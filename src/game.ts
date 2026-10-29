import { SIM_DT } from "./core/constants.ts";
import { buildFirstLevel, type Level } from "./core/level.ts";
import { RunState, World } from "./core/world.ts";
import { damp } from "./core/math.ts";
import { attachInput, type InputState } from "./platform/input.ts";
import { writeSave, type SaveData } from "./platform/storage.ts";
import { modPalette, type ModRuntime } from "./mods/loader.ts";
import type { GameBridge, ModPalette } from "./mods/types.ts";
import {
  computePpu,
  drawBackground,
  drawLevel,
  drawMarkers,
  drawParticles,
  drawPlayer,
  makeView,
  type Camera,
} from "./render/scene.ts";
import { createRenderer, type Renderer } from "./render/renderer.ts";
import { QUALITY_PRESETS, type Quality, type QualitySettings } from "./render/quality.ts";

export type HudState = {
  levelName: string;
  attempts: number;
  progress: number;
  best: number;
  fps: number;
  state: RunState;
  time: number;
  quality: Quality;
  drawCalls: "webgl2" | "canvas2d";
  respawning: boolean;
};

export type GameEvent =
  | { type: "attempt" }
  | { type: "death"; progress: number }
  | { type: "complete"; time: number };

export type GameOptions = {
  canvas: HTMLCanvasElement;
  quality: Quality;
  save: SaveData;
  level?: Level;
  mods?: ModRuntime;
  onHud?: (hud: HudState) => void;
  onEvent?: (event: GameEvent) => void;
  onSave?: (save: SaveData) => void;
  onPause?: (paused: boolean) => void;
};

export class Game implements GameBridge {
  readonly canvas: HTMLCanvasElement;
  readonly world: World;
  private renderer: Renderer;
  private input: InputState;
  private settings: QualitySettings;
  private qualityName: Quality;
  private save: SaveData;
  private mods: ModRuntime | undefined;
  private onHud: ((hud: HudState) => void) | undefined;
  private onEvent: ((event: GameEvent) => void) | undefined;
  private onSave: ((save: SaveData) => void) | undefined;
  private onPause: ((paused: boolean) => void) | undefined;

  private camera: Camera = { x: 0, y: 5.2, shakeX: 0, shakeY: 0 };
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  private paused = false;
  private fps = 0;
  private hudTimer = 0;
  private lastAttempts = 1;
  private paletteOverride: Partial<ModPalette> = {};
  private saveTimer = 0;

  constructor(options: GameOptions) {
    this.canvas = options.canvas;
    this.qualityName = options.quality;
    this.settings = QUALITY_PRESETS[options.quality];
    this.save = options.save;
    this.mods = options.mods;
    this.onHud = options.onHud;
    this.onEvent = options.onEvent;
    this.onSave = options.onSave;
    this.onPause = options.onPause;

    this.world = new World(options.level ?? buildFirstLevel());
    this.world.bestProgress = this.save.bestProgress;
    this.world.attempts = Math.max(1, this.save.attempts + 1);
    this.lastAttempts = this.world.attempts;

    this.renderer = createRenderer(this.canvas, this.settings.resolutionScale);
    this.input = attachInput(this.canvas, {
      onPause: () => this.togglePause(),
    });

    this.camera.x = this.world.player.x + 4.5;
    this.camera.y = 5.2;

    this.resize();
    globalThis.addEventListener("resize", this.resize);
  }

  // --- lifecycle --------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose(): void {
    this.stop();
    globalThis.removeEventListener("resize", this.resize);
    this.renderer.dispose();
  }

  private resize = (): void => {
    this.renderer.resize();
  };

  setQuality(quality: Quality): void {
    if (quality === this.qualityName) return;
    this.qualityName = quality;
    this.settings = QUALITY_PRESETS[quality];
    this.renderer.dispose();
    this.renderer = createRenderer(this.canvas, this.settings.resolutionScale);
    this.renderer.resize();
    this.save = { ...this.save, quality };
    this.persist();
  }

  togglePause(): void {
    if (this.world.state !== RunState.Playing) return;
    this.setPaused(!this.paused);
  }

  pause(): void {
    this.setPaused(true);
  }

  resume(): void {
    this.setPaused(false);
  }

  restart(): void {
    this.setPaused(false);
    this.world.restart();
    this.resetCamera();
    this.emitHud();
  }

  attachMods(runtime: ModRuntime): void {
    this.mods = runtime;
  }

  private setPaused(value: boolean): void {
    if (this.paused === value) return;
    this.paused = value;
    this.input.release();
    this.onPause?.(value);
    this.emitHud();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  // --- GameBridge (mod API) --------------------------------------------

  get levelName(): string {
    return this.world.level.name;
  }

  get progress(): number {
    return this.world.progress;
  }

  get attempts(): number {
    return this.world.attempts;
  }

  get player(): { x: number; y: number; vy: number; onGround: boolean } {
    const p = this.world.player;
    return { x: p.x, y: p.y, vy: p.vy, onGround: p.onGround };
  }

  get state(): RunState {
    return this.world.state;
  }

  setPalette(palette: Partial<ModPalette>): void {
    this.paletteOverride = { ...this.paletteOverride, ...palette };
  }

  setRespawnX(x: number | null): void {
    this.world.respawnX = x;
  }

  // --- main loop --------------------------------------------------------

  private frame = (now: number): void => {
    if (!this.running) return;
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0), 0.25);
    this.fps = this.fps === 0 ? 1 / Math.max(dt, 0.001) : this.fps * 0.9 + (1 / Math.max(dt, 0.001)) * 0.1;

    if (!this.paused) {
      this.accumulator += dt;
      let steps = 0;
      // never let a slow frame spiral: cap the catch up at 12 ticks
      while (this.accumulator >= SIM_DT && steps < 12) {
        this.tick();
        this.accumulator -= SIM_DT;
        steps++;
      }
      if (steps === 12) this.accumulator = 0;
    }

    this.render(dt);
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.emitHud();
    }
    this.rafId = requestAnimationFrame(this.frame);
  };

  private tick(): void {
    const before = this.world.state;
    this.world.step(SIM_DT, this.input.held && !this.paused);

    if (this.world.attempts !== this.lastAttempts) {
      this.lastAttempts = this.world.attempts;
      this.onEvent?.({ type: "attempt" });
      this.mods?.fireAttempt({ attempts: this.world.attempts });
      this.resetCamera();
    }

    if (before !== RunState.Dead && this.world.state === RunState.Dead) {
      this.onEvent?.({ type: "death", progress: this.world.progress });
      this.save.attempts = this.world.attempts;
      this.save.bestProgress = Math.max(this.save.bestProgress, this.world.bestProgress);
      this.persist();
      this.mods?.fireDeath({
        x: this.world.markerX,
        y: this.world.markerY,
        progress: this.world.progress,
        attempts: this.world.attempts,
      });
    }

    if (before !== RunState.Complete && this.world.state === RunState.Complete) {
      this.onEvent?.({ type: "complete", time: this.world.finishTime ?? this.world.time });
      this.mods?.fireComplete({
        time: this.world.finishTime ?? this.world.time,
        attempts: this.world.attempts,
      });
      this.save.cleared = true;
      this.save.bestProgress = 100;
      this.persist();
    }

    if (this.world.bestProgress > this.save.bestProgress) {
      this.save.bestProgress = this.world.bestProgress;
      this.saveTimer = 0.6;
    }
    if (this.saveTimer > 0) {
      this.saveTimer -= SIM_DT;
      if (this.saveTimer <= 0) {
        this.save.attempts = Math.max(0, this.world.attempts - 1);
        this.persist();
      }
    }
  }

  private resetCamera(): void {
    this.camera.x = this.world.player.x + 4.5;
    this.camera.y = 5.2;
  }

  private render(dt: number): void {
    const p = this.world.player;
    const targetX = p.x + 4.5;
    this.camera.x = damp(this.camera.x, targetX, 14, dt);
    const targetY = 5.2 + Math.max(0, p.y - 6) * 0.9;
    this.camera.y = damp(this.camera.y, targetY, 6, dt);

    const shakeAmount = this.settings.shake ? this.world.shake * 0.16 : 0;
    this.camera.shakeX = (Math.random() * 2 - 1) * shakeAmount;
    this.camera.shakeY = (Math.random() * 2 - 1) * shakeAmount;

    const ppu = computePpu(this.renderer, this.settings);
    const view = makeView(
      this.renderer,
      { ...this.camera, x: this.camera.x + this.camera.shakeX, y: this.camera.y + this.camera.shakeY },
      ppu,
    );

    const r = this.renderer;
    r.setPixelsPerUnit(ppu);
    r.setOrigin(this.camera.x + this.camera.shakeX, this.camera.y + this.camera.shakeY);
    r.begin();

    drawBackground(r, view, this.settings);
    drawLevel(r, this.world.level, view, this.settings, this.world.time);
    drawMarkers(r, this.world, this.world.level, view);
    if (this.settings.particles) drawParticles(r, this.world);

    const palette = {
      primary: this.paletteOverride.primary ?? modPalette.primary,
      detail: this.paletteOverride.detail ?? modPalette.detail,
    };
    drawPlayer(r, this.world, view, this.settings, [palette.primary, palette.detail]);
    r.flush();

    this.mods?.fireFrame({
      time: this.world.time,
      dt,
      progress: this.world.progress,
      attempts: this.world.attempts,
      player: this.player,
      state: this.world.state,
    });
  }

  private emitHud(): void {
    this.onHud?.({
      levelName: this.world.level.name,
      attempts: this.world.attempts,
      progress: this.world.progress,
      best: Math.max(this.save.bestProgress, this.world.bestProgress),
      fps: this.fps,
      state: this.world.state,
      time: this.world.time,
      quality: this.qualityName,
      drawCalls: this.renderer.kind,
      respawning: this.world.respawnX !== null,
    });
  }

  private persist(): void {
    writeSave(this.save);
    this.onSave?.(this.save);
  }

  get saveData(): SaveData {
    return this.save;
  }
}
