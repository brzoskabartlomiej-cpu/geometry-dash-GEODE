/**
 * Minimal DOM/canvas stub so the browser-facing half of the game can be
 * exercised in Node: the real `Game` loop, the real `Ui` class and the Canvas2D
 * renderer fallback all run against these fakes.
 *
 * It is intentionally dumb: the point is to catch wiring mistakes (missing
 * element ids, undefined colours, wrong constructor order), not to fake a
 * browser.
 */

type Listener = (event: StubEvent) => void;

export type StubEvent = {
  type: string;
  code?: string;
  repeat?: boolean;
  button?: number;
  pointerType?: string;
  pointerId?: number;
  target?: unknown;
  preventDefault(): void;
};

export class StubClassList {
  private set = new Set<string>();
  add(...names: string[]): void {
    for (const n of names) this.set.add(n);
  }
  remove(...names: string[]): void {
    for (const n of names) this.set.delete(n);
  }
  toggle(name: string, force?: boolean): boolean {
    const next = force ?? !this.set.has(name);
    if (next) this.set.add(name);
    else this.set.delete(name);
    return next;
  }
  contains(name: string): boolean {
    return this.set.has(name);
  }
}

export class StubElement {
  readonly tagName: string;
  id = "";
  type = "";
  textContent = "";
  title = "";
  className = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  classList = new StubClassList();
  children: StubElement[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  append(...nodes: StubElement[]): void {
    this.children.push(...nodes);
  }
  appendChild(node: StubElement): StubElement {
    this.children.push(node);
    return node;
  }
  replaceChildren(...nodes: StubElement[]): void {
    this.children = [...nodes];
  }
  remove(): void {}
  blur(): void {}
  focus(): void {}
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }
  setPointerCapture(): void {}
  addEventListener(type: string, cb: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, cb: Listener): void {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(
      type,
      list.filter((l) => l !== cb),
    );
  }
  dispatch(type: string, event: Partial<StubEvent> = {}): void {
    const full: StubEvent = {
      type,
      preventDefault() {},
      ...event,
    };
    for (const cb of this.listeners.get(type) ?? []) cb(full);
  }
  querySelectorAll(selector: string): StubElement[] {
    if (selector === "button") return this.children.filter((c) => c.tagName === "BUTTON");
    return [];
  }
  getBoundingClientRect(): { width: number; height: number; top: number; left: number } {
    return { width: 1280, height: 720, top: 0, left: 0 };
  }
}

class StubCanvas extends StubElement {
  width = 1280;
  height = 720;
  private ctx: Record<string, unknown>;

  constructor() {
    super("canvas");
    const noop = () => {};
    this.ctx = {
      setTransform: noop,
      save: noop,
      restore: noop,
      translate: noop,
      rotate: noop,
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      closePath: noop,
      fill: noop,
      fillRect: noop,
      strokeRect: noop,
      clearRect: noop,
      fillStyle: "#000",
    };
  }

  getContext(kind: string): unknown {
    // no WebGL in the stub: this exercises the Canvas2D fallback path
    return kind === "2d" ? this.ctx : null;
  }
}

export type DomHarness = {
  document: unknown;
  canvas: StubCanvas;
  ids: string[];
  dispatchKey(type: string, code: string): void;
  pumpFrames(count: number, stepMs?: number): number;
  restore(): void;
};

export function installDom(ids: string[]): DomHarness {
  const elements = new Map<string, StubElement>();
  for (const id of ids) {
    const el = id === "game" ? new StubCanvas() : new StubElement("div");
    el.id = id;
    elements.set(id, el);
  }

  const documentStub = {
    getElementById: (id: string) => elements.get(id) ?? null,
    createElement: (tag: string) => (tag === "canvas" ? new StubCanvas() : new StubElement(tag)),
    addEventListener: () => {},
    activeElement: null,
  };

  const global = globalThis as unknown as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    saved[key] = global[key];
    global[key] = value;
  };

  set("document", documentStub);
  set("window", globalThis);
  set("devicePixelRatio", 1);
  set("HTMLElement", StubElement);
  set("HTMLInputElement", class {});
  set("HTMLTextAreaElement", class {});
  set("HTMLCanvasElement", StubCanvas);

  const store = new Map<string, string>();
  set("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });

  const windowListeners = new Map<string, Listener[]>();
  set("addEventListener", (type: string, cb: Listener) => {
    const list = windowListeners.get(type) ?? [];
    list.push(cb);
    windowListeners.set(type, list);
  });
  set("removeEventListener", (type: string, cb: Listener) => {
    const list = windowListeners.get(type) ?? [];
    windowListeners.set(
      type,
      list.filter((l) => l !== cb),
    );
  });

  let rafQueue: ((t: number) => void)[] = [];
  set("requestAnimationFrame", (cb: (t: number) => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  set("cancelAnimationFrame", () => {
    rafQueue = [];
  });

  const canvas = elements.get("game") as StubCanvas;

  return {
    document: documentStub,
    canvas,
    ids,
    dispatchKey(type: string, code: string) {
      for (const cb of windowListeners.get(type) ?? []) {
        cb({ type, code, repeat: false, preventDefault() {} });
      }
    },
    pumpFrames(count: number, stepMs = 16.7) {
      let time = 0;
      for (let i = 0; i < count; i++) {
        const batch = rafQueue;
        rafQueue = [];
        time += stepMs;
        for (const cb of batch) cb(time);
        if (rafQueue.length === 0) break;
      }
      return time;
    },
    restore() {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete global[key];
        else global[key] = value;
      }
    },
  };
}

/** Ids that `index.html` must provide for the UI layer. */
export function parseIdsFromIndexHtml(html: string): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(/id="([^"]+)"/g)) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}
