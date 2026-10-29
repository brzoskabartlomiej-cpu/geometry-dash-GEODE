# Architecture

## Engine choice and why

**TypeScript 5 (strict) + a purpose-built 2D renderer on WebGL2.** One codebase runs in
the browser (weak devices) and inside a Tauri 2 native window (the "high quality" build).

Considered and rejected:

| Option | Why not |
| --- | --- |
| C++ + raylib | Fastest on paper, but this repo also has to ship a browser build; there is no WebAssembly toolchain available in the project environment, so the web version would be unverifiable or a second implementation. |
| Rust + wgpu/bevy | Same problem, plus a much heavier build for contributors. |
| Godot 4 | Web export is ~40 MB and struggles on low-end phones; it also duplicates a lot of what a 2D auto-scroller needs. |
| Phaser / PixiJS | Good libraries, but the physics layer here is 300 lines of deterministic code and the renderer is ~400 lines. A framework would add weight without removing work. |

The result: **~29 kB of JS (10.7 kB gzip)** for the whole game. Load time and fill rate,
not CPU, are the limiting factors on cheap phones, so the budget goes into the quality
presets instead of a framework.

## Module map

```
src/core/          pure simulation, no DOM, no rendering
  math.ts          clamp/lerp/damp, SAT triangle-vs-rect, deterministic PRNG
  constants.ts     PHYSICS tuning (single source of truth)
  level.ts         grid level (blocks + spikes), Level.progressAt, first level layout
  player.ts        player state + gravity/rotation helpers
  world.ts         World: fixed step, collisions, death, particles, trail, fork()
src/render/
  quality.ts       low / medium / high presets + device detection
  renderer.ts      batched WebGL2 renderer (quads, rotated quads, triangles) + Canvas2D fallback
  scene.ts         background, level, player, particles, markers, camera helpers
src/platform/      input.ts (keyboard/mouse/touch), storage.ts (localStorage save)
src/mods/          types.ts (public API), loader.ts (runtime loading, fault isolation)
src/ui/            ui.ts - all DOM: HUD, menus, toasts
src/game.ts        loop, camera, save handling, mod hook dispatch, GameBridge for mods
src/main.ts        bootstrap and wiring
```

The simulation never imports from `render/`, `ui/` or `platform/`, which is why
`npm test` can drive the real game in Node with no browser.

## Fixed timestep

`PHYSICS.simHz = 240`, `SIM_DT = 1/240`. The loop accumulates real time and runs whole
ticks, capped at 12 ticks per frame (slow devices degrade to slower gameplay instead of
exploding). Rendering interpolates nothing: at 240 Hz the simulation is smoother than any
display, and the cheap camera smoothing (`damp`) hides the rest.

Why 240 and not 60: cube jump/collision timing in GD-like games is brutal at 1-block
precision. At 240 Hz the max movement per tick is 0.043 blocks, so a landing can never
tunnel through a 1-block surface.

## Collision model

- Player: 1×1 AABB, bottom-left anchored.
- Blocks: full cells. Landing is reported by the highest overlapping block top; hitting a
  block side is a death (as in GD), so the auto-scroller has no "stuck" state.
- Spikes: **triangles** (base 0.6 wide, apex at 0.95 high) tested with a separating-axis
  test against the player AABB. Narrower than the sprite on purpose: a triple spike is only
  clearable if the hitbox is smaller than the drawn spike.
- Ground contact uses a 0.02 epsilon instead of an exact overlap test, because exact
  floating point comparison made the cube hover 1e-7 above the floor and never "land"
  (a real bug found by `tests/core.test.ts`).

## Quality presets

Quality is data, not branches in the hot path: `QUALITY_PRESETS` describes pixels per unit,
internal resolution scale, and which effects to draw. `low` renders at 0.75× resolution and
skips particles/trail/glow/parallax. `detectQuality()` picks a starting preset from
`hardwareConcurrency`, `deviceMemory` and pointer type; the player can override it from the
menu or the `HQ` chip in the HUD.

## Native build

`src-tauri/` is a thin Tauri 2 shell: same web build, real window, no browser tab frame
throttling, real filesystem for future level packs. Playability parity is guaranteed
because it is literally the same bundle.

## Level format

`Level` is a grid of integer cells with three tile kinds (empty/block/spike). It is
deliberately boring: it serialises to JSON today and can be converted from community level
strings later without touching the simulation. `Level.progressAt()` defines the percentage
shown in the HUD, so a server can verify submitted percentages with the same function.

## Testing

`npm test` (Node 22, `node:test`) covers:

1. tuning numbers match the documented jump arc,
2. the simulation is frame-rate independent (irregular frame batches produce identical
   positions),
3. holding the button bunny-hops instead of flying,
4. spikes kill without a jump, and a timed jump clears them,
5. level geometry sanity (no floating spikes, spikes always on solid ground),
6. **a bot completes the level** — the guard against shipping an impossible level,
7. run lifecycle: restart, practice respawn safety, `fork()` isolation, auto-respawn, finish state,
8. UI wiring against `index.html` ids, and a headless smoke test of the whole frame loop
   (`tests/dom-stub.ts` fakes the DOM, so the game runs the real `Game` + `Ui` + Canvas2D
   fallback in Node).
