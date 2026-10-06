"""
Subversion Nuvi - SSL/TLS & Certificate Lifecycle API Router
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.api.db import get_db
from backend.api.services.cert_service import CertificateService
from backend.api.services.audit_service import AuditService

router = APIRouter(prefix="/certificates", tags=["Certificates"])

class SelfSignedCertRequest(BaseModel):
    common_name: str = Field(default="localhost", description="Primary FQDN or IP")
    san_list: Optional[List[str]] = Field(default=None, description="Subject Alternative Names (DNS or IP)")
    validity_days: int = Field(default=365, ge=1, le=3650, description="Certificate validity duration in days")
    key_size: int = Field(default=2048, description="RSA key size (2048 or 4096)")
    organization: str = Field(default="Subversion Nuvi Enterprise", description="Organization name")

class CSRRequest(BaseModel):
    common_name: str = Field(..., description="Primary FQDN")
    organization: str = Field(..., description="Organization name")
    country: str = Field(default="US", min_length=2, max_length=2, description="2-letter ISO country code")
    state: Optional[str] = Field(default=None, description="State or province")
    locality: Optional[str] = Field(default=None, description="City or locality")
    san_list: Optional[List[str]] = Field(default=None, description="Subject Alternative Names")
    key_size: int = Field(default=2048, description="RSA key size")

class CustomCertInstallRequest(BaseModel):
    cert_pem: str = Field(..., description="X.509 Certificate in PEM format")
    key_pem: str = Field(..., description="Private Key in PEM format")
    chain_pem: Optional[str] = Field(default=None, description="Optional intermediate CA chain in PEM format")

@router.get("/active")
def get_active_certificate():
    """Inspects the currently active server certificate and validity status."""
    return CertificateService.get_active_certificate_info()

@router.post("/self-signed")
def generate_self_signed(payload: SelfSignedCertRequest, db: Session = Depends(get_db)):
    """Generates and installs a new self-signed X.509 certificate with Subject Alternative Names."""
    try:
        result = CertificateService.generate_self_signed(
            common_name=payload.common_name,
            san_list=payload.san_list,
            validity_days=payload.validity_days,
            key_size=payload.key_size,
            organization=payload.organization
        )
        AuditService.log_action(
            db,
            actor="admin",
            category="certificate",
            action="generate_self_signed",
            target_type="certificate",
            target_id=payload.common_name,
            details=result
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate self-signed certificate: {str(e)}"
        )

@router.post("/csr")
def generate_csr(payload: CSRRequest, db: Session = Depends(get_db)):
    """Generates a Certificate Signing Request (CSR) and private key for an enterprise CA."""
    try:
        result = CertificateService.generate_csr(
            common_name=payload.common_name,
            organization=payload.organization,
            country=payload.country,
            state=payload.state,
            locality=payload.locality,
            san_list=payload.san_list,
            key_size=payload.key_size
        )
        AuditService.log_action(
            db,
            actor="admin",
            category="certificate",
            action="generate_csr",
            target_type="csr",
            target_id=payload.common_name,
            details={"common_name": payload.common_name, "csr_path": result["csr_path"]}
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate CSR: {str(e)}"
        )

@router.post("/install-custom")
def install_custom_certificate(payload: CustomCertInstallRequest, db: Session = Depends(get_db)):
    """Validates and installs a custom enterprise PEM certificate and private key."""
    try:
        result = CertificateService.install_custom_certificate(
            cert_pem=payload.cert_pem,
            key_pem=payload.key_pem,
            chain_pem=payload.chain_pem
        )
        AuditService.log_action(
            db,
            actor="admin",
            category="certificate",
            action="install_custom",
            target_type="certificate",
            target_id=result.get("common_name", "custom"),
            details={"sha256": result.get("sha256_fingerprint")}
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to install custom certificate: {str(e)}"
        )
