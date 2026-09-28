/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKEN_ENDPOINT?: string;
  readonly VITE_LIVEKIT_URL?: string;
  readonly VITE_SEGMENTER_MODEL_URL?: string;
  readonly VITE_FACE_MODEL_URL?: string;
  readonly VITE_MEDIAPIPE_WASM_BASE?: string;
  readonly VITE_TIME_SCALE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
