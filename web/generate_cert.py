#!/usr/bin/env python3
"""Generate a self-signed SSL certificate for localhost development.

Writes cert.pem and key.pem to the certs/ directory. The certificate
is valid for 10 years and covers localhost, 127.0.0.1, and ::1.

Usage:
    python generate_cert.py              # writes to certs/
    python generate_cert.py --output /app/web/certs   # custom output dir
"""

import argparse
import datetime
import ipaddress
import os
import sys
from pathlib import Path

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def generate_cert(output_dir="certs"):
    """Generate a self-signed cert and key, write to output_dir."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    cert_path = out / "cert.pem"
    key_path = out / "key.pem"

    # Skip if cert already exists and is valid
    if cert_path.exists() and key_path.exists():
        print(f"[generate_cert] Cert already exists: {cert_path}")
        return

    print("[generate_cert] Generating self-signed certificate...")

    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Build certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "CN"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Local"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Localhost"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Chinese DOS Games Dev"),
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])

    now = datetime.datetime.utcnow()
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=3650))  # 10 years
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
                x509.IPAddress(ipaddress.IPv6Address("::1")),
            ]),
            critical=False,
        )
        .sign(private_key, hashes.SHA256())
    )

    # Write key
    with open(key_path, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))
    key_path.chmod(0o600)

    # Write cert
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f"[generate_cert] Certificate written: {cert_path}")
    print(f"[generate_cert] Private key written:  {key_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate self-signed SSL cert")
    parser.add_argument("--output", default="certs", help="Output directory (default: certs/)")
    args = parser.parse_args()
    generate_cert(args.output)
