/**
 * One shared input state for keyboard, mouse and touch.
 *
 * The simulation reads `held` once per fixed tick, which is what makes the
 * "hold to keep jumping" behaviour identical on every device.
 */
export type InputState = {
  held: boolean;
  release(): void;
};

const JUMP_KEYS = new Set(["Space", "ArrowUp", "KeyW", "KeyZ"]);

export function attachInput(
  target: HTMLElement,
  handlers: { onPause?: () => void; onJumpPress?: () => void; onJumpRelease?: () => void },
): InputState {
  const state: InputState = {
    held: false,
    release() {
      state.held = false;
    },
  };

  const press = () => {
    if (!state.held) handlers.onJumpPress?.();
    state.held = true;
  };
  const release = () => {
    if (state.held) handlers.onJumpRelease?.();
    state.held = false;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target;
    // keep keyboard-only UI (Tab + Enter) usable: don't hijack text fields
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (JUMP_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) press();
      return;
    }
    if (e.code === "Escape" || e.code === "KeyP") {
      e.preventDefault();
      handlers.onPause?.();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (JUMP_KEYS.has(e.code)) {
      e.preventDefault();
      release();
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    press();
  };
  const onPointerUp = () => release();

  globalThis.addEventListener("keydown", onKeyDown, { passive: false });
  globalThis.addEventListener("keyup", onKeyUp, { passive: false });
  target.addEventListener("pointerdown", onPointerDown);
  globalThis.addEventListener("pointerup", onPointerUp);
  globalThis.addEventListener("pointercancel", onPointerUp);
  globalThis.addEventListener("blur", release);

  return state;
}
