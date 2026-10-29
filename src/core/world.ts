import { PHYSICS } from "./constants.ts";
import { buildFirstLevel, Level, TileKind, type Tile } from "./level.ts";
import { applyGravity, createPlayer, rotateCube, type PlayerState } from "./player.ts";
import { clamp, snapAngle, triRectOverlap, type Rect, type Tri } from "./math.ts";

export const RunState = {
  Playing: "playing",
  Dead: "dead",
  Complete: "complete",
} as const;
export type RunState = (typeof RunState)[keyof typeof RunState];

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: [number, number, number];
};

export type TrailPoint = { x: number; y: number; life: number };

const DEATH_RESTART_DELAY = 0.55;
const MAX_PARTICLES = 220;

function playerRect(p: PlayerState): Rect {
  return { x: p.x, y: p.y, w: PHYSICS.playerSize, h: PHYSICS.playerSize };
}

/**
 * GD-like spike hitbox: a triangle that is narrower than the sprite, so a
 * well timed triple spike jump actually fits inside the arc.
 */
function spikeTriangle(t: Tile): Tri {
  return [
    [t.x + 0.2, t.y + 0.02],
    [t.x + 0.8, t.y + 0.02],
    [t.x + 0.5, t.y + 0.95],
  ];
}

export class World {
  readonly level: Level;
  player: PlayerState;
  state: RunState = RunState.Playing;
  attempts = 1;
  bestProgress = 0;
  progress = 0;
  time = 0;
  deathTimer = 0;
  finishTime: number | null = null;
  particles: Particle[] = [];
  trail: TrailPoint[] = [];
  /** Where the cube died / finished, used by the camera and effects. */
  markerX = 0;
  markerY = 0;
  shake = 0;
  /** Overrides the start position (practice-style mods). */
  respawnX: number | null = null;

  constructor(level: Level = buildFirstLevel()) {
    this.level = level;
    this.player = createPlayer(level.startX, 1);
    this.markerX = this.player.x;
    this.markerY = this.player.y;
  }

  restart(): void {
    this.attempts += 1;
    this.progress = 0;
    this.player = createPlayer(
      this.respawnX === null ? this.level.startX : this.safeRespawnX(this.respawnX),
      1,
    );
    this.state = RunState.Playing;
    this.time = 0;
    this.deathTimer = 0;
    this.finishTime = null;
    this.particles.length = 0;
    this.trail.length = 0;
    this.markerX = this.player.x;
    this.markerY = this.player.y;
  }

  /**
   * Cheap independent copy of the run state. The level (immutable) is shared,
   * particles/trail are dropped. Used by the test bot, replays and ghost probes.
   */
  fork(): World {
    const w = new World(this.level);
    w.player = { ...this.player };
    w.state = this.state;
    w.time = this.time;
    w.progress = this.progress;
    w.attempts = this.attempts;
    w.respawnX = this.respawnX;
    return w;
  }

  get isFinished(): boolean {
    return this.state === RunState.Complete;
  }

  /**
   * One fixed simulation tick. `hold` mirrors GD: holding down keeps the cube
   * jumping the moment it touches a surface.
   */
  step(dt: number, hold: boolean): void {
    if (this.state === RunState.Dead) {
      this.deathTimer -= dt;
      this.updateParticles(dt);
      this.shake = Math.max(0, this.shake - dt * 3);
      if (this.deathTimer <= 0) this.restart();
      return;
    }

    if (this.state === RunState.Complete) {
      this.updateParticles(dt);
      return;
    }

    this.time += dt;
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 3);

    const p = this.player;

    // --- 1. resolve the ground contact first ----------------------------
    // Using a small epsilon instead of an exact overlap test keeps the cube
    // stable at 240 Hz: without it floating point wobble can leave it hovering
    // a fraction of a unit above the floor and never "landing".
    const groundTop = p.vy <= 0 ? this.groundTopBelow() : null;
    p.onGround = groundTop !== null;
    if (groundTop !== null) {
      if (p.y !== groundTop) p.squash = Math.max(p.squash, 0.6);
      p.y = groundTop;
      p.vy = 0;
      p.rotation = snapAngle(p.rotation, Math.PI / 2);
    }

    // --- 2. input: holding the button re-jumps on contact ----------------
    if (p.onGround && hold) {
      p.vy = PHYSICS.jumpVelocity;
      p.onGround = false;
    } else if (!p.onGround) {
      applyGravity(p, dt);
    }

    // --- 3. horizontal (auto-scroll) ------------------------------------
    p.x += PHYSICS.speed * dt;
    if (this.collidesSolid()) {
      this.kill("wall");
      return;
    }

    // --- 4. vertical ----------------------------------------------------
    if (!p.onGround) {
      p.y += p.vy * dt;
      if (p.vy <= 0) {
        const top = this.lowestCollisionTop();
        if (top !== null) {
          p.y = top;
          p.vy = 0;
          p.onGround = true;
          p.rotation = snapAngle(p.rotation, Math.PI / 2);
          p.squash = 1;
        }
      } else if (this.collidesSolid()) {
        this.kill("ceiling");
        return;
      }
      if (!p.onGround) rotateCube(p, dt);
    }

    p.squash = Math.max(0, p.squash - dt * 6);

    // --- hazards --------------------------------------------------------
    for (const t of this.level.tilesInRange(Math.floor(p.x) - 2, Math.ceil(p.x) + 2)) {
      if (t.kind !== TileKind.Spike) continue;
      if (triRectOverlap(spikeTriangle(t), playerRect(p))) {
        this.kill("spike");
        return;
      }
    }

    if (p.y < -4) {
      this.kill("pit");
      return;
    }

    // --- progress -------------------------------------------------------
    this.progress = Math.max(this.progress, this.level.progressAt(p.x));
    this.trail.push({ x: p.x + 0.5, y: p.y + 0.5, life: 0.35 });
    if (this.trail.length > 26) this.trail.shift();
    for (const tp of this.trail) tp.life -= dt;

    if (p.x >= this.level.finishX) {
      this.state = RunState.Complete;
      this.finishTime = this.time;
      this.progress = 100;
      this.markerX = p.x;
      this.markerY = p.y;
      this.bestProgress = Math.max(this.bestProgress, 100);
      this.burst(p.x + 0.5, p.y + 0.5, 46, [0.55, 0.95, 1]);
    }
  }

  /**
   * Practice-style respawns must never place the cube inside geometry or above a
   * pit (that would be an instant, unavoidable death loop). Walk back until a
   * column has solid ground and a free cell for the cube.
   */
  private safeRespawnX(requested: number): number {
    const target = Math.max(this.level.startX, Math.floor(requested));
    for (let dx = 0; dx < 16; dx++) {
      const cx = target - dx;
      if (cx < this.level.startX) break;
      if (!this.level.isSolid(cx, 0)) continue;
      if (this.level.isSolid(cx, 1) || this.level.isSolid(cx, 2)) continue;
      if (this.level.tileAt(cx, 1) !== TileKind.Empty) continue;
      return cx;
    }
    return this.level.startX;
  }

  /** Tile range the player currently touches (with a small epsilon). */
  private overlappingTiles(rect: Rect): Tile[] {
    const x0 = Math.floor(rect.x + 0.0001);
    const x1 = Math.floor(rect.x + rect.w - 0.0001);
    const y0 = Math.floor(rect.y + 0.0001);
    const y1 = Math.floor(rect.y + rect.h - 0.0001);
    const out: Tile[] = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.level.isSolid(tx, ty)) out.push({ x: tx, y: ty, kind: TileKind.Block });
      }
    }
    return out;
  }

  private collidesSolid(): boolean {
    const p = this.player;
    const x0 = Math.floor(p.x + 0.0001);
    const x1 = Math.floor(p.x + PHYSICS.playerSize - 0.0001);
    const y0 = Math.floor(p.y + 0.0001);
    const y1 = Math.floor(p.y + PHYSICS.playerSize - 0.0001);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.level.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }

  /** Highest block top the player is standing on (or null). */
  private lowestCollisionTop(): number | null {
    const tiles = this.overlappingTiles(playerRect(this.player));
    if (tiles.length === 0) return null;
    let top = -Infinity;
    for (const t of tiles) top = Math.max(top, t.y + 1);
    return top;
  }

  /**
   * Top surface the player is resting on, or null when airborne.
   * The 0.02 epsilon is 2% of a block: invisible, but it makes the ground
   * contact survive float rounding.
   */
  private groundTopBelow(): number | null {
    const p = this.player;
    const y = p.y - 0.02;
    const row = Math.floor(y);
    if (Math.abs(row + 1 - p.y) > 0.02) return null;
    let found: number | null = null;
    const x0 = Math.floor(p.x + 0.05);
    const x1 = Math.floor(p.x + PHYSICS.playerSize - 0.05);
    for (let tx = x0; tx <= x1; tx++) {
      if (this.level.isSolid(tx, row)) found = Math.max(found ?? -Infinity, row + 1);
    }
    // Also accept a tile whose top is within epsilon above the cube (rare,
    // happens when two collision passes rounded in opposite directions).
    if (found === null) {
      const rowAbove = Math.floor(p.y + 0.001);
      for (let tx = x0; tx <= x1; tx++) {
        if (this.level.isSolid(tx, rowAbove)) found = Math.max(found ?? -Infinity, rowAbove + 1);
      }
    }
    return found;
  }

  private kill(reason: string): void {
    if (this.state !== RunState.Playing) return;
    this.state = RunState.Dead;
    this.deathTimer = DEATH_RESTART_DELAY;
    this.shake = 1;
    this.markerX = this.player.x;
    this.markerY = this.player.y;
    this.bestProgress = Math.max(this.bestProgress, this.progress);
    const palette: [number, number, number] =
      reason === "spike" ? [1, 0.42, 0.42] : [1, 0.78, 0.4];
    this.burst(this.player.x + 0.5, this.player.y + 0.5, 34, palette);
  }

  private burst(x: number, y: number, count: number, hue: [number, number, number]): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const a = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 7;
      const life = 0.3 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed + 2,
        life,
        maxLife: life,
        size: 0.08 + Math.random() * 0.16,
        hue,
      });
    }
  }

  private updateParticles(dt: number): void {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        ps.splice(i, 1);
        continue;
      }
      p.vy -= 22 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
}
