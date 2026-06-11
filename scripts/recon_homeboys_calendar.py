#!/usr/bin/env python3
"""READ-ONLY recon: list Home Boys sessionSummaries, map to session numbers,
dump current calendar. Writes nothing. Used to confirm mapping + back up before
the calendar fix."""
import json, subprocess, urllib.request

PROJECT  = "homeboyshouse-dev"
CAMPAIGN = "groups/nCNPq08BwD5dR7wAiONG/campaigns/S9OsX5rbdBthdhh49LIW"
COLL     = f"{CAMPAIGN}/sessionSummaries"
BASE     = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
TOKEN    = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()


def api(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def sval(f, k, default=None):
    v = f.get(k)
    if not v:
        return default
    return v.get("stringValue", v.get("integerValue", v.get("booleanValue", default)))


docs, page = [], None
while True:
    url = f"{BASE}/{COLL}?pageSize=300" + (f"&pageToken={page}" if page else "")
    out = api(url)
    docs += out.get("documents", [])
    page = out.get("nextPageToken")
    if not page:
        break

print(f"Found {len(docs)} sessionSummaries in {COLL}\n")
rows = []
for d in docs:
    doc_id = d["name"].split("/")[-1]
    f = d.get("fields", {})
    title = sval(f, "title", "")
    sn = sval(f, "sessionNumber")
    edited = sval(f, "hasHumanEdits", False)
    cal = f.get("calendar", {}).get("arrayValue", {}).get("values", [])
    cal_summary = []
    for c in cal:
        cf = c.get("mapValue", {}).get("fields", {})
        key = sval(cf, "key", "?")
        entries = cf.get("entries", {}).get("arrayValue", {}).get("values", [])
        cal_summary.append(f"{key}({len(entries)})")
    rows.append((sn, doc_id, title, edited, cal_summary))

rows.sort(key=lambda r: (r[0] is None, r[0]))
for sn, doc_id, title, edited, cal_summary in rows:
    print(f"  S{sn}  id={doc_id}  title={title!r}  hasHumanEdits={edited}")
    print(f"       calendar: {', '.join(cal_summary) or '(empty)'}")

# Full backup of every calendar field
backup = {d["name"].split("/")[-1]: d.get("fields", {}).get("calendar") for d in docs}
with open("scripts/homeboys_calendar_backup.json", "w") as fh:
    json.dump(backup, fh, indent=2)
print(f"\nBacked up {len(backup)} calendar fields -> scripts/homeboys_calendar_backup.json")
