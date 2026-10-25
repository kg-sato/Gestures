/*
 * Gestures camera transport for the original AI-Thinker ESP32-CAM / OV2640.
 * Protocol and command implementation are original to this project.
 * Camera API and AI-Thinker pin map verified against Espressif's official sources:
 * https://github.com/espressif/esp32-camera
 * https://github.com/espressif/arduino-esp32/blob/master/libraries/ESP32/examples/Camera/CameraWebServer/camera_pins.h
 * No Wi-Fi credentials, SD card, network listener or microphone are used.
 */
#include <Arduino.h>
#include "esp_camera.h"

constexpr uint32_t SERIAL_BAUD = 921600;
constexpr size_t MAX_FRAME_BYTES = 512 * 1024;
constexpr size_t MAX_COMMAND_BYTES = 63;
bool cameraReady = false;
bool cameraHasPsram = false;
char commandBuffer[MAX_COMMAND_BYTES + 1];
size_t commandLength = 0;
bool commandOverflow = false;

void describeCamera() {
  Serial.printf("INFO Gestures camera protocol=1 baud=%lu psram=%d camera=%s\n",
                static_cast<unsigned long>(SERIAL_BAUD), cameraHasPsram ? 1 : 0,
                cameraReady ? "ready" : "unavailable");
}

void captureFrame() {
  if (!cameraReady) {
    Serial.println("ERROR Camera unavailable; check OV2640 ribbon and board selection");
    return;
  }
  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame) {
    Serial.println("ERROR Camera capture failed");
    return;
  }
  if (frame->format != PIXFORMAT_JPEG || frame->len < 4 || frame->len > MAX_FRAME_BYTES) {
    esp_camera_fb_return(frame);
    Serial.println("ERROR Invalid camera frame");
    return;
  }
  Serial.printf("FRAME %u\n", static_cast<unsigned int>(frame->len));
  Serial.write(frame->buf, frame->len);
  Serial.write('\n');
  Serial.flush();
  esp_camera_fb_return(frame);
}

void processCommand(const char *command) {
  if (strcmp(command, "HELLO") == 0) {
    describeCamera();
  } else if (strcmp(command, "CAPTURE") == 0) {
    captureFrame();
  } else if (strcmp(command, "RESOLUTION QVGA") == 0 || strcmp(command, "RESOLUTION VGA") == 0) {
    if (!cameraReady) {
      Serial.println("ERROR Camera unavailable");
      return;
    }
    const bool wantsVga = strcmp(command, "RESOLUTION VGA") == 0;
    if (wantsVga && !cameraHasPsram) {
      Serial.println("ERROR VGA requires detected PSRAM; use QVGA");
      return;
    }
    sensor_t *sensor = esp_camera_sensor_get();
    if (!sensor || sensor->set_framesize(sensor, wantsVga ? FRAMESIZE_VGA : FRAMESIZE_QVGA) != 0) {
      Serial.println("ERROR Resolution change failed");
      return;
    }
    Serial.printf("INFO Resolution %s\n", wantsVga ? "VGA" : "QVGA");
  } else {
    Serial.println("ERROR Unknown command");
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  Serial.setDebugOutput(false);
  // Keep the board's bright flash LED off. It is not a camera status indicator.
  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);
  cameraHasPsram = psramFound();

  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 5;
  config.pin_d1 = 18;
  config.pin_d2 = 19;
  config.pin_d3 = 21;
  config.pin_d4 = 36;
  config.pin_d5 = 39;
  config.pin_d6 = 34;
  config.pin_d7 = 35;
  config.pin_xclk = 0;
  config.pin_pclk = 22;
  config.pin_vsync = 25;
  config.pin_href = 23;
  config.pin_sccb_sda = 26;
  config.pin_sccb_scl = 27;
  config.pin_pwdn = 32;
  config.pin_reset = -1;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  // Allocate for optional VGA, but start capture at QVGA for lower UART latency.
  config.frame_size = cameraHasPsram ? FRAMESIZE_VGA : FRAMESIZE_QVGA;
  config.jpeg_quality = 14;
  config.fb_count = cameraHasPsram ? 2 : 1;
  config.fb_location = cameraHasPsram ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.grab_mode = cameraHasPsram ? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY;

  const esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) {
    Serial.printf("ERROR Camera initialization failed code=0x%x\n", result);
  } else {
    sensor_t *sensor = esp_camera_sensor_get();
    cameraReady = sensor && sensor->set_framesize(sensor, FRAMESIZE_QVGA) == 0;
  }
  describeCamera();
}

void loop() {
  while (Serial.available()) {
    const char value = static_cast<char>(Serial.read());
    if (value == '\n') {
      if (commandOverflow) {
        Serial.println("ERROR Command too long");
      } else {
        commandBuffer[commandLength] = '\0';
        processCommand(commandBuffer);
      }
      commandLength = 0;
      commandOverflow = false;
    } else if (value != '\r') {
      if (commandLength < MAX_COMMAND_BYTES) {
        commandBuffer[commandLength++] = value;
      } else {
        commandOverflow = true;
      }
    }
  }
  delay(1);
}
