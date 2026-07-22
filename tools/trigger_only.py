import json, time, urllib.request, urllib.error, os

env = {}
for line in open(r"C:\Users\Dell\caregiver-briefing-tool\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')

url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
email = "pipeline.test.agent@gmail.com"
pw = "pipeline-test-password-123!"

def post(u, headers, body):
    req = urllib.request.Request(u, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        r = urllib.request.urlopen(req, timeout=60)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# get JWT via password grant
st, tok = post(f"{url}/auth/v1/token?grant_type=password",
               {"apikey": anon, "Content-Type": "application/json"},
               {"email": email, "password": pw})
if st != 200:
    print("JWT FAIL", st, tok[:200]); raise SystemExit(1)
jwt = json.loads(tok)["access_token"]
print("JWT obtained")

fn_url = f"{url}/functions/v1/process-document"
fn_headers = {"apikey": anon, "Authorization": f"Bearer {jwt}", "Content-Type": "application/json"}

for i in range(25):
    st, body = post(fn_url, fn_headers, {"worker_name": f"trigger-{i}"})
    print(f"call {i}: {st} {body[:160]}")
    if "No queued jobs" in body:
        print("QUEUE DRAINED")
        break
    time.sleep(4)

# report final state via REST (service role)
svc = env["SUPABASE_SERVICE_ROLE_KEY"]
h = {"apikey": svc, "Authorization": f"Bearer {svc}"}
for table in ("documents", "jobs"):
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            f"{url}/rest/v1/{table}?select=status&limit=1000", headers=h), timeout=30)
        rows = json.loads(r.read().decode())
        from collections import Counter
        print(table, dict(Counter(x["status"] for x in rows)))
    except Exception as e:
        print(table, "ERR", e)
