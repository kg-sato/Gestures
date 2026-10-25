"""Explicit-port USB camera client for the Gestures ESP32-CAM firmware.

No ports are opened on import. Listing devices is read-only. Actual camera access
requires an explicitly supplied port and only speaks the Gestures camera protocol.
"""
from __future__ import annotations

import argparse
import json
import threading
import time
from pathlib import Path

BAUD = 921600
MAX_FRAME_BYTES = 512 * 1024
MAX_LINE_BYTES = 256
IDENTITY_PREFIX = b"INFO Gestures camera protocol=1 "


class CameraError(RuntimeError):
    """Transport, framing or device failure that can be shown to the user."""


def list_ports() -> list[dict]:
    try:
        from serial.tools import list_ports as ports
    except ImportError as exc:
        raise CameraError("pyserial is missing. Run the project's dependency setup first.") from exc
    return [
        {"device": item.device, "description": item.description, "hwid": item.hwid,
         "vid": item.vid, "pid": item.pid, "serial_number": item.serial_number}
        for item in ports.comports()
    ]


class SerialCamera:
    def __init__(self, port: str, baud: int = BAUD, *, timeout: float = 4.0,
                 _transport=None):
        if not isinstance(port, str) or not port.strip():
            raise ValueError("Choose the ESP32-CAM serial port explicitly")
        if not 0 < timeout <= 30:
            raise ValueError("Camera timeout must be between 0 and 30 seconds")
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.lock = threading.Lock()
        self.serial = None
        self.identity = ""
        try:
            if _transport is None:
                try:
                    import serial
                except ImportError as exc:
                    raise CameraError("pyserial is missing. Run the project's dependency setup first.") from exc
                # Configure RTS/DTR before opening: opening a camera must not
                # intentionally enter its bootloader or reset an unrelated board.
                connection = serial.Serial(port=None, baudrate=baud, timeout=0.1,
                                           write_timeout=timeout)
                connection.dtr = False
                connection.rts = False
                connection.port = port
                connection.open()
                self.serial = connection
                self.serial.reset_input_buffer()
            else:
                self.serial = _transport
            self._write(b"HELLO\n")
            deadline = time.monotonic() + timeout
            # ROM boot messages (normally 115200 baud) may precede the firmware.
            # Bound total consumed diagnostic lines as well as time.
            for _ in range(64):
                line = self._line(deadline)
                if line.startswith(IDENTITY_PREFIX):
                    self.identity = line.decode("ascii", errors="replace")
                    if b"camera=ready" not in line:
                        raise CameraError("ESP32 firmware responded, but its camera is unavailable; check the ribbon cable")
                    break
            else:
                raise CameraError("This port did not identify as a Gestures camera")
        except Exception as exc:
            self.close()
            if isinstance(exc, (CameraError, ValueError)):
                raise
            raise CameraError(f"Cannot open camera on {port}: {exc}") from exc

    def _write(self, data: bytes):
        if self.serial is None:
            raise CameraError("Camera is closed")
        written = self.serial.write(data)
        if written != len(data):
            raise CameraError("Camera command was only partly written")
        self.serial.flush()

    def _line(self, deadline: float) -> bytes:
        result = bytearray()
        while time.monotonic() < deadline:
            value = self.serial.read(1)
            if not value:
                continue
            if value == b"\n":
                return bytes(result).rstrip(b"\r")
            result.extend(value)
            if len(result) > MAX_LINE_BYTES:
                raise CameraError("Camera response line exceeded the protocol limit")
        raise CameraError("Camera response timed out; check firmware, port and USB connection")

    def _exact(self, size: int, deadline: float) -> bytes:
        result = bytearray()
        while len(result) < size and time.monotonic() < deadline:
            result.extend(self.serial.read(min(16384, size - len(result))))
        if len(result) != size:
            raise CameraError("Camera JPEG transfer was truncated or timed out")
        return bytes(result)

    def capture(self) -> bytes:
        with self.lock:
            try:
                self._write(b"CAPTURE\n")
                deadline = time.monotonic() + self.timeout
                for _ in range(32):
                    line = self._line(deadline)
                    if line.startswith(b"ERROR "):
                        raise CameraError(line.decode("ascii", errors="replace"))
                    if line.startswith(b"FRAME "):
                        raw_size = line[6:]
                        if not raw_size.isdigit() or len(raw_size) > 6:
                            raise CameraError("Invalid camera frame length")
                        size = int(raw_size)
                        if not 4 <= size <= MAX_FRAME_BYTES:
                            raise CameraError("Camera frame length is outside the safe bounds")
                        image = self._exact(size, deadline)
                        if self._exact(1, deadline) != b"\n":
                            raise CameraError("Camera frame terminator was missing")
                        if not image.startswith(b"\xff\xd8") or not image.endswith(b"\xff\xd9"):
                            raise CameraError("Camera frame is not a complete JPEG")
                        return image
                raise CameraError("Camera sent too many diagnostics without a frame")
            except Exception as exc:
                # Stop this connection after a framing failure. Reopening only
                # the same explicit port is the caller's reconnect decision.
                self.close()
                if isinstance(exc, CameraError):
                    raise
                raise CameraError(f"Camera disconnected on {self.port}: {exc}") from exc

    def set_resolution(self, resolution: str):
        if resolution not in ("QVGA", "VGA"):
            raise ValueError("Resolution must be QVGA or VGA")
        with self.lock:
            try:
                self._write(f"RESOLUTION {resolution}\n".encode("ascii"))
                deadline = time.monotonic() + self.timeout
                for _ in range(16):
                    line = self._line(deadline)
                    if line == f"INFO Resolution {resolution}".encode("ascii"):
                        return
                    if line.startswith(b"ERROR "):
                        raise CameraError(line.decode("ascii", errors="replace"))
                raise CameraError("Camera did not acknowledge resolution change")
            except Exception:
                self.close()
                raise

    def close(self):
        connection, self.serial = self.serial, None
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="List serial devices without opening them")
    parser.add_argument("--port", help="Explicit ESP32-CAM port, e.g. COM5")
    parser.add_argument("--baud", type=int, default=BAUD)
    parser.add_argument("--hello", action="store_true", help="Check firmware identity without taking a picture")
    parser.add_argument("--resolution", choices=("QVGA", "VGA"), default="QVGA")
    parser.add_argument("--save", type=Path, help="Capture one JPEG into this path")
    args = parser.parse_args()
    try:
        if args.list:
            print(json.dumps(list_ports(), indent=2))
            return
        if not args.port:
            parser.error("--port is required unless --list is used")
        if not args.hello and not args.save:
            parser.error("Choose --hello or --save <image.jpg>")
        with SerialCamera(args.port, args.baud) as camera:
            print(camera.identity)
            if args.save:
                camera.set_resolution(args.resolution)
                image = camera.capture()
                args.save.parent.mkdir(parents=True, exist_ok=True)
                args.save.write_bytes(image)
                print(f"Captured {len(image)} bytes to {args.save.resolve()}")
    except CameraError as exc:
        parser.exit(1, f"Camera error: {exc}\n")


if __name__ == "__main__":
    main()
