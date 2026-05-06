#!/usr/bin/env python
import argparse
import base64
import json
import sys
import time
import uuid
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from _orcs_quickstart import OrcsHttpError, build_url, request_form, resolve_server


def base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def get_certificate_path(private_key_path: str) -> Path:
    return Path(private_key_path).with_name("certificate.pem")


def get_certificate_kid(private_key_path: str) -> str:
    cert_bytes = get_certificate_path(private_key_path).read_bytes()
    cert = x509.load_pem_x509_certificate(cert_bytes)
    fingerprint = cert.fingerprint(hashes.SHA1())
    return fingerprint.hex().upper()


def build_client_assertion(client_id: str, token_url: str, private_key_path: str) -> str:
    pem_content = Path(private_key_path).read_bytes()

    private_key = serialization.load_pem_private_key(pem_content, password=None)
    kid_thumbprint = get_certificate_kid(private_key_path)

    now = int(time.time())
    payload = {
        "iss": client_id,
        "sub": client_id,
        "aud": token_url,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + 300,
    }
    header = {"alg": "RS384", "typ": "JWT", "kid": kid_thumbprint}

    header_segment = base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_segment = base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signed_content = f"{header_segment}.{payload_segment}".encode("utf-8")
    signature = private_key.sign(signed_content, padding.PKCS1v15(), hashes.SHA384())
    return f"{header_segment}.{payload_segment}.{base64url_encode(signature)}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Obtain a bearer token using the SMART backend auth flow and write it to stdout."
        )
    )
    parser.add_argument("--client-id", required=True, help="The username you created with keyset.")
    parser.add_argument("--server", required=True, help="Orchestrate Server base URL")
    parser.add_argument("--private-key-path", default="./private_key.pem")
    parser.add_argument("--scope", default="system/*.*")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        server = resolve_server(args.server)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    token_url = build_url(server, "/smart/auth/token")

    if args.verbose:
        print(f"Loading private key from {args.private_key_path}", file=sys.stderr)
        print(f"Loading certificate from {get_certificate_path(args.private_key_path)}", file=sys.stderr)

    try:
        client_assertion = build_client_assertion(args.client_id, token_url, args.private_key_path)
        if args.verbose:
            print(f"Requesting access token from {token_url}", file=sys.stderr)

        response = request_form(
            token_url,
            form_data={
                "grant_type": "client_credentials",
                "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                "client_assertion": client_assertion,
                "scope": args.scope,
            },
        )
        access_token = response.get("access_token")
        if not access_token:
            raise RuntimeError("Token response did not include an access_token field.")
        print(access_token)
        return 0
    except OrcsHttpError as error:
        details = error.details or "No additional details provided by server."
        print(
            f"Authentication failed. Status: {error.status_code}. Server response: {details}",
            file=sys.stderr,
        )
        return 1
    except FileNotFoundError:
        print(
            (
                "Private key or certificate file not found. Expected private key at "
                f"{args.private_key_path} and certificate at {get_certificate_path(args.private_key_path)}"
            ),
            file=sys.stderr,
        )
        return 1
    except Exception as error:
        print(f"Authentication failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())