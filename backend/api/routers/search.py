"""
Subversion Nuvi - Search API Router
Exposes full-text search, jump-to-revision, indexing triggers, and index telemetry.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.services.search_service import SearchService
from backend.api.services.audit_service import AuditService

router = APIRouter(prefix="/search", tags=["Search"])

@router.get("", summary="Execute Full-Text & Filename Search")
def execute_search(
    q: str = Query(..., min_length=1, description="Search query string or revision (e.g. 'r42')"),
    repository_id: Optional[int] = Query(None, description="Optional repository ID filter"),
    path_prefix: Optional[str] = Query(None, description="Optional path prefix filter"),
    extension: Optional[str] = Query(None, description="Optional file extension filter"),
    username: Optional[str] = Query(None, description="Current username for ACL security trimming"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of search results to return"),
    db: Session = Depends(get_db)
):
    """
    Searches across indexed repository files, logs, and paths using SQLite FTS5.
    Applies automatic ACL security trimming to hide inaccessible files.
    """
    try:
        return SearchService.search(
            db=db,
            query_str=q,
            repository_id=repository_id,
            path_prefix=path_prefix,
            extension=extension,
            username=username,
            limit=limit
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/index/{repo_id}", summary="Trigger repository indexing")
def trigger_index(
    repo_id: int,
    revision: int = Query(-1, description="Revision to index (-1 for latest)"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Indexes a repository for full-text and symbol search."""
    client_ip = request.client.host if request and request.client else "127.0.0.1"
    try:
        res = SearchService.index_repository(db, repo_id=repo_id, revision=revision)
        AuditService.log_event(
            db,
            actor="admin",
            action_category="management",
            action_name="search_index_repository",
            target_type="repository",
            target_id=str(repo_id),
            details={"revision": res.get("revision"), "indexed_files": res.get("indexed_files_count")},
            client_ip=client_ip
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/status", summary="Search Engine Telemetry")
def get_search_status(db: Session = Depends(get_db)):
    """Returns total indexed documents and repository coverage."""
    return SearchService.get_index_stats(db)
