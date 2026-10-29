import assert from "node:assert/strict";
import { test } from "node:test";
import { PHYSICS, SIM_DT } from "../src/core/constants.ts";
import { buildFirstLevel, Level, TileKind } from "../src/core/level.ts";
import { RunState, World } from "../src/core/world.ts";
import { triRectOverlap } from "../src/core/math.ts";
import { playWithBot } from "./bot.ts";

test("baseline cube tuning matches the documented numbers", () => {
  const airtime = (2 * PHYSICS.jumpVelocity) / PHYSICS.gravity;
  const height = (PHYSICS.jumpVelocity * PHYSICS.jumpVelocity) / (2 * PHYSICS.gravity);
  assert.ok(Math.abs(airtime - 0.5) < 1e-9, "airtime should be 0.5s");
  assert.ok(Math.abs(height - 2) < 1e-9, "jump height should be 2 blocks");
  const length = airtime * PHYSICS.speed;
  assert.ok(Math.abs(length - 5.2) < 1e-9, "jump length should be 5.2 blocks");
});

test("physics is frame rate independent", () => {
  // Same simulated duration, different render cadence -> same result.
  const a = new World(buildFirstLevel());
  for (let i = 0; i < 240; i++) a.step(SIM_DT, i === 10 || i === 11);

  const b = new World(buildFirstLevel());
  // 240 ticks fed in irregular batches, sim still fixed step
  let acc = 0;
  let ticks = 0;
  const frames = [16.7, 8.3, 33.4];
  let f = 0;
  while (ticks < 240) {
    acc += frames[f % frames.length]! / 1000;
    f++;
    while (acc >= SIM_DT && ticks < 240) {
      b.step(SIM_DT, ticks === 10 || ticks === 11);
      acc -= SIM_DT;
      ticks++;
    }
  }

  assert.equal(a.player.x.toFixed(6), b.player.x.toFixed(6));
  assert.equal(a.player.y.toFixed(6), b.player.y.toFixed(6));
});

test("holding the jump button bunny hops instead of flying", () => {
  const flat = new Level("flat", 60, 3, 50);
  flat.floor(0, 60);
  const w = new World(flat);
  let maxY = 0;
  // onGround is only true inside the tick that performs the jump, so count the
  // jump impulse instead of the visual state.
  let jumps = 0;
  for (let i = 0; i < PHYSICS.simHz * 4; i++) {
    w.step(SIM_DT, true);
    if (w.player.vy > PHYSICS.jumpVelocity - 1) jumps++;
    maxY = Math.max(maxY, w.player.y);
  }
  assert.equal(w.state, RunState.Playing, "flat ground must never kill the cube");
  assert.ok(jumps > 4, `holding should trigger repeated jumps (got ${jumps})`);
  assert.ok(maxY <= 3.1, `cube must not exceed ~3 blocks above the floor (got ${maxY})`);
});

test("a spike without a jump kills the cube", () => {
  const L = new Level("spike-test", 40, 3, 30);
  L.floor(0, 30);
  L.spike(10, 1);
  const w = new World(L);
  for (let i = 0; i < PHYSICS.simHz * 2 && w.state === RunState.Playing; i++) w.step(SIM_DT, false);
  assert.equal(w.state, RunState.Dead);
  assert.ok(Math.abs(w.markerX - 9) < 1.5, `should die at the spike, died at ${w.markerX}`);
});

test("a properly timed jump clears a single spike", () => {
  const L = new Level("jump-test", 40, 3, 30);
  L.floor(0, 30);
  L.spike(10, 1);
  const w = new World(L);
  let hold = false;
  for (let i = 0; i < PHYSICS.simHz * 3 && w.state === RunState.Playing; i++) {
    // jump when the spike is ~1.5 blocks ahead
    if (w.player.onGround && w.player.x > 8.4 && w.player.x < 8.6) hold = true;
    w.step(SIM_DT, hold);
    if (hold && w.player.onGround) hold = false;
  }
  assert.equal(w.state, RunState.Complete, `cube died at x=${w.markerX}`);
});

test("level geometry is structurally sane", () => {
  const L = buildFirstLevel();
  assert.ok(L.tiles.length > 300, "level should have geometry");
  for (const s of L.spikes) {
    assert.ok(L.isSolid(s.x, s.y - 1), `spike at ${s.x},${s.y} needs a block under it`);
  }
  // no floating spikes inside blocks
  for (const s of L.spikes) assert.ok(!L.isSolid(s.x, s.y), "spike tile must be free");
});

test("the bot can complete the level", () => {
  const w = new World(buildFirstLevel());
  const result = playWithBot(w);
  assert.ok(
    result.completed,
    `bot died at x=${result.deathX?.toFixed(2)} with ${result.progress.toFixed(1)}%`,
  );
  // sanity: finishing should take roughly width / speed seconds
  assert.ok(result.time > 20 && result.time < 45, `unexpected clear time ${result.time}`);
});

test("spike hitbox is a triangle, not a box", () => {
  const tri = [
    [0.2, 0.02],
    [0.8, 0.02],
    [0.5, 0.95],
  ] as const;
  // corner of the bounding box must not collide
  assert.equal(triRectOverlap(tri, { x: 0.05, y: 0.75, w: 0.1, h: 0.1 }), false);
  // centre must collide
  assert.equal(triRectOverlap(tri, { x: 0.42, y: 0.2, w: 0.16, h: 0.16 }), true);
});

test("spike tiles are the only hazard kind", () => {
  const L = buildFirstLevel();
  const kinds = new Set(L.tiles.map((t) => t.kind));
  assert.ok(kinds.has(TileKind.Block));
  assert.ok(kinds.has(TileKind.Spike));
});

test("progress is clamped to 0..100", () => {
  const L = buildFirstLevel();
  assert.equal(L.progressAt(-50), 0);
  assert.equal(L.progressAt(0), 0);
  assert.equal(L.progressAt(5000), 100);
  assert.ok(L.progressAt((L.startX + L.finishX) / 2) > 45);
});
