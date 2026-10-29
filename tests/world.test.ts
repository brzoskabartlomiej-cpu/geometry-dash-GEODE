import assert from "node:assert/strict";
import { test } from "node:test";
import { SIM_DT } from "../src/core/constants.ts";
import { buildFirstLevel } from "../src/core/level.ts";
import { RunState, World } from "../src/core/world.ts";

test("restart resets the run but keeps the attempt counter", () => {
  const w = new World(buildFirstLevel());
  for (let i = 0; i < 240; i++) w.step(SIM_DT, false);
  assert.ok(w.player.x > 13, "should have moved forward");
  w.progress = 42;
  w.restart();
  assert.equal(w.state, RunState.Playing);
  assert.equal(w.player.x, w.level.startX);
  assert.equal(w.player.y, 1);
  assert.equal(w.progress, 0);
  assert.equal(w.time, 0);
  assert.equal(w.attempts, 2);
});

test("respawnX is honoured by restart (practice mode)", () => {
  const w = new World(buildFirstLevel());
  w.respawnX = 100;
  w.restart();
  assert.equal(w.player.x, 100);
  w.respawnX = null;
  w.restart();
  assert.equal(w.player.x, w.level.startX);
});

test("practice respawn never drops the cube into geometry or a pit", () => {
  const level = buildFirstLevel();
  const w = new World(level);
  // a spike column and a pit column both have to fall back to safe ground
  for (const requested of [70, 61, 152, 262]) {
    w.respawnX = requested;
    w.restart();
    const x = Math.floor(w.player.x);
    assert.ok(level.isSolid(x, 0), `respawn ${requested} -> ${x} must stand on a block`);
    assert.equal(level.isSolid(x, 1), false, `respawn ${requested} -> ${x} must be free`);
    assert.notEqual(level.tileAt(x, 1), 2, `respawn ${requested} -> ${x} must not be a spike`);
  }
});

test("fork() is an isolated copy of the run", () => {
  const w = new World(buildFirstLevel());
  for (let i = 0; i < 120; i++) w.step(SIM_DT, false);
  const ghost = w.fork();
  const originalX = w.player.x;
  for (let i = 0; i < 120; i++) ghost.step(SIM_DT, true);
  assert.equal(w.player.x, originalX, "original world must not move");
  assert.notEqual(ghost.player.x, originalX);
});

test("dead runs restart automatically after the delay", () => {
  const w = new World(buildFirstLevel());
  // walk into the first spike without jumping
  for (let i = 0; i < 240 * 3; i++) {
    w.step(SIM_DT, false);
    if (w.state === RunState.Dead) break;
  }
  assert.equal(w.state, RunState.Dead);
  const attemptsBefore = w.attempts;
  for (let i = 0; i < 240; i++) w.step(SIM_DT, false);
  assert.notEqual(w.state, RunState.Dead, "must respawn");
  assert.ok(w.attempts > attemptsBefore, "attempts must increase");
});

test("finishing sets the complete state once", () => {
  const w = new World(buildFirstLevel());
  w.player.x = w.level.finishX - 0.5;
  w.player.y = 1;
  for (let i = 0; i < 60 && w.state === RunState.Playing; i++) w.step(SIM_DT, false);
  assert.equal(w.state, RunState.Complete);
  const finishTime = w.finishTime;
  for (let i = 0; i < 60; i++) w.step(SIM_DT, false);
  assert.equal(w.finishTime, finishTime, "finish time must not be overwritten");
  assert.equal(w.bestProgress, 100);
});
