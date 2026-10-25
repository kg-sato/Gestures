"""USB framing tests using a fake serial transport; no physical device access."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("gestures_device", ROOT / "scripts/device.py")
device = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(device)


class FakeSerial:
    def __init__(self, reply=b"", chunk=7, ready=True):
        self.data = bytearray()
        self.reply = reply
        self.chunk = chunk
        self.ready = ready
        self.closed = False
        self.writes = []

    def write(self, data):
        self.writes.append(data)
        if data == b"HELLO\n":
            state = b"ready" if self.ready else b"unavailable"
            self.data.extend(b"boot noise\nINFO Gestures camera protocol=1 baud=921600 psram=1 camera=" + state + b"\n")
        elif data == b"CAPTURE\n":
            self.data.extend(self.reply)
        elif data == b"RESOLUTION VGA\n":
            self.data.extend(b"INFO Resolution VGA\n")
        return len(data)

    def read(self, count):
        count = min(count, self.chunk)
        result = bytes(self.data[:count])
        del self.data[:count]
        return result

    def flush(self):
        pass

    def close(self):
        self.closed = True


class CameraProtocolTests(unittest.TestCase):
    def test_fragmented_jpeg_with_newline_in_payload(self):
        jpeg = b"\xff\xd8payload\nFRAME 999\n\x00\xff\xd9"
        transport = FakeSerial(b"INFO capturing\nFRAME " + str(len(jpeg)).encode() + b"\n" + jpeg + b"\n", chunk=2)
        with device.SerialCamera("TEST", _transport=transport) as camera:
            self.assertEqual(camera.capture(), jpeg)
            self.assertEqual(transport.writes, [b"HELLO\n", b"CAPTURE\n"])
        self.assertTrue(transport.closed)

    def test_invalid_or_oversized_length_closes(self):
        for length in (b"-1", b"nope", b"0", b"3", b"524289", b"999999999"):
            with self.subTest(length=length):
                transport = FakeSerial(b"FRAME " + length + b"\n")
                camera = device.SerialCamera("TEST", _transport=transport)
                with self.assertRaises(device.CameraError):
                    camera.capture()
                self.assertTrue(transport.closed)

    def test_invalid_jpeg_or_terminator_closes(self):
        for reply in (b"FRAME 4\nnope\n", b"FRAME 4\n\xff\xd8\xff\xd9X"):
            transport = FakeSerial(reply)
            camera = device.SerialCamera("TEST", _transport=transport)
            with self.assertRaises(device.CameraError):
                camera.capture()
            self.assertTrue(transport.closed)

    def test_truncated_jpeg_times_out(self):
        transport = FakeSerial(b"FRAME 20\n\xff\xd8")
        camera = device.SerialCamera("TEST", timeout=0.01, _transport=transport)
        with self.assertRaisesRegex(device.CameraError, "truncated"):
            camera.capture()
        self.assertTrue(transport.closed)

    def test_device_error_is_actionable(self):
        transport = FakeSerial(b"ERROR Camera capture failed\n")
        camera = device.SerialCamera("TEST", _transport=transport)
        with self.assertRaisesRegex(device.CameraError, "capture failed"):
            camera.capture()

    def test_unavailable_camera_rejected(self):
        transport = FakeSerial(ready=False)
        with self.assertRaisesRegex(device.CameraError, "ribbon"):
            device.SerialCamera("TEST", _transport=transport)
        self.assertTrue(transport.closed)

    def test_resolution_and_explicit_port(self):
        with self.assertRaises(ValueError):
            device.SerialCamera("")
        transport = FakeSerial()
        with device.SerialCamera("TEST", _transport=transport) as camera:
            camera.set_resolution("VGA")
            with self.assertRaises(ValueError):
                camera.set_resolution("UXGA")

    def test_diagnostic_line_bound(self):
        transport = FakeSerial(b"x" * 257 + b"\n")
        camera = device.SerialCamera("TEST", _transport=transport)
        with self.assertRaisesRegex(device.CameraError, "line exceeded"):
            camera.capture()


if __name__ == "__main__":
    unittest.main()
