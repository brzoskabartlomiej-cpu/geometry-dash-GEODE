import type { Quality } from "../render/quality.ts";

export type SaveData = {
  version: 1;
  bestProgress: number;
  attempts: number;
  cleared: boolean;
  quality: Quality | "auto";
  modsEnabled: boolean;
  muted: boolean;
};

const KEY = "geo-dash-save-v1";

export const DEFAULT_SAVE: SaveData = {
  version: 1,
  bestProgress: 0,
  attempts: 0,
  cleared: false,
  quality: "auto",
  modsEnabled: true,
  muted: false,
};

export function loadSave(): SaveData {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...DEFAULT_SAVE, ...parsed, version: 1 };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function writeSave(data: SaveData): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data));
  } catch {
    // private mode / storage disabled: the game still plays, progress is lost
  }
}
