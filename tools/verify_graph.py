#!/usr/bin/env python3
"""Verify that the Graphiti knowledge graph was built for the test patient.

This script does NOT perform any writes; it only GETs from the Graphiti
wrapper (via the cloudflared tunnel, with localhost fallback) and prints
raw JSON plus a best-effort PASS/FAIL assessment.

Run later (after the pipeline has processed the test document):
  C:\Users\Dell\AppData\Local\Programs\Python\Python313\python.exe \
      tools/verify_graph.py
"""

import json
import sys
import urllib.error
import urllib.request

# ---------------------------------------------------------------------------
# Hardcoded configuration (verified facts from the shared pipeline test brief)
# ---------------------------------------------------------------------------
PATIENT_ID = "9d2333b4-2e40-4565-bcc4-fb73e4c2cb9c"

# Primary target: the cloudflared tunnel to the local Graphiti wrapper.
TUNNEL_BASE = "https://receiving-person-wonderful-builds.trycloudflare.com"
# Fallback if the tunnel has died: the local wrapper directly.
LOCAL_BASE = "http://localhost:8000"

# Candidate bases, tried in order.
BASES = [TUNNEL_BASE, LOCAL_BASE]

REQUEST_TIMEOUT = 30

# Entities we expect to find trends for.
TREND_ENTITIES = ["Creatinine", "GFR"]

USER_AGENT = "caregiver-briefing-tool/verify_graph"


def make_url(base: str, path: str) -> str:
    return base.rstrip("/") + path


def http_get_json(url: str):
    """GET a URL and return (ok, payload_or_error_string, status_code)."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            status = resp.getcode()
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return False, f"HTTPError {e.code}: {e.reason}", e.code
    except urllib.error.URLError as e:
        # Tunnel died / wrapper down / DNS failure.
        return False, f"URLError: {e.reason}", None
    except Exception as e:  # noqa: BLE001 - we want to be defensive here
        return False, f"{type(e).__name__}: {e}", None

    # Try to parse JSON; if it fails, return raw text so we can still inspect.
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        payload = {"__raw_text__": raw}
    return True, payload, status


def try_bases(path: str):
    """Try each base until one answers. Returns (base_used, ok, payload, status)."""
    last_err = None
    for base in BASES:
        url = make_url(base, path)
        print(f"\n--- GET {url}")
        ok, payload, status = http_get_json(url)
        if ok:
            return base, ok, payload, status
        last_err = payload
        print(f"    failed: {payload}")
    return None, False, last_err, None


def best_effort_facts(payload):
    """Extract a list of fact-like objects from the (unknown) response shape.

    Handles common shapes:
      - {"facts": [...]} or {"data": {"facts": [...]}}
      - {"episode_id": ..., "facts": [...]}
      - a bare list
      - graph-node style {"nodes": [...], "edges": [...]}
    Returns (facts_list, entity_names_set, raw_facts_repr).
    """
    facts = []
    if isinstance(payload, list):
        facts = payload
    elif isinstance(payload, dict):
        # Drill into common wrapper keys.
        for key in ("facts", "results", "items", "data"):
            val = payload.get(key)
            if isinstance(val, list):
                facts = val
                break
            if isinstance(val, dict):
                for sub in ("facts", "results", "items"):
                    if isinstance(val.get(sub), list):
                        facts = val[sub]
                        break
        # Graph node style.
        if not facts and isinstance(payload.get("nodes"), list):
            facts = payload["nodes"]
        # If still nothing but the payload has entity_name / name, treat as one.
        if not facts and ("entity_name" in payload or "name" in payload):
            facts = [payload]

    entity_names = set()
    for f in facts:
        if isinstance(f, dict):
            for key in ("entity_name", "name", "entity", "label", "subject"):
                v = f.get(key)
                if v:
                    entity_names.add(str(v))
                    break
    return facts, entity_names


def looks_like_lab_or_med(f: dict) -> bool:
    text = json.dumps(f, default=str).lower()
    markers = (
        "creatinine", "gfr", "glucose", "hemoglobin", "sodium", "potassium",
        "medication", "med", "drug", "dose", "lab", "observation",
    )
    return any(m in text for m in markers)


def main() -> int:
    print("=" * 70)
    print("Graphiti knowledge-graph verification")
    print(f"Patient ID: {PATIENT_ID}")
    print("=" * 70)

    # 1) Reachability probe: GET / (or /docs).
    print("\n[1] Reachability probe -> GET /")
    base, ok, payload, status = try_bases("/")
    if not ok:
        # Try /docs as a fallback liveness check.
        print("    / failed, trying /docs ...")
        base, ok, payload, status = try_bases("/docs")
    if ok:
        print(f"    REACHABLE via {base} (status {status})")
        print("    raw response (truncated):")
        print("    " + json.dumps(payload, indent=2, default=str)[:800])
    else:
        print("\n*** CONNECTION ERROR: wrapper is NOT reachable. ***")
        print(f"    Last error: {payload}")
        print("    The tunnel may have died, or the local wrapper is down.")
        print("    Cannot proceed with verification.")
        return 2

    # 2) patient-state: current facts (valid_to is None).
    print("\n[2] GET /patient-state/{patient_id}")
    _, ok, ps_payload, ps_status = try_bases(f"/patient-state/{PATIENT_ID}")
    if not ok:
        print(f"    FAILED: {ps_payload}")
        print("*** patient-state endpoint unavailable -> FAIL ***")
        return 1

    print("    RAW JSON:")
    print(json.dumps(ps_payload, indent=2, default=str))

    facts, entity_names = best_effort_facts(ps_payload)
    n_facts = len(facts)
    any_lab_med = any(isinstance(f, dict) and looks_like_lab_or_med(f) for f in facts)

    print(f"\n    best-effort parsed: {n_facts} fact-like objects")
    print(f"    distinct entity names: {sorted(entity_names)}")
    print(f"    any labs/meds present: {any_lab_med}")

    # 3) trends for Creatinine (and GFR if present).
    print("\n[3] GET /trend/{patient_id}/{entity}")
    for ent in TREND_ENTITIES:
        _, ok, tr_payload, tr_status = try_bases(
            f"/trend/{PATIENT_ID}/{ent}"
        )
        if not ok:
            print(f"    {ent}: FAILED ({tr_payload})")
            continue
        print(f"\n    --- {ent} RAW JSON:")
        print(json.dumps(tr_payload, indent=2, default=str))

        # Best-effort chronological extraction.
        series = None
        if isinstance(tr_payload, list):
            series = tr_payload
        elif isinstance(tr_payload, dict):
            for k in ("values", "data", "results", "history", "points"):
                if isinstance(tr_payload.get(k), list):
                    series = tr_payload[k]
                    break
        if series is None:
            print(f"    {ent}: could not locate a values array; see raw above.")
            continue
        print(f"    {ent}: {len(series)} chronological point(s):")
        for pt in series:
            if isinstance(pt, dict):
                vf = pt.get("valid_from") or pt.get("timestamp") or pt.get("date")
                val = (
                    pt.get("value")
                    or pt.get("value_float")
                    or pt.get("val")
                    or pt.get("data")
                )
                print(f"      valid_from={vf}  value={val}")
            else:
                print(f"      {pt}")

    # 4) Final verdict.
    print("\n" + "=" * 70)
    print("VERDICT")
    print("=" * 70)
    if n_facts > 0:
        print("PASS: patient-state returned a non-empty set of facts.")
        print(f"  - facts (best-effort count): {n_facts}")
        print(f"  - distinct entity names: {len(entity_names)} "
              f"-> {sorted(entity_names)}")
        print(f"  - labs/meds appear: {any_lab_med}")
        return 0
    else:
        print("FAIL: patient-state returned NO facts for this patient.")
        print("  Graphiti does not appear to have stored this patient's data,")
        print("  or the response shape was unrecognized (see raw JSON above).")
        return 1


if __name__ == "__main__":
    sys.exit(main())
