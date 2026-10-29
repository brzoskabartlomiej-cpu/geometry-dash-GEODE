# Roadmap

## Hard boundaries

- No RobTop assets, level data, music or branding.
- No connection to RobTop's servers, and no patching/decompiling of the official client.
- No "GD for free" distribution. Geo Dash is its own game with its own backend.

## v0.1 (done)

Fixed-step cube physics, spike/block collision, one complete level, HUD, local save,
three quality presets, WebGL2 renderer with Canvas2D fallback, Tauri 2 native shell,
runtime mod loader with two reference mods, 15 headless tests including a level-completion
bot.

## v0.2 — content and feel

- [ ] Level format v1 (JSON) + in-game editor (place block/spike, test-play, export).
- [ ] Additional player modes: ship, ball, UFO (each with its own physics block).
- [ ] Portals, speed changes, jump pads, jump orbs.
- [ ] Music/SFX with a WebAudio mixer, volume in save file.
- [ ] Cloud save via own API (see below), local save stays authoritative offline.
- [ ] Level import/export in a documented community format (own schema, not GD's).

## v0.3 — own online layer

Server: Node + Fastify + SQLite (Postgres later), same TypeScript toolchain, deployed
separately from the game.

- `GET /api/levels?page=&search=` — level list (name, author, difficulty, stars, likes).
- `POST /api/levels` — upload, server-side validation of the level schema and a
  size/count cap, moderation queue for the public list.
- `POST /api/levels/:id/attempts` — submit `{ progress, attempts, time, replay }`.
- `GET /api/levels/:id/leaderboard` — best progress or clear time per account.

Integrity: every submission carries the input replay (the fixed-step simulation is
deterministic, `World.fork()` already supports this), so the server can re-run the run with
the same code and reject impossible percentages. That is also why the simulation must stay
DOM-free and deterministic — the tests already enforce both.

Accounts: OAuth device flow or email+password with argon2, no third-party identity required.
Mods are client-side cosmetics/gameplay helpers; anything a mod changes that affects scores
must run server-side to be ranked, otherwise runs are flagged "modded".

## v0.4 — desktop and distribution

- [ ] Tauri auto-updater + signed builds for Windows/macOS/Linux.
- [ ] Mod repository (curated index + signature check) served from the same API.
- [ ] Controller support, rebindable keys, fullscreen toggle.
- [ ] Steam is *optional*: Greenlight-style release can be added later, but the desktop
      build, the web build and mods must never require a store account.

## Known limitations

- Single-level campaign; no editor yet, so content is code-defined.
- Mods are trusted code in the page realm (documented in `docs/mods.md`).
- No shader bloom: `high` uses additive glow quads to stay cheap on integrated GPUs.
