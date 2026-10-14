"""
Unit & Integration Tests for Phase 3: Modern Web Repository Client & Preview Engine
"""

import io
import uuid
import zipfile
import pytest
from fastapi.testclient import TestClient
from backend.api.main import app
from backend.api.db import init_db

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()

def test_repository_browser_lifecycle():
    uid = uuid.uuid4().hex[:6]
    repo_name = f"browser_repo_{uid}"

    # 1. Create repository with standard layout (/trunk, /branches, /tags)
    create_res = client.post("/api/v1/repositories", json={
        "name": repo_name,
        "description": "Browser test repo",
        "init_standard_layout": True,
        "layout_author": "admin"
    })
    assert create_res.status_code == 201
    repo_id = create_res.json()["id"]

    try:
        # 2. Browse directory tree at root /
        tree_res = client.get(f"/api/v1/browser/{repo_id}/tree?path=/")
        assert tree_res.status_code == 200
        tree_data = tree_res.json()
        assert tree_data["revision"] == 1
        entry_names = [e["name"] for e in tree_data["entries"]]
        assert "trunk" in entry_names
        assert "branches" in entry_names
        assert "tags" in entry_names

        # 3. Web upload a README.md file into /trunk
        readme_text = "# Project Alpha\nWelcome to Subversion Nuvi repository.\n"
        upload_res = client.post(
            f"/api/v1/browser/{repo_id}/upload",
            data={
                "file_path": "/trunk/README.md",
                "commit_author": "developer-alice",
                "commit_message": "Add introductory README markdown"
            },
            files={"file": ("README.md", io.BytesIO(readme_text.encode("utf-8")), "text/markdown")}
        )
        assert upload_res.status_code == 200
        rev2 = upload_res.json()["committed_revision"]
        assert rev2 == 2

        # 4. Browse /trunk -> should list README.md and auto-render readme content
        trunk_res = client.get(f"/api/v1/browser/{repo_id}/tree?path=/trunk")
        assert trunk_res.status_code == 200
        trunk_data = trunk_res.json()
        assert any(e["name"] == "README.md" for e in trunk_data["entries"])
        assert trunk_data["readme"] is not None
        assert "Welcome to Subversion Nuvi" in trunk_data["readme"]

        # 5. Cat file /trunk/README.md
        cat_res = client.get(f"/api/v1/browser/{repo_id}/cat?path=/trunk/README.md")
        assert cat_res.status_code == 200
        assert cat_res.json()["content"] == readme_text
        assert "markdown" in cat_res.json()["mime_type"] or "text" in cat_res.json()["mime_type"]

        # 6. Raw file streaming
        raw_res = client.get(f"/api/v1/browser/{repo_id}/raw?path=/trunk/README.md")
        assert raw_res.status_code == 200
        assert raw_res.content == readme_text.encode("utf-8")

        # 7. Download folder as ZIP
        zip_res = client.get(f"/api/v1/browser/{repo_id}/zip?path=/trunk")
        assert zip_res.status_code == 200
        assert zip_res.headers["content-type"] == "application/zip"
        
        # Verify ZIP archive contents
        with zipfile.ZipFile(io.BytesIO(zip_res.content), "r") as zf:
            namelist = zf.namelist()
            assert any("README.md" in name for name in namelist)

        # 8. Commit revision 3 (Modify README.md to test diff)
        updated_text = "# Project Alpha\nWelcome to Subversion Nuvi repository.\nNew line added in revision 3.\n"
        upload_res2 = client.post(
            f"/api/v1/browser/{repo_id}/upload",
            data={
                "file_path": "/trunk/README.md",
                "commit_author": "developer-bob",
                "commit_message": "Update README with revision 3 details"
            },
            files={"file": ("README.md", io.BytesIO(updated_text.encode("utf-8")), "text/markdown")}
        )
        assert upload_res2.status_code == 200
        assert upload_res2.json()["committed_revision"] == 3

        # 9. Get Diff between revision 2 and revision 3
        diff_res = client.get(f"/api/v1/browser/{repo_id}/diff?path=/trunk/README.md&rev1=2&rev2=3")
        assert diff_res.status_code == 200
        diff_text = diff_res.json()["diff"]
        assert "+New line added in revision 3." in diff_text

        # 10. Get Blame / Annotate view
        blame_res = client.get(f"/api/v1/browser/{repo_id}/blame?path=/trunk/README.md&rev=3")
        assert blame_res.status_code == 200
        lines = blame_res.json()["lines"]
        assert len(lines) == 3
        assert lines[0]["line_number"] == 1
        assert lines[0]["author"] != ""

        # 11. Get Commit History Logs for repository root /
        logs_res = client.get(f"/api/v1/browser/{repo_id}/logs?path=/")
        assert logs_res.status_code == 200
        logs_data = logs_res.json()
        assert logs_data["total"] >= 3
        revisions = [entry["revision"] for entry in logs_data["logs"]]
        assert 3 in revisions
        assert 2 in revisions
        assert 1 in revisions
        authors = [entry["author"] for entry in logs_data["logs"]]
        assert "developer-bob" in authors
        assert "developer-alice" in authors
        assert any(entry["message"] == "Update README with revision 3 details" for entry in logs_data["logs"])

        # 12. Get Commit History Logs for specific file /trunk/README.md
        file_logs_res = client.get(f"/api/v1/browser/{repo_id}/logs?path=/trunk/README.md")
        assert file_logs_res.status_code == 200
        file_logs_data = file_logs_res.json()
        assert file_logs_data["total"] == 2
        file_revs = [entry["revision"] for entry in file_logs_data["logs"]]
        assert file_revs == [3, 2]
        assert all(any("README.md" in cp["path"] for cp in entry["changed_paths"]) for entry in file_logs_data["logs"])

    finally:
        # Clean up test repository
        client.delete(f"/api/v1/repositories/{repo_id}?delete_files=true")
