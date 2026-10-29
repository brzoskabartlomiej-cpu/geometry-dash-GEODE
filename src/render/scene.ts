import { PHYSICS } from "../core/constants.ts";
import { TileKind, type Level } from "../core/level.ts";
import { RunState, type World } from "../core/world.ts";
import type { QualitySettings } from "./quality.ts";
import { COLORS, type Color } from "./quality.ts";
import type { Renderer } from "./renderer.ts";

export type Camera = {
  x: number;
  y: number;
  /** shake offset in world units */
  shakeX: number;
  shakeY: number;
};

export type View = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  ppu: number;
};

export const VIEW_UNITS = 13;

export function computePpu(renderer: Renderer, quality: QualitySettings): number {
  const fromHeight = renderer.height / VIEW_UNITS;
  const fromQuality = quality.pixelsPerUnit * Math.min(globalThis.devicePixelRatio || 1, 2);
  // never lower than the height derived value (that would crop the view), never
  // much higher than the preset allows (that would cost fill rate)
  return Math.min(Math.max(fromHeight, fromQuality * 0.5), fromQuality * 1.6);
}

export function makeView(renderer: Renderer, cam: Camera, ppu: number): View {
  const halfW = renderer.width / 2 / ppu;
  const halfH = renderer.height / 2 / ppu;
  return {
    left: cam.x - halfW,
    right: cam.x + halfW,
    top: cam.y + halfH,
    bottom: cam.y - halfH,
    ppu,
  };
}

const c = (color: Color, alpha = 1): Color => [color[0], color[1], color[2], color[3] * alpha];

export function drawBackground(r: Renderer, view: View, quality: QualitySettings): void {
  const strips = quality.backgroundLayers > 0 ? 18 : 8;
  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    const y = view.top - ((view.top - view.bottom) / strips) * (i + 1);
    const h = (view.top - view.bottom) / strips + 0.01;
    const color: Color = [
      COLORS.skyTop[0] + (COLORS.skyBottom[0] - COLORS.skyTop[0]) * t,
      COLORS.skyTop[1] + (COLORS.skyBottom[1] - COLORS.skyTop[1]) * t,
      COLORS.skyTop[2] + (COLORS.skyBottom[2] - COLORS.skyTop[2]) * t,
      1,
    ];
    r.quad(view.left - 1, y, view.right - view.left + 2, h, color);
  }

  // parallax mountains: cheap triangles, disabled on low quality
  if (quality.backgroundLayers > 0) {
    for (let layer = 0; layer < quality.backgroundLayers; layer++) {
      const speed = 0.18 + layer * 0.14;
      const alpha = 0.1 + layer * 0.05;
      const baseY = view.bottom + 2.5 + layer * 1.2;
      const span = 9 + layer * 3;
      const offset = view.left * speed;
      const first = Math.floor((view.left * 0.35 + offset) / span) - 1;
      for (let i = 0; i < 4 + quality.backgroundLayers * 2; i++) {
        const x = first * span + i * span - offset * 0.35;
        r.tri(
          x,
          baseY,
          x + span / 2,
          baseY + 3.2 + layer,
          x + span,
          baseY,
          [0.55, 0.62, 1, alpha],
        );
      }
    }
  }
}

export function drawLevel(
  r: Renderer,
  level: Level,
  view: View,
  quality: QualitySettings,
  time: number,
): void {
  // ground glow line
  r.quad(view.left, -0.08, view.right - view.left, 0.08, [0.42, 0.6, 1, 0.35]);

  // finish portal
  const fx = level.finishX;
  if (fx > view.left - 4 && fx < view.right + 4) {
    const pulse = 0.65 + Math.sin(time * 4) * 0.15;
    r.quad(fx, -1, 0.5, 12, [0.45, 0.95, 1, 0.16 * pulse]);
    r.quad(fx + 0.15, -1, 0.2, 12, [0.75, 1, 1, 0.85]);
  }

  const x0 = Math.floor(view.left) - 1;
  const x1 = Math.ceil(view.right) + 1;
  for (const t of level.tilesInRange(x0, x1)) {
    if (t.y > view.top + 2 || t.y < view.bottom - 2) continue;
    if (t.kind === TileKind.Block) {
      r.quad(t.x, t.y, 1, 1, COLORS.block);
      // top highlight only for exposed surfaces
      if (!level.isSolid(t.x, t.y + 1)) {
        r.quad(t.x, t.y + 0.92, 1, 0.08, COLORS.blockEdge);
      }
      if (quality.gridLines) {
        r.quad(t.x, t.y, 0.04, 1, [0.28, 0.34, 0.7, 0.9]);
      }
    } else if (t.kind === TileKind.Spike) {
      // soft halo
      if (quality.glow) {
        r.tri(
          t.x + 0.02,
          t.y + 0.02,
          t.x + 0.5,
          t.y + 1.15,
          t.x + 0.98,
          t.y + 0.02,
          [0.55, 0.8, 1, 0.16],
        );
      }
      r.tri(
        t.x + 0.06,
        t.y + 0.02,
        t.x + 0.5,
        t.y + 0.98,
        t.x + 0.94,
        t.y + 0.02,
        COLORS.spike,
      );
      r.tri(
        t.x + 0.5,
        t.y + 0.98,
        t.x + 0.36,
        t.y + 0.4,
        t.x + 0.64,
        t.y + 0.4,
        COLORS.spikeEdge,
      );
    }
  }
}

export function drawPlayer(
  r: Renderer,
  world: World,
  view: View,
  quality: QualitySettings,
  palette: readonly [Color, Color],
): void {
  const p = world.player;
  const cx = p.x + PHYSICS.playerSize / 2;
  const cy = p.y + PHYSICS.playerSize / 2;
  const size = PHYSICS.playerSize;
  const alpha = world.state === RunState.Dead ? 0 : 1;
  if (alpha === 0) return;

  if (quality.glow) {
    r.quadRot(cx, cy, size * 2.2, size * 2.2, p.rotation, [palette[0][0], palette[0][1], palette[0][2], 0.14]);
  }

  if (quality.trail) {
    for (let i = 0; i < world.trail.length; i++) {
      const tp = world.trail[i]!;
      const fade = Math.max(0, tp.life / 0.35) * 0.35 * (i / world.trail.length);
      r.quadRot(tp.x, tp.y, size * 0.8, size * 0.8, p.rotation, [palette[1][0], palette[1][1], palette[1][2], fade]);
    }
  }

  const squash = 1 + p.squash * 0.12;
  r.quadRot(cx, cy, size / squash, size * squash, p.rotation, palette[0]);
  r.quadRot(cx, cy, size * 0.52, size * 0.52, p.rotation, c(palette[1], 0.95));
  r.quadRot(cx, cy, size * 0.2, size * 0.2, p.rotation, [1, 1, 1, 0.9]);

  // drop shadow on the floor below
  r.quad(cx - 0.5, 0.01, 1, 0.06, [0, 0, 0, 0.25 * Math.max(0, 1 - (cy - 1) / 6)]);
}

export function drawParticles(r: Renderer, world: World): void {
  for (const p of world.particles) {
    const t = Math.max(0, p.life / p.maxLife);
    r.quad(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size, [p.hue[0], p.hue[1], p.hue[2], t]);
  }
}

export function drawMarkers(r: Renderer, world: World, level: Level, view: View): void {
  if (world.state === RunState.Dead) {
    r.quad(world.markerX + 0.35, world.markerY, 0.3, 0.3, [1, 0.3, 0.35, 0.9]);
  }
  const best = level.startX + ((level.finishX - level.startX) * world.bestProgress) / 100;
  if (world.bestProgress > 1 && world.bestProgress < 100) {
    r.quad(best, view.bottom, 0.08, view.top - view.bottom, [0.5, 1, 0.7, 0.18]);
  }
}
