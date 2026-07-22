import json, time, urllib.request, urllib.error, os
from collections import Counter

env = {}
for line in open(r"C:\Users\Dell\caregiver-briefing-tool\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')

url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

resp = urllib.request.urlopen(urllib.request.Request(
    f"{url}/auth/v1/token?grant_type=password",
    data=json.dumps({"email": "pipeline.test.agent@gmail.com",
                     "password": "pipeline-test-password-123!"}).encode(),
    headers={"apikey": anon, "Content-Type": "application/json"}, method="POST"), timeout=60)
tok = resp.read().decode()
jwt = json.loads(tok)["access_token"]
print("JWT obtained")

fh = {"apikey": anon, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}
req = urllib.request.Request(f"{url}/functions/v1/process-document",
                             data=json.dumps({"worker_name": "verify-one"}).encode(),
                             headers=fh, method="POST")
try:
    r = urllib.request.urlopen(req, timeout=150)
    print("FN STATUS", r.status, r.read().decode()[:400])
except urllib.error.HTTPError as e:
    print("FN HTTPERR", e.code, e.read().decode()[:400])

svc = env["SUPABASE_SERVICE_ROLE_KEY"]
h = {"apikey": svc, "Authorization": f"Bearer {svc}"}
time.sleep(3)
r = urllib.request.urlopen(urllib.request.Request(
    f"{url}/rest/v1/documents?select=status,extracted_text&limit=100", headers=h), timeout=30)
rows = json.loads(r.read().decode())
print("doc status:", dict(Counter(x["status"] for x in rows)))
ext = [x for x in rows if x.get("extracted_text")]
print("docs with extracted_text:", len(ext))
if ext:
    print("SAMPLE:", ext[0]["extracted_text"][:400])
