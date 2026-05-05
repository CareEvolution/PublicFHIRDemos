#!/usr/bin/env python
import argparse
import base64
import sys
import textwrap
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

def pem_block(label: str, content: bytes) -> str:
    encoded = base64.b64encode(content).decode("ascii")
    wrapped = "\n".join(textwrap.wrap(encoded, 64))
    return f"-----BEGIN {label}-----\n{wrapped}\n-----END {label}-----"

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate an RSA signing key for the quickstart flow.")
    parser.add_argument("--key-size", type=int, default=2048)
    parser.add_argument("--private-key-path", default="./private_key.pem")
    return parser.parse_args()

def main() -> int:
    args = parse_args()

    print(f"Generating {args.key_size}-bit RSA key pair...")
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=args.key_size)
    public_key = private_key.public_key()

    public_key_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_key_pem = pem_block("PUBLIC KEY", public_key_bytes)
    print("\n--- PUBLIC KEY (X.509 PEM) ---")
    print(public_key_pem)
    print("----------------------------------")

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