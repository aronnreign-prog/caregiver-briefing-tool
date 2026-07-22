#!/usr/bin/env python3
"""Ingest pre-generated PDFs into the Caregiver Briefing Tool pipeline.

This script:
  1. Reads Supabase config from .env.local
  2. For each PDF in PIPELINE_PDF_DIR:
       a. Uploads it to the `medical_records` bucket ({PATIENT_ID}/{filename})
       b. Inserts a `documents` row (service role)
       c. Inserts a `jobs` row (job_type='process_document', status='queued')
  3. Invokes the deployed `process-document` Edge Function (verify_jwt=true).
     The function claims the next queued job itself, so we POST with a valid
     user JWT and loop until no queued jobs remain.
  4. Prints progress and final document status.

Auth approach for verify_jwt:
  We create a test auth user via the Supabase Auth REST API using the ANON key
  (auth/v1/signup). Supabase may require email confirmation; if so, signup
  returns the user without a session. We then auto-confirm the user using the
  SERVICE ROLE key (auth/v1/admin/users/{id}) and sign in via
  auth/v1/token?grant_type=password to obtain a valid JWT with a session.

Run with the Python 3.13 interpreter against tools\\ingest_and_run.py
"""

import os
import sys
import time
import json
import glob

import requests
from dotenv import load_dotenv  # optional; falls back to manual parse

# --------------------------------------------------------------------------
# Configuration — all sensitive values read from env vars or .env.local
# DO NOT hardcode UUIDs, emails, passwords, or machine-specific paths here.
# --------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
ENV_PATH = os.path.join(PROJECT_ROOT, ".env.local")

# PDF directory: set PIPELINE_PDF_DIR env var or pass as CLI arg
# Default falls back to a 'pipeline_pdfs/' folder inside the project root
PIPELINE_PDF_DIR = os.environ.get(
    "PIPELINE_PDF_DIR",
    os.path.join(PROJECT_ROOT, "pipeline_pdfs")
)
# Patient/caregiver UUIDs: set in env — never hardcode real DB row IDs in source
PATIENT_ID = os.environ.get("TEST_PATIENT_ID", "")
CAREGIVER_ID = os.environ.get("TEST_CAREGIVER_ID", "")
BUCKET = "medical_records"
FUNCTION_PATH = "/functions/v1/process-document"

# Polling / retry limits
MAX_FUNCTION_CALLS = 200          # safety cap on Edge Function POSTs
CALL_INTERVAL_S = 15.0            # delay between function POSTs
POLL_TIMEOUT_S = 1800             # overall timeout (30 min)
POLL_INTERVAL_S = 10.0            # status poll interval

# Test user credentials: set in env — never hardcode in source
TEST_USER_EMAIL = os.environ.get("TEST_USER_EMAIL", "")
TEST_USER_PASSWORD = os.environ.get("TEST_USER_PASSWORD", "")

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def load_env(path):
    """Load env vars from a .env.local file (manual parse, no dependency)."""
    env = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env


def log(msg):
    print(f"[ingest] {msg}", flush=True)


# --------------------------------------------------------------------------
# Auth: obtain a valid user JWT
# --------------------------------------------------------------------------
def get_user_jwt(supabase_url, anon_key, service_key):
    """Create (or reuse) a test auth user and return a valid access JWT.

    Strategy:
      - Try signup with anon key.
      - If a session (with access_token) is returned, email confirmation is
        off -> use that token directly.
      - Otherwise confirmation is on: auto-confirm the user via the service-role
        admin API, then sign in with password grant to get a real session token.
    """
    auth_base = f"{supabase_url}/auth/v1"

    # 1. Sign up (anon key)
    signup_headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
    }
    signup_body = {
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
    }

    user_id = None
    access_token = None

    resp = requests.post(
        f"{auth_base}/signup",
        headers=signup_headers,
        json=signup_body,
        timeout=30,
    )

    if resp.status_code in (200, 201):
        data = resp.json()
        user_id = (data.get("user") or {}).get("id")
        session = data.get("session")
        if session and session.get("access_token"):
            access_token = session["access_token"]
            log("Test user signed up and confirmed (session returned).")
        else:
            log("Test user signed up but pending email confirmation.")
    else:
        # 422/400/429 etc -> user may already exist or email send is rate-limited.
        # Fall through to the sign-in / admin-confirm path below.
        if "already registered" in resp.text.lower():
            log("Test user already exists; will sign in.")
        else:
            log(f"signup returned {resp.status_code} ({resp.text[:120]}); will attempt sign-in/admin path.")

    # 2. If we don't have a token yet, we need to confirm + sign in.
    if access_token is None:
        # 2a. Resolve the user id via the admin API (works regardless of
        # confirmation state). If signup already gave us the id, reuse it;
        # otherwise look the user up by email.
        if user_id is None:
            admin_headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            }
            list_resp = requests.get(
                f"{auth_base}/admin/users",
                headers=admin_headers,
                params={"email": TEST_USER_EMAIL},
                timeout=30,
            )
            if list_resp.status_code == 200:
                users = list_resp.json().get("users") or []
                for u in users:
                    if u.get("email", "").lower() == TEST_USER_EMAIL.lower():
                        user_id = u.get("id")
                        break
            if user_id is None:
                raise RuntimeError(
                    "Could not resolve test user id via admin API. "
                    "Confirm the user exists or disable email confirmation."
                )
            log("Resolved existing test user id via admin API.")

        # 2b. Auto-confirm the user with the service role (admin API) only if
        # the account is not already confirmed.
        admin_headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }
        info_resp = requests.get(
            f"{auth_base}/admin/users/{user_id}",
            headers=admin_headers,
            timeout=30,
        )
        if info_resp.status_code == 200:
            confirmed = (info_resp.json().get("confirmed_at") is not None
                         or info_resp.json().get("email_confirmed_at") is not None)
        else:
            confirmed = False

        if not confirmed:
            confirm_resp = requests.put(
                f"{auth_base}/admin/users/{user_id}",
                headers=admin_headers,
                json={"confirm": True},
                timeout=30,
            )
            if confirm_resp.status_code not in (200, 201):
                raise RuntimeError(
                    f"admin confirm failed {confirm_resp.status_code}: {confirm_resp.text}"
                )
            log("Test user email confirmed via admin API.")
        else:
            log("Test user already confirmed; skipping admin confirm.")

        # 2c. Sign in with password grant to get a valid JWT session.
        login_resp = requests.post(
            f"{auth_base}/token?grant_type=password",
            headers={"apikey": anon_key, "Content-Type": "application/json"},
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD},
            timeout=30,
        )
        if login_resp.status_code != 200 or not login_resp.json().get("access_token"):
            raise RuntimeError(
                f"sign-in failed {login_resp.status_code}: {login_resp.text}"
            )
        access_token = login_resp.json()["access_token"]
        log("Test user signed in; obtained JWT.")

    return access_token


# --------------------------------------------------------------------------
# Storage upload (service role)
# --------------------------------------------------------------------------
def upload_pdf(supabase_url, service_key, patient_id, filepath, filename):
    storage_path = f"{patient_id}/{filename}"
    upload_url = (
        f"{supabase_url}/storage/v1/object/{BUCKET}/{storage_path}"
    )
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        # No Content-Type; let requests set multipart or raw properly.
    }
    with open(filepath, "rb") as f:
        filesize = os.fstat(f.fileno()).st_size
        # Upload raw bytes with explicit content-type for the object.
        resp = requests.post(
            upload_url,
            headers={**headers, "Content-Type": "application/pdf"},
            data=f.read(),
            timeout=120,
        )
    if resp.status_code in (200, 201):
        log(f"Uploaded {filename} -> {storage_path} ({filesize} bytes)")
    elif resp.status_code in (400, 409) and "Duplicate" in resp.text:
        # Object already exists from a previous run (Supabase returns HTTP 400
        # with a 409 Duplicate body); treat as success so the pipeline can be
        # re-run idempotently.
        log(f"Upload already exists {filename} -> {storage_path}; reusing.")
    else:
        raise RuntimeError(f"upload failed {resp.status_code}: {resp.text}")
    return storage_path, filesize


# --------------------------------------------------------------------------
# REST inserts (service role)
# --------------------------------------------------------------------------
def rest_insert(supabase_url, service_key, table, payload):
    url = f"{supabase_url}/rest/v1/{table}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"insert {table} failed {resp.status_code}: {resp.text}")
    rows = resp.json()
    if not rows:
        raise RuntimeError(f"insert {table} returned no rows")
    return rows[0]


def find_existing_document(supabase_url, service_key, patient_id, filename):
    url = (
        f"{supabase_url}/rest/v1/documents"
        f"?patient_id=eq.{patient_id}&filename=eq.{filename}&select=id,status"
    )
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    resp = requests.get(url, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"document lookup failed {resp.status_code}: {resp.text}")
    rows = resp.json()
    return rows[0] if rows else None


def find_existing_queued_job(supabase_url, service_key, document_id):
    url = (
        f"{supabase_url}/rest/v1/jobs"
        f"?job_type=eq.process_document&status=eq.queued"
        f"&payload->>document_id=eq.{document_id}&select=id"
    )
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    resp = requests.get(url, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"job lookup failed {resp.status_code}: {resp.text}")
    rows = resp.json()
    return rows[0] if rows else None


def insert_document(supabase_url, service_key, row):
    existing = find_existing_document(
        supabase_url, service_key, row["patient_id"], row["filename"]
    )
    if existing is not None:
        log(f"Document already exists id={existing['id']} filename={row['filename']}")
        return existing["id"]
    created = rest_insert(supabase_url, service_key, "documents", row)
    doc_id = created["id"]
    log(f"Inserted documents id={doc_id} filename={row['filename']}")
    return doc_id


def insert_job(supabase_url, service_key, document_id):
    existing = find_existing_queued_job(supabase_url, service_key, document_id)
    if existing is not None:
        log(f"Queued job already exists id={existing['id']} for document {document_id}")
        return existing["id"]
    payload = {
        "job_type": "process_document",
        "payload": {"document_id": str(document_id)},
        "status": "queued",
    }
    created = rest_insert(supabase_url, service_key, "jobs", payload)
    job_id = created["id"]
    log(f"Inserted jobs id={job_id} for document {document_id}")
    return job_id


# --------------------------------------------------------------------------
# Invoke Edge Function
# --------------------------------------------------------------------------
def invoke_function(supabase_url, anon_key, jwt):
    url = f"{supabase_url}{FUNCTION_PATH}"
    headers = {
        "Authorization": f"Bearer {jwt}",
        "apikey": anon_key,
        "Content-Type": "application/json",
    }
    resp = requests.post(url, headers=headers, json={}, timeout=120)
    return resp


# --------------------------------------------------------------------------
# Status polling (service role)
# --------------------------------------------------------------------------
def get_document_statuses(supabase_url, service_key, doc_ids):
    ids = ",".join(f'"{d}"' for d in doc_ids)
    url = (
        f"{supabase_url}/rest/v1/documents"
        f"?id=in.({ids})&select=id,filename,status,error_message"
    )
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    resp = requests.get(url, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"status query failed {resp.status_code}: {resp.text}")
    return {r["id"]: r for r in resp.json()}


def count_queued_jobs(supabase_url, service_key):
    url = (
        f"{supabase_url}/rest/v1/jobs"
        "?job_type=eq.process_document&status=eq.queued&select=id"
    )
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    resp = requests.get(url, headers=headers, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"job count failed {resp.status_code}: {resp.text}")
    return len(resp.json())


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    # Load config
    env = load_env(ENV_PATH)
    if not env:
        # Fall back to process env
        env = dict(os.environ)

    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    anon_key = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    missing = [
        k for k, v in {
            "NEXT_PUBLIC_SUPABASE_URL": supabase_url,
            "SUPABASE_SERVICE_ROLE_KEY": service_key,
            "NEXT_PUBLIC_SUPABASE_ANON_KEY": anon_key,
        }.items() if not v
    ]
    if missing:
        raise RuntimeError(f"Missing required env vars: {missing}")

    # Check PDF directory
    if not os.path.isdir(PIPELINE_PDF_DIR):
        print(f"ERROR: PDF directory does not exist: {PIPELINE_PDF_DIR}")
        sys.exit(1)

    pdfs = sorted(glob.glob(os.path.join(PIPELINE_PDF_DIR, "*.pdf")))
    if not pdfs:
        print(f"ERROR: No PDFs found in {PIPELINE_PDF_DIR}. Nothing to do.")
        sys.exit(0)

    log(f"Found {len(pdfs)} PDF(s) to ingest.")

    # 1. Auth: get a valid user JWT for the Edge Function
    log("Obtaining test-user JWT for verify_jwt Edge Function...")
    jwt = get_user_jwt(supabase_url, anon_key, service_key)
    log("JWT obtained.")

    # 2. Ingest each PDF
    doc_ids = []
    for filepath in pdfs:
        filename = os.path.basename(filepath)
        log(f"--- Processing {filename} ---")
        try:
            storage_path, file_size = upload_pdf(
                supabase_url, service_key, PATIENT_ID, filepath, filename
            )
            doc_row = {
                "patient_id": PATIENT_ID,
                "caregiver_id": CAREGIVER_ID,
                "filename": filename,
                "storage_path": storage_path,
                "status": "uploaded",
                "mime_type": "application/pdf",
                "file_size": file_size,
            }
            doc_id = insert_document(supabase_url, service_key, doc_row)
            insert_job(supabase_url, service_key, doc_id)
            doc_ids.append(doc_id)
        except Exception as e:
            log(f"FAILED to ingest {filename}: {e}")

    if not doc_ids:
        log("No documents were ingested; exiting.")
        sys.exit(1)

    log(f"Ingested {len(doc_ids)} document(s). Starting pipeline run...")

    # 3. Drive the Edge Function until all jobs drain
    start = time.time()
    calls = 0
    while True:
        queued = count_queued_jobs(supabase_url, service_key)
        if queued == 0:
            log("No queued jobs remaining.")
            break

        if calls >= MAX_FUNCTION_CALLS:
            log(f"Reached MAX_FUNCTION_CALLS ({MAX_FUNCTION_CALLS}); stopping.")
            break

        if time.time() - start > POLL_TIMEOUT_S:
            log(f"POLL_TIMEOUT_S ({POLL_TIMEOUT_S}) exceeded; stopping.")
            break

        calls += 1
        log(f"POST process-document (call #{calls}, {queued} queued)...")
        try:
            resp = invoke_function(supabase_url, anon_key, jwt)
            if resp.status_code == 200:
                log(f"  OK: {resp.text[:300]}")
            else:
                log(f"  HTTP {resp.status_code}: {resp.text[:300]}")
        except Exception as e:
            log(f"  invocation error: {e}")

        time.sleep(CALL_INTERVAL_S)

    # 4. Final status report
    log("=== FINAL DOCUMENT STATUS ===")
    statuses = get_document_statuses(supabase_url, service_key, doc_ids)
    for doc_id in doc_ids:
        s = statuses.get(doc_id, {})
        log(
            f"  {s.get('filename', doc_id)} | status={s.get('status')} | "
            f"error={s.get('error_message')}"
        )

    extracted = [s for s in statuses.values() if s.get("status") == "extracted"]
    failed = [s for s in statuses.values() if s.get("status") == "failed"]
    other = [s for s in statuses.values()
             if s.get("status") not in ("extracted", "failed")]
    log(
        f"Summary: extracted={len(extracted)} failed={len(failed)} "
        f"other={len(other)} (total={len(doc_ids)})"
    )


if __name__ == "__main__":
    main()
