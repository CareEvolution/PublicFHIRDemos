#!/usr/bin/env python
import argparse
import sys

from _orcs_quickstart import (
    OrcsHttpError,
    discover_fhir_endpoints,
    read_token,
    request,
    resolve_server,
)


TARGETS = [
    "Condition/333D46AA-4E8B-4B2F-BA42-B58169E1DC5D",
    "Condition/4E57F361-6B33-4A7C-89F1-D4CA95BF88FD",
    "Person/person-test-6",
    "Patient/patient-record-6a",
    "Patient/patient-record-6b",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Delete the quickstart FHIR resources created by add-fhir-data.py."
    )
    parser.add_argument("--server")
    parser.add_argument("--token")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        server = resolve_server(args.server)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    try:
        token = read_token(args.token)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/fhir+json",
    }

    print(f"Server: {server}")
    info_url = server.rstrip("/") + "/api/info"
    print(f"Discovering endpoints at: {info_url}")

    try:
        _, readwrite_base, _ = discover_fhir_endpoints(server)
        print(f"Read-Write Base: {readwrite_base}")

        if not readwrite_base:
            print(f"Could not get read-write endpoint from {info_url}", file=sys.stderr)
            return 1

        for target in TARGETS:
            target_url = f"{readwrite_base}/{target}"
            print(f"## Deleting {target}")
            try:
                request(target_url, method="DELETE", headers=headers, parse_json=False)
                print(f"Successfully deleted {target}")
            except OrcsHttpError as error:
                details = error.details.strip() or str(error)
                print(
                    f"Failed to delete {target}. It may have already been deleted or there is an authorization issue.",
                    file=sys.stderr,
                )
                print(details, file=sys.stderr)

        print("Cleanup complete.")
        return 0
    except OrcsHttpError as error:
        details = error.details or "No additional details provided by server."
        print(f"Request failed. Status: {error.status_code}. Server response: {details}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"Request failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())