export type Color = readonly [number, number, number, number];

export const COLORS = {
  white: [1, 1, 1, 1],
  ink: [0.05, 0.07, 0.16, 1],
  skyTop: [0.05, 0.07, 0.23, 1],
  skyBottom: [0.22, 0.09, 0.42, 1],
  block: [0.16, 0.2, 0.42, 1],
  blockEdge: [0.36, 0.44, 0.85, 1],
  spike: [0.92, 0.96, 1, 1],
  spikeEdge: [0.55, 0.78, 1, 1],
} as const satisfies Record<string, Color>;

export const QUALITY_PRESETS = {
  low: {
    label: "Low",
    pixelsPerUnit: 34,
    resolutionScale: 0.75,
    particles: false,
    trail: false,
    glow: false,
    shake: false,
    backgroundLayers: 0,
    gridLines: false,
    targetFps: 0,
  },
  medium: {
    label: "Medium",
    pixelsPerUnit: 48,
    resolutionScale: 1,
    particles: true,
    trail: true,
    glow: false,
    shake: true,
    backgroundLayers: 1,
    gridLines: true,
    targetFps: 0,
  },
  high: {
    label: "High",
    pixelsPerUnit: 62,
    resolutionScale: 1,
    particles: true,
    trail: true,
    glow: true,
    shake: true,
    backgroundLayers: 2,
    gridLines: true,
    targetFps: 0,
  },
} as const;

export type Quality = keyof typeof QUALITY_PRESETS;
export type QualitySettings = (typeof QUALITY_PRESETS)[Quality];

export const QUALITY_ORDER: readonly Quality[] = ["low", "medium", "high"];

/** Detects a weak device so the first run already picks a playable preset. */
export function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const smallScreen = typeof innerWidth !== "undefined" && Math.min(innerWidth, innerHeight) < 520;
  if (cores <= 4 || mem <= 2 || (coarse && smallScreen)) return "low";
  if (cores >= 8 && !coarse) return "high";
  return "medium";
}
