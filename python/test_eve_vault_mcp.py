import json
import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request

from eve_vault_mcp import (
    EveVaultMcpError,
    consume_nonce,
    introspect_token,
    issue_nonce,
    require_active_token,
)


class _FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = json.dumps(payload).encode("utf-8")
        self.status = status

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class IntrospectTests(unittest.TestCase):
    def test_active_token(self):
        def opener(request, timeout=10.0):
            self.assertIsInstance(request, Request)
            self.assertEqual(request.full_url, "https://example.test/introspect")
            self.assertEqual(request.data, b"token=eva_secret")
            return _FakeResponse(
                {
                    "active": True,
                    "sub": "0xabc",
                    "scope": "contracts:read contracts:prepare",
                    "wallet_address": "0xabc",
                }
            )

        with patch("eve_vault_mcp.urllib.request.urlopen", opener):
            body = introspect_token("https://example.test/introspect", "eva_secret")
        self.assertTrue(body["active"])
        self.assertEqual(body["wallet_address"], "0xabc")

    def test_require_active_rejects_missing_header(self):
        with self.assertRaises(EveVaultMcpError) as ctx:
            require_active_token("https://example.test/introspect", None)
        self.assertEqual(ctx.exception.status, 401)

    def test_require_active_enforces_scopes(self):
        def opener(request, timeout=10.0):
            return _FakeResponse({"active": True, "scope": "contracts:read", "sub": "0xabc"})

        with patch("eve_vault_mcp.urllib.request.urlopen", opener):
            with self.assertRaises(EveVaultMcpError) as ctx:
                require_active_token(
                    "https://example.test/introspect",
                    "Bearer eva_secret",
                    required_scopes=["contracts:prepare"],
                )
        self.assertEqual(ctx.exception.status, 403)

    def test_inactive_token(self):
        def opener(request, timeout=10.0):
            return _FakeResponse({"active": False})

        with patch("eve_vault_mcp.urllib.request.urlopen", opener):
            with self.assertRaises(EveVaultMcpError) as ctx:
                require_active_token("https://example.test/introspect", "Bearer eva_secret")
        self.assertEqual(ctx.exception.status, 401)

    def test_http_error(self):
        def opener(request, timeout=10.0):
            raise HTTPError(
                "https://example.test/nonces/abc/consume",
                404,
                "Not Found",
                hdrs=None,
                fp=BytesIO(json.dumps({"error": "not_found", "error_description": "Unknown nonce"}).encode()),
            )

        with patch("eve_vault_mcp.urllib.request.urlopen", opener):
            with self.assertRaises(EveVaultMcpError) as ctx:
                consume_nonce("https://example.test/nonces/abc/consume")
        self.assertEqual(ctx.exception.status, 404)
        self.assertIn("Unknown nonce", str(ctx.exception))

    def test_issue_nonce_json(self):
        def opener(request, timeout=10.0):
            self.assertEqual(request.get_header("Content-type"), "application/json")
            payload = json.loads(request.data.decode())
            self.assertEqual(payload["purpose"], "wallet-proof")
            return _FakeResponse({"id": "n1", "value": "v1", "expiresAt": 1})

        with patch("eve_vault_mcp.urllib.request.urlopen", opener):
            body = issue_nonce(
                "https://example.test/nonces",
                purpose="wallet-proof",
                metadata={"action": "profile.save"},
            )
        self.assertEqual(body["id"], "n1")


if __name__ == "__main__":
    unittest.main()
