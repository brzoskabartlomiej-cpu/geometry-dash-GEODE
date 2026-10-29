export const TileKind = {
  Empty: 0,
  Block: 1,
  Spike: 2,
} as const;
export type TileKind = (typeof TileKind)[keyof typeof TileKind];

export type Tile = {
  readonly x: number;
  readonly y: number;
  readonly kind: TileKind;
};

/**
 * Grid based level geometry. One cell == one block.
 *
 * The format is intentionally plain (integer cells, three tile kinds) so it can
 * be serialised into the own online level format *and* converted from community
 * level strings later without touching the simulation.
 */
export class Level {
  readonly name: string;
  readonly width: number;
  readonly startX: number;
  readonly finishX: number;
  readonly tiles: Tile[] = [];
  private readonly grid = new Map<number, Tile>();
  /** column index -> tiles, keeps per tick lookups independent of level size */
  private readonly byColumn = new Map<number, Tile[]>();

  constructor(name: string, width: number, startX = 3, finishX = width - 6) {
    this.name = name;
    this.width = width;
    this.startX = startX;
    this.finishX = finishX;
  }

  private static key(x: number, y: number): number {
    // x in [0, 4096), y in [-256, 768) -> collision free integer key.
    return Math.floor(x) * 1024 + Math.floor(y) + 256;
  }

  add(x: number, y: number, kind: TileKind): this {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const key = Level.key(cx, cy);
    if (this.grid.has(key)) return this;
    const tile: Tile = { x: cx, y: cy, kind };
    this.grid.set(key, tile);
    this.tiles.push(tile);
    const col = this.byColumn.get(cx);
    if (col) col.push(tile);
    else this.byColumn.set(cx, [tile]);
    return this;
  }

  /** Solid floor from x0 (inclusive) to x1 (exclusive). */
  floor(x0: number, x1: number): this {
    for (let x = Math.floor(x0); x < Math.floor(x1); x++) this.add(x, 0, TileKind.Block);
    return this;
  }

  block(x: number, y: number, w = 1, h = 1): this {
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) this.add(x + dx, y + dy, TileKind.Block);
    }
    return this;
  }

  spike(x: number, y: number): this {
    return this.add(x, y, TileKind.Spike);
  }

  spikeRow(x: number, y: number, count: number): this {
    for (let i = 0; i < count; i++) this.spike(x + i, y);
    return this;
  }

  tileAt(x: number, y: number): TileKind {
    return this.grid.get(Level.key(x, y))?.kind ?? TileKind.Empty;
  }

  isSolid(x: number, y: number): boolean {
    return this.tileAt(x, y) === TileKind.Block;
  }

  /** Tiles overlapping a camera window, so drawing stays cheap on weak GPUs. */
  tilesInRange(x0: number, x1: number): Tile[] {
    const out: Tile[] = [];
    const a = Math.floor(x0);
    const b = Math.floor(x1);
    for (let x = a; x <= b; x++) {
      const col = this.byColumn.get(x);
      if (col) for (const t of col) out.push(t);
    }
    return out;
  }

  /** Sorted spike positions, used by hazard lookups and by the test bot. */
  get spikes(): Tile[] {
    return this.tiles.filter((t) => t.kind === TileKind.Spike);
  }

  /** 0..100, clamped. Used by the HUD and attempt records. */
  progressAt(x: number): number {
    const span = this.finishX - this.startX;
    if (span <= 0) return 100;
    const p = ((x - this.startX) / span) * 100;
    return p < 0 ? 0 : p > 100 ? 100 : p;
  }
}

/**
 * First playable level: "Stereo Sprint".
 *
 * Original layout (not a copy of any existing GD level), designed around the
 * baseline cube: 5.2 blocks of jump length, 2 blocks of jump height. Every
 * hazard group is followed by at least 4 blocks of landing room and every pit
 * is at most 4 blocks wide. tests/level.test.ts drives the level with a bot so
 * it stays completable when the tuning is changed.
 */
export function buildFirstLevel(): Level {
  const L = new Level("Stereo Sprint", 340);

  // 1) warm-up: single spikes, nothing to learn but the timing
  L.floor(0, 60);
  L.spike(14, 1);
  L.spike(22, 1);
  L.spike(30, 1);
  L.spike(38, 1);
  L.spike(47, 1);

  // 2) first pit, then a triple spike
  L.floor(63, 110);
  L.spikeRow(70, 1, 3);
  L.spike(78, 1);
  L.spike(86, 1);
  L.spikeRow(94, 1, 2);
  L.block(102, 1, 2, 1);
  L.spike(107, 1);

  // 3) pit, light climb, double spike
  L.floor(113, 150);
  L.spike(117, 1);
  L.spikeRow(125, 1, 2);
  L.block(133, 1, 1, 1);
  L.spike(140, 1);

  // 4) wide pit, triple spike, elevated block
  L.floor(153, 200);
  L.spikeRow(159, 1, 3);
  L.spike(168, 1);
  L.block(176, 1, 3, 1);
  L.spike(186, 1);
  L.spikeRow(193, 1, 2);

  // 5) pit, rhythm section
  L.floor(203, 260);
  L.spikeRow(208, 1, 2);
  L.spike(218, 1);
  L.spikeRow(226, 1, 3);
  L.block(236, 1, 1, 1);
  L.spike(244, 1);
  L.spike(252, 1);

  // 6) final gauntlet
  L.floor(263, 340);
  L.spike(267, 1);
  L.spikeRow(275, 1, 2);
  L.spike(284, 1);
  L.spikeRow(292, 1, 3);
  L.spike(301, 1);
  L.spike(309, 1);
  L.spike(317, 1);
  L.spike(325, 1);

  return L;
}
