import json, urllib.request, urllib.error, os, base64, time

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
    f"{url}/rest/v1/documents?select=storage_path&limit=1", headers=h), timeout=30)
doc = json.loads(r.read().decode())[0]
sr = urllib.request.urlopen(urllib.request.Request(
    f"{url}/storage/v1/object/medical_records/{doc['storage_path']}", headers=h), timeout=60)
pdf_bytes = sr.read()
b64 = base64.b64encode(pdf_bytes).decode()

BASE = "https://volunteers-canal-york-oem.trycloudflare.com"
MODELS = [
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b:free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
]

for m in MODELS:
    body = json.dumps({"pdf_base64": b64, "model": m}).encode()
    req = urllib.request.Request(f"{BASE}/extract-pdf", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    t = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=110)
        out = resp.read().decode()
        dt = time.time() - t
        print(f"OK  {m:45s} {dt:6.1f}s  text_len={len(out)}")
    except urllib.error.HTTPError as e:
        dt = time.time() - t
        print(f"ERR {m:45s} {dt:6.1f}s  {e.code} {e.read().decode()[:80]}")
    except Exception as e:
        dt = time.time() - t
        print(f"ERR {m:45s} {dt:6.1f}s  {type(e).__name__}: {e}")
