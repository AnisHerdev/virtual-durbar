// Pure geometry for anchoring headwear to MediaPipe face landmarks.

export interface Landmark {
  x: number;
  y: number;
}

/** Where headwear goes, in output-canvas pixels. (x, y) is the top of the forehead. */
export interface HeadPose {
  x: number;
  y: number;
  width: number; // face width (temple to temple)
  angle: number; // head roll in radians
}

// Face mesh indices: 10 = top of forehead, 152 = chin, 234/454 = face edges.
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_EDGE = 234;
const RIGHT_EDGE = 454;

export function placeProp(
  landmarks: Landmark[],
  videoWidth: number,
  videoHeight: number,
  crop: { sx: number; sy: number },
  scale: number,
): HeadPose | null {
  const pick = (i: number) => {
    const p = landmarks[i];
    return p ? { x: (p.x * videoWidth - crop.sx) * scale, y: (p.y * videoHeight - crop.sy) * scale } : null;
  };
  const top = pick(FOREHEAD);
  const chin = pick(CHIN);
  const left = pick(LEFT_EDGE);
  const right = pick(RIGHT_EDGE);
  if (!top || !chin || !left || !right) return null;

  const width = Math.hypot(right.x - left.x, right.y - left.y);
  const angle = Math.atan2(right.y - left.y, right.x - left.x);
  // Landmark 10 sits at the hairline-ish; lift the brim a little along the face's up axis.
  const faceHeight = Math.hypot(top.x - chin.x, top.y - chin.y);
  const ux = (top.x - chin.x) / (faceHeight || 1);
  const uy = (top.y - chin.y) / (faceHeight || 1);
  const lift = faceHeight * 0.08;
  return { x: top.x + ux * lift, y: top.y + uy * lift, width, angle };
}

/** Exponential smoothing to stop the crown from jittering. */
export function smoothPose(prev: HeadPose | null, next: HeadPose, alpha: number): HeadPose {
  if (!prev) return next;
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  // Unwrap the angle so smoothing never spins the long way round.
  let da = next.angle - prev.angle;
  if (da > Math.PI) da -= 2 * Math.PI;
  if (da < -Math.PI) da += 2 * Math.PI;
  return {
    x: lerp(prev.x, next.x),
    y: lerp(prev.y, next.y),
    width: lerp(prev.width, next.width),
    angle: prev.angle + da * alpha,
  };
}
