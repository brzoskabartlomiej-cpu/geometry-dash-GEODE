import type { HudState } from "../game.ts";
import type { LoadedMod } from "../mods/types.ts";
import { QUALITY_ORDER, QUALITY_PRESETS, type Quality } from "../render/quality.ts";

export type OverlayName = "menu" | "pause" | "complete" | null;

export type UiCallbacks = {
  onPlay(): void;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onQuality(quality: Quality): void;
  onToggleMods(): void;
};

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

/** Thin DOM layer: everything that is text or layout lives in HTML/CSS. */
export class Ui {
  private cb: UiCallbacks;
  private overlay = el("overlay");
  private panels = {
    menu: el("panel-menu"),
    pause: el("panel-pause"),
    complete: el("panel-complete"),
  };
  private hudBar = el("hud-bar");
  private hudPct = el("hud-pct");
  private hudBest = el("hud-best");
  private hudAttempts = el("hud-attempts");
  private hudFps = el("hud-fps");
  private hudLevel = el("hud-level");
  private hudQuality = el<HTMLButtonElement>("hud-quality");
  private banner = el("attempt-banner");
  private toasts = el("toasts");
  private qualitySeg = el("quality-seg");
  private modsBtn = el<HTMLButtonElement>("btn-mods");
  private modsList = el<HTMLUListElement>("mods-list");
  private pauseProgress = el("pause-progress");
  private completeStats = el("complete-stats");
  private bannerTimer = 0;
  private current: OverlayName = "menu";

  constructor(callbacks: UiCallbacks, quality: Quality) {
    this.cb = callbacks;

    el<HTMLButtonElement>("btn-play").addEventListener("click", () => this.cb.onPlay());
    el<HTMLButtonElement>("btn-resume").addEventListener("click", () => this.cb.onResume());
    el<HTMLButtonElement>("btn-restart").addEventListener("click", () => this.cb.onRestart());
    el<HTMLButtonElement>("btn-quit").addEventListener("click", () => this.cb.onQuit());
    el<HTMLButtonElement>("btn-again").addEventListener("click", () => this.cb.onPlay());
    el<HTMLButtonElement>("btn-menu").addEventListener("click", () => this.cb.onQuit());
    this.modsBtn.addEventListener("click", () => this.cb.onToggleMods());
    this.hudQuality.addEventListener("click", () => this.cycleQuality());

    for (const q of QUALITY_ORDER) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = QUALITY_PRESETS[q].label;
      b.dataset["quality"] = q;
      b.addEventListener("click", () => this.cb.onQuality(q));
      this.qualitySeg.append(b);
    }
    this.setQuality(quality);
  }

  private cycleQuality(): void {
    const i = QUALITY_ORDER.indexOf(this.activeQuality);
    const next = QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length]!;
    this.cb.onQuality(next);
  }

  private activeQuality: Quality = "high";

  setQuality(quality: Quality): void {
    this.activeQuality = quality;
    for (const btn of this.qualitySeg.querySelectorAll<HTMLButtonElement>("button")) {
      btn.setAttribute("aria-pressed", String(btn.dataset["quality"] === quality));
    }
    this.hudQuality.textContent = QUALITY_PRESETS[quality].label.slice(0, 2).toUpperCase();
  }

  setMods(mods: LoadedMod[], enabled: boolean): void {
    this.modsBtn.textContent = enabled ? "on" : "off";
    this.modsBtn.setAttribute("aria-pressed", String(enabled));
    this.modsList.replaceChildren();
    if (!enabled) {
      const li = document.createElement("li");
      li.textContent = "Mod loading disabled. Enable it to load community mods.";
      this.modsList.append(li);
      return;
    }
    if (mods.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No mods installed (drop a folder into /mods and list it in mods/index.json).";
      this.modsList.append(li);
      return;
    }
    for (const mod of mods) {
      const li = document.createElement("li");
      const left = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = mod.manifest.name;
      left.append(strong);
      if (mod.manifest.author) {
        const author = document.createElement("span");
        author.className = "dim";
        author.textContent = ` by ${mod.manifest.author}`;
        left.append(author);
      }
      const right = document.createElement("span");
      right.textContent = mod.error ? "error" : `v${mod.manifest.version}`;
      if (mod.error) right.className = "bad";
      right.title = mod.error ?? mod.manifest.description ?? "";
      li.append(left, right);
      this.modsList.append(li);
    }
  }

  setOverlay(which: OverlayName): void {
    this.current = which;
    for (const [name, panel] of Object.entries(this.panels)) {
      panel.classList.toggle("hidden", name !== which);
    }
    this.overlay.classList.toggle("hidden", which === null);
  }

  get overlayName(): OverlayName {
    return this.current;
  }

  setHud(hud: HudState): void {
    this.hudLevel.textContent = hud.levelName;
    this.hudBar.style.width = `${Math.min(100, Math.max(0, hud.progress)).toFixed(1)}%`;
    this.hudPct.textContent = `${Math.floor(hud.progress)}%`;
    this.hudBest.textContent = `best ${Math.floor(hud.best)}%`;
    this.hudAttempts.textContent = `attempt ${hud.attempts}`;
    this.hudFps.textContent = `${Math.round(hud.fps)} fps`;
    this.pauseProgress.textContent = `${Math.floor(hud.progress)}% · attempt ${hud.attempts}`;
  }

  setCompleteStats(text: string): void {
    this.completeStats.textContent = text;
  }

  showAttempt(attempt: number): void {
    this.banner.textContent = `Attempt ${attempt}`;
    this.banner.classList.add("show");
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove("show"), 900);
  }

  toast(message: string): void {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    this.toasts.append(node);
    window.setTimeout(() => node.remove(), 3200);
  }
}
