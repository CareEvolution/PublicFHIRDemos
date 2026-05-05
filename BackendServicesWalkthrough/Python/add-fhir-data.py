#!/usr/bin/env python
import argparse
import sys

from _orcs_quickstart import (
    OrcsHttpError,
    discover_fhir_endpoints,
    dump_json,
    read_token,
    request_json,
    resolve_server,
)

PERSON_ID = "person-test-6"
FIRST_PATIENT_RECORD_ID = "patient-record-6a"
SECOND_PATIENT_RECORD_ID = "patient-record-6b"
FEVER_CONDITION_ID = "333D46AA-4E8B-4B2F-BA42-B58169E1DC5D"
COUGH_CONDITION_ID = "4E57F361-6B33-4A7C-89F1-D4CA95BF88FD"

# Simulates a common situation where a patient treated at different facilities has multiple 
#   patient records with slightly differing names/information, but which is later linked together
#   using a Person resource. 
PATIENT_AND_PERSON_BUNDLE = {
    "resourceType": "Bundle",
    "type": "transaction",
    "entry": [
        {
            "fullUrl": f"Patient/{FIRST_PATIENT_RECORD_ID}",
            "resource": {
                "resourceType": "Patient",
                "identifier": [{"value": "patient-test-6a"}],
                "name": [{"family": "Baggins", "given": ["Bilbo"]}],
                "gender": "male",
                "birthDate": "1912-09-22",
            },
            "request": {"method": "PUT", "url": f"Patient/{FIRST_PATIENT_RECORD_ID}"},
        },
        {
            "fullUrl": f"Patient/{SECOND_PATIENT_RECORD_ID}",
            "resource": {
                "resourceType": "Patient",
                "identifier": [{"value": "patient-test-6b"}],
                "name": [{"family": "Baggins", "given": ["Bilbo", "Gardner"]}],
                "gender": "male",
                "birthDate": "1912-09-22",
                "telecom": [{"system": "phone", "value": "555-0106"}],
            },
            "request": {"method": "PUT", "url": f"Patient/{SECOND_PATIENT_RECORD_ID}"},
        },
        {
            "resource": {
                "resourceType": "Person",
                "link": [
                    {"target": {"reference": f"Patient/{FIRST_PATIENT_RECORD_ID}"}},
                    {"target": {"reference": f"Patient/{SECOND_PATIENT_RECORD_ID}"}},
                ],
            },
            "request": {"method": "PUT", "url": f"Person/{PERSON_ID}"},
        }
    ],
}


FEVER_CONDITION = {
    "resourceType": "Condition",
    "clinicalStatus": {
        "coding": [
            {
                "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                "code": "active",
            }
        ]
    },
    "verificationStatus": {
        "coding": [
            {
                "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                "code": "confirmed",
            }
        ]
    },
    "code": {"text": "fever"},
    "subject": {"reference": f"Patient/{FIRST_PATIENT_RECORD_ID}"},
    "onsetDateTime": "2023-11-02",
}


COUGH_CONDITION = {
    "resourceType": "Condition",
    "clinicalStatus": {
        "coding": [
            {
                "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                "code": "active",
            }
        ]
    },
    "verificationStatus": {
        "coding": [
            {
                "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                "code": "confirmed",
            }
        ]
    },
    "code": {"text": "cough"},
    "subject": {"reference": f"Patient/{SECOND_PATIENT_RECORD_ID}"},
    "onsetDateTime": "2023-11-03",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create two patient records, group them with a Person, and read the merged patient."
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
        readonly_base, readwrite_base, _ = discover_fhir_endpoints(server)
        print(f"Read-Only Base: {readonly_base}")
        print(f"Read-Write Base: {readwrite_base}")

        if not readonly_base or not readwrite_base:
            print(f"Could not get endpoints from {info_url}", file=sys.stderr)
            return 1

        print("## Posting Transaction Bundle With Two Patient Records And One Person Group")
        bundle_response = request_json(
            readwrite_base,
            method="POST",
            headers=headers,
            payload=PATIENT_AND_PERSON_BUNDLE,
        )
        print("Patient and Person transaction processed.")
        print(dump_json(bundle_response))

        print(f"## Retrieving Separate Patient Record {FIRST_PATIENT_RECORD_ID}")
        first_patient = request_json(f"{readwrite_base}/Patient/{FIRST_PATIENT_RECORD_ID}", headers=headers)
        print(dump_json(first_patient))

        print(f"## Retrieving Separate Patient Record {SECOND_PATIENT_RECORD_ID}")
        second_patient = request_json(f"{readwrite_base}/Patient/{SECOND_PATIENT_RECORD_ID}", headers=headers)
        print(dump_json(second_patient))

        print(f"## Writing Fever Condition/{FEVER_CONDITION_ID} Against Record {FIRST_PATIENT_RECORD_ID}")
        fever_condition = request_json(
            f"{readwrite_base}/Condition/{FEVER_CONDITION_ID}",
            method="PUT",
            headers=headers,
            payload=FEVER_CONDITION,
        )
        print(dump_json(fever_condition))

        print(f"## Writing Cough Condition/{COUGH_CONDITION_ID} Against Record {SECOND_PATIENT_RECORD_ID}")
        cough_condition = request_json(
            f"{readwrite_base}/Condition/{COUGH_CONDITION_ID}",
            method="PUT",
            headers=headers,
            payload=COUGH_CONDITION,
        )
        print(dump_json(cough_condition))

        print(f"## Retrieving Merged Patient/{PERSON_ID} From The Read-Only Endpoint")
        merged_patient = request_json(f"{readonly_base}/Patient/{PERSON_ID}", headers=headers)
        print(dump_json(merged_patient))

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