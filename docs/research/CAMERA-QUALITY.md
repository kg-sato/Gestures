# Camera quality research and implementation

Reviewed 2026-11-05 against browser documentation and the W3C media-capture specification.

## Findings applied

1. Capture constraints express preferences, not a quality guarantee. `ideal` permits devices with other modes to work; mandatory `exact`/`min` may reject cameras. Request 1920x1080 at 30fps as ideals, retain the explicit chosen device and bounded low-resolution recovery. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
2. Prefer native capture sizing with `resizeMode: {ideal: 'none'}` only when the browser reports support. Do not force an unsupported mode. Keep CSS cover cropping separate from camera acquisition, and map hand coordinates through the same visible crop. [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)
3. Use negotiated settings to verify capture, not requested dimensions. The display canvas uses actual video dimensions; only the tracking bitmap is reduced to 640px width. This avoids accidentally displaying the inference thumbnail at full screen. [MDN getSettings](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)
4. Video-frame callbacks track video presentation more closely than display-refresh callbacks, with no strict latency guarantee. Keep existing requestVideoFrameCallback acquisition and skip repainting unchanged bitmaps in static-filter modes. Animated underwater/swirl modes still redraw intentionally. [MDN requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
5. SVG filter operations default to linearRGB unless configured; keep the filters explicitly in sRGB. Excess channel quantization and saturation alter source color, so the default mixes 85% original image with 15% comic treatment and has no saturation boost. Only temporary gesture layers use stronger color. Reduce blur from .55 to .35px. These blend/blur values are project choices, not browser recommendations. [MDN filter color space](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/color-interpolation-filters)

## Limits

1080p is a preference, not a promise; browser, USB bandwidth, lighting, sensor and camera processing determine the actual result. CSS cover intentionally crops to fill the viewport. Existing camera fallback may negotiate VGA at 15fps when normal acquisition fails. No exposure/white-balance/sharpening settings are forced and no new packages are installed. Frame scheduling avoids duplicate work but is not a measured physical-camera latency improvement.

## Evidence

Generated-camera browser checks assert display dimensions equal negotiated track dimensions, skin-patch output remains within 10 RGB levels of its source, local MediaPipe initializes, and each gesture filter still includes the comic base. Tests separately cover camera cancellation/retry, raw hand sequences, collision behavior and mobile layout. Real Brio fidelity/latency remains unverified until physically tested.
