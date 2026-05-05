import json
import os
import sys
import requests

class OrcsHttpError(RuntimeError):
    def __init__(self, status_code: int, message: str, details: str = "") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.details = details


def resolve_server(server: str | None) -> str:
    resolved_server = server or os.environ.get("ORCS_SERVERURL")
    if resolved_server:
        return resolved_server

    raise ValueError(
        "A server URL is required. Pass --server or set ORCS_SERVERURL."
    )


def trim_trailing_slash(value: str) -> str:
    return value.rstrip("/")


def build_url(server: str, path: str) -> str:
    return f"{trim_trailing_slash(server)}/{path.lstrip('/')}"


def read_token(token: str | None) -> str:
    if token:
        return token.strip()

    if not sys.stdin.isatty():
        piped_token = sys.stdin.read().strip()
        if piped_token:
            return piped_token

    raise ValueError("A bearer token is required. Pass --token or pipe one into stdin.")


def _handle_response(response: requests.Response, parse_json: bool):
    try:
        response.raise_for_status()
        if not parse_json:
            return response.text
        if not response.content:
            return None
        return response.json()
    except requests.exceptions.HTTPError as error:
        details = response.text
        message = f"HTTP {response.status_code} calling {response.url}"
        raise OrcsHttpError(response.status_code, message, details) from error
    except requests.exceptions.RequestException as error:
        raise RuntimeError(f"Could not reach {response.url}: {error}") from error


def request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    data: bytes | str | None = None,
    timeout: int = 60,
    parse_json: bool = True,
):
    response = requests.request(
        method=method.upper(), url=url, headers=headers, data=data, timeout=timeout
    )
    return _handle_response(response, parse_json)


def request_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    payload=None,
    timeout: int = 60,
):
    kwargs = {}
    if payload is not None:
        kwargs["json"] = payload  # Automatically sets Content-Type: application/json and serializes

    response = requests.request(
        method=method.upper(), url=url, headers=headers, timeout=timeout, **kwargs
    )
    return _handle_response(response, parse_json=True)


def request_form(
    url: str,
    *,
    method: str = "POST",
    headers: dict[str, str] | None = None,
    form_data: dict[str, str] | None = None,
    timeout: int = 60,
):
    kwargs = {}
    if form_data is not None:
        kwargs["data"] = form_data

    response = requests.request(
        method=method.upper(), url=url, headers=headers, timeout=timeout, **kwargs
    )
    return _handle_response(response, parse_json=True)


def discover_fhir_endpoints(server: str) -> tuple[str | None, str | None, dict]:
    info_url = build_url(server, "/api/info")
    api_info = request_json(info_url)
    readonly_base = None
    readwrite_base = None

    for endpoint in api_info.get("fhirEndpoints", []):
        version = str(endpoint.get("version") or "").lower()
        if version != "r4":
            continue
        patient_records_handling = str(
            endpoint.get("patientRecordsHandling") or ""
        ).lower()
        if patient_records_handling == "merge":
            readonly_base = endpoint.get("endpoint")
        if patient_records_handling == "separate":
            readwrite_base = endpoint.get("endpoint")

    return readonly_base, readwrite_base, api_info


def dump_json(value) -> str:
    return json.dumps(value, indent=2, sort_keys=True)