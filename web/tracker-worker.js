/**
 * Adapted from Google's Apache-2.0 MediaPipe Hand Landmarker worker example.
 * Copyright 2026 The MediaPipe Authors.
 * https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts
 * Changes: self-contained local assets, transferable frames, CPU fallback,
 * serialized inference and small normalized results for the Gestures studio.
 * Licensed under Apache-2.0; see licenses/Apache-2.0.txt.
 */
import { FilesetResolver, HandLandmarker } from '/vendor/vision_bundle.mjs';

let landmarker;
let loading;
async function initialize() {
  const vision = await FilesetResolver.forVisionTasks('/vendor/wasm', true);
  // Module workers need the ES-module WASM loader. Restore its exported factory
  // before each attempt because MediaPipe consumes the global and imports cache.
  const {default:factory} = await import(vision.wasmLoaderPath);
  const options = {baseOptions:{modelAssetPath:'/models/hand_landmarker.task',delegate:'GPU'},
    runningMode:'VIDEO', numHands:2, minHandDetectionConfidence:0.65,
    minHandPresenceConfidence:0.65, minTrackingConfidence:0.65};
  try {
    globalThis.ModuleFactory=factory;
    landmarker = await HandLandmarker.createFromOptions(vision, options);
    return 'GPU';
  } catch (error) {
    globalThis.ModuleFactory=factory;
    options.baseOptions.delegate = 'CPU';
    landmarker = await HandLandmarker.createFromOptions(vision, options);
    return 'CPU';
  }
}
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      loading = initialize();
      const delegate = await loading;
      // Compile first-frame kernels before inviting the user to draw. This
      // discarded blank image is never presented as a detected hand.
      const warmup=new OffscreenCanvas(320,240);
      warmup.getContext('2d').fillRect(0,0,320,240);
      landmarker.detectForVideo(warmup,0);
      self.postMessage({type:'ready',delegate});
    } catch (error) { self.postMessage({type:'error',message:'Cannot load hand tracker: '+error.message}); }
    return;
  }
  if (data.type !== 'frame') return;
  const {bitmap,timestamp,id,sourceAgeMs=0} = data;
  try {
    if (!landmarker) throw Error('Hand tracker is not ready');
    const started = performance.now();
    const result = landmarker.detectForVideo(bitmap, timestamp);
    const hands = result.landmarks.map((landmarks,index)=>({landmarks,
      handedness:result.handedness[index]?.[0]?.categoryName || '',
      confidence:result.handedness[index]?.[0]?.score ?? 0}));
    self.postMessage({type:'result',hands,timestamp,id,sourceAgeMs,inferenceMs:performance.now()-started});
  } catch (error) { self.postMessage({type:'frame-error',id,message:error.message}); }
  finally { bitmap.close(); }
};
