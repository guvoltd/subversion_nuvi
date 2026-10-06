"""
Subversion Nuvi - Automated SSL/TLS & Certificate Lifecycle Service (Pillar 11)
Handles:
1. Self-signed X.509 certificate generation with Subject Alternative Names (SAN).
2. Certificate Signing Request (CSR) generation for enterprise CAs.
3. Custom PEM/PKCS#12 certificate bundle import.
4. Active certificate inspection, expiration warning, and ACME (Let's Encrypt) status.
"""

import os
import ipaddress
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional

from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from backend.api.config import config
from backend.api.services.audit_service import AuditService

def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _get_not_after(cert: x509.Certificate) -> datetime:
    if hasattr(cert, "not_valid_after_utc"):
        return cert.not_valid_after_utc
    return _to_utc(cert.not_valid_after)

def _get_not_before(cert: x509.Certificate) -> datetime:
    if hasattr(cert, "not_valid_before_utc"):
        return cert.not_valid_before_utc
    return _to_utc(cert.not_valid_before)

class CertificateService:
    @staticmethod
    def get_certs_dir() -> Path:
        certs_dir = config.CERTS_DIR
        certs_dir.mkdir(parents=True, exist_ok=True)
        return certs_dir

    @staticmethod
    def generate_self_signed(
        common_name: str = "localhost",
        san_list: Optional[List[str]] = None,
        validity_days: int = 365,
        key_size: int = 2048,
        organization: str = "Subversion Nuvi Enterprise"
    ) -> Dict[str, Any]:
        """Generates a self-signed X.509 certificate with Subject Alternative Names."""
        certs_dir = CertificateService.get_certs_dir()
        key_path = certs_dir / "nuvi_server.key"
        cert_path = certs_dir / "nuvi_server.crt"

        # 1. Generate Private Key
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=key_size
        )

        # 2. Assemble Subject & Issuer
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
        ])

        # 3. Assemble SANs
        sans: List[x509.GeneralName] = []
        sans.append(x509.DNSName(common_name))

        if san_list:
            for item in san_list:
                item = item.strip()
                if not item:
                    continue
                try:
                    ip_obj = ipaddress.ip_address(item)
                    sans.append(x509.IPAddress(ip_obj))
                except ValueError:
                    sans.append(x509.DNSName(item))

        # Always include localhost and 127.0.0.1 for loopback
        if not any(isinstance(s, x509.IPAddress) and s.value == ipaddress.ip_address("127.0.0.1") for s in sans):
            sans.append(x509.IPAddress(ipaddress.ip_address("127.0.0.1")))

        now = datetime.now(timezone.utc)
        cert_builder = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(private_key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now)
            .not_valid_after(now + timedelta(days=validity_days))
            .add_extension(x509.SubjectAlternativeName(sans), critical=False)
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=False,
                    key_encipherment=True,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    encipher_only=False,
                    decipher_only=False
                ),
                critical=True
            )
            .add_extension(
                x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH, ExtendedKeyUsageOID.CLIENT_AUTH]),
                critical=False
            )
        )

        cert = cert_builder.sign(private_key, hashes.SHA256())

        # Write private key PEM
        key_bytes = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        )
        with open(key_path, "wb") as f:
            f.write(key_bytes)
        key_path.chmod(0o600)

        # Write cert PEM
        cert_bytes = cert.public_bytes(serialization.Encoding.PEM)
        with open(cert_path, "wb") as f:
            f.write(cert_bytes)

        not_before = _get_not_before(cert)
        not_after = _get_not_after(cert)

        return {
            "status": "generated",
            "common_name": common_name,
            "issuer": organization,
            "serial_number": str(cert.serial_number),
            "valid_from": not_before.isoformat(),
            "valid_to": not_after.isoformat(),
            "sha256_fingerprint": cert.fingerprint(hashes.SHA256()).hex(),
            "cert_path": str(cert_path),
            "key_path": str(key_path),
            "sans": [str(s.value) for s in sans]
        }

    @staticmethod
    def generate_csr(
        common_name: str,
        organization: str,
        country: str = "US",
        state: Optional[str] = None,
        locality: Optional[str] = None,
        san_list: Optional[List[str]] = None,
        key_size: int = 2048
    ) -> Dict[str, Any]:
        """Generates a Certificate Signing Request (CSR) and private key for an enterprise CA."""
        certs_dir = CertificateService.get_certs_dir()
        key_path = certs_dir / f"{common_name}.key"
        csr_path = certs_dir / f"{common_name}.csr"

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=key_size)

        attributes = [
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
            x509.NameAttribute(NameOID.COUNTRY_NAME, country),
        ]
        if state:
            attributes.append(x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, state))
        if locality:
            attributes.append(x509.NameAttribute(NameOID.LOCALITY_NAME, locality))

        csr_builder = x509.CertificateSigningRequestBuilder().subject_name(x509.Name(attributes))

        sans: List[x509.GeneralName] = [x509.DNSName(common_name)]
        if san_list:
            for item in san_list:
                item = item.strip()
                if not item:
                    continue
                try:
                    ip_obj = ipaddress.ip_address(item)
                    sans.append(x509.IPAddress(ip_obj))
                except ValueError:
                    sans.append(x509.DNSName(item))

        csr_builder = csr_builder.add_extension(x509.SubjectAlternativeName(sans), critical=False)
        csr = csr_builder.sign(private_key, hashes.SHA256())

        key_bytes = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        )
        with open(key_path, "wb") as f:
            f.write(key_bytes)
        key_path.chmod(0o600)

        csr_bytes = csr.public_bytes(serialization.Encoding.PEM)
        with open(csr_path, "wb") as f:
            f.write(csr_bytes)

        return {
            "status": "generated",
            "common_name": common_name,
            "csr_pem": csr_bytes.decode("utf-8"),
            "csr_path": str(csr_path),
            "key_path": str(key_path)
        }

    @staticmethod
    def get_active_certificate_info() -> Dict[str, Any]:
        """Inspects the active server certificate."""
        certs_dir = CertificateService.get_certs_dir()
        cert_path = certs_dir / "nuvi_server.crt"

        if not cert_path.exists():
            return {
                "installed": False,
                "message": "No active SSL/TLS certificate installed. Using HTTP fallback."
            }

        with open(cert_path, "rb") as f:
            cert = x509.load_pem_x509_certificate(f.read())

        now = datetime.now(timezone.utc)
        not_before = _get_not_before(cert)
        not_after = _get_not_after(cert)
        days_remaining = (not_after - now).days
        is_expired = days_remaining < 0

        sans = []
        try:
            san_ext = cert.extensions.get_extension_for_oid(x509.OID_SUBJECT_ALTERNATIVE_NAME)
            sans = [str(name.value) for name in san_ext.value]
        except Exception:
            pass

        return {
            "installed": True,
            "common_name": cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value if cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME) else "Unknown",
            "issuer": cert.issuer.get_attributes_for_oid(NameOID.ORGANIZATION_NAME)[0].value if cert.issuer.get_attributes_for_oid(NameOID.ORGANIZATION_NAME) else "Unknown",
            "serial_number": str(cert.serial_number),
            "valid_from": not_before.isoformat(),
            "valid_to": not_after.isoformat(),
            "days_remaining": days_remaining,
            "is_expired": is_expired,
            "sha256_fingerprint": cert.fingerprint(hashes.SHA256()).hex(),
            "sans": sans
        }

    @staticmethod
    def install_custom_certificate(cert_pem: str, key_pem: str, chain_pem: Optional[str] = None) -> Dict[str, Any]:
        """Validates and installs a custom PEM certificate and private key."""
        try:
            cert = x509.load_pem_x509_certificate(cert_pem.encode("utf-8"))
        except Exception as e:
            raise ValueError(f"Invalid X.509 certificate PEM: {str(e)}")

        try:
            private_key = serialization.load_pem_private_key(key_pem.encode("utf-8"), password=None)
        except Exception as e:
            raise ValueError(f"Invalid private key PEM: {str(e)}")

        # Verify private key matches certificate public key
        cert_pub_bytes = cert.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        key_pub_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        if cert_pub_bytes != key_pub_bytes:
            raise ValueError("Private key does not match certificate public key.")

        certs_dir = CertificateService.get_certs_dir()
        cert_path = certs_dir / "nuvi_server.crt"
        key_path = certs_dir / "nuvi_server.key"

        # Combine cert and chain if provided
        full_cert = cert_pem.strip()
        if chain_pem and chain_pem.strip():
            full_cert = f"{full_cert}\n{chain_pem.strip()}\n"

        with open(cert_path, "w", encoding="utf-8") as f:
            f.write(full_cert)

        with open(key_path, "w", encoding="utf-8") as f:
            f.write(key_pem.strip() + "\n")
        key_path.chmod(0o600)

        return CertificateService.get_active_certificate_info()

