#!/usr/bin/env node
/**
 * Proves the portable single-file build is actually playable.
 *
 * The portable ZIP exists so the game runs from `file://` without a server.
 * That promise is only worth something if it is tested, so this script:
 *
 *   1. reads release/portable/GeoDash.html,
 *   2. extracts the inlined module and imports it in Node with a fake DOM,
 *   3. pumps frames and asserts the game booted, drew something and reacts to
 *      the jump key.
 *
 * Run: node --experimental-strip-types scripts/verify-portable.mjs
 * (needs `npm run portable` first)
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = join(root, "release", "portable", "GeoDash.html");

const html = readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.equal(scripts.length, 1, "expected exactly one inlined module script");
const code = scripts[0];
assert.ok(code.length > 5000, `inlined bundle looks too small (${code.length} bytes)`);
assert.ok(!/<script[^>]*src=/.test(html), "portable html must not load external scripts");

// no external asset references at all: the file has to work on its own
const external = [...html.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="((?!#|data:|https?:)[^"]*)"/g)].map(
  (m) => m[1],
);
assert.deepEqual(external, [], `portable html still references ${external.join(", ")}`);

const { installDom, parseIdsFromIndexHtml, stubCounters } = await import("../tests/dom-stub.ts");
const dom = installDom(parseIdsFromIndexHtml(html));

try {
  const dir = mkdtempSync(join(tmpdir(), "geodash-portable-"));
  const file = join(dir, "bundle.mjs");
  writeFileSync(file, code, "utf8");
  await import(pathToFileURL(file).href);

  // boot: the menu must exist and frames must be produced
  stubCounters.reset();
  dom.pumpFrames(90);
  assert.ok(stubCounters.frames >= 80, `game loop did not run (${stubCounters.frames} frames)`);
  assert.ok(stubCounters.fillRect > 50, `renderer drew too little (${stubCounters.fillRect} rects)`);

  const doc = dom.document;
  const hud = doc.getElementById("hud-level");
  assert.equal(hud.textContent, "Stereo Sprint", "HUD must show the level name");
  assert.equal(doc.getElementById("overlay").classList.contains("hidden"), false, "menu should be visible");

  // simulate a real session: press PLAY, then hold jump for a while
  doc.getElementById("btn-play").dispatch("click");
  stubCounters.reset();
  dom.dispatchKey("keydown", "Space");
  dom.pumpFrames(240);
  dom.dispatchKey("keyup", "Space");

  const progressText = doc.getElementById("hud-pct").textContent;
  const progress = Number.parseInt(progressText, 10);
  assert.ok(Number.isFinite(progress), `HUD progress is not a number: "${progressText}"`);
  assert.ok(progress > 0, "playing for 4 seconds should make progress");
  assert.ok(stubCounters.fillRect > 100, "the game must keep drawing while playing");

  console.log(`portable build OK: ${progress}% after 4s, ${stubCounters.frames} frames rendered`);
} finally {
  dom.restore();
}
