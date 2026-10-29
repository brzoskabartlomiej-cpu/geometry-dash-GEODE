/**
 * Geode-inspired mod API.
 *
 * A mod is a folder with `mod.json` (manifest) and a JS entry point that
 * exports a default `setup(ctx)` function. Mods are discovered from
 * `mods/index.json`, which means a hosted build can ship a mod repository
 * without rebuilding the game (this is the "load mods at runtime" part of
 * Geode that actually makes sense for a web/native hybrid title).
 */
export type ModManifest = {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  /** Path relative to the mod folder, usually "index.js". */
  entry: string;
};

export type ModPalette = {
  primary: [number, number, number, number];
  detail: [number, number, number, number];
};

export type FrameInfo = {
  /** Seconds since the current attempt started. */
  time: number;
  /** Seconds since the previous frame. */
  dt: number;
  progress: number;
  attempts: number;
  player: { x: number; y: number; vy: number; onGround: boolean };
  state: "playing" | "dead" | "complete";
};

export type AttemptInfo = { attempts: number };
export type DeathInfo = { x: number; y: number; progress: number; attempts: number };
export type CompleteInfo = { time: number; attempts: number };

export type ModHooks = {
  onAttempt(cb: (info: AttemptInfo) => void): void;
  onDeath(cb: (info: DeathInfo) => void): void;
  onComplete(cb: (info: CompleteInfo) => void): void;
  onFrame(cb: (info: FrameInfo) => void): void;
};

/** Methods a mod may call on the running game. Everything else stays private. */
export type GameBridge = {
  readonly levelName: string;
  readonly progress: number;
  readonly attempts: number;
  readonly player: { x: number; y: number; vy: number; onGround: boolean };
  readonly state: "playing" | "dead" | "complete";
  setPalette(palette: Partial<ModPalette>): void;
  /** null => respawn at the level start. Practice-style mods use this. */
  setRespawnX(x: number | null): void;
  restart(): void;
  pause(): void;
  resume(): void;
};

export type ModApi = {
  readonly id: string;
  readonly version: string;
  log(...args: unknown[]): void;
  hooks: ModHooks;
  game: GameBridge;
  ui: { toast(message: string): void };
  storage: { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): void };
};

export type ModSetup = (ctx: ModApi) => void | Promise<void>;

export type LoadedMod = {
  manifest: ModManifest;
  enabled: boolean;
  error?: string;
};
