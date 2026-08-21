#!/usr/bin/env python3
"""
Phase 2 of the legacy campaign migration: copy the Cloud Storage MEDIA and
re-point the migrated Firestore documents at it.

`scripts/migrate_legacy_campaign.py` (phase 1) copied Firestore documents
verbatim, including every `portraitPath` / `tokenIcon.customImagePath` /
`imagePath` / `tokenImagePath` / ... field. It never touched Cloud Storage, so
every migrated document still points into the OLD flat storage tree

    campaigns/237sg5HxL39dgZbZg9pQ/characters/<id>/portraits/<file>

while the app itself now lives entirely in the group-scoped tree

    groups/nCNPq08BwD5dR7wAiONG/campaigns/S9OsX5rbdBthdhh49LIW/characters/<id>/portraits/<file>

Those reads only still resolve because the legacy `campaigns/<legacyId>/members/*`
documents were never deleted - `storage.rules` gates the flat tree on
`isCampaignMember(<legacyCampaignId>)`. The moment anyone prunes the "safe to
delete" legacy data, every migrated portrait and token icon goes dark for
everyone, GM included.

This script closes that gap:

  1. Scans every document under the migrated campaign, and its legacy
     counterpart, for references into the legacy storage tree - both raw object
     paths (`portraitPath`) and Firebase download URLs (`portraitUrl`).
  2. Copies each referenced Storage object to the matching group-scoped path,
     carrying its `firebaseStorageDownloadTokens` metadata across so download
     URLs keep resolving once re-pointed.
  3. Rewrites the pointer fields on the MIGRATED documents only, field-masked
     so nothing else on the document is disturbed.

Two kinds of pointer rewrite:

  REPOINT  the migrated field still holds the legacy value -> rewrite it.
  RESTORE  the migrated field is blank but its legacy counterpart still holds a
           good value -> restore it, re-pointed at the new location. This is
           what recovers a portrait cleared by a failed remove/re-upload after
           the migration (character "Chev Chelios", cleared 2026-08-07).
           Pass --no-restore to skip this class entirely.

Safety posture, matching phase 1:

  * ADDITIVE ONLY. Legacy documents and legacy Storage objects are read and
    never modified or deleted.
  * Only objects the migrated campaign actually references are copied. The
    legacy tree holds thousands of superseded uploads nothing points at; those
    are deliberately left behind.
  * A pointer is only rewritten once its source object is confirmed to exist,
    so no rewrite can leave a document pointing at nothing.
  * Fields that already point into the new tree are never overwritten, so
    anything uploaded since the migration always wins.
  * Idempotent: an object already copied (same md5) is skipped, and rewriting
    an already-rewritten field is a no-op.

Usage:
  python3 scripts/migrate_legacy_campaign_storage.py              # dry run, writes nothing
  python3 scripts/migrate_legacy_campaign_storage.py --apply      # performs copies + rewrites
  python3 scripts/migrate_legacy_campaign_storage.py --no-restore # only REPOINT, never RESTORE

Auth: uses `gcloud auth print-access-token`, same as phase 1.
"""
import copy
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request

PROJECT      = "homeboyshouse-dev"
BUCKET       = "homeboyshouse-dev.firebasestorage.app"
SRC_CAMPAIGN = "campaigns/237sg5HxL39dgZbZg9pQ"
DST_GROUP    = "groups/nCNPq08BwD5dR7wAiONG"
DST_CAMPAIGN = f"{DST_GROUP}/campaigns/S9OsX5rbdBthdhh49LIW"

FS_BASE    = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
DOC_PREFIX = f"projects/{PROJECT}/databases/(default)/documents"
GCS_BASE   = f"https://storage.googleapis.com/storage/v1/b/{BUCKET}"

LEGACY_PREFIX = f"{SRC_CAMPAIGN}/"
NEW_PREFIX    = f"{DST_CAMPAIGN}/"

DOWNLOAD_TOKEN_KEY = "firebaseStorageDownloadTokens"

# Object metadata carried onto the copy. DOWNLOAD_TOKEN_KEY lives inside the
# custom `metadata` dict and is what makes a Firebase download URL resolve, so
# propagating it is what lets a rewritten `...Url` field keep working.
COPIED_METADATA_KEYS = (
    "contentType", "cacheControl", "contentDisposition",
    "contentEncoding", "contentLanguage", "metadata",
)

DOWNLOAD_URL_RE = re.compile(
    r"^(https://firebasestorage\.googleapis\.com/v0/b/[^/]+/o/)([^?]+)(\?.*)?$"
)

BLANK = "'' (empty)"          # how a blank pointer reads in the report
BATCH = 200                   # documents per Firestore commit

_access_token = None


# ---------------------------------------------------------------- REST helpers
def auth_token():
    """Cached `gcloud auth print-access-token`, fetched on first API call.

    Deferred so the module stays importable (and unit-testable) without gcloud."""
    global _access_token
    if _access_token is None:
        _access_token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token"]).decode().strip()
    return _access_token


def api(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": f"Bearer {auth_token()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def list_collection_ids(doc_path):
    url = f"{FS_BASE}/{doc_path}:listCollectionIds"
    ids, body = [], {}
    while True:
        out = api(url, "POST", body)
        ids += out.get("collectionIds", [])
        tok = out.get("nextPageToken")
        if not tok:
            return ids
        body = {"pageToken": tok}


def list_docs(coll_path):
    """(relative_doc_path, fields) for every document in a collection."""
    docs, page = [], None
    while True:
        url = f"{FS_BASE}/{coll_path}?pageSize=300"
        if page:
            url += f"&pageToken={urllib.parse.quote(page, safe='')}"
        out = api(url)
        for d in out.get("documents", []):
            docs.append((d["name"].split("/documents/")[1], d.get("fields", {})))
        page = out.get("nextPageToken")
        if not page:
            return docs


def walk_tree(root_doc_path):
    """Every document at or beneath `root_doc_path`, as {relpath: fields}."""
    tree = {root_doc_path: api(f"{FS_BASE}/{root_doc_path}").get("fields", {})}

    def recurse(doc_path):
        for col in list_collection_ids(doc_path):
            for rel, fields in list_docs(f"{doc_path}/{col}"):
                tree[rel] = fields
                recurse(rel)

    recurse(root_doc_path)
    return tree


def list_objects(prefix):
    """Bucket listing for `prefix`, as {objectPath: objectResource}."""
    fields = ("items(name,size,md5Hash,contentType,cacheControl,contentDisposition,"
              "contentEncoding,contentLanguage,metadata),nextPageToken")
    out, page = {}, None
    while True:
        url = (f"{GCS_BASE}/o?prefix={urllib.parse.quote(prefix, safe='')}"
               f"&maxResults=1000&fields={urllib.parse.quote(fields, safe='(),')}")
        if page:
            url += f"&pageToken={urllib.parse.quote(page, safe='')}"
        d = api(url)
        for item in d.get("items", []):
            out[item["name"]] = item
        page = d.get("nextPageToken")
        if not page:
            return out


def copy_object(src_path, dst_path, src_meta):
    """Server-side copy src -> dst, preserving the metadata that matters.

    Uses `rewriteTo` rather than `copyTo` because it resumes across chunks -
    the campaign's map images run to ~16 MB apiece."""
    body = {k: src_meta[k] for k in COPIED_METADATA_KEYS if src_meta.get(k) is not None}
    url = (f"{GCS_BASE}/o/{urllib.parse.quote(src_path, safe='')}"
           f"/rewriteTo/b/{BUCKET}/o/{urllib.parse.quote(dst_path, safe='')}")
    rewrite_token = None
    while True:
        page = url + (f"?rewriteToken={urllib.parse.quote(rewrite_token, safe='')}"
                      if rewrite_token else "")
        out = api(page, "POST", body)
        if out.get("done", True):
            return out.get("resource", {})
        rewrite_token = out["rewriteToken"]


def download_token(obj_meta):
    return ((obj_meta or {}).get("metadata") or {}).get(DOWNLOAD_TOKEN_KEY)


# ------------------------------------------------------- Firestore value trees
# A leaf is addressed by `steps`: a tuple mixing str (map keys) and int (array
# indices), e.g. ("tokenIcon", "customImagePath") or ("inventory", 3, "portraitPath").
def leaves(value, steps=()):
    """Yield (steps, string) for every string leaf in a Firestore Value."""
    if "stringValue" in value:
        yield steps, value["stringValue"]
    elif "mapValue" in value:
        for k, v in (value["mapValue"].get("fields") or {}).items():
            yield from leaves(v, steps + (k,))
    elif "arrayValue" in value:
        for i, v in enumerate(value["arrayValue"].get("values") or []):
            yield from leaves(v, steps + (i,))


def doc_leaves(fields):
    for k, v in fields.items():
        yield from leaves(v, (k,))


def read_leaf(fields, steps):
    """The Value at `steps`, or None when any step is absent."""
    value = fields.get(steps[0])
    for step in steps[1:]:
        if value is None:
            return None
        if isinstance(step, int):
            values = (value.get("arrayValue") or {}).get("values") or []
            value = values[step] if step < len(values) else None
        else:
            value = ((value.get("mapValue") or {}).get("fields") or {}).get(step)
    return value


def write_leaf(fields, steps, new_string):
    """Set `steps` to `new_string`, creating intermediate maps as needed."""
    if len(steps) == 1:
        fields[steps[0]] = {"stringValue": new_string}
        return
    value = fields.setdefault(steps[0], {"mapValue": {"fields": {}}})
    for step, nxt in zip(steps[1:], steps[2:] + (None,)):
        if isinstance(step, int):
            container = value["arrayValue"]["values"]
        else:
            container = value.setdefault("mapValue", {}).setdefault("fields", {})
        if nxt is None:
            container[step] = {"stringValue": new_string}
        elif isinstance(step, int):
            value = container[step]
        else:
            value = container.setdefault(step, {"mapValue": {"fields": {}}})


def steps_label(steps):
    out = ""
    for step in steps:
        out += f"[{step}]" if isinstance(step, int) else (f".{step}" if out else step)
    return out


_PLAIN_SEGMENT = re.compile(r"^[A-Za-z_][A-Za-z_0-9]*$")


def mask_for(steps):
    """The updateMask fieldPath covering `steps`.

    Field masks cannot address array elements, so a leaf inside an array is
    covered by the shortest ancestor path holding no index - the whole array
    field is rewritten, with only that leaf changed."""
    covered = []
    for step in steps:
        if isinstance(step, int):
            break
        covered.append(step)
    return ".".join(s if _PLAIN_SEGMENT.match(s) else "`" + s.replace("`", "\\`") + "`"
                    for s in covered)


# ------------------------------------------------------------ reference typing
def as_legacy_ref(text):
    """(objectPath, rebuild) when `text` references the legacy storage tree.

    `rebuild(newObjectPath)` produces the replacement string, so a raw path and
    a download URL wrapping that same path are handled identically."""
    if text.startswith(LEGACY_PREFIX):
        return text, lambda new_path: new_path
    m = DOWNLOAD_URL_RE.match(text)
    if m:
        head, encoded, query = m.group(1), m.group(2), m.group(3) or ""
        object_path = urllib.parse.unquote(encoded)
        if object_path.startswith(LEGACY_PREFIX):
            return object_path, lambda new_path: (
                head + urllib.parse.quote(new_path, safe="") + query
            )
    return None, None


def is_download_url(text):
    return bool(DOWNLOAD_URL_RE.match(text))


def points_at_new_tree(text):
    if text.startswith(NEW_PREFIX):
        return True
    m = DOWNLOAD_URL_RE.match(text)
    return bool(m and urllib.parse.unquote(m.group(2)).startswith(NEW_PREFIX))


def new_object_path(legacy_path):
    return NEW_PREFIX + legacy_path[len(LEGACY_PREFIX):]


def sibling_steps(steps):
    """The `...Path` <-> `...Url` companion field, or None."""
    last = steps[-1]
    if isinstance(last, str) and last.endswith("Path"):
        return steps[:-1] + (last[:-4] + "Url",)
    return None


def is_blank(value):
    return value is None or "nullValue" in value or value.get("stringValue", "?") == ""


def holds_inline_image(value):
    return value is not None and value.get("stringValue", "").startswith("data:")


def summarize(value):
    if value is None:
        return "<absent>"
    if "nullValue" in value:
        return "<null>"
    text = value.get("stringValue")
    if text is None:
        return json.dumps(value)[:60]
    if text.startswith("data:"):
        return f"<inline data: image, {len(text)} chars>"
    return text if len(text) <= 90 else text[:87] + "..."


# --------------------------------------------------------------------- planning
def build_plan(migrated, legacy, no_restore):
    """(rewrites, skips) for the migrated tree.

    A rewrite is a dict: doc, steps, label, action, old, new, src_object,
    dst_object, is_url. A skip is (kind, doc, label, detail)."""
    legacy_for = {rel.replace(SRC_CAMPAIGN, DST_CAMPAIGN, 1): fields
                  for rel, fields in legacy.items()}
    rewrites, skips = [], []

    for doc_rel in sorted(migrated):
        fields = migrated[doc_rel]
        legacy_fields = legacy_for.get(doc_rel, {})

        candidates = {}                       # steps -> (action, sourceText)
        for steps, text in doc_leaves(fields):
            if as_legacy_ref(text)[0]:
                candidates[steps] = ("REPOINT", text)

        for steps, text in doc_leaves(legacy_fields):
            if steps in candidates or not as_legacy_ref(text)[0]:
                continue
            current = read_leaf(fields, steps)
            label = steps_label(steps)
            if not is_blank(current):
                kind, detail = (
                    ("newer", "already points into the new tree")
                    if points_at_new_tree(current.get("stringValue", ""))
                    else ("conflict", f"holds an unrelated value: {summarize(current)}")
                )
                skips.append((kind, doc_rel, label, detail))
                continue
            companion = sibling_steps(steps)
            if companion and holds_inline_image(read_leaf(fields, companion)):
                skips.append(("inline", doc_rel, label,
                              f"blank, but {steps_label(companion)} holds an inline data: image"))
                continue
            if no_restore:
                skips.append(("no-restore", doc_rel, label, "--no-restore given"))
                continue
            candidates[steps] = ("RESTORE", text)

        for steps in sorted(candidates, key=steps_label):
            action, text = candidates[steps]
            object_path, rebuild = as_legacy_ref(text)
            rewrites.append({
                "doc": doc_rel,
                "steps": steps,
                "label": steps_label(steps),
                "action": action,
                "old": text,
                "src_object": object_path,
                "dst_object": new_object_path(object_path),
                "new": rebuild(new_object_path(object_path)),
                "is_url": is_download_url(text),
            })

    return rewrites, skips


def classify_objects(rewrites, legacy_objects, existing_new):
    """Decide which objects can be copied; annotate unbackable rewrites.

    Returns {srcPath: {dst, meta, size, state}} for the copyable ones. Every
    rewrite gains a `blocked` key: None, or the reason it is being left alone."""
    copies, blocked = {}, {}

    def reason_for(src, dst):
        meta = legacy_objects.get(src)
        if meta is None:
            return "source object no longer exists in the bucket"
        already = existing_new.get(dst)
        if already is not None and already.get("md5Hash") != meta.get("md5Hash"):
            return f"destination already holds different content ({dst})"
        return None

    for r in rewrites:
        src, dst = r["src_object"], r["dst_object"]
        if src not in copies and src not in blocked:
            why = reason_for(src, dst)
            if why:
                blocked[src] = why
            else:
                meta = legacy_objects[src]
                copies[src] = {
                    "dst": dst,
                    "meta": meta,
                    "size": int(meta.get("size", 0)),
                    "state": "already copied" if dst in existing_new else "copy",
                }
        r["blocked"] = blocked.get(src)
        # A download URL embeds the object's download token; without one on the
        # source there is nothing to carry across and the rewritten URL would 403.
        if not r["blocked"] and r["is_url"] and not download_token(legacy_objects[src]):
            r["blocked"] = f"source object carries no {DOWNLOAD_TOKEN_KEY} to preserve"

    return copies


def build_writes(migrated, applicable):
    """[(docRelPath, fields, fieldPaths)] - one field-masked update per document."""
    by_doc = {}
    for r in applicable:
        by_doc.setdefault(r["doc"], []).append(r)

    writes = []
    for doc_rel, doc_rewrites in by_doc.items():
        fields, masks = {}, []
        for r in doc_rewrites:
            mask = mask_for(r["steps"])
            if mask not in masks:
                masks.append(mask)
            top = r["steps"][0]
            # Seed the whole top-level field once, so several rewrites inside the
            # same field accumulate instead of overwriting each other. The mask
            # still limits what the commit actually touches.
            if top not in fields and top in migrated[doc_rel]:
                fields[top] = copy.deepcopy(migrated[doc_rel][top])
            write_leaf(fields, r["steps"], r["new"])
        writes.append((doc_rel, fields, masks))
    return writes


# ----------------------------------------------------------------- presentation
def human_bytes(n):
    size = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{int(size)} B" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024


def entity_title(doc_rel, migrated):
    rel = (doc_rel[len(DST_CAMPAIGN) + 1:]
           if doc_rel.startswith(DST_CAMPAIGN + "/") else "(campaign root)")
    name = (migrated.get(doc_rel, {}).get("name") or {}).get("stringValue")
    return rel + (f'   "{name}"' if name else "")


def print_report(migrated, legacy, rewrites, skips, copies, no_restore, legacy_objects):
    applicable = [r for r in rewrites if not r["blocked"]]
    blocked_rewrites = [r for r in rewrites if r["blocked"]]
    restores = [r for r in applicable if r["action"] == "RESTORE"]
    to_copy = {s: c for s, c in copies.items() if c["state"] == "copy"}
    copy_bytes = sum(c["size"] for c in to_copy.values())

    print("=" * 78)
    print(" LEGACY CAMPAIGN STORAGE MIGRATION - copy media + re-point Firestore")
    print("=" * 78)
    print(f" bucket       : {BUCKET}")
    print(f" source tree  : {LEGACY_PREFIX}...   (READ ONLY, never modified)")
    print(f" target tree  : {NEW_PREFIX}...")
    print(f" restore mode : {'OFF (--no-restore)' if no_restore else 'ON'}")
    print()
    print(f"Scanned {len(migrated)} migrated documents and {len(legacy)} legacy documents.")

    print()
    print("-" * 78)
    print(f" STORAGE OBJECTS ({len(to_copy)} to copy, {human_bytes(copy_bytes)}; "
          f"{len(copies) - len(to_copy)} already present)")
    print("-" * 78)
    for src in sorted(copies):
        c = copies[src]
        print(f"  [{'copy  ' if c['state'] == 'copy' else 'exists'}] "
              f"{human_bytes(c['size']):>10}  {c['meta'].get('contentType', '?')}")
        print(f"           from  {src}")
        print(f"           to    {c['dst']}")
    if not copies:
        print("  (none)")

    print()
    print("-" * 78)
    print(f" FIRESTORE POINTER REWRITES ({len(applicable)} fields across "
          f"{len({r['doc'] for r in applicable})} documents)")
    print("-" * 78)
    last_doc = None
    for r in applicable:
        if r["doc"] != last_doc:
            last_doc = r["doc"]
            print(f"\n  {entity_title(r['doc'], migrated)}")
        print(f"    {r['label']}  [{r['action']}]")
        print(f"        from  {r['old'] or BLANK}")
        print(f"        to    {r['new']}")
    if not applicable:
        print("  (none)")

    if restores:
        print()
        print("-" * 78)
        print(f" RESTORED POINTERS ({len(restores)}) - blank on the migrated document,")
        print(" recovered from its untouched legacy counterpart")
        print("-" * 78)
        for r in restores:
            print(f"  {entity_title(r['doc'], migrated)}")
            print(f"    {r['label']} -> {r['new']}")

    if blocked_rewrites or skips:
        print()
        print("-" * 78)
        print(" NOT TOUCHED")
        print("-" * 78)
        for r in blocked_rewrites:
            print(f"  ! {entity_title(r['doc'], migrated)}")
            print(f"      {r['label']}: {r['blocked']}")
            print(f"      left as {r['old'][:100] or BLANK}")
        for _kind, doc_rel, label, detail in skips:
            print(f"  ~ {entity_title(doc_rel, migrated)}")
            print(f"      {label}: {detail}")

    print()
    print("-" * 78)
    print(" SUMMARY")
    print("-" * 78)
    print(f"  objects to copy            : {len(to_copy)}  ({human_bytes(copy_bytes)})")
    print(f"  objects already copied     : {len(copies) - len(to_copy)}")
    print(f"  pointer rewrites           : {len(applicable)}"
          f"   (repoint {len(applicable) - len(restores)} / restore {len(restores)})")
    print(f"  documents touched          : {len({r['doc'] for r in applicable})}")
    print(f"  rewrites blocked           : {len(blocked_rewrites)}")
    print(f"  legacy objects left behind : {len(legacy_objects) - len(copies)} of "
          f"{len(legacy_objects)} (superseded uploads nothing points at)")


# ----------------------------------------------------------------------- apply
def apply_plan(migrated, rewrites, copies):
    print("\n>>> APPLYING ...")
    to_copy = {s: c for s, c in copies.items() if c["state"] == "copy"}
    for src in sorted(to_copy):
        copy_object(src, to_copy[src]["dst"], to_copy[src]["meta"])
        print(f"    copied {src} -> {to_copy[src]['dst']}")

    landed = list_objects(NEW_PREFIX)
    missing = sorted(c["dst"] for c in copies.values() if c["dst"] not in landed)
    if missing:
        print(f"!!! {len(missing)} object(s) did not land. No Firestore write was made:")
        for dst in missing:
            print(f"    {dst}")
        sys.exit(1)

    # A rewritten download URL only resolves if the copy kept the source's
    # download token. Verify rather than assume; drop just those rewrites if not.
    for r in rewrites:
        if r["blocked"] or not r["is_url"]:
            continue
        want = download_token(copies[r["src_object"]]["meta"])
        got = download_token(landed[r["dst_object"]])
        if want != got:
            r["blocked"] = (f"copy did not preserve {DOWNLOAD_TOKEN_KEY} "
                            f"({want} -> {got}); URL left pointing at the legacy object")
            print(f"    ! {r['doc']} {r['label']}: {r['blocked']}")

    applicable = [r for r in rewrites if not r["blocked"]]
    writes = build_writes(migrated, applicable)
    for i in range(0, len(writes), BATCH):
        api(f"{FS_BASE}:commit", "POST", {"writes": [
            {"update": {"name": f"{DOC_PREFIX}/{rel}", "fields": fields},
             "updateMask": {"fieldPaths": masks}}
            for rel, fields, masks in writes[i:i + BATCH]
        ]})

    print(f">>> DONE. Copied {len(to_copy)} objects, rewrote {len(applicable)} pointers "
          f"across {len(writes)} documents.")


def main():
    no_restore = "--no-restore" in sys.argv
    apply_writes = "--apply" in sys.argv

    migrated = walk_tree(DST_CAMPAIGN)
    legacy = walk_tree(SRC_CAMPAIGN)
    legacy_objects = list_objects(LEGACY_PREFIX)
    existing_new = list_objects(NEW_PREFIX)

    rewrites, skips = build_plan(migrated, legacy, no_restore)
    copies = classify_objects(rewrites, legacy_objects, existing_new)

    print_report(migrated, legacy, rewrites, skips, copies, no_restore, legacy_objects)

    if not apply_writes:
        print("\n*** DRY RUN -- nothing written. Re-run with --apply to perform. ***")
        return
    apply_plan(migrated, rewrites, copies)


if __name__ == "__main__":
    main()
