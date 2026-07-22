import json, urllib.request, os
from collections import Counter

env = {}
for line in open(r"C:\Users\Dell\caregiver-briefing-tool\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')

url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
svc = env["SUPABASE_SERVICE_ROLE_KEY"]
h = {"apikey": svc, "Authorization": f"Bearer {svc}"}
r = urllib.request.urlopen(urllib.request.Request(
    f"{url}/rest/v1/documents?select=status,extracted_text&limit=100", headers=h), timeout=30)
rows = json.loads(r.read().decode())
print("doc status:", dict(Counter(x["status"] for x in rows)))
ext = [x for x in rows if x.get("extracted_text")]
print("docs with extracted_text:", len(ext))
if ext:
    print("SAMPLE:", ext[0]["extracted_text"][:300])
