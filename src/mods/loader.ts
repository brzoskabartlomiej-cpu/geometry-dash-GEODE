import type {
  AttemptInfo,
  CompleteInfo,
  DeathInfo,
  FrameInfo,
  GameBridge,
  LoadedMod,
  ModApi,
  ModManifest,
  ModPalette,
  ModSetup,
} from "./types.ts";

/**
 * Runtime mod loader. Mods are trusted code (exactly like Geode C++ mods): the
 * sandbox here is about ergonomics and fault isolation, not about containing
 * malicious code. Everything a mod throws is caught so a broken mod cannot take
 * the game down.
 */
export type ModRuntime = {
  mods: LoadedMod[];
  fireAttempt(info: AttemptInfo): void;
  fireDeath(info: DeathInfo): void;
  fireComplete(info: CompleteInfo): void;
  fireFrame(info: FrameInfo): void;
};

type LoadOptions = {
  enabled: boolean;
  /** Base URL of the mods folder, e.g. "./mods/". */
  baseUrl?: string;
  game: GameBridge;
  toast?: (message: string) => void;
  onLog?: (message: string) => void;
};

const listeners: {
  attempt: ((info: AttemptInfo) => void)[];
  death: ((info: DeathInfo) => void)[];
  complete: ((info: CompleteInfo) => void)[];
  frame: ((info: FrameInfo) => void)[];
} = { attempt: [], death: [], complete: [], frame: [] };

/** State shared by every hook call in one frame; reset by the game. */
export const modPalette: ModPalette = {
  primary: [0.36, 0.85, 1, 1],
  detail: [1, 0.93, 0.35, 1],
};

export async function loadMods(options: LoadOptions): Promise<ModRuntime> {
  const base = options.baseUrl ?? "./mods/";
  const loaded: LoadedMod[] = [];
  const log = (m: string) => options.onLog?.(m);
  const toast = (m: string) => options.toast?.(m);

  const runtime: ModRuntime = {
    mods: loaded,
    fireAttempt(info) {
      for (const cb of listeners.attempt) safeRun(cb, info, log);
    },
    fireDeath(info) {
      for (const cb of listeners.death) safeRun(cb, info, log);
    },
    fireComplete(info) {
      for (const cb of listeners.complete) safeRun(cb, info, log);
    },
    fireFrame(info) {
      for (const cb of listeners.frame) safeRun(cb, info, log);
    },
  };

  if (!options.enabled) return runtime;

  let index: { mods?: ModManifest[] };
  try {
    const res = await fetch(`${base}index.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    index = (await res.json()) as { mods?: ModManifest[] };
  } catch (err) {
    log(`mod index not loaded: ${String(err)}`);
    return runtime;
  }

  for (const manifest of index.mods ?? []) {
    if (!manifest?.id || !manifest.entry) continue;
    try {
      const url = new URL(`${base}${manifest.id}/${manifest.entry}`, globalThis.location.href).href;
      const module = (await import(/* @vite-ignore */ url)) as { default?: ModSetup };
      if (typeof module.default !== "function") {
        throw new Error("entry has no default export(setup)");
      }
      await module.default(createApi(manifest, options.game, log, toast));
      loaded.push({ manifest, enabled: true });
      log(`mod loaded: ${manifest.name} v${manifest.version}`);
    } catch (err) {
      loaded.push({ manifest, enabled: false, error: String(err) });
      log(`mod failed: ${manifest.id}: ${String(err)}`);
    }
  }

  return runtime;
}

export function resetModHooks(): void {
  listeners.attempt.length = 0;
  listeners.death.length = 0;
  listeners.complete.length = 0;
  listeners.frame.length = 0;
  modPalette.primary = [0.36, 0.85, 1, 1];
  modPalette.detail = [1, 0.93, 0.35, 1];
}

function createApi(
  manifest: ModManifest,
  game: GameBridge,
  log: (m: string) => void,
  toast: (m: string) => void,
): ModApi {
  const prefix = `[${manifest.id}]`;
  return {
    id: manifest.id,
    version: manifest.version,
    log: (...args: unknown[]) => log(`${prefix} ${args.map((a) => String(a)).join(" ")}`),
    hooks: {
      onAttempt: (cb) => listeners.attempt.push(cb),
      onDeath: (cb) => listeners.death.push(cb),
      onComplete: (cb) => listeners.complete.push(cb),
      onFrame: (cb) => listeners.frame.push(cb),
    },
    game,
    ui: { toast: (message: string) => toast(`${manifest.name}: ${message}`) },
    storage: {
      get<T>(key: string, fallback: T): T {
        try {
          const raw = globalThis.localStorage?.getItem(`mod:${manifest.id}:${key}`);
          return raw ? (JSON.parse(raw) as T) : fallback;
        } catch {
          return fallback;
        }
      },
      set(key: string, value: unknown): void {
        try {
          globalThis.localStorage?.setItem(`mod:${manifest.id}:${key}`, JSON.stringify(value));
        } catch {
          // ignore: storage may be disabled
        }
      },
    },
  };
}

function safeRun<T>(cb: (info: T) => void, info: T, log: (m: string) => void): void {
  try {
    cb(info);
  } catch (err) {
    log(`mod hook error: ${String(err)}`);
  }
}
