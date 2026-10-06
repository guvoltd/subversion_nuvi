"""
Subversion Nuvi - Groups API Router
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.models.dto import (
    GroupCreateRequest,
    GroupUpdateRequest,
    GroupResponse,
    GroupMemberRequest
)
from backend.api.services.security_service import SecurityService
from backend.api.services.token_service import get_optional_current_user

router = APIRouter(prefix="/groups", tags=["Groups"])

@router.get("", response_model=List[GroupResponse], summary="List all security groups")
def list_groups(request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    return SecurityService.list_groups(db)

@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED, summary="Create a new security group")
def create_group(req: GroupCreateRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return SecurityService.create_group(db, req, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

@router.get("/{group_id}", response_model=GroupResponse, summary="Get group by ID")
def get_group(group_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    try:
        return SecurityService.get_group(db, group_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.put("/{group_id}", response_model=GroupResponse, summary="Update group details")
def update_group(group_id: int, req: GroupUpdateRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return SecurityService.update_group(db, group_id, req, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete group")
def delete_group(group_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        SecurityService.delete_group(db, group_id, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/{group_id}/members", response_model=GroupResponse, summary="Add user to group")
def add_member(group_id: int, req: GroupMemberRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return SecurityService.add_group_member(db, group_id, req.username, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.delete("/{group_id}/members/{username}", response_model=GroupResponse, summary="Remove user from group")
def remove_member(group_id: int, username: str, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return SecurityService.remove_group_member(db, group_id, username, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
