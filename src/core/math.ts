export const TAU = Math.PI * 2;

export type Vec2 = { x: number; y: number };

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/** Snap an angle (radians) to the nearest multiple of `step`. */
export function snapAngle(angle: number, step: number): number {
  return Math.round(angle / step) * step;
}

export type Rect = { x: number; y: number; w: number; h: number };
export type Tri = readonly [readonly [number, number], readonly [number, number], readonly [number, number]];

function projectRect(r: Rect, ax: number, ay: number): [number, number] {
  const corners: readonly (readonly [number, number])[] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ];
  let min = Infinity;
  let max = -Infinity;
  for (const [px, py] of corners) {
    const p = px * ax + py * ay;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

function projectTri(t: Tri, ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [px, py] of t) {
    const p = px * ax + py * ay;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/**
 * Separating-axis test between an axis aligned rect and a triangle.
 * Used for the spike hitboxes (GD-style triangles, not boxes).
 */
export function triRectOverlap(t: Tri, r: Rect): boolean {
  const axes: [number, number][] = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < 3; i++) {
    const a = t[i]!;
    const b = t[(i + 1) % 3]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    axes.push([-ey / len, ex / len]);
  }
  for (const [ax, ay] of axes) {
    if (!intervalsOverlap(projectRect(r, ax, ay), projectTri(t, ax, ay))) return false;
  }
  return true;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Deterministic PRNG (mulberry32) so replays and tests are reproducible. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
