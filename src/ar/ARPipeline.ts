// On-device AR compositor:
//   webcam → ImageSegmenter (person mask) → court background
//          → FaceLandmarker (head pose) → role headwear + necklace
//          → hidden <canvas> → canvas.captureStream(30) → published to LiveKit.

import type { PropDef } from '../content/types';
import type { VisionModels } from './visionModels';
import { placeProps, smoothPose, type HeadPose, type PropPoses } from './headPose';

export const OUTPUT_WIDTH = 640;
export const OUTPUT_HEIGHT = 480;
const FPS = 30;

export type ARStatus = 'idle' | 'starting' | 'running' | 'no-camera' | 'stopped';

export interface ARState {
  status: ARStatus;
  segmentation: boolean;
  faceTracking: boolean;
  messages: string[];
  fps: number;
}

export interface Placeholder {
  emblem: string;
  name: string;
  color: string;
}

type Listener = (state: ARState) => void;

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

/** Source rect that crops (sw×sh) to cover the destination aspect ratio. */
function coverRect(sw: number, sh: number, dw: number, dh: number) {
  const scale = Math.max(dw / sw, dh / sh);
  const w = dw / scale;
  const h = dh / scale;
  return { sx: (sw - w) / 2, sy: (sh - h) / 2, sw: w, sh: h };
}

export class ARPipeline {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private person = document.createElement('canvas');
  private personCtx: CanvasRenderingContext2D;
  private mask = document.createElement('canvas');
  private maskCtx: CanvasRenderingContext2D;
  private maskData: ImageData | null = null;

  private video = document.createElement('video');
  private camera: MediaStream | null = null;
  private output: MediaStream | null = null;
  private models: VisionModels | null = null;

  private background: HTMLImageElement | null = null;
  private prop: HTMLImageElement | null = null;
  private propDef: PropDef | null = null;
  private necklace: HTMLImageElement | null = null;
  private necklaceDef: PropDef | null = null;
  private placeholder: Placeholder = { emblem: '☀', name: '', color: '#b8860b' };
  backgroundEnabled = true;
  propEnabled = true;
  necklaceEnabled = true;

  private poses: PropPoses | null = null;
  private lastTs = 0;
  private frameCount = 0;
  private fpsWindowStart = performance.now();
  private raf = 0;
  private hiddenTimer = 0;
  private frameIndex = 0;
  private generation = 0;
  private listeners = new Set<Listener>();
  state: ARState = { status: 'idle', segmentation: false, faceTracking: false, messages: [], fps: 0 };

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = OUTPUT_WIDTH;
    this.canvas.height = OUTPUT_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
    this.person.width = OUTPUT_WIDTH;
    this.person.height = OUTPUT_HEIGHT;
    this.personCtx = this.person.getContext('2d')!;
    this.maskCtx = this.mask.getContext('2d', { willReadFrequently: true })!;
    this.video.muted = true;
    this.video.playsInline = true;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private update(patch: Partial<ARState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  /** Starts the camera and models. Safe to call more than once. */
  async start(): Promise<void> {
    if (this.state.status === 'starting' || this.state.status === 'running') return;
    // Each start/stop bumps the generation, so a start() that finishes after a
    // stop() (React dev double-mount) releases its camera instead of leaking it.
    const gen = ++this.generation;
    this.update({ status: 'starting' });
    this.startLoop();

    const messages: string[] = [];
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      messages.push('The camera needs HTTPS or localhost. Open the game via https:// (or localhost) to use AR.');
      this.update({ status: 'no-camera', messages });
      return;
    }
    let camera: MediaStream;
    try {
      camera = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
    } catch (e) {
      if (gen !== this.generation) return;
      messages.push(`Camera unavailable (${(e as Error).name ?? e}).`);
      this.update({ status: 'no-camera', messages });
      return;
    }
    if (gen !== this.generation) {
      camera.getTracks().forEach((t) => t.stop());
      return;
    }
    this.camera = camera;
    this.video.srcObject = camera;
    await this.video.play().catch(() => undefined);
    this.update({ status: 'running', messages });

    // Loaded on demand: MediaPipe is a large chunk and only needed with a camera.
    const { loadVisionModels } = await import('./visionModels');
    this.models = await loadVisionModels();
    if (gen !== this.generation) return;
    this.update({
      segmentation: !!this.models.segmenter,
      faceTracking: !!this.models.face,
      messages: [...messages, ...this.models.errors],
    });
  }

  /** The composited stream to publish. Created lazily, lives as long as the pipeline. */
  getStream(): MediaStream {
    this.output ??= this.canvas.captureStream(FPS);
    return this.output;
  }

  async setBackground(url: string | null) {
    this.background = url ? await loadImage(url) : null;
  }

  async setProp(def: PropDef | null) {
    this.propDef = def;
    this.prop = def ? await loadImage(def.file) : null;
  }

  async setNecklace(def: PropDef | null) {
    this.necklaceDef = def;
    this.necklace = def ? await loadImage(def.file) : null;
  }

  setPlaceholder(p: Placeholder) {
    this.placeholder = p;
  }

  stop() {
    this.generation++;
    cancelAnimationFrame(this.raf);
    clearInterval(this.hiddenTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.camera?.getTracks().forEach((t) => t.stop());
    this.output?.getTracks().forEach((t) => t.stop());
    this.camera = null;
    this.output = null;
    this.update({ status: 'stopped' });
  }

  // requestAnimationFrame stops in background tabs, which would freeze the
  // published track; fall back to a (browser-throttled) timer while hidden.
  private onVisibility = () => {
    clearInterval(this.hiddenTimer);
    if (document.hidden) this.hiddenTimer = window.setInterval(() => this.renderFrame(), 1000 / FPS);
    else this.startLoop();
  };

  private startLoop() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.addEventListener('visibilitychange', this.onVisibility);
    cancelAnimationFrame(this.raf);
    clearInterval(this.hiddenTimer);
    if (document.hidden) {
      // A tab opened in the background never gets animation frames; without a
      // first frame the canvas track has no size and LiveKit can't publish it.
      this.hiddenTimer = window.setInterval(() => this.renderFrame(), 1000 / FPS);
      return;
    }
    const tick = () => {
      this.renderFrame();
      if (!document.hidden) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private renderFrame() {
    const { ctx } = this;
    const W = OUTPUT_WIDTH;
    const H = OUTPUT_HEIGHT;
    const hasVideo = this.state.status === 'running' && this.video.readyState >= 2 && this.video.videoWidth > 0;

    this.drawBackground();
    if (!hasVideo) {
      this.drawPlaceholder();
      this.countFrame();
      return;
    }

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const crop = coverRect(vw, vh, W, H);
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1; // MediaPipe needs strictly increasing timestamps
    this.lastTs = ts;

    const segmenter = this.backgroundEnabled ? this.models?.segmenter : null;
    let composited = false;
    if (segmenter) {
      try {
        segmenter.segmentForVideo(this.video, ts, (result) => {
          const m = result.confidenceMasks?.[0];
          if (!m) return;
          this.writeMask(m.getAsFloat32Array(), m.width, m.height);
          const mx = m.width / vw;
          const my = m.height / vh;
          const pc = this.personCtx;
          pc.globalCompositeOperation = 'source-over';
          pc.clearRect(0, 0, W, H);
          pc.drawImage(this.video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
          pc.globalCompositeOperation = 'destination-in';
          pc.drawImage(this.mask, crop.sx * mx, crop.sy * my, crop.sw * mx, crop.sh * my, 0, 0, W, H);
          pc.globalCompositeOperation = 'source-over';
          ctx.drawImage(this.person, 0, 0);
          composited = true;
        });
      } catch (e) {
        console.warn('[ar] segmentation frame failed', e);
      }
    }
    if (!composited) ctx.drawImage(this.video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);

    // Face landmarks every other frame; the poses are smoothed in between.
    const showHead = this.propEnabled && !!this.prop && !!this.propDef;
    const showNeck = this.necklaceEnabled && !!this.necklace && !!this.necklaceDef;
    const face = showHead || showNeck ? this.models?.face : null;
    if (face && this.frameIndex++ % 2 === 0) {
      try {
        const res = face.detectForVideo(this.video, ts);
        const lm = res.faceLandmarks?.[0];
        const next = lm ? placeProps(lm, vw, vh, crop, W / crop.sw) : null;
        this.poses = next
          ? {
              head: smoothPose(this.poses?.head ?? null, next.head, 0.55),
              neck: smoothPose(this.poses?.neck ?? null, next.neck, 0.55),
            }
          : null;
      } catch (e) {
        console.warn('[ar] face frame failed', e);
      }
    }
    if (this.poses) {
      if (showNeck) this.drawProp(this.necklace!, this.necklaceDef!, this.poses.neck);
      if (showHead) this.drawProp(this.prop!, this.propDef!, this.poses.head);
    }
    this.countFrame();
  }

  private writeMask(conf: Float32Array, w: number, h: number) {
    if (this.mask.width !== w || this.mask.height !== h || !this.maskData) {
      this.mask.width = w;
      this.mask.height = h;
      this.maskData = this.maskCtx.createImageData(w, h);
    }
    const px = this.maskData.data;
    for (let i = 0, j = 0; i < conf.length; i++, j += 4) {
      // Soft threshold (smoothstep 0.25..0.75) for a feathered edge.
      const t = Math.min(1, Math.max(0, (conf[i] - 0.25) * 2));
      px[j + 3] = t * t * (3 - 2 * t) * 255;
    }
    this.maskCtx.putImageData(this.maskData, 0, 0);
  }

  private drawBackground() {
    const { ctx } = this;
    if (this.background && (this.backgroundEnabled || this.state.status !== 'running')) {
      const b = this.background;
      const r = coverRect(b.naturalWidth || OUTPUT_WIDTH, b.naturalHeight || OUTPUT_HEIGHT, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      ctx.drawImage(b, r.sx, r.sy, r.sw, r.sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    } else {
      ctx.fillStyle = '#2b1a12';
      ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    }
  }

  private drawPlaceholder() {
    const { ctx } = this;
    const { emblem, name, color } = this.placeholder;
    const cx = OUTPUT_WIDTH / 2;
    const cy = OUTPUT_HEIGHT / 2 - 10;
    ctx.fillStyle = 'rgba(33, 20, 12, 0.55)';
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    ctx.beginPath();
    ctx.arc(cx, cy, 110, 0, Math.PI * 2);
    ctx.fillStyle = '#f3e3c3';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '120px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emblem, cx, cy + 6);
    if (name) {
      ctx.font = '600 34px "Rozha One", serif';
      ctx.fillStyle = '#f3e3c3';
      ctx.fillText(name, cx, cy + 160);
    }
    if (this.prop && this.propDef && this.propEnabled) {
      // Cap the drawn width so the big crown does not swamp the medallion.
      const width = Math.min(230, 360 / this.propDef.scale);
      this.drawProp(this.prop, this.propDef, { x: cx, y: cy - 88, width, angle: 0 });
    }
  }

  private drawProp(img: HTMLImageElement, def: PropDef, pose: HeadPose) {
    const width = pose.width * def.scale;
    const height = width * (img.naturalHeight / img.naturalWidth || 0.75);
    const { ctx } = this;
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    ctx.drawImage(img, -width / 2, -height * (1 - def.anchorY), width, height);
    ctx.restore();
  }

  private countFrame() {
    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsWindowStart >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / (now - this.fpsWindowStart));
      this.frameCount = 0;
      this.fpsWindowStart = now;
      if (fps !== this.state.fps) this.update({ fps });
    }
  }
}
