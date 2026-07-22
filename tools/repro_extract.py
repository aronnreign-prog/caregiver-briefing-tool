import json, urllib.request, urllib.error, os, base64

env = {}
for line in open(r"C:\Users\Dell\caregiver-briefing-tool\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')

url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
svc = env["SUPABASE_SERVICE_ROLE_KEY"]
h = {"apikey": svc, "Authorization": f"Bearer {svc}"}

# Get one document's storage_path
r = urllib.request.urlopen(urllib.request.Request(
    f"{url}/rest/v1/documents?select=id,storage_path&limit=1", headers=h), timeout=30)
doc = json.loads(r.read().decode())[0]
print("doc:", doc)

# Download PDF from storage
sr = urllib.request.urlopen(urllib.request.Request(
    f"{url}/storage/v1/object/medical_records/{doc['storage_path']}", headers=h), timeout=60)
pdf_bytes = sr.read()
print("PDF bytes:", len(pdf_bytes))

# POST to wrapper
body = json.dumps({"pdf_base64": base64.b64encode(pdf_bytes).decode()}).encode()
req = urllib.request.Request("https://volunteers-canal-york-oem.trycloudflare.com/extract-pdf",
                             data=body, headers={"Content-Type": "application/json"}, method="POST")
try:
    resp = urllib.request.urlopen(req, timeout=150)
    out = resp.read().decode()
    print("STATUS 200, len:", len(out))
    print(out[:500])
except urllib.error.HTTPError as e:
    print("HTTPERR", e.code, e.read().decode()[:500])
except Exception as e:
    print("ERR", type(e).__name__, e)
