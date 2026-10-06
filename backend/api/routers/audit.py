"""
Subversion Nuvi - Audit Logging API Router
Provides structured access, filtering, and export for operational and management audit logs.
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
import json

from backend.api.db import get_db
from backend.api.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["Audit"])

class AuditLogCreateRequest(BaseModel):
    category: str
    action_name: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

@router.get("", summary="Query audit logs")
def query_audit_logs(
    category: Optional[str] = Query(None, description="Filter by 'operational' or 'management'"),
    actor: Optional[str] = Query(None, description="Filter by actor username"),
    action_name: Optional[str] = Query(None, description="Filter by action name"),
    limit: int = Query(100, ge=1, le=1000, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: Session = Depends(get_db)
):
    """Retrieve audit logs with optional filtering."""
    return AuditService.query_logs(
        db=db,
        category=category,
        actor=actor,
        action_name=action_name,
        limit=limit,
        offset=offset
    )

@router.post("/log", status_code=status.HTTP_201_CREATED, summary="Record audit event")
def record_audit_log(
    req: AuditLogCreateRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Records an explicit audit event."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    entry = AuditService.log_event(
        db=db,
        actor="admin",
        action_category=req.category,
        action_name=req.action_name,
        target_type=req.target_type,
        target_id=req.target_id,
        details=req.details,
        client_ip=client_ip
    )
    return {"status": "recorded", "id": entry.id}

@router.get("/export", summary="Export audit logs in JSON Lines format")
def export_audit_logs(
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(500, ge=1, le=10000),
    db: Session = Depends(get_db)
):
    """Exports audit logs formatted as JSON Lines (.jsonl) for SIEM import."""
    logs = AuditService.query_logs(db=db, category=category, limit=limit, offset=0)
    lines = [json.dumps(log) for log in logs]
    content = "\n".join(lines)
    return PlainTextResponse(content, media_type="application/x-ndjson", headers={
        "Content-Disposition": "attachment; filename=nuvi_audit_export.jsonl"
    })
