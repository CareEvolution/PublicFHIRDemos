#!/usr/bin/env python
import argparse
import datetime
import sys
from pathlib import Path

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def get_certificate_path(private_key_path: str) -> Path:
    return Path(private_key_path).with_name("certificate.pem")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate an RSA signing key for the quickstart flow.")
    parser.add_argument("--key-size", type=int, default=2048)
    parser.add_argument("--private-key-path", default="./private_key.pem")
    return parser.parse_args()

def main() -> int:
    args = parse_args()
    certificate_path = get_certificate_path(args.private_key_path)

    print(f"Generating {args.key_size}-bit RSA key pair...")
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=args.key_size)
    public_key = private_key.public_key()

    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, u"SMART App Quickstart"),])   
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(public_key)
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=365))
        .sign(private_key, hashes.SHA256())
    )

    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    certificate_path.write_bytes(cert_pem)

    print(cert_pem.decode("ascii"))

    private_key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    
    Path(args.private_key_path).write_bytes(private_key_bytes)

    print(f"[Success] Private key saved to: {args.private_key_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())