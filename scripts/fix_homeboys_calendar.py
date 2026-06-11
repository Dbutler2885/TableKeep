#!/usr/bin/env python3
"""Rewrite Home Boys sessionSummaries' `calendar` field from the validated
proto run (proto_run_homeboys.json). Only the `calendar` field is touched
(updateMask). Dry run by default; --apply to write.

  python3 scripts/fix_homeboys_calendar.py            # dry run
  python3 scripts/fix_homeboys_calendar.py --apply
"""
import json, sys, subprocess, urllib.request
from pathlib import Path

PROJECT  = "homeboyshouse-dev"
CAMPAIGN = "groups/nCNPq08BwD5dR7wAiONG/campaigns/S9OsX5rbdBthdhh49LIW"
COLL     = f"{CAMPAIGN}/sessionSummaries"
BASE     = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
DOC_PREFIX = f"projects/{PROJECT}/databases/(default)/documents"
FIXTURE  = Path.home() / "Roleplaying-Transcripts" / "proto_run_homeboys.json"
TOKEN    = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()


def api(url, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


# --- map session number -> doc id ------------------------------------------
docs, page = [], None
while True:
    out = api(f"{BASE}/{COLL}?pageSize=300" + (f"&pageToken={page}" if page else ""))
    docs += out.get("documents", [])
    page = out.get("nextPageToken")
    if not page:
        break

sess_to_id = {}
for d in docs:
    f = d.get("fields", {})
    sn = f.get("sessionNumber", {}).get("integerValue")
    title = f.get("title", {}).get("stringValue", "")
    doc_id = d["name"].split("/")[-1]
    if sn is not None:
        sess_to_id[int(sn)] = doc_id
    elif title.startswith("Session 1"):
        sess_to_id[1] = doc_id

# --- build per-session calendar arrays from the fixture --------------------
fixture = json.loads(FIXTURE.read_text())["sessions"]
max_day = max(ev["day"] for s in fixture.values() for ev in s["events"])

seen_days = set()
plan = {}   # session -> calendar list[{key,action,label,dayComplete,entries}]
for n in sorted(int(k) for k in fixture):
    events = fixture[str(n)]["events"]
    by_day = {}
    for ev in events:
        by_day.setdefault(ev["day"], []).append(ev["text"])
    cal = []
    for day in sorted(by_day):
        action = "new" if day not in seen_days else "update"
        seen_days.add(day)
        cal.append({
            "key": f"day_{day:03d}",
            "action": action,
            "label": "",
            "dayComplete": day < max_day,
            "entries": by_day[day],
        })
    plan[n] = cal


def to_fs(cal):
    """Encode a calendar list into a Firestore arrayValue."""
    vals = []
    for c in cal:
        vals.append({"mapValue": {"fields": {
            "key":         {"stringValue": c["key"]},
            "action":      {"stringValue": c["action"]},
            "label":       {"stringValue": c["label"]},
            "dayComplete": {"booleanValue": c["dayComplete"]},
            "entries":     {"arrayValue": {"values": [{"stringValue": e} for e in c["entries"]]}},
        }}})
    return {"arrayValue": {"values": vals}}


# --- report ----------------------------------------------------------------
print(f"Target: {COLL}\n")
writes = []
for n in sorted(plan):
    doc_id = sess_to_id.get(n)
    cal = plan[n]
    desc = ", ".join(f"{c['key']}({c['action']},{len(c['entries'])}ev,{'done' if c['dayComplete'] else 'open'})" for c in cal)
    print(f"  S{n}  id={doc_id}")
    print(f"       -> {desc}")
    if doc_id is None:
        print("       !! no doc id mapped — SKIPPED")
        continue
    writes.append((f"{COLL}/{doc_id}", to_fs(cal)))

if "--apply" not in sys.argv:
    print(f"\n*** DRY RUN — nothing written. {len(writes)} docs would update (calendar field only). ***")
    sys.exit(0)

print(f"\n>>> APPLYING {len(writes)} calendar updates (updateMask=calendar) ...")
body = {"writes": [
    {"update": {"name": f"{DOC_PREFIX}/{rel}", "fields": {"calendar": cal}},
     "updateMask": {"fieldPaths": ["calendar"]}}
    for rel, cal in writes
]}
api(f"{BASE}:commit", "POST", body)
print(">>> DONE.")
