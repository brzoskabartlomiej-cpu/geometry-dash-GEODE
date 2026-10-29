import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { installDom, parseIdsFromIndexHtml, type DomHarness } from "./dom-stub.ts";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ids = parseIdsFromIndexHtml(html);

/**
 * `Ui` looks elements up by id, so this test fails the moment index.html and
 * ui.ts drift apart. A staging build has no other automatic guard for that.
 */
test("ui wiring matches index.html and survives hud updates", async () => {
  const dom = installDom(ids);
  try {
    const { Ui } = await import("../src/ui/ui.ts");
    const calls: string[] = [];
    const ui = new Ui(
      {
        onPlay: () => calls.push("play"),
        onResume: () => calls.push("resume"),
        onRestart: () => calls.push("restart"),
        onQuit: () => calls.push("quit"),
        onQuality: (q) => calls.push(`quality:${q}`),
        onToggleMods: () => calls.push("mods"),
      },
      "low",
    );

    ui.setHud({
      levelName: "Stereo Sprint",
      attempts: 7,
      progress: 42.7,
      best: 88,
      fps: 59.6,
      state: "playing",
      time: 3.2,
      quality: "low",
      drawCalls: "canvas2d",
      respawning: false,
    });

    const pct = dom.document as {
      getElementById(id: string): { textContent: string; style: Record<string, string> };
    };
    assert.equal(pct.getElementById("hud-bar").style["width"], "42.7%");
    assert.equal(pct.getElementById("hud-pct").textContent, "42%");
    assert.equal(pct.getElementById("hud-best").textContent, "best 88%");
    assert.equal(pct.getElementById("hud-attempts").textContent, "attempt 7");

    ui.showAttempt(7);
    assert.equal(pct.getElementById("attempt-banner").textContent, "Attempt 7");

    ui.setMods([{ manifest: { id: "practice", name: "Practice", version: "1.0.0", entry: "index.js" }, enabled: true }], true);
    const modsList = pct.getElementById("mods-list") as unknown as { children: unknown[] };
    assert.equal(modsList.children.length, 1);

    ui.setOverlay("pause");
    assert.equal(ui.overlayName, "pause");
    ui.setOverlay(null);
    assert.equal(ui.overlayName, null);

    ui.setQuality("high");
    assert.equal(calls.length, 0, "setQuality must not fire callbacks by itself");
  } finally {
    dom.restore();
  }
});

test("the full game loop runs and advances the level", async () => {
  const dom: DomHarness = installDom(ids);
  try {
    const { Game } = await import("../src/game.ts");
    const hud: { attempts: number; progress: number; state: string }[] = [];
    const events: string[] = [];

    const game = new Game({
      canvas: dom.canvas as unknown as HTMLCanvasElement,
      quality: "low",
      save: {
        version: 1,
        bestProgress: 0,
        attempts: 0,
        cleared: false,
        quality: "auto",
        modsEnabled: false,
        muted: false,
      },
      onHud: (h) => hud.push({ attempts: h.attempts, progress: h.progress, state: h.state }),
      onEvent: (e) => events.push(e.type),
      onPause: () => {},
      onSave: () => {},
    });

    game.start();
    game.resume();
    dom.pumpFrames(180); // ~3 s of frames

    const startX = game.world.level.startX;
    if (game.world.state === "playing") {
      assert.ok(game.world.player.x > startX + 5, "the cube must auto-scroll forward");
    } else {
      assert.equal(game.world.state, "dead", "running into the first spike should kill");
    }
    assert.ok(hud.length > 0, "hud updates must be emitted");
    const last = hud[hud.length - 1]!;
    assert.equal(typeof last.progress, "number");

    // hold the jump button: the cube has to keep bunny hopping off the ground
    dom.dispatchKey("keydown", "Space");
    dom.pumpFrames(120);
    dom.dispatchKey("keyup", "Space");
    dom.pumpFrames(60);

    // pause / resume must not throw and must stop the simulation
    game.pause();
    const snapshot = { x: game.world.player.x, time: game.world.time, attempts: game.world.attempts };
    dom.pumpFrames(30);
    assert.equal(game.world.player.x, snapshot.x, "paused game must not simulate");
    assert.equal(game.world.time, snapshot.time, "paused game must not advance time");
    game.resume();
    dom.pumpFrames(30);
    const moved =
      game.world.player.x > snapshot.x ||
      game.world.time > snapshot.time ||
      game.world.attempts > snapshot.attempts;
    assert.ok(moved, "resume must continue the run");

    game.setQuality("high");
    dom.pumpFrames(5);

    game.dispose();
  } finally {
    dom.restore();
  }
});
