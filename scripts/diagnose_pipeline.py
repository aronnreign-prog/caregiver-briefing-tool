#!/usr/bin/env python3
"""
Pipeline Diagnostic Harness & Shadow Replay Tool
===============================================
Executes multi-layer diagnostic checks across the CareNote pipeline:
- Health Check (`GET /health`)
- Layer 1: PDF Vision Text Extraction (`POST /extract-pdf`)
- Layer 2: Medical Entity Extraction (`POST /extract-entities`)
- Layer 7: FalkorDB Graph Ingestion (`POST /add-facts` with group_id)
- Layer 7: Scoped Graph Retrieval (`GET /patient-state/{id}`, `/trend/{id}/{lab}`)

Options:
  --url URL             Base URL of the Python wrapper (default: http://localhost:8000)
  --pdf PATH            Path to PDF file to test
  --patient-id ID       Patient ID to use for graph scoping (default: diag-patient-001)
  --save-artifacts      Save intermediate JSON layer outputs to .temp/artifacts/
  --replay-artifact PATH Replay downstream layers (Layer 2 & 7) using a saved Layer 1 text file
"""

import os
import sys
import json
import time
import base64
import argparse
from typing import Dict, Any

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Terminal ANSI colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def print_header(title: str):
    print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'='*60}{RESET}\n")

def print_pass(step_name: str, duration_sec: float, details: str = ""):
    print(f"  {GREEN}[OK]{RESET} [{duration_sec:.2f}s] {BOLD}{step_name}{RESET}")
    if details:
        print(f"       {YELLOW}└─ {details}{RESET}")

def print_fail(step_name: str, duration_sec: float, error: str):
    print(f"  {RED}[FAIL]{RESET} [{duration_sec:.2f}s] {BOLD}{step_name}{RESET}")
    print(f"         {RED}└─ Error: {error}{RESET}")

def http_post(url: str, payload: dict, timeout: int = 60) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "CareNote-DiagHarness/1.0"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def http_get(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "CareNote-DiagHarness/1.0"},
        method="GET"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_diagnostics(base_url: str, pdf_path: str, patient_id: str, save_artifacts: bool, replay_artifact: str | None):
    base_url = base_url.rstrip("/")
    artifact_dir = os.path.join(os.getcwd(), ".temp", "artifacts", patient_id)
    if save_artifacts:
        os.makedirs(artifact_dir, exist_ok=True)

    print_header(f"CARENOTE PIPELINE DIAGNOSTIC HARNESS — {base_url}")
    print(f"Patient ID:  {BOLD}{patient_id}{RESET}")
    if pdf_path:
        print(f"Target PDF:  {pdf_path}")
    if replay_artifact:
        print(f"Replay File: {replay_artifact} (Bypassing Layer 1 Vision API)")

    # -------------------------------------------------------------------------
    # STEP 0: Health Check
    # -------------------------------------------------------------------------
    t0 = time.time()
    try:
        health = http_get(f"{base_url}/health")
        duration = time.time() - t0
        db_status = health.get("falkordb", "unknown")
        llm_model = health.get("llm_model", "unknown")
        print_pass("Health Check (GET /health)", duration, f"FalkorDB: {db_status} | LLM: {llm_model}")
    except Exception as e:
        duration = time.time() - t0
        print_fail("Health Check (GET /health)", duration, str(e))
        print("\nAborting diagnostic — target service is unhealthy.")
        return

    # -------------------------------------------------------------------------
    # STEP 1: Layer 1 PDF Vision Text Extraction
    # -------------------------------------------------------------------------
    extracted_text = ""
    if replay_artifact:
        t0 = time.time()
        with open(replay_artifact, "r", encoding="utf-8") as f:
            data = json.load(f)
            extracted_text = data.get("extracted_text", "")
        duration = time.time() - t0
        print_pass("Layer 1: PDF Vision Text (Replayed from Artifact)", duration, f"{len(extracted_text)} chars loaded")
    else:
        if not pdf_path or not os.path.exists(pdf_path):
            print(f"\n{RED}Error: PDF file '{pdf_path}' not found.{RESET}")
            return

        t0 = time.time()
        try:
            with open(pdf_path, "rb") as f:
                pdf_base64 = base64.b64encode(f.read()).decode("utf-8")

            res1 = http_post(f"{base_url}/extract-pdf", {"pdf_base64": pdf_base64}, timeout=90)
            duration = time.time() - t0
            extracted_text = res1.get("extracted_text", "")
            print_pass("Layer 1: PDF Vision Text (/extract-pdf)", duration, f"Extracted {len(extracted_text)} chars")

            if save_artifacts:
                art_path = os.path.join(artifact_dir, "l1_extracted_text.json")
                with open(art_path, "w", encoding="utf-8") as f:
                    json.dump({"extracted_text": extracted_text, "timestamp": time.time()}, f, indent=2)
                print(f"         {CYAN}├─ Saved artifact: {art_path}{RESET}")
        except Exception as e:
            duration = time.time() - t0
            print_fail("Layer 1: PDF Vision Text (/extract-pdf)", duration, str(e))
            return

    # -------------------------------------------------------------------------
    # STEP 2: Layer 2 Medical Entity Extraction
    # -------------------------------------------------------------------------
    t0 = time.time()
    extracted_entities = {"medications": [], "lab_values": []}
    try:
        res2 = http_post(f"{base_url}/extract-entities", {"text": extracted_text}, timeout=45)
        duration = time.time() - t0
        extracted_entities = res2
        med_count = len(res2.get("medications", []))
        lab_count = len(res2.get("lab_values", []))
        print_pass("Layer 2: Medical Entity Extraction (/extract-entities)", duration, f"Found {med_count} meds, {lab_count} labs")

        if save_artifacts:
            art_path = os.path.join(artifact_dir, "l2_entities.json")
            with open(art_path, "w", encoding="utf-8") as f:
                json.dump(extracted_entities, f, indent=2)
            print(f"         {CYAN}├─ Saved artifact: {art_path}{RESET}")
    except Exception as e:
        duration = time.time() - t0
        print_fail("Layer 2: Medical Entity Extraction (/extract-entities)", duration, str(e))

    # -------------------------------------------------------------------------
    # STEP 3: Layer 7 Graphiti FalkorDB Ingestion (/add-facts)
    # -------------------------------------------------------------------------
    t0 = time.time()
    try:
        doc_id = f"diag-doc-{int(time.time())}"
        payload3 = {
            "patient_id": patient_id,
            "episode_text": extracted_text[:2000], # Send snapshot text
            "source_doc_id": doc_id,
            "source_doc_date": "2024-03-15",
            "entities": extracted_entities.get("medications", []) + extracted_entities.get("lab_values", []),
            "reference_time": "2024-03-15T00:00:00Z"
        }
        res3 = http_post(f"{base_url}/add-facts", payload3, timeout=30)
        duration = time.time() - t0
        status = res3.get("status", "unknown")
        print_pass("Layer 7: FalkorDB Graph Ingestion (/add-facts)", duration, f"Enqueued async episode 'doc_{doc_id}' (group_id={patient_id}) -> status={status}")

        if save_artifacts:
            art_path = os.path.join(artifact_dir, "l7_add_facts_req.json")
            with open(art_path, "w", encoding="utf-8") as f:
                json.dump(payload3, f, indent=2)
            print(f"         {CYAN}├─ Saved artifact: {art_path}{RESET}")
    except Exception as e:
        duration = time.time() - t0
        print_fail("Layer 7: FalkorDB Graph Ingestion (/add-facts)", duration, str(e))

    # Wait 3 seconds for background graphiti extraction task to complete
    print(f"\n  {YELLOW}⏳ Waiting 3 seconds for background Graphiti ingestion task to complete...{RESET}")
    time.sleep(3)

    # -------------------------------------------------------------------------
    # STEP 4: Scoped Graph Retrieval (/patient-state/{id})
    # -------------------------------------------------------------------------
    t0 = time.time()
    try:
        res4 = http_get(f"{base_url}/patient-state/{patient_id}")
        duration = time.time() - t0
        facts = res4.get("current_facts", [])
        print_pass(f"Layer 7: Patient State Retrieval (/patient-state/{patient_id})", duration, f"Retrieved {len(facts)} active facts for group_id={patient_id}")

        if save_artifacts:
            art_path = os.path.join(artifact_dir, "l7_patient_state.json")
            with open(art_path, "w", encoding="utf-8") as f:
                json.dump(res4, f, indent=2)
            print(f"         {CYAN}├─ Saved artifact: {art_path}{RESET}")
    except Exception as e:
        duration = time.time() - t0
        print_fail(f"Layer 7: Patient State Retrieval (/patient-state/{patient_id})", duration, str(e))

    print_header("DIAGNOSTIC COMPLETE")

def main():
    parser = argparse.ArgumentParser(description="CareNote Pipeline Diagnostic Harness")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of Python wrapper (default: http://localhost:8000)")
    parser.add_argument("--pdf", default="synthea-test-data/pdfs/Mr._John_A_Smith_medications_list.pdf", help="Path to PDF to test")
    parser.add_argument("--patient-id", default="diag-patient-001", help="Patient ID for group_id scoping")
    parser.add_argument("--save-artifacts", action="store_true", help="Save layer JSON artifacts to .temp/artifacts/")
    parser.add_argument("--replay-artifact", help="Path to l1_extracted_text.json to skip Vision API call")
    args = parser.parse_args()

    run_diagnostics(args.url, args.pdf, args.patient_id, args.save_artifacts, args.replay_artifact)

if __name__ == "__main__":
    main()
