"""Loopback HTTP contract checks with hardware held and no camera access."""
import http.client
import importlib.util
import json
from pathlib import Path
import threading
import time
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("gestures_server_under_test", ROOT / "server.py")
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.broker = studio.CameraBroker(allow_device=False)
        cls.server = studio.make_server(port=0, broker=cls.broker)
        cls.port = cls.server.server_port
        cls.origin = f"http://127.0.0.1:{cls.port}"
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join(timeout=3)
        cls.broker.disconnect()

    def setUp(self):
        self.broker.disconnect()
        _, _, body = self.request("GET", "/api/status")
        self.token = json.loads(body)["token"]

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request(method, path, body=body, headers={"Connection": "close", **(headers or {})})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def post(self, path, data, **headers):
        return self.request("POST", path, json.dumps(data).encode(),
                            {"Content-Type": "application/json", "X-Gestures-Token": self.token, **headers})

    def raw_post(self, headers, body=b""):
        """Exercise ambiguous framing without a client correcting its headers."""
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.putrequest("POST", "/api/disconnect")
            connection.putheader("Connection", "close")
            connection.putheader("X-Gestures-Token", self.token)
            for name, value in headers:
                connection.putheader(name, value)
            connection.endheaders(body)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_loopback_status_identifies_hold_and_no_external_permissions(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")
        status, headers, body = self.request("GET", "/api/status")
        data = json.loads(body)
        self.assertEqual(status, 200)
        self.assertTrue(data["hardware_hold"])
        self.assertFalse(data["connected"])
        self.assertIsNone(data["frame_age_ms"])
        self.assertGreaterEqual(len(data["token"]), 32)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertIn("connect-src 'self'", headers["Content-Security-Policy"])
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_static_allowlist_serves_app_but_never_repository_or_private_files(self):
        status, headers, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"Gestures", body)
        self.assertIn("text/html", headers["Content-Type"])
        for path in ("/README.md", "/server.py", "/config.json", "/.git/config",
                     "/../README.md", "/%2e%2e/server.py", "/web/../server.py"):
            with self.subTest(path=path):
                status, _, _ = self.request("GET", path)
                self.assertEqual(status, 404)

    def test_foreign_host_and_origin_cannot_read_camera_or_status(self):
        for path in ("/api/status", "/api/frame.jpg"):
            for headers in ({"Host": "attacker.example"}, {"Origin": "https://attacker.example"},
                            {"Origin": "null"}):
                with self.subTest(path=path, headers=headers):
                    status, _, _ = self.request("GET", path, headers=headers)
                    self.assertEqual(status, 403)
        # The alternate local URL intentionally remains usable.
        status, _, _ = self.request("GET", "/api/status", headers={"Host": f"localhost:{self.port}",
                                                "Origin": f"http://localhost:{self.port}"})
        self.assertEqual(status, 200)

    def test_mutation_requires_token_and_rejects_foreign_origin_even_with_token(self):
        with patch.object(self.broker, "disconnect") as disconnect:
            for headers in ({}, {"X-Gestures-Token": "incorrect"},
                            {"X-Gestures-Token": self.token, "Origin": "https://attacker.example"}):
                with self.subTest(headers=headers):
                    status, _, _ = self.request("POST", "/api/disconnect", b"{}", headers)
                    self.assertEqual(status, 403)
            disconnect.assert_not_called()

    def test_authorized_connect_still_respects_hardware_hold_without_enumerating_devices(self):
        # Hardware hold must stop before even enumerating available ports.
        with patch.object(studio, "usb_ports", side_effect=AssertionError("Hardware enumeration forbidden")) as ports:
            status, _, body = self.post("/api/connect", {"port": "COM999"}, Origin=self.origin)
            self.assertEqual(status, 409)
            self.assertIn("on hold", json.loads(body)["error"])
            ports.assert_not_called()
        self.assertIsNone(self.broker.camera)
        self.assertIsNone(self.broker.thread)

    def test_authorized_disconnect_is_idempotent_and_never_opens_a_camera(self):
        with patch.object(studio, "usb_ports", side_effect=AssertionError("No enumeration expected")):
            for _ in range(2):
                status, _, body = self.post("/api/disconnect", {}, Origin=self.origin)
                self.assertEqual(status, 200)
                self.assertFalse(json.loads(body)["connected"])
                self.assertTrue(json.loads(body)["hardware_hold"])

    def test_fresh_frame_has_sequence_and_age_but_stale_or_empty_frames_fail(self):
        image = b"\xff\xd8mock-camera-jpeg\xff\xd9"
        with self.broker.lock:
            self.broker.image = image
            self.broker.sequence = 42
            self.broker.captured_at = time.monotonic() - 0.1
        status, headers, body = self.request("GET", "/api/frame.jpg?after=41")
        self.assertEqual(status, 200)
        self.assertEqual(body, image)
        self.assertEqual(headers["Content-Type"], "image/jpeg")
        self.assertEqual(headers["X-Frame-Sequence"], "42")
        self.assertGreaterEqual(int(headers["X-Frame-Age-Ms"]), 100)
        self.assertLess(int(headers["X-Frame-Age-Ms"]), 2000)
        with self.broker.lock:
            self.broker.captured_at = time.monotonic() - 3
        self.assertEqual(self.request("GET", "/api/frame.jpg")[0], 503)
        with self.broker.lock:
            self.broker.image = b""
            self.broker.captured_at = time.monotonic()
        self.assertEqual(self.request("GET", "/api/frame.jpg")[0], 503)

    def test_invalid_frame_sequence_returns_a_clear_client_error(self):
        status, _, body = self.request("GET", "/api/frame.jpg?after=not-a-number")
        self.assertEqual(status, 400)
        self.assertIn("frame number", json.loads(body)["error"])

    def test_invalid_or_ambiguous_request_bodies_cannot_mutate_broker(self):
        cases = [
            ([("Content-Length", "2")], b"{]"),
            ([("Content-Length", "2")], b"[]"),
            ([("Content-Length", "0"), ("Content-Length", "0")], b""),
            ([("Content-Length", str(studio.MAX_REQUEST + 1))], b""),
            ([("Content-Length", "-1")], b""),
            ([("Transfer-Encoding", "chunked")], b""),
        ]
        with patch.object(self.broker, "disconnect") as disconnect:
            for headers, body in cases:
                with self.subTest(headers=headers, body=body):
                    status, error = self.raw_post(headers, body)
                    self.assertEqual(status, 409)
                    self.assertIn("error", error)
            disconnect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
