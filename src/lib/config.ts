const env = import.meta.env;

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  tokenEndpoint: env.VITE_TOKEN_ENDPOINT || '/api/token',
  livekitUrlOverride: env.VITE_LIVEKIT_URL || '',
  segmenterModelUrl:
    env.VITE_SEGMENTER_MODEL_URL ||
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  faceModelUrl:
    env.VITE_FACE_MODEL_URL ||
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  mediapipeWasmBase: env.VITE_MEDIAPIPE_WASM_BASE || '/mediapipe/wasm',
  timeScale: num(env.VITE_TIME_SCALE, 1),
};
