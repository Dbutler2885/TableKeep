#!/usr/bin/env python3
"""
One-off migration: copy the single real legacy flat-schema campaign into the new
nested group/campaign schema.

  SOURCE: campaigns/237sg5HxL39dgZbZg9pQ            ("My OSE Module")
  TARGET: groups/nCNPq08BwD5dR7wAiONG
            /campaigns/S9OsX5rbdBthdhh49LIW          ("The Black Wyrm of Brandonsford")

Behaviour:
  * ADDITIVE ONLY. Never deletes or modifies any legacy document.
  * Copies every campaign subcollection VERBATIM (doc IDs preserved), recursing
    into nested subcollections (maps -> tokens/annotations/fogChunks, etc.),
    EXCEPT the legacy `members` subcollection which is transformed instead.
  * `members` -> new `groups/<gid>/members/<uid>` (role/status) + per-campaign
    `userState/<uid>` (currentCharacterId, only when the character actually
    migrated -- dangling selections are skipped).
  * GM (already a group admin) is left untouched. Dropped accounts are skipped.
  * Copies legacy campaign-root `activeMapId` onto the new campaign doc via a
    field-masked update so the app-created campaign fields are preserved.

Idempotent: re-running overwrites the same target doc IDs.

NOTE: this script moves Firestore documents ONLY. The media those documents
point at (portraitPath, tokenIcon.customImagePath, imagePath, tokenImagePath,
...) stays in the legacy Cloud Storage tree until phase 2 runs -- see
`scripts/migrate_legacy_campaign_storage.py`, which copies the objects into the
group-scoped tree and rewrites the pointers.

Usage:
  python3 scripts/migrate_legacy_campaign.py            # dry run, writes nothing
  python3 scripts/migrate_legacy_campaign.py --apply    # performs the writes
"""
import sys, json, subprocess, urllib.request, urllib.error
from datetime import datetime, timezone

PROJECT      = "homeboyshouse-dev"
SRC_CAMPAIGN = "campaigns/237sg5HxL39dgZbZg9pQ"
DST_GROUP    = "groups/nCNPq08BwD5dR7wAiONG"
DST_CAMPAIGN = f"{DST_GROUP}/campaigns/S9OsX5rbdBthdhh49LIW"

GM_UID = "1vpfR7r1gOQ7eizSSYOGgyK9USy2"          # already admin in target group
KEEP_MEMBERS = {                                  # uid -> new group role
    "3aoNWYIMl4YxPse9PAf0uw4PQLm1": "member",     # danquir
    "AvTfwKLu55QCksnkxGtZzFHdFTF2": "member",     # wolfman
    "k79GkfusmjMVwpSiDQF9yD323yE3": "member",     # Purist!
    "yIOxnrotRkRY3gZZsxIXMvjcP8i2": "member",     # Thrilho
    "04JZTiyV2ocwL6xbiKzHYyufd2m1": "member",     # DbPlayr (test acct, keep)
    "KQCQCvUFhhXrq5RJX3ICYhCbgWF2": "member",     # poooooo
}
DROP_MEMBERS = {"R9uZK8XMRyZs327UKswGYSUakmq1"}   # testply (owns no characters)
SKIP_SUBCOLLECTIONS = {"members"}                 # transformed, not copied

BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
DOC_PREFIX = f"projects/{PROJECT}/databases/(default)/documents"
TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()


def api(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def list_collection_ids(doc_path):
    url = f"{BASE}/{doc_path}:listCollectionIds"
    ids, body = [], {}
    while True:
        out = api(url, "POST", body)
        ids += out.get("collectionIds", [])
        tok = out.get("nextPageToken")
        if not tok:
            return ids
        body = {"pageToken": tok}


def list_docs(coll_path):
    """Yield (relative_doc_path, fields) for every doc in a collection."""
    docs, page = [], None
    while True:
        url = f"{BASE}/{coll_path}?pageSize=300"
        if page:
            url += f"&pageToken={page}"
        out = api(url)
        for d in out.get("documents", []):
            docs.append((d["name"].split("/documents/")[1], d.get("fields", {})))
        page = out.get("nextPageToken")
        if not page:
            return docs


def now_ts():
    return {"timestampValue": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


# ---- 1. Walk source campaign, build verbatim copy writes ------------------
copy_writes = []          # (dst_relpath, fields)
subcol_counts = {}        # top-level subcollection -> doc count
migrated_char_ids = set()


def walk(doc_path):
    for col in list_collection_ids(doc_path):
        if doc_path == SRC_CAMPAIGN and col in SKIP_SUBCOLLECTIONS:
            continue
        coll_path = f"{doc_path}/{col}"
        for rel, fields in list_docs(coll_path):
            dst = rel.replace(SRC_CAMPAIGN, DST_CAMPAIGN, 1)
            copy_writes.append((dst, fields))
            if doc_path == SRC_CAMPAIGN:
                subcol_counts[col] = subcol_counts.get(col, 0) + 1
            if rel.startswith(f"{SRC_CAMPAIGN}/characters/") and rel.count("/") == 3:
                migrated_char_ids.add(rel.split("/")[-1])
            walk(rel)


walk(SRC_CAMPAIGN)

# ---- 2. activeMapId onto the (already-created) campaign doc ----------------
src_root = api(f"{BASE}/{SRC_CAMPAIGN}").get("fields", {})
active_map = src_root.get("activeMapId")

# ---- 3. members -> group members + userState ------------------------------
member_writes, userstate_writes, skipped_members, dangling = [], [], [], []
for rel, f in list_docs(f"{SRC_CAMPAIGN}/members"):
    uid = rel.split("/")[-1]
    if uid == GM_UID:
        skipped_members.append((uid, "GM (already group admin)"))
        continue
    if uid in DROP_MEMBERS:
        skipped_members.append((uid, "dropped"))
        continue
    if uid not in KEEP_MEMBERS:
        skipped_members.append((uid, "not in keep-list"))
        continue
    member_writes.append((f"{DST_GROUP}/members/{uid}", {
        "userId":   {"stringValue": uid},
        "role":     {"stringValue": KEEP_MEMBERS[uid]},
        "status":   {"stringValue": "active"},
        "joinedAt": f.get("joinedAt", now_ts()),
        "updatedAt": now_ts(),
    }))
    cc = f.get("currentCharacterId")
    cc_id = cc.get("stringValue") if isinstance(cc, dict) else None
    if cc_id and cc_id in migrated_char_ids:
        userstate_writes.append((f"{DST_CAMPAIGN}/userState/{uid}", {"currentCharacterId": cc}))
    elif cc_id:
        dangling.append((uid, cc_id))


def commit(writes_with_mask):
    """writes_with_mask: list of (relpath, fields, mask_or_None) -> batched commit."""
    for i in range(0, len(writes_with_mask), 400):
        batch = writes_with_mask[i:i + 400]
        body = {"writes": []}
        for rel, fields, mask in batch:
            w = {"update": {"name": f"{DOC_PREFIX}/{rel}", "fields": fields}}
            if mask is not None:
                w["updateMask"] = {"fieldPaths": mask}
            body["writes"].append(w)
        api(f"{BASE}:commit", "POST", body)


# ---- Report ----------------------------------------------------------------
total_copy = len(copy_writes)
print("=" * 70)
print(f"SOURCE : {SRC_CAMPAIGN}")
print(f"TARGET : {DST_CAMPAIGN}")
print("=" * 70)
print("\nVerbatim copies by top-level subcollection:")
for k in sorted(subcol_counts):
    print(f"  {k:18} {subcol_counts[k]}")
nested = total_copy - sum(subcol_counts.values())
print(f"  {'(nested docs)':18} {nested}   (map tokens/annotations/fogChunks etc.)")
print(f"  {'TOTAL docs copied':18} {total_copy}")
print(f"\nCampaign root: set activeMapId = "
      f"{active_map.get('stringValue') if active_map else '(none)'} (field-masked, preserves other fields)")
print(f"\nGroup member docs to write ({len(member_writes)}):")
for rel, fields in member_writes:
    print(f"  + {rel}   role={fields['role']['stringValue']}")
print(f"\nuserState (currentCharacterId carried over) ({len(userstate_writes)}):")
for rel, fields in userstate_writes:
    print(f"  + {rel}   -> {fields['currentCharacterId']['stringValue']}")
if dangling:
    print(f"\nuserState SKIPPED (selected character not migrated):")
    for uid, cc in dangling:
        print(f"  ! {uid}  currentCharacterId={cc}")
print(f"\nMembers skipped:")
for uid, why in skipped_members:
    print(f"  - {uid}  ({why})")

if "--apply" not in sys.argv:
    print("\n*** DRY RUN -- nothing written. Re-run with --apply to perform. ***")
    sys.exit(0)

print("\n>>> APPLYING ...")
commit([(rel, fields, None) for rel, fields in copy_writes])
if active_map is not None:
    commit([(DST_CAMPAIGN, {"activeMapId": active_map}, ["activeMapId"])])
commit([(rel, fields, None) for rel, fields in member_writes])
commit([(rel, fields, None) for rel, fields in userstate_writes])
print(f">>> DONE. Copied {total_copy} docs, "
      f"{len(member_writes)} memberships, {len(userstate_writes)} userState.")
