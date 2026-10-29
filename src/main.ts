import "./styles.css";
import { Game, type GameEvent, type HudState } from "./game.ts";
import { Ui } from "./ui/ui.ts";
import { detectQuality, type Quality } from "./render/quality.ts";
import { loadSave, writeSave, type SaveData } from "./platform/storage.ts";
import { loadMods, resetModHooks } from "./mods/loader.ts";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("canvas missing");

let save: SaveData = loadSave();
const initialQuality: Quality = save.quality === "auto" ? detectQuality() : save.quality;

const ui = new Ui(
  {
    onPlay: () => startRun(),
    onResume: () => game.resume(),
    onRestart: () => startRun(),
    onQuit: () => backToMenu(),
    onQuality: (q) => applyQuality(q),
    onToggleMods: () => toggleMods(),
  },
  initialQuality,
);

const game = new Game({
  canvas,
  quality: initialQuality,
  save,
  onHud: (hud: HudState) => ui.setHud(hud),
  onEvent: (event: GameEvent) => handleEvent(event),
  onSave: (next: SaveData) => {
    save = next;
  },
  onPause: (paused: boolean) => {
    if (paused) ui.setOverlay("pause");
    else if (ui.overlayName === "pause") ui.setOverlay(null);
  },
});

game.start();
game.pause();
ui.setOverlay("menu");
ui.setQuality(initialQuality);

function startRun(): void {
  ui.setOverlay(null);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  game.restart();
}

function backToMenu(): void {
  game.restart();
  game.pause();
  ui.setOverlay("menu");
}

function applyQuality(quality: Quality): void {
  save.quality = quality;
  writeSave(save);
  game.setQuality(quality);
  ui.setQuality(quality);
}

function handleEvent(event: GameEvent): void {
  switch (event.type) {
    case "attempt":
      ui.showAttempt(game.attempts);
      break;
    case "complete":
      ui.setCompleteStats(
        `100% · ${formatTime(event.time)} · ${game.attempts} attempt${game.attempts === 1 ? "" : "s"}`,
      );
      game.pause();
      ui.setOverlay("complete");
      break;
    case "death":
      break;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, "0")}` : `${s.toFixed(2)}s`;
}

async function toggleMods(): Promise<void> {
  save.modsEnabled = !save.modsEnabled;
  writeSave(save);
  await reloadMods();
}

let modsLoading = false;
async function reloadMods(): Promise<void> {
  if (modsLoading) return;
  modsLoading = true;
  try {
    resetModHooks();
    const runtime = await loadMods({
      enabled: save.modsEnabled,
      baseUrl: `${import.meta.env.BASE_URL}mods/`,
      game,
      toast: (message) => ui.toast(message),
      onLog: (message) => console.info(`[mods] ${message}`),
    });
    game.attachMods(runtime);
    ui.setMods(runtime.mods, save.modsEnabled);
  } finally {
    modsLoading = false;
  }
}

void reloadMods();

document.addEventListener("visibilitychange", () => {
  if (document.hidden && !game.isPaused) game.pause();
});
