"""Resource-server helpers for eve-vault-mcp opaque tokens.

Any backend (not just Python) can POST to the kit's /introspect and
/nonces/{id}/consume endpoints. This module is a small stdlib client so a
FastAPI/Django/Flask app does not have to copy the form-encoding details.

This file has no knowledge of any particular dApp.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Mapping

DEFAULT_TIMEOUT_SECONDS = 10.0


class EveVaultMcpError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, body: Mapping[str, Any] | None = None):
        super().__init__(message)
        self.status = status
        self.body = dict(body) if body else None


def introspect_token(
    introspect_url: str,
    token: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """RFC 7662 token introspection. Returns `{active: false}` for unknown tokens."""
    return _post_form(introspect_url, {"token": token}, timeout=timeout)


def require_active_token(
    introspect_url: str,
    authorization_header: str | None,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    required_scopes: list[str] | None = None,
) -> dict[str, Any]:
    """Parse `Authorization: Bearer`, introspect, and require `active` plus scopes."""
    if not authorization_header or not authorization_header.lower().startswith("bearer "):
        raise EveVaultMcpError("missing bearer token", status=401)
    token = authorization_header.split(" ", 1)[1].strip()
    if not token:
        raise EveVaultMcpError("missing bearer token", status=401)
    body = introspect_token(introspect_url, token, timeout=timeout)
    if not body.get("active"):
        raise EveVaultMcpError("inactive token", status=401, body=body)
    granted = set(str(body.get("scope") or "").split())
    missing = [scope for scope in required_scopes or [] if scope not in granted]
    if missing:
        raise EveVaultMcpError(
            "insufficient scope: " + " ".join(missing),
            status=403,
            body=body,
        )
    return body


def consume_nonce(
    consume_url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """POST to `/nonces/{id}/consume`. Raises if the nonce is unknown, used, or expired."""
    return _post_form(consume_url, {}, timeout=timeout)


def issue_nonce(
    nonces_url: str,
    *,
    purpose: str | None = None,
    metadata: Mapping[str, Any] | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if purpose:
        payload["purpose"] = purpose
    if metadata:
        payload["metadata"] = dict(metadata)
    return _post_json(nonces_url, payload, timeout=timeout)


def _post_form(url: str, fields: Mapping[str, str], *, timeout: float) -> dict[str, Any]:
    data = urllib.parse.urlencode(fields).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")
    return _read_json(request, timeout=timeout)


def _post_json(url: str, payload: Mapping[str, Any], *, timeout: float) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")
    request.add_header("Content-Type", "application/json")
    return _read_json(request, timeout=timeout)


def _read_json(request: urllib.request.Request, *, timeout: float) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            status = getattr(response, "status", 200)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8") if exc.fp else ""
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError as decode_error:
            raise EveVaultMcpError(raw or exc.reason, status=exc.code) from decode_error
        raise EveVaultMcpError(
            str(body.get("error_description") or body.get("error") or exc.reason),
            status=exc.code,
            body=body if isinstance(body, dict) else None,
        ) from exc
    try:
        parsed = json.loads(raw) if raw else {}
    except json.JSONDecodeError as exc:
        raise EveVaultMcpError("introspect response was not JSON", status=status) from exc
    if not isinstance(parsed, dict):
        raise EveVaultMcpError("introspect response was not an object", status=status)
    return parsed
