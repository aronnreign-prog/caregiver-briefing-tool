import urllib.request, json, sys

BASE = "https://volunteers-canal-york-oem.trycloudflare.com"

# 1) Check schema includes extract-pdf
try:
    d = urllib.request.urlopen(f"{BASE}/openapi.json", timeout=10).read().decode()
    print("extract-pdf in schema:", "extract-pdf" in d)
except Exception as e:
    print("schema err", e)

# 2) Direct smoke test of /extract-pdf with a 1-page dummy PDF (valid PDF bytes)
# Minimal valid PDF generated below.
pdf = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\n"
    b"startxref\n164\n%%EOF\n"
)
import base64
body = json.dumps({"pdf_base64": base64.b64encode(pdf).decode()}).encode()
req = urllib.request.Request(f"{BASE}/extract-pdf", data=body,
                             headers={"Content-Type": "application/json"}, method="POST")
try:
    r = urllib.request.urlopen(req, timeout=90)
    print("extract-pdf status:", r.status)
    print("extract-pdf body:", r.read().decode()[:300])
except Exception as e:
    print("extract-pdf ERR:", e)
