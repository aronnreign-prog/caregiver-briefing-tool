import json, urllib.request, urllib.error, os

env = {}
for line in open(r"C:\Users\Dell\caregiver-briefing-tool\.env.local", encoding="utf-8"):
    line = line.strip()
    if line and "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"')

url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
svc = env["SUPABASE_SERVICE_ROLE_KEY"]
h = {"apikey": svc, "Authorization": f"Bearer {svc}", "Content-Type": "application/json"}

def patch(table, body, filter_q):
    u = f"{url}/rest/v1/{table}?{filter_q}"
    req = urllib.request.Request(u, data=json.dumps(body).encode(), headers=h, method="PATCH")
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Reset stuck jobs (failed/processing) -> queued
st, b = patch("jobs", {"status": "queued", "error_message": None, "completed_at": None},
              "job_type=eq.process_document&status=in.(failed,processing)")
print("jobs reset:", st, b[:120])

# Reset their documents -> uploaded
st, b = patch("documents", {"status": "uploaded", "error_message": None,
                            "extracted_text": None, "processed_at": None},
              "status=in.(failed,processing)")
print("documents reset:", st, b[:120])

# Report final state
for table in ("documents", "jobs"):
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            f"{url}/rest/v1/{table}?select=status&limit=1000", headers=h), timeout=30)
        rows = json.loads(r.read().decode())
        from collections import Counter
        print(table, dict(Counter(x["status"] for x in rows)))
    except Exception as e:
        print(table, "ERR", e)
