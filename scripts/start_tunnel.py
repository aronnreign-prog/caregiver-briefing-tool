#!/usr/bin/env python3
"""Start the graphiti-wrapper ngrok tunnel (stable reserved domain) and sync its
URL to the Supabase GRAPHITI_WRAPPER_URL secret.

Usage:
    py scripts/start_tunnel.py

What it does:
    1. Launches `ngrok http 8000 --domain <static-domain>` as a child process.
    2. The reserved static domain means the public URL never changes, so the
       Supabase secret is set once and stays valid across restarts.
    3. Verifies the tunnel is reachable (GET /health).
    4. Pushes the URL to the linked Supabase project secret GRAPHITI_WRAPPER_URL
       via `supabase secrets set`.

Requires: ngrok on PATH + authtoken configured, supabase CLI linked to the
project, and the graphiti-wrapper already listening on localhost:8000.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.request

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "")
LOCAL_PORT = "8000"
STATIC_DOMAIN = os.environ.get("NGROK_STATIC_DOMAIN", "")
TUNNEL_URL = f"https://{STATIC_DOMAIN}"
HEALTH_TIMEOUT = 30  # seconds for the /health check


def check_health(base: str) -> bool:
    url = base.rstrip("/") + "/health"
    for _ in range(HEALTH_TIMEOUT):
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                return r.status == 200
        except Exception:
            time.sleep(1)
    return False


def main() -> None:
    print(f"[*] Starting ngrok tunnel -> {TUNNEL_URL} (static domain)")
    ngrok_bin = shutil.which("ngrok")
    if not ngrok_bin:
        sys.exit("[fatal] ngrok not found on PATH")

    proc = subprocess.Popen(
        ["ngrok", "http", LOCAL_PORT, "--url", TUNNEL_URL],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        # ngrok needs a few seconds to establish the tunnel
        time.sleep(5)
        if proc.poll() is not None:
            sys.exit(f"[fatal] ngrok exited early (code {proc.returncode})")

        if not check_health(TUNNEL_URL):
            proc.terminate()
            sys.exit("[fatal] ngrok tunnel not reachable (/health failed)")

        print(f"[*] Tunnel healthy: {TUNNEL_URL}")

        supabase_bin = shutil.which("supabase.cmd") or shutil.which("supabase")
        if not supabase_bin:
            proc.terminate()
            sys.exit("[fatal] supabase CLI not found on PATH")

        print("[*] Syncing GRAPHITI_WRAPPER_URL secret...")
        res = subprocess.run(
            [
                supabase_bin, "secrets", "set",
                f"GRAPHITI_WRAPPER_URL={TUNNEL_URL}",
                "--project-ref", PROJECT_REF,
            ],
            check=False,
            shell=True,
        )
        if res.returncode != 0:
            proc.terminate()
            sys.exit("[fatal] supabase secrets set failed")

        print(f"[ok] GRAPHITI_WRAPPER_URL = {TUNNEL_URL}")
        print("[*] Tunnel running in foreground. Ctrl-C to stop.")
        proc.wait()
    except KeyboardInterrupt:
        print("\n[*] Stopping tunnel...")
        proc.terminate()


if __name__ == "__main__":
    main()
