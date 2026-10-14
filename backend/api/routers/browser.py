"""
Subversion Nuvi - Modern Web Repository Client & Browser API Router
Provides directory tree navigation, code viewing, syntax detection, ZIP streaming,
diff comparisons, blame annotations, and web file commit operations.
"""

import io
import mimetypes
import zipfile
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.services.repo_service import RepositoryService
from backend.api.services.svn_native import svn_engine, SubversionNativeError
from backend.api.services.acl_service import AclService
from backend.api.services.token_service import get_optional_current_user

router = APIRouter(prefix="/browser", tags=["Repository Browser"])

@router.get("/{repo_id}/tree", summary="Browse repository directory tree")
def browse_tree(
    repo_id: int,
    request: Request,
    path: str = Query("/", description="Subdirectory path, e.g. / or /trunk"),
    rev: int = Query(-1, description="Revision number (-1 for HEAD)"),
    db: Session = Depends(get_db)
):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
        perm = AclService.evaluate_permission(db, user.username, repo_id, path)
        if not perm.can_read:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access to path '{path}' forbidden.")

    repo = RepositoryService.get_repository(db, repo_id)
    try:
        data = svn_engine.list_directory(repo.fs_path, dir_path=path, revision=rev)
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Filter directory entries according to user's permissions
    if user and not user.is_admin:
        allowed_entries = []
        for e in data.get("entries", []):
            entry_perm = AclService.evaluate_permission(db, user.username, repo_id, e["path"])
            if entry_perm.can_read:
                allowed_entries.append(e)
        data["entries"] = allowed_entries

    # Detect README.md if present
    readme_content = None
    readme_entry = next((e for e in data["entries"] if not e["is_dir"] and e["name"].lower() == "readme.md"), None)
    if readme_entry:
        try:
            readme_content = svn_engine.cat_file(repo.fs_path, readme_entry["path"], revision=data["revision"])
        except Exception:
            pass

    return {
        "repository_id": repo.id,
        "repository_name": repo.name,
        "current_path": path,
        "revision": data["revision"],
        "entries": data["entries"],
        "readme": readme_content
    }

@router.get("/{repo_id}/cat", summary="Retrieve file content as text")
def cat_file(
    repo_id: int,
    request: Request,
    path: str = Query(..., description="Repository file path"),
    rev: int = Query(-1, description="Revision number (-1 for HEAD)"),
    db: Session = Depends(get_db)
):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
        perm = AclService.evaluate_permission(db, user.username, repo_id, path)
        if not perm.can_read:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access to path '{path}' forbidden.")

    repo = RepositoryService.get_repository(db, repo_id)
    try:
        content = svn_engine.cat_file(repo.fs_path, file_path=path, revision=rev)
        mime_type, _ = mimetypes.guess_type(path)
        return {
            "path": path,
            "revision": rev,
            "mime_type": mime_type or "text/plain",
            "content": content
        }
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.get("/{repo_id}/raw", summary="Stream raw file content (binary / image / PDF)")
def get_raw_file(
    repo_id: int,
    request: Request,
    path: str = Query(..., description="Repository file path"),
    rev: int = Query(-1, description="Revision number (-1 for HEAD)"),
    db: Session = Depends(get_db)
):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
        perm = AclService.evaluate_permission(db, user.username, repo_id, path)
        if not perm.can_read:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access to path '{path}' forbidden.")

    repo = RepositoryService.get_repository(db, repo_id)
    try:
        raw_bytes = svn_engine.cat_file_bytes(repo.fs_path, file_path=path, revision=rev)
        mime_type, _ = mimetypes.guess_type(path)
        return Response(content=raw_bytes, media_type=mime_type or "application/octet-stream")
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.get("/{repo_id}/zip", summary="Stream directory as ZIP archive")
def download_folder_zip(
    repo_id: int,
    request: Request,
    path: str = Query("/", description="Subdirectory to zip"),
    rev: int = Query(-1, description="Revision number"),
    db: Session = Depends(get_db)
):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
        perm = AclService.evaluate_permission(db, user.username, repo_id, path)
        if not perm.can_read:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access to path '{path}' forbidden.")

    repo = RepositoryService.get_repository(db, repo_id)
    try:
        # Recursively collect files in folder
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            def add_dir(dir_path: str):
                res = svn_engine.list_directory(repo.fs_path, dir_path, revision=rev)
                for entry in res["entries"]:
                    if user and not user.is_admin:
                        entry_perm = AclService.evaluate_permission(db, user.username, repo_id, entry["path"])
                        if not entry_perm.can_read:
                            continue
                    if entry["is_dir"]:
                        add_dir(entry["path"])
                    else:
                        file_data = svn_engine.cat_file_bytes(repo.fs_path, entry["path"], revision=rev)
                        rel_zip_path = entry["path"].lstrip("/")
                        zf.writestr(rel_zip_path, file_data)

            add_dir(path)

        zip_buffer.seek(0)
        filename = f"{repo.name}_{path.strip('/').replace('/', '_') or 'root'}.zip"
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/{repo_id}/diff", summary="Get unified diff between revisions")
def get_diff(
    repo_id: int,
    request: Request,
    path: str = Query(..., description="File path"),
    rev1: int = Query(..., description="Base revision"),
    rev2: int = Query(..., description="Target revision"),
    db: Session = Depends(get_db)
):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
        perm = AclService.evaluate_permission(db, user.username, repo_id, path)
        if not perm.can_read:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access to path '{path}' forbidden.")

    repo = RepositoryService.get_repository(db, repo_id)
    try:
        diff_text = svn_engine.get_file_diff(repo.fs_path, path, rev1, rev2)
        return {
            "path": path,
            "rev1": rev1,
            "rev2": rev2,
            "diff": diff_text
        }
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/{repo_id}/blame", summary="Get line-by-line annotation (blame)")
def get_blame(
    repo_id: int,
    request: Request,
    path: str = Query(..., description="File path"),
    rev: int = Query(-1, description="Revision number"),
    db: Session = Depends(get_db)
):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
        perm = AclService.evaluate_permission(db, user.username, repo_id, path)
        if not perm.can_read:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access to path '{path}' forbidden.")

    repo = RepositoryService.get_repository(db, repo_id)
    try:
        blame_lines = svn_engine.get_blame(repo.fs_path, path, rev)
        return {
            "path": path,
            "revision": rev,
            "lines": blame_lines
        }
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("/{repo_id}/upload", summary="In-browser file upload & commit")
async def upload_file(
    repo_id: int,
    request: Request,
    file_path: str = Form(...),
    commit_author: str = Form("web-admin"),
    commit_message: str = Form("Web file upload"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
        perm = AclService.evaluate_permission(db, user.username, repo_id, file_path)
        if not perm.can_write:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Write access to path '{file_path}' forbidden.")

    repo = RepositoryService.get_repository(db, repo_id)
    content = await file.read()
    author = user.username if user else commit_author
    try:
        new_rev = svn_engine.put_file(
            path=repo.fs_path,
            file_path=file_path,
            content=content,
            author=author,
            log_message=commit_message
        )
        try:
            from backend.api.services.notification_service import NotificationService
            NotificationService.sync_repository_notifications(db, repo_id)
        except Exception:
            pass

        return {
            "status": "success",
            "message": f"File '{file_path}' committed successfully.",
            "committed_revision": new_rev
        }
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get("/{repo_id}/logs", summary="Get commit history logs for a repository or subpath")
def get_commit_logs(
    repo_id: int,
    request: Request,
    path: str = Query("/", description="Subdirectory or file path, e.g. / or /trunk"),
    limit: int = Query(50, ge=1, le=1000, description="Maximum number of log entries to retrieve"),
    rev: int = Query(-1, description="Base revision (-1 for HEAD)"),
    db: Session = Depends(get_db)
):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        if not AclService.user_has_repo_access(db, user, repo_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to repository forbidden.")
        perm = AclService.evaluate_permission(db, user.username, repo_id, path)
        if not perm.can_read:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access to path '{path}' forbidden.")

    repo = RepositoryService.get_repository(db, repo_id)
    try:
        logs = svn_engine.get_commit_logs(repo.fs_path, subpath=path, limit=limit, revision=rev)
        return {
            "repository_id": repo.id,
            "repository_name": repo.name,
            "path": path,
            "total": len(logs),
            "logs": logs
        }
    except SubversionNativeError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
