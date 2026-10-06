"""
Subversion Nuvi - Users API Router
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.models.dto import (
    UserCreateRequest,
    UserUpdateRequest,
    UserPasswordChangeRequest,
    UserStatusRequest,
    UserResponse
)
from backend.api.services.security_service import SecurityService, SecurityPolicyError
from backend.api.services.token_service import get_optional_current_user

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("", response_model=List[UserResponse], summary="List all internal users")
def list_users(request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    return SecurityService.list_users(db)

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Create a new user")
def create_user(req: UserCreateRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return SecurityService.create_user(db, req, actor=actor, client_ip=client_ip)
    except SecurityPolicyError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

@router.get("/{user_id}", response_model=UserResponse, summary="Get user by ID")
def get_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin and user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    try:
        return SecurityService.get_user(db, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.put("/{user_id}", response_model=UserResponse, summary="Update user profile")
def update_user(user_id: int, req: UserUpdateRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin and user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return SecurityService.update_user(db, user_id, req, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete user")
def delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        SecurityService.delete_user(db, user_id, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/{user_id}/password", status_code=status.HTTP_200_OK, summary="Change user password")
def change_password(user_id: int, req: UserPasswordChangeRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin and user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only change your own password.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        SecurityService.change_password(db, user_id, req.new_password, actor=actor, client_ip=client_ip)
        return {"status": "success", "message": "Password updated successfully"}
    except SecurityPolicyError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post("/{user_id}/status", response_model=UserResponse, summary="Enable or disable user account")
def set_user_status(user_id: int, req: UserStatusRequest, request: Request, db: Session = Depends(get_db)):
    user = get_optional_current_user(request, db)
    if user and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator privileges required.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    actor = user.username if user else "admin"
    try:
        return SecurityService.set_user_status(db, user_id, req.is_active, actor=actor, client_ip=client_ip)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
