import { PHYSICS } from "./constants.ts";

export type PlayerState = {
  /** Bottom-left corner in blocks. */
  x: number;
  y: number;
  vy: number;
  onGround: boolean;
  /** Visual cube rotation in radians. */
  rotation: number;
  /** Smoothed visual ground offset, purely cosmetic. */
  squash: number;
};

export function createPlayer(x: number, y: number): PlayerState {
  return { x, y, vy: 0, onGround: true, rotation: 0, squash: 0 };
}

export function applyGravity(p: PlayerState, dt: number): void {
  p.vy = Math.max(p.vy - PHYSICS.gravity * dt, -PHYSICS.maxFallSpeed);
}

export function rotateCube(p: PlayerState, dt: number): void {
  if (!p.onGround) p.rotation += PHYSICS.rotationPerSecond * dt;
}
