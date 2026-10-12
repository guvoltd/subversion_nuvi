"""
Subversion Nuvi - Access Control (ACL) & Permissions API Router
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.models.dto import (
    AccessRuleCreateRequest,
    AccessRuleBatchCreateRequest,
    AccessRuleResponse,
    EffectivePermissionRequest,
    EffectivePermissionResponse,
    SupervisorAssignRequest,
    SupervisorResponse
)
from backend.api.services.acl_service import AclService
from backend.api.services.token_service import get_optional_current_user

router = APIRouter(prefix="/acl", tags=["Access Control"])

@router.get("/rules", response_model=List[AccessRuleResponse], summary="List access control rules")
def list_rules(request: Request, repository_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    return AclService.list_rules(db, repository_id=repository_id)

@router.post("/rules", response_model=AccessRuleResponse, status_code=status.HTTP_201_CREATED, summary="Create an access rule")
def create_rule(req: AccessRuleCreateRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return AclService.create_rule(db, req, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("/rules/batch", response_model=List[AccessRuleResponse], status_code=status.HTTP_201_CREATED, summary="Create multiple access rules in a single batch")
def create_rules_batch(req: AccessRuleBatchCreateRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return AclService.create_batch_rules(db, req, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an access rule")
def delete_rule(rule_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        AclService.delete_rule(db, rule_id, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/evaluate", response_model=EffectivePermissionResponse, summary="Evaluate effective permissions (nuvi-acl-eval)")
def evaluate_effective_permission(req: EffectivePermissionRequest, db: Session = Depends(get_db)):
    """
    Computes exact effective permissions ('rw', 'r', or '') for a user on any repository path,
    generating a step-by-step decision tree trace.
    """
    try:
        return AclService.evaluate_effective_permission(
            db,
            username=req.username,
            repository_id=req.repository_id,
            target_path=req.path
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/compile", status_code=status.HTTP_200_OK, summary="Trigger immediate authz file compilation")
def compile_authz(request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    content = AclService.compile_authz(db)
    return {"status": "success", "message": "authz file compiled successfully", "lines": len(content.splitlines())}

# --- Repository Supervisors ---

@router.get("/supervisors/{repo_id}", response_model=List[SupervisorResponse], summary="List repository supervisors")
def list_supervisors(repo_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    return AclService.list_supervisors(db, repo_id)

@router.post("/supervisors/{repo_id}", response_model=SupervisorResponse, summary="Assign repository supervisor")
def assign_supervisor(repo_id: int, req: SupervisorAssignRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    try:
        return AclService.assign_supervisor(db, repo_id, req)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.delete("/supervisors/{repo_id}/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove repository supervisor")
def remove_supervisor(repo_id: int, user_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    AclService.remove_supervisor(db, repo_id, user_id)
