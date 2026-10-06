"""
Subversion Nuvi - Authentication & SSO API Router
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.models.schema import User, AuditLog, PersonalAccessToken
from backend.api.models.dto import (
    ChangeSelfPasswordRequest,
    CreatePATRequest,
    PATResponse,
    PATCreatedResponse,
)
from backend.api.services.directory_service import DirectoryService, AuthenticationError
from backend.api.services.token_service import create_access_token, get_current_user, create_personal_access_token
from backend.api.services.security_service import SecurityService, SecurityPolicyError

router = APIRouter(prefix="/auth", tags=["Authentication"])

class LoginRequest(BaseModel):
    username: str
    password: str

class UserProfileResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_active: bool

class LoginResponse(BaseModel):
    status: str
    token: str
    token_type: str = "bearer"
    user: UserProfileResponse
    details: Optional[dict] = None

@router.post("/login", response_model=LoginResponse, summary="Authenticate credentials and issue management session token")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        user, details = DirectoryService.authenticate(
            db,
            username=req.username,
            password=req.password,
            client_ip=client_ip
        )
        token = create_access_token(user)
        return LoginResponse(
            status="authenticated",
            token=token,
            token_type="bearer",
            user=UserProfileResponse(
                id=user.id,
                username=user.username,
                is_admin=user.is_admin,
                email=user.email,
                full_name=user.full_name,
                is_active=user.is_active
            ),
            details=details
        )
    except AuthenticationError as e:
        status_code = status.HTTP_429_TOO_MANY_REQUESTS if e.is_banned else status.HTTP_401_UNAUTHORIZED
        raise HTTPException(
            status_code=status_code,
            detail={
                "error": str(e),
                "is_banned": e.is_banned,
                "remaining_attempts": e.remaining_attempts
            }
        )

@router.get("/me", response_model=UserProfileResponse, summary="Retrieve active authenticated administrator profile")
def get_me(current_user: User = Depends(get_current_user)):
    return UserProfileResponse(
        id=current_user.id,
        username=current_user.username,
        is_admin=current_user.is_admin,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active
    )

@router.post("/logout", summary="End management session and invalidate client state")
def logout(request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        current_user = get_current_user(request, db=db)
        db.add(AuditLog(
            actor=current_user.username,
            client_ip=client_ip,
            action_category="auth",
            action_name="logout",
            target_type="user",
            target_id=current_user.username
        ))
        db.commit()
    except Exception:
        pass

    return {"status": "logged_out", "message": "Successfully signed out"}

@router.post("/change-password", summary="Self-service change password for currently logged-in user")
def change_my_password(
    req: ChangeSelfPasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allows any logged-in user (admin or standard user) to update their own password."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not SecurityService.verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    try:
        SecurityService.change_password(
            db,
            user_id=current_user.id,
            new_password=req.new_password,
            actor=current_user.username,
            client_ip=client_ip
        )
        return {"status": "success", "message": "Password changed successfully"}
    except SecurityPolicyError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# --- Personal Access Tokens (PATs) / App Passwords ---

@router.get("/tokens", response_model=List[PATResponse], summary="List Personal Access Tokens for current user")
def list_my_tokens(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lists all Personal Access Tokens belonging to the logged-in user."""
    tokens = db.query(PersonalAccessToken).filter(
        PersonalAccessToken.user_id == current_user.id
    ).order_by(PersonalAccessToken.created_at.desc()).all()

    return [
        PATResponse(
            id=t.id,
            name=t.name,
            token_prefix=t.token_prefix,
            created_at=t.created_at,
            expires_at=t.expires_at,
            last_used_at=t.last_used_at,
            is_active=t.is_active
        )
        for t in tokens
    ]

@router.post("/tokens", response_model=PATCreatedResponse, status_code=status.HTTP_201_CREATED, summary="Generate a new Personal Access Token")
def generate_token(
    req: CreatePATRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generates a new Personal Access Token for the user (usable with API and CLI)."""
    pat, raw_token = create_personal_access_token(
        db=db,
        user_id=current_user.id,
        name=req.name,
        expires_in_days=req.expires_in_days
    )
    return PATCreatedResponse(
        id=pat.id,
        name=pat.name,
        token=raw_token,
        token_prefix=pat.token_prefix,
        expires_at=pat.expires_at
    )

@router.delete("/tokens/{token_id}", status_code=status.HTTP_200_OK, summary="Revoke a Personal Access Token")
def revoke_token(
    token_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revokes / deletes a Personal Access Token."""
    pat = db.query(PersonalAccessToken).filter(
        PersonalAccessToken.id == token_id,
        PersonalAccessToken.user_id == current_user.id
    ).first()
    if not pat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found.")

    db.delete(pat)
    db.commit()
    return {"status": "success", "message": "Token revoked successfully"}

