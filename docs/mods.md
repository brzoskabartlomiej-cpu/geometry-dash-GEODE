# Modding (Geode-style)

The mod system borrows the part of Geode that matters for this game: mods are folders with
a manifest, they are discovered at runtime from an index, they get a typed API instead of
raw internals, and one broken mod never takes the game down.

## Layout

```
public/mods/
  index.json                 <- list of manifests, loaded at start
  practice/
    mod.json                 <- manifest (single mod)
    index.js                 <- entry, export default function setup(ctx)
  rainbow-cube/
    mod.json
    index.js
```

`public/mods/index.json`:

```json
{
  "mods": [
    { "id": "practice", "name": "Practice Mode", "version": "1.0.0", "entry": "index.js" }
  ]
}
```

A mod can be disabled by removing it from `index.json`, or globally by toggling **Mods: off**
in the menu (`save.modsEnabled`). Nothing else is required — no rebuild, no registry.

## Entry point

```js
export default function setup(ctx) {
  ctx.log("hello");                        // console via loader
  ctx.storage.set("seen", true);           // namespaced to this mod id
  const seen = ctx.storage.get("seen", false);

  ctx.hooks.onAttempt(({ attempts }) => {});
  ctx.hooks.onDeath(({ x, y, progress }) => {});
  ctx.hooks.onComplete(({ time, attempts }) => {});
  ctx.hooks.onFrame(({ dt, time, progress, player, state }) => {});

  ctx.game.setPalette({ primary: [0.3, 0.9, 1, 1] });
  ctx.game.setRespawnX(120);               // practice-style respawn, null = level start
  ctx.game.restart();
  ctx.game.pause();
  ctx.game.resume();
  ctx.ui.toast("loaded");
}
```

`setup` may be `async`. If it throws, the loader records the error, shows it in the menu
mod list and the game keeps running.

## GameBridge

| Member | Description |
| --- | --- |
| `levelName` | current level name |
| `progress` | current attempt progress in % |
| `attempts` | attempt counter |
| `player` | `{ x, y, vy, onGround }` snapshot (read-only copy) |
| `state` | `"playing" \| "dead" \| "complete"` |
| `setPalette({ primary, detail })` | per-mod visual override, RGBA 0..1 |
| `setRespawnX(x \| null)` | overrides where the next attempt starts |
| `restart()` / `pause()` / `resume()` | run control |

Hooks are called on the simulation thread (the main thread) in registration order. A hook
that throws is caught and logged; the frame continues.

## Trust model

Mods are **trusted code**, exactly like Geode mods on desktop: they run in the same realm as
the game, so a malicious mod can do anything a script on the page can do. Consequences:

- only install mods you trust (the loader prints every load/failure in the console),
- a hosted mod repository must be curated and versioned,
- a real sandbox (Web Worker + strict message API) is on the roadmap if mods are ever
  distributed from an open index.

What the loader *does* guarantee is fault isolation: bad manifests, missing entries,
syntax errors and throwing hooks never crash the game or corrupt the save file (mod storage
is namespaced with `mod:<id>:`).

## Reference mods

- `practice` — on death, respawns two blocks before the death point; resets on completion.
- `rainbow-cube` — animates the cube palette every frame through `setPalette`.

## Porting Geode mods

Geode mods are C++ against GD's binary. They cannot run here, and no attempt is made to
emulate GD's internals. What transfers is the *authoring model*: manifest + entry + hooks +
namespaced storage. A Geode mod can be reimplemented as a JS mod in tens of lines when the
behaviour is gameplay-level (practice mode, colour effects, HUD tweaks).
