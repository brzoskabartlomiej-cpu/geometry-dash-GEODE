import { SIM_DT } from "../src/core/constants.ts";
import { RunState, World } from "../src/core/world.ts";

/**
 * Reference autoplayer for the test suite. It is not part of the game build.
 *
 * It exists to prove the shipped level is actually beatable and that the
 * physics tuning stays playable when values change: a level nobody can finish
 * fails CI.
 *
 * Strategy: while grounded, look ahead. If doing nothing kills the cube inside
 * the danger window, search for the *latest* jump that survives a long horizon
 * (hitting a wall needs an early jump, landing after a spike group needs a late
 * one), then remember that tick and press the button exactly there.
 */
export type BotResult = {
  completed: boolean;
  time: number;
  progress: number;
  steps: number;
  deathX: number | null;
};

const DANGER_WINDOW = 0.35; // seconds of look-ahead that counts as "about to die"
const PLAN_HORIZON = 0.6; // how far a candidate jump must survive
const MAX_DELAY = 0.34; // latest acceptable jump delay inside the danger window

export function playWithBot(world: World, maxSeconds = 120): BotResult {
  const maxSteps = Math.ceil(maxSeconds / SIM_DT);
  const dangerSteps = Math.round(DANGER_WINDOW / SIM_DT);
  const planSteps = Math.round(PLAN_HORIZON / SIM_DT);
  const maxDelay = Math.round(MAX_DELAY / SIM_DT);

  let planTick = -1;

  for (let i = 0; i < maxSteps; i++) {
    if (world.state === RunState.Complete) {
      return { completed: true, time: world.time, progress: 100, steps: i, deathX: null };
    }
    if (world.state === RunState.Dead) {
      return {
        completed: false,
        time: world.time,
        progress: world.progress,
        steps: i,
        deathX: world.markerX,
      };
    }

    let hold = false;

    if (planTick >= 0 && i >= planTick) {
      hold = true;
      planTick = -1;
    } else if (planTick < 0 && world.player.onGround && predictDeath(world, false, dangerSteps)) {
      planTick = findLatestJumpTick(world, planSteps, maxDelay, i);
      if (planTick >= 0 && planTick <= i) {
        hold = true;
        planTick = -1;
      }
    }

    world.step(SIM_DT, hold);
  }

  return {
    completed: false,
    time: world.time,
    progress: world.progress,
    steps: maxSteps,
    deathX: world.player.x,
  };
}

/** Smallest delay (in ticks) whose jump survives the plan horizon, or -1. */
function findLatestJumpTick(world: World, planSteps: number, maxDelay: number, now: number): number {
  for (let delay = 0; delay <= maxDelay; delay++) {
    const ghost = world.fork();
    let alive = true;
    for (let t = 0; t < delay + planSteps; t++) {
      ghost.step(SIM_DT, t >= delay);
      if (ghost.state !== RunState.Playing) {
        alive = ghost.state === RunState.Complete;
        break;
      }
    }
    if (alive) return now + delay;
  }
  return -1;
}

function predictDeath(world: World, hold: boolean, steps: number): boolean {
  const ghost = world.fork();
  for (let i = 0; i < steps; i++) {
    ghost.step(SIM_DT, hold);
    if (ghost.state !== RunState.Playing) return ghost.state === RunState.Dead;
  }
  return false;
}
