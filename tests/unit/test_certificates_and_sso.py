"""
Subversion Nuvi - Unit Tests for SSL/TLS Certificate Lifecycle & Directory/SSO Integration
"""

import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from cryptography import x509
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import rsa

from backend.api.main import app
from backend.api.config import config
from backend.api.db import SessionLocal
from backend.api.models.schema import User, DirectoryConfiguration
from backend.api.services.cert_service import CertificateService
from backend.api.services.directory_service import DirectoryService

client = TestClient(app)

def test_generate_self_signed_certificate():
    """Verifies generation of self-signed X.509 certificate with SANs."""
    res = client.post("/api/v1/certificates/self-signed", json={
        "common_name": "svn.internal.corp",
        "san_list": ["svn.internal.corp", "192.168.1.50", "svn-backup.corp"],
        "validity_days": 180,
        "key_size": 2048,
        "organization": "Nuvi Test Enterprise"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "generated"
    assert data["common_name"] == "svn.internal.corp"
    assert data["issuer"] == "Nuvi Test Enterprise"
    assert "svn.internal.corp" in data["sans"]
    assert "192.168.1.50" in data["sans"]
    assert "127.0.0.1" in data["sans"]

    cert_path = Path(data["cert_path"])
    key_path = Path(data["key_path"])
    assert cert_path.exists()
    assert key_path.exists()

    # Load and verify certificate via cryptography
    with open(cert_path, "rb") as f:
        cert = x509.load_pem_x509_certificate(f.read())
    assert cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)[0].value == "svn.internal.corp"

def test_generate_csr():
    """Verifies generation of Certificate Signing Request (CSR)."""
    res = client.post("/api/v1/certificates/csr", json={
        "common_name": "svn-ca.corp",
        "organization": "Global Corp",
        "country": "US",
        "state": "California",
        "locality": "San Francisco",
        "san_list": ["svn-ca.corp", "svn-alt.corp"],
        "key_size": 2048
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "generated"
    assert data["common_name"] == "svn-ca.corp"
    assert "BEGIN CERTIFICATE REQUEST" in data["csr_pem"]

    csr_path = Path(data["csr_path"])
    assert csr_path.exists()
    with open(csr_path, "rb") as f:
        csr = x509.load_pem_x509_csr(f.read())
    assert csr.is_signature_valid
    assert csr.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)[0].value == "svn-ca.corp"

def test_get_active_certificate():
    """Verifies active certificate inspection endpoint."""
    res = client.get("/api/v1/certificates/active")
    assert res.status_code == 200
    data = res.json()
    assert data["installed"] is True
    assert data["days_remaining"] > 0
    assert data["is_expired"] is False
    assert len(data["sha256_fingerprint"]) == 64

def test_install_custom_certificate():
    """Verifies installation and public-private key validation for custom certificates."""
    # 1. Generate a standalone key and cert pair
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(x509.oid.NameOID.COMMON_NAME, "custom.svn.corp")
    ])
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(123456789)
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=90))
        .sign(private_key, hashes.SHA256())
    )

    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode("utf-8")
    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")

    # Mismatched key test
    bad_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    bad_key_pem = bad_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")

    bad_res = client.post("/api/v1/certificates/install-custom", json={
        "cert_pem": cert_pem,
        "key_pem": bad_key_pem
    })
    assert bad_res.status_code == 400
    assert "Private key does not match" in bad_res.json()["detail"]

    # Valid install test
    good_res = client.post("/api/v1/certificates/install-custom", json={
        "cert_pem": cert_pem,
        "key_pem": key_pem
    })
    assert good_res.status_code == 200
    installed_info = good_res.json()
    assert installed_info["installed"] is True
    assert installed_info["common_name"] == "custom.svn.corp"

def test_directory_configuration_crud_and_sync():
    """Verifies directory & SSO settings CRUD, connection testing, and sync."""
    # 1. Update config
    update_res = client.put("/api/v1/directory/config", json={
        "provider_type": "ad",
        "is_enabled": True,
        "server_url": "ldaps://test-dc01.corp.internal:636",
        "bind_dn": "CN=NuviService,OU=ServiceAccounts,DC=corp,DC=internal",
        "bind_password": "ServiceSecretPassword123!",
        "base_dn": "DC=corp,DC=internal",
        "user_search_filter": "(sAMAccountName={username})",
        "group_search_filter": "(member={dn})",
        "use_tls": True
    })
    assert update_res.status_code == 200
    assert update_res.json()["is_enabled"] is True
    assert update_res.json()["provider_type"] == "ad"

    # 2. Get config (verify password is NOT returned in plain text)
    get_res = client.get("/api/v1/directory/config")
    assert get_res.status_code == 200
    cfg = get_res.json()
    assert cfg["is_enabled"] is True
    assert cfg["bind_password_set"] is True
    assert "ServiceSecretPassword123!" not in str(cfg)

    # 3. Test connection
    test_conn_res = client.post("/api/v1/directory/test-connection")
    assert test_conn_res.status_code == 200
    assert test_conn_res.json()["status"] == "connected"

    # 4. Trigger sync
    sync_res = client.post("/api/v1/directory/sync")
    assert sync_res.status_code == 200
    assert sync_res.json()["status"] == "success"

def test_ldap_authentication_flow():
    """Verifies simulated LDAP authentication through DirectoryService."""
    db = SessionLocal()
    try:
        # Directory is configured with "test" in server_url
        user, details = DirectoryService.authenticate(
            db=db,
            username="ldap_engineer",
            password="ldap-secret-pass",
            client_ip="127.0.0.1"
        )
        assert user is not None
        assert user.username == "ldap_engineer"
        assert details["authenticated"] is True
        assert details["provider"] == "ad"
    finally:
        db.close()
