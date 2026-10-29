import type { Color } from "./quality.ts";

/**
 * Tiny batched 2D renderer on top of WebGL2.
 *
 * Everything is a float array of triangles submitted in draw order, uploaded as
 * one buffer per flush. No textures, no post processing: on a weak phone the
 * whole frame is a couple of draw calls, which is what keeps the "low" preset
 * usable. A Canvas2D fallback is used when WebGL2 is not available at all.
 */

const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
in vec4 a_color;
uniform vec2 u_origin;
uniform vec2 u_res;
uniform float u_ppu;
out vec4 v_color;
void main() {
  vec2 p = (a_pos - u_origin) * u_ppu;
  vec2 clip = vec2(p.x / (u_res.x * 0.5), -p.y / (u_res.y * 0.5));
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}`;

const FLOATS_PER_VERTEX = 6;
const MAX_VERTS = 65536;

export type Renderer = {
  readonly kind: "webgl2" | "canvas2d";
  readonly canvas: HTMLCanvasElement;
  begin(): void;
  /** World point that should sit in the middle of the screen. */
  setOrigin(x: number, y: number): void;
  setPixelsPerUnit(ppu: number): void;
  quad(x: number, y: number, w: number, h: number, color: Color): void;
  /** Quad centered on (cx, cy), rotated by `angle` radians (screen space). */
  quadRot(cx: number, cy: number, w: number, h: number, angle: number, color: Color): void;
  tri(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    color: Color,
  ): void;
  flush(): void;
  resize(): void;
  readonly width: number;
  readonly height: number;
  dispose(): void;
};

export function createRenderer(canvas: HTMLCanvasElement, resolutionScale: number): Renderer {
  const gl = canvas.getContext("webgl2", {
    antialias: resolutionScale >= 1,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) return createCanvas2DRenderer(canvas);
  return createWebGL2Renderer(canvas, gl, resolutionScale);
}

function createWebGL2Renderer(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  resolutionScale: number,
): Renderer {
  const program = gl.createProgram();
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERTEX_SHADER);
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, FRAGMENT_SHADER);
  gl.compileShader(fs);
  if (!program) throw new Error("cannot create WebGL2 program");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`shader link failed: ${gl.getProgramInfoLog(program) ?? "unknown"}`);
  }
  gl.useProgram(program);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, MAX_VERTS * FLOATS_PER_VERTEX * 4, gl.DYNAMIC_DRAW);

  const stride = FLOATS_PER_VERTEX * 4;
  const aPos = gl.getAttribLocation(program, "a_pos");
  const aColor = gl.getAttribLocation(program, "a_color");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 8);

  const uOrigin = gl.getUniformLocation(program, "u_origin");
  const uRes = gl.getUniformLocation(program, "u_res");
  const uPpu = gl.getUniformLocation(program, "u_ppu");

  const data = new Float32Array(MAX_VERTS * FLOATS_PER_VERTEX);
  let count = 0;
  let originX = 0;
  let originY = 0;
  let ppu = 48;
  let width = 1;
  let height = 1;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  function push(x: number, y: number, c: Color): void {
    if (count + FLOATS_PER_VERTEX > data.length) return flush();
    const o = count;
    data[o] = x;
    data[o + 1] = y;
    data[o + 2] = c[0];
    data[o + 3] = c[1];
    data[o + 4] = c[2];
    data[o + 5] = c[3];
    count += FLOATS_PER_VERTEX;
  }

  function flush(): void {
    if (count === 0) return;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count));
    gl.drawArrays(gl.TRIANGLES, 0, count / FLOATS_PER_VERTEX);
    count = 0;
  }

  const renderer: Renderer = {
    kind: "webgl2",
    canvas,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    begin() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uOrigin, originX, originY);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uPpu, ppu);
      count = 0;
    },
    setOrigin(x: number, y: number) {
      originX = x;
      originY = y;
      gl.uniform2f(uOrigin, x, y);
    },
    setPixelsPerUnit(value: number) {
      ppu = value;
      gl.uniform1f(uPpu, value);
    },
    quad(x, y, w, h, color) {
      push(x, y, color);
      push(x + w, y, color);
      push(x, y + h, color);
      push(x + w, y, color);
      push(x + w, y + h, color);
      push(x, y + h, color);
    },
    quadRot(cx, cy, w, h, angle, color) {
      const hw = w / 2;
      const hh = h / 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const px = (lx: number, ly: number) => cx + lx * c - ly * s;
      const py = (lx: number, ly: number) => cy + lx * s + ly * c;
      const x0 = px(-hw, -hh);
      const y0 = py(-hw, -hh);
      const x1 = px(hw, -hh);
      const y1 = py(hw, -hh);
      const x2 = px(hw, hh);
      const y2 = py(hw, hh);
      const x3 = px(-hw, hh);
      const y3 = py(-hw, hh);
      push(x0, y0, color);
      push(x1, y1, color);
      push(x2, y2, color);
      push(x0, y0, color);
      push(x2, y2, color);
      push(x3, y3, color);
    },
    tri(ax, ay, bx, by, cx, cy, color) {
      push(ax, ay, color);
      push(bx, by, color);
      push(cx, cy, color);
    },
    flush,
    resize() {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2) * resolutionScale;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width * dpr));
      height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };

  return renderer;
}

/** Last-resort renderer for browsers without WebGL2. */
function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d")!;
  let originX = 0;
  let originY = 0;
  let ppu = 48;
  let width = 1;
  let height = 1;

  const sx = (x: number) => width / 2 + (x - originX) * ppu;
  const sy = (y: number) => height / 2 - (y - originY) * ppu;
  const css = (c: Color) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;

  return {
    kind: "canvas2d",
    canvas,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    begin() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#0b0f2b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    },
    setOrigin(x, y) {
      originX = x;
      originY = y;
    },
    setPixelsPerUnit(value) {
      ppu = value;
    },
    quad(x, y, w, h, color) {
      ctx.fillStyle = css(color);
      ctx.fillRect(sx(x), sy(y + h), w * ppu, h * ppu);
    },
    quadRot(cx, cy, w, h, angle, color) {
      ctx.save();
      ctx.translate(sx(cx), sy(cy));
      ctx.rotate(angle);
      ctx.fillStyle = css(color);
      ctx.fillRect((-w * ppu) / 2, (-h * ppu) / 2, w * ppu, h * ppu);
      ctx.restore();
    },
    tri(ax, ay, bx, by, cx, cy, color) {
      ctx.beginPath();
      ctx.moveTo(sx(ax), sy(ay));
      ctx.lineTo(sx(bx), sy(by));
      ctx.lineTo(sx(cx), sy(cy));
      ctx.closePath();
      ctx.fillStyle = css(color);
      ctx.fill();
    },
    flush() {},
    resize() {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width * dpr));
      height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    },
    dispose() {},
  };
}
