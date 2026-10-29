/**
 * Tuning values for the baseline 1x cube.
 *
 * Units: one block == 1.0. Everything is expressed in blocks and seconds so the
 * simulation is resolution independent and easy to reason about.
 *
 * Derived numbers (see tests/core.test.ts):
 *   jump apex  = v^2 / (2g)      = 16^2 / (2 * 64) = 2.0 blocks
 *   airtime    = 2v / g          = 32 / 64        = 0.5 s
 *   jump length= airtime * speed = 0.5 * 10.4     = 5.2 blocks
 */
export const PHYSICS = {
  /** Horizontal speed of the player at 1x speed. */
  speed: 10.4,
  gravity: 64,
  jumpVelocity: 16,
  /** Terminal fall speed, keeps long drops readable. */
  maxFallSpeed: 30,
  playerSize: 1,
  /** Simulation rate. Player physics must never depend on render frame rate. */
  simHz: 240,
  /** Cube spin while airborne. */
  rotationPerSecond: 6.2,
  /** Grace: if a spike hit is registered this close to a landing, forgive it. */
  landingGraceSeconds: 0.01,
} as const;

export const SIM_DT = 1 / PHYSICS.simHz;
