# ESP32-CAM connection

## Current hardware hold

The user reported unusual heat and unplugged the camera. **Keep it disconnected
until the board/base seating, orientation and visible component condition have
been inspected.** The steps below describe the eventual setup, not an instruction
to reconnect now. No board commands were sent during software preparation.
Do not flash, probe or power the board as a troubleshooting shortcut while this
hold is unresolved.

This firmware targets the common original **AI-Thinker ESP32-CAM with OV2640**
and its ESP32-CAM-MB micro-USB serial programming base. A listing title alone
does not prove board identity; check its labels before flashing.

The USB cable is a serial connection, not a standard USB webcam connection.
`GesturesCamera.ino` turns it into a request-driven JPEG transport. Your PC
does the hand tracking. This path needs no Wi-Fi password, access point, SD
card or Internet connection after project setup. The antenna is unused by
the USB-only firmware.

## Before flashing

1. Seat the camera board in its matching MB base in the correct orientation.
2. Connect the micro-USB data cable to the PC. Do not attach the Pico; this
   project does not need to change the existing Pico–Kindle setup.
3. Run the project's Python with `scripts/device.py --list`. Match the newly
   appearing USB serial port to the camera base. Do not select the PC's
   built-in `COM1` port just because it is listed.
4. Check that the module really is an original AI-Thinker/OV2640-compatible
   ESP32-CAM. Other ESP32 camera boards have different pin maps.

The firmware is under `firmware/GesturesCamera/`. With an installed Espressif
Arduino core, the board identifier is `esp32:esp32:esp32cam`.
The project setup supplies the pinned CLI/core and exact build command.
Neither importing `scripts/device.py` nor listing ports flashes anything.

Some MB bases automatically reset the camera into its bootloader when the
upload tool requests it. Other revisions require the base's IO0/BOOT and reset
buttons; follow the actual board labels. After upload, release any BOOT button
and reset into normal run mode. Do not short unidentified pins.

## Host checks

Replace `COM5` with the confirmed camera port, and use the project's Python:

```powershell
python scripts/device.py --list
python scripts/device.py --port COM5 --hello
python scripts/device.py --port COM5 --save build/camera-check.jpg
```

The probe must return `INFO Gestures camera protocol=1 ... camera=ready`.
The capture command must produce a valid image of the actual scene before
camera/hand-tracking integration is considered verified. The default QVGA
resolution is 320 × 240. Optional `--resolution VGA` captures 640 × 480 when
PSRAM is detected; larger images consume more serial transfer time.

Good lighting, a stable camera position and a hand that occupies a useful
part of the frame matter more than merely selecting the largest resolution.
Actual frame rate and fingertip precision must be measured on the device.
There is no promised frame rate or precision based solely on this firmware.

## Transport contract

- UART: **921600 baud, 8 data bits, no parity, 1 stop bit**, no hardware flow control.
- PC `HELLO\n`: camera `INFO Gestures camera protocol=1 ...\n`.
- PC `CAPTURE\n`: camera `FRAME <decimal-byte-length>\n`, followed by exactly
  that many JPEG bytes, followed by one LF byte.
- PC `RESOLUTION QVGA\n` or `RESOLUTION VGA\n`: corresponding
  `INFO Resolution QVGA\n` or `INFO Resolution VGA\n` acknowledgement.
- Errors are bounded ASCII `ERROR ...\n` lines, never embedded inside a frame.
- Only one outstanding request is allowed. The firmware never pushes frames
  without a request, preventing an ever-growing queue of old camera images.
- The host accepts frames between 4 and 524288 bytes, validates JPEG start/end
  markers, bounds response lines and transfer time, and closes a broken session.
  The application can reconnect to the same explicitly chosen port.

The host does not automatically scan by opening arbitrary serial ports, toggle
the bootloader pins, or flash during normal drawing use.

## Source and compatibility references

The transport and command parser are original project code. Camera APIs,
JPEG buffering and board pin assignments were checked against:

- [Espressif camera driver](https://github.com/espressif/esp32-camera), Apache-2.0.
- [Official AI-Thinker pin map](https://github.com/espressif/arduino-esp32/blob/master/libraries/ESP32/examples/Camera/CameraWebServer/camera_pins.h).
- [Official CameraWebServer setup](https://github.com/espressif/arduino-esp32/blob/master/libraries/ESP32/examples/Camera/CameraWebServer/CameraWebServer.ino).
- [pySerial API](https://pyserial.readthedocs.io/en/latest/pyserial_api.html).

The official driver warns that RGB/YUV capture strains the original ESP32,
especially alongside Wi-Fi. This implementation requests JPEG and decodes on
the PC. With PSRAM it uses two frame buffers and `CAMERA_GRAB_LATEST`; without
PSRAM it stays at QVGA with one DRAM frame buffer. Flash illumination stays off.

## Local compiler verification — 2026-10-24

The firmware compiled with official Arduino CLI **1.5.1** and Espressif Arduino
core **3.3.12**, FQBN `esp32:esp32:esp32cam`. All toolchain files stay under
project `.tools/`. Setup: `powershell -NoProfile -File scripts/setup_firmware.ps1`.
The script verifies the CLI archive SHA-256 and records toolchain provenance.
Build output: 372853 bytes program storage and 34164 bytes globals. Compiled
files are under ignored `build/firmware/artifacts/`. Source/artifact hashes are
in `build/firmware/verification.json`. Nothing was flashed.

The board photos show an ESP-32S module and MB base, but do not resolve the
reported heat or prove pin-map/electrical health. Hardware hold remains active.
