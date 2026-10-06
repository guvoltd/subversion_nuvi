"""
Subversion Nuvi - Authentication Token & Session Management
Provides lightweight, secure signed tokens (HMAC-SHA256 JWT format)
without requiring external C/PyJWT dependencies.
"""

import os
import json
import time
import hmac
import hashlib
import base64
from typing import Optional, Dict, Any
from pathlib import Path
from fastapi import Request, HTTPException, Depends, status
from sqlalchemy.orm import Session

from backend.api.config import config
from backend.api.db import get_db
from backend.api.models.schema import User

# Persistent Secret Key for Token Signing
def _get_secret_key() -> bytes:
    env_key = os.getenv("NUVI_JWT_SECRET")
    if env_key:
        return env_key.encode("utf-8")
    
    secret_file = config.DATA_DIR / ".jwt_secret"
    if secret_file.exists():
        try:
            return secret_file.read_bytes().strip()
        except Exception:
            pass

    import secrets
    gen_key = secrets.token_bytes(32)
    try:
        secret_file.parent.mkdir(parents=True, exist_ok=True)
        secret_file.write_bytes(gen_key)
        os.chmod(secret_file, 0o600)
    except Exception:
        pass
    return gen_key

_SECRET_KEY = _get_secret_key()

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def _b64url_decode(data_str: str) -> bytes:
    rem = len(data_str) % 4
    if rem > 0:
        data_str += '=' * (4 - rem)
    return base64.urlsafe_b64decode(data_str.encode('ascii'))

def create_access_token(user: User, expires_seconds: int = 86400 * 7) -> str:
    """Creates a signed HMAC-SHA256 JWT token for the user."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user.username,
        "user_id": user.id,
        "is_admin": bool(user.is_admin),
        "iat": int(time.time()),
        "exp": int(time.time() + expires_seconds)
    }

    hdr_b64 = _b64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    pay_b64 = _b64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signing_input = f"{hdr_b64}.{pay_b64}".encode('utf-8')
    sig = hmac.new(_SECRET_KEY, signing_input, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)

    return f"{hdr_b64}.{pay_b64}.{sig_b64}"

def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Verifies the HMAC-SHA256 signature and expiration of a JWT token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        hdr_b64, pay_b64, sig_b64 = parts
        signing_input = f"{hdr_b64}.{pay_b64}".encode('utf-8')
        expected_sig = hmac.new(_SECRET_KEY, signing_input, hashlib.sha256).digest()
        actual_sig = _b64url_decode(sig_b64)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload = json.loads(_b64url_decode(pay_b64).decode('utf-8'))
        if "exp" in payload and int(time.time()) > payload["exp"]:
            return None

        return payload
    except Exception:
        return None

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    FastAPI dependency to authenticate the current user via Bearer token,
    JWT session, or Personal Access Token (nuvi_pat_...).
    """
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "token" in request.query_params:
        token = request.query_params["token"]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Check if token is a Personal Access Token (PAT)
    if token.startswith("nuvi_pat_"):
        from backend.api.models.schema import PersonalAccessToken
        from datetime import datetime, timezone
        t_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        pat = db.query(PersonalAccessToken).filter(
            PersonalAccessToken.token_hash == t_hash,
            PersonalAccessToken.is_active == True
        ).first()
        if not pat:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or revoked Personal Access Token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if pat.expires_at and pat.expires_at.replace(tzinfo=timezone.utc if pat.expires_at.tzinfo is None else None) < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Personal Access Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        pat.last_used_at = datetime.now(timezone.utc)
        db.commit()
        if not pat.user or not pat.user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is deactivated or not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return pat.user

    # 2. Check signed JWT session token
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated or not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user

def get_optional_current_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
    """Retrieves current user if authenticated, or None if anonymous/unauthenticated."""
    try:
        return get_current_user(request, db)
    except HTTPException:
        return None

def create_personal_access_token(
    db: Session,
    user_id: int,
    name: str,
    expires_in_days: Optional[int] = 30
):
    import secrets
    from datetime import datetime, timezone, timedelta
    from backend.api.models.schema import PersonalAccessToken

    raw_random = secrets.token_hex(20)
    raw_token = f"nuvi_pat_{raw_random}"
    prefix = raw_token[:13] + "..."
    t_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days) if expires_in_days else None

    pat = PersonalAccessToken(
        user_id=user_id,
        name=name,
        token_prefix=prefix,
        token_hash=t_hash,
        expires_at=expires_at,
        is_active=True
    )
    db.add(pat)
    db.commit()
    db.refresh(pat)
    return pat, raw_token
