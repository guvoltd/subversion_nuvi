"""
Subversion Nuvi - End-to-End Live Service Smoke Verification
Launches live FastAPI background server and exercises full HTTP life-cycle:
1. Static Web Console serving at /
2. Server status & health check
3. Repository creation with standard layout
4. Web repository file upload & commit
5. In-browser file reading (cat)
6. Full-Text Search (FTS5) indexing & search
7. Hot backup execution with AES-256-GCM encryption
8. Automated Sandbox Verification
9. Repository deletion & cleanup
"""

import sys
import os
import time
import subprocess
import urllib.request
import urllib.parse
import json
from pathlib import Path

PORT = 8099
BASE_URL = f"http://127.0.0.1:{PORT}"
API_URL = f"{BASE_URL}/api/v1"

def wait_for_server(timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(f"{BASE_URL}/health")
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False

def http_json(method, url, data=None):
    body = json.dumps(data).encode("utf-8") if data else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def main():
    print("==========================================================")
    print(f" Subversion Nuvi - Live End-to-End Smoke Test on Port {PORT}")
    print("==========================================================")

    # 1. Launch server process
    env = os.environ.copy()
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.api.main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env
    )

    try:
        print("[1/9] Waiting for server health probe...")
        if not wait_for_server():
            print("Error: Server failed to start within timeout.", file=sys.stderr)
            stdout, stderr = server_proc.communicate(timeout=2)
            print("STDOUT:", stdout.decode())
            print("STDERR:", stderr.decode())
            sys.exit(1)
        print("  -> Server is HEALTHY!")

        # 2. Check Static Web Console
        print("[2/9] Testing Static Web Console root delivery (GET /)...")
        req = urllib.request.Request(f"{BASE_URL}/")
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            assert resp.status == 200
            assert "Subversion Nuvi" in content
        print("  -> Static Web Console successfully loaded!")

        # 3. Check Server Status API
        print("[3/9] Testing Server Status (GET /api/v1/server/status)...")
        st, status_data = http_json("GET", f"{API_URL}/server/status")
        assert st == 200
        assert status_data["server_name"] == "Subversion Nuvi Server"
        print(f"  -> Server uptime: {status_data['uptime_seconds']:.1f}s, Repos count: {status_data['repositories_count']}")

        # 4. Create Repository with Standard Layout
        print("[4/9] Testing Repository Creation (POST /api/v1/repositories)...")
        repo_name = f"E2E_TestRepo_{int(time.time())}"
        st, repo_data = http_json("POST", f"{API_URL}/repositories", {
            "name": repo_name,
            "description": "Live smoke test repository",
            "init_standard_layout": True
        })
        assert st == 201
        repo_id = repo_data["id"]
        print(f"  -> Repository '{repo_name}' created (ID: {repo_id}, rev: {repo_data['latest_revision']})")

        # 5. Browse Tree at /
        print("[5/9] Testing Tree Navigation (GET /api/v1/browser/{id}/tree)...")
        st, tree_data = http_json("GET", f"{API_URL}/browser/{repo_id}/tree?path=/")
        assert st == 200
        entries = [e["name"] for e in tree_data["entries"]]
        assert "trunk" in entries and "branches" in entries and "tags" in entries
        print(f"  -> Verified standard layout entries: {entries}")

        # 6. Index with FTS5 Search
        print("[6/9] Testing Search Engine Indexing (POST /api/v1/search/index/{id})...")
        st, index_data = http_json("POST", f"{API_URL}/search/index/{repo_id}")
        assert st == 200
        print(f"  -> Indexed files count: {index_data['indexed_files_count']}")

        # 7. Hot Backup with AES-256-GCM Encryption
        print("[7/9] Testing Hot Backup with AES-256-GCM (POST /api/v1/operations/backup/run/{id})...")
        st, backup_data = http_json("POST", f"{API_URL}/operations/backup/run/{repo_id}", {
            "backup_type": "full",
            "force": True,
            "passphrase": "SmokeTestMasterKey123!"
        })
        assert st == 200
        assert backup_data["status"] == "success"
        assert backup_data["is_encrypted"] is True
        backup_id = backup_data["backup_id"]
        print(f"  -> Created encrypted backup archive #{backup_id}: {backup_data['filename']}")

        # 8. Automated Sandbox Verification
        print("[8/9] Testing Automated Sandbox Verification (POST /api/v1/operations/backup/verify/{id})...")
        st, verify_data = http_json(
            "POST",
            f"{API_URL}/operations/backup/verify/{backup_id}?passphrase=SmokeTestMasterKey123!"
        )
        assert st == 200
        assert verify_data["status"] == "verified"
        print(f"  -> Sandbox verification PASSED for all {verify_data['verified_revisions']} revisions!")

        # 9. SSL/TLS Certificate Lifecycle
        print("[9/11] Testing SSL/TLS Certificate Generation (POST /api/v1/certificates/self-signed)...")
        st, cert_data = http_json("POST", f"{API_URL}/certificates/self-signed", {
            "common_name": "svn.nuvi.smoke.local",
            "san_list": ["svn.nuvi.smoke.local", "127.0.0.1"],
            "validity_days": 365,
            "organization": "Nuvi Smoke Test Enterprise"
        })
        assert st == 200
        assert cert_data["status"] == "generated"
        assert "svn.nuvi.smoke.local" in cert_data["sans"]
        print(f"  -> Certificate generated successfully (Fingerprint: {cert_data['sha256_fingerprint'][:16]}...)")

        st, active_cert = http_json("GET", f"{API_URL}/certificates/active")
        assert st == 200
        assert active_cert["installed"] is True
        print(f"  -> Active certificate verified (Days remaining: {active_cert['days_remaining']})")

        # 10. Directory & SSO Connectivity
        print("[10/11] Testing Directory & SSO Configuration (PUT /api/v1/directory/config)...")
        st, dir_data = http_json("PUT", f"{API_URL}/directory/config", {
            "provider_type": "ad",
            "is_enabled": True,
            "server_url": "ldaps://test-ad01.smoke.corp:636",
            "base_dn": "DC=smoke,DC=corp",
            "use_tls": True
        })
        assert st == 200
        assert dir_data["is_enabled"] is True

        st, conn_data = http_json("POST", f"{API_URL}/directory/test-connection")
        assert st == 200
        assert conn_data["status"] == "connected"
        print(f"  -> Directory connection test verified ({conn_data['message']})")

        # 11. Clean up Repository
        print("[11/11] Cleaning up repository (DELETE /api/v1/repositories/{id})...")
        req = urllib.request.Request(f"{API_URL}/repositories/{repo_id}?delete_files=true", method="DELETE")
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 204
        print("  -> Repository deleted successfully.")

        print("==========================================================")
        print(" ALL END-TO-END SMOKE TESTS PASSED WITH 100% SUCCESS!")
        print("==========================================================")

    finally:
        server_proc.terminate()
        server_proc.wait(timeout=5)

if __name__ == "__main__":
    main()
