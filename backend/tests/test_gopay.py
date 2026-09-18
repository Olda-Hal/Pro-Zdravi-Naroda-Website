import base64
import unittest

import httpx

from app.gopay import create_gopay_payment_session, normalize_gopay_status


class GoPayHelperTests(unittest.TestCase):
    def test_create_gopay_payment_session_uses_basic_auth_and_returns_gw_url(self):
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/oauth2/token"):
                self.assertEqual(
                    request.headers.get("Authorization"),
                    "Basic " +
                    base64.b64encode(
                        b"client-id:client-secret").decode("utf-8"),
                )
                return httpx.Response(200, json={"access_token": "token-123"})

            if request.url.path.endswith("/payments"):
                self.assertEqual(request.headers.get(
                    "Authorization"), "Bearer token-123")
                payload = request.read()
                self.assertIn(b'"order_number":"PZN-1001"', payload)
                self.assertIn(b'"amount":1490', payload)
                return httpx.Response(200, json={"gw_url": "https://gopay.example/pay/abc"})

            raise AssertionError(f"Unexpected request: {request.url}")

        client = httpx.Client(transport=httpx.MockTransport(handler))

        redirect_url = create_gopay_payment_session(
            order_id="ord-1",
            order_number="PZN-1001",
            amount=1490,
            customer_name="Test User",
            customer_email="test@example.com",
            client_id="client-id",
            client_secret="client-secret",
            base_url="https://gw.sandbox.gopay.com/api",
            client=client,
        )

        self.assertEqual(redirect_url, "https://gopay.example/pay/abc")

    def test_normalize_gopay_status(self):
        self.assertEqual(normalize_gopay_status({"state": "PAID"}), "paid")
        self.assertEqual(normalize_gopay_status(
            {"state": "CREATED"}), "pending")


if __name__ == "__main__":
    unittest.main()
