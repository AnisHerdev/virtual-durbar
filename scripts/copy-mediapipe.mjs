// Copies the MediaPipe Tasks Vision WASM runtime into public/ so it is served
// from our own origin (and matches the installed JS package version exactly).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(src)) {
  console.warn('[copy-mediapipe] @mediapipe/tasks-vision not installed yet; skipping.');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
// FilesetResolver.forVisionTasks(base, useModule=false) only loads these; the
// *_module_* variants would add ~12MB to the deploy for nothing.
for (const file of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  cpSync(join(src, file), join(dest, file));
}
console.log('[copy-mediapipe] WASM runtime copied to public/mediapipe/wasm');
