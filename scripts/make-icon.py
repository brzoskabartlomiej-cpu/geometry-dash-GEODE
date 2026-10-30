#!/usr/bin/env python3
"""Generates the source icon for `npx tauri icon`.

Only the Python standard library is used on purpose: the repo should stay
buildable with node + rust, without adding an image toolchain dependency.
"""
import math
import struct
import zlib
from pathlib import Path

SIZE = 1024
SS = 2  # supersampling factor per axis


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def rounded_rect(px: float, py: float, half: float, radius: float) -> float:
    """Signed distance to a rounded square centred at the origin (negative = inside)."""
    qx = abs(px) - (half - radius)
    qy = abs(py) - (half - radius)
    ox = max(qx, 0.0)
    oy = max(qy, 0.0)
    return math.hypot(ox, oy) + min(max(qx, qy), 0.0) - radius


def rotate(px: float, py: float, angle: float) -> tuple[float, float]:
    c, s = math.cos(angle), math.sin(angle)
    return px * c - py * s, px * s + py * c


def rot_rect(px: float, py: float, half: float, angle: float) -> float:
    rx, ry = rotate(px, py, angle)
    return max(abs(rx), abs(ry)) - half


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(px: float, py: float):
    """Returns (r, g, b, alpha) in 0..1 for a point in [-1, 1]^2."""
    # background: rounded square, vertical gradient, no transparency outside
    d_bg = rounded_rect(px, py, 0.97, 0.46)
    if d_bg > 0.012:
        return None
    bg_t = (py + 1) * 0.5
    bg = mix((0.13, 0.17, 0.46), (0.035, 0.05, 0.17), bg_t)
    col = bg

    # cyan glow behind the cube
    glow = math.exp(-(px * px + (py + 0.05) ** 2) * 2.4)
    col = mix(col, (0.35, 0.85, 1.0), 0.20 * glow)

    angle = math.radians(-9)

    # main cube
    d_cube = rot_rect(px, py, 0.46, angle)
    if d_cube < 0.01:
        t = (py + 0.5) * 0.55 + 0.25
        face = mix((0.42, 0.88, 1.0), (0.13, 0.36, 0.95), max(0.0, min(1.0, t)))
        edge = smoothstep(0.0, -0.045, d_cube)
        face = mix((0.06, 0.10, 0.30), face, edge)
        col = mix(col, face, smoothstep(0.008, -0.008, d_cube))

    # inner gold square
    d_inner = rot_rect(px, py, 0.215, angle)
    if d_inner < 0.01:
        gold = mix((1.0, 0.90, 0.42), (1.0, 0.66, 0.20), (py + 0.5) * 0.9)
        col = mix(col, gold, smoothstep(0.008, -0.008, d_inner))

    # white highlight in the middle
    d_dot = rot_rect(px, py, 0.085, angle)
    if d_dot < 0.01:
        col = mix(col, (1.0, 1.0, 1.0), smoothstep(0.008, -0.008, d_dot))

    alpha = smoothstep(0.012, -0.006, d_bg)
    return (col[0], col[1], col[2], alpha)


def main() -> None:
    rows = []
    step = 1.0 / SIZE
    for y in range(SIZE):
        row = bytearray()
        row.append(0)  # PNG filter: none
        for x in range(SIZE):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    px = ((x + (sx + 0.5) / SS) * step) * 2 - 1
                    py = ((y + (sy + 0.5) / SS) * step) * 2 - 1
                    sample = shade(px, py)
                    if sample is None:
                        continue
                    acc[0] += sample[0] * sample[3]
                    acc[1] += sample[1] * sample[3]
                    acc[2] += sample[2] * sample[3]
                    acc[3] += sample[3]
            n = SS * SS
            a = acc[3] / n
            if a > 0.0:
                r = acc[0] / acc[3]
                g = acc[1] / acc[3]
                b = acc[2] / acc[3]
            else:
                r = g = b = 0.0
            row += bytes(
                (
                    max(0, min(255, round(r * 255))),
                    max(0, min(255, round(g * 255))),
                    max(0, min(255, round(b * 255))),
                    max(0, min(255, round(a * 255))),
                )
            )
        rows.append(bytes(row))

    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    out = Path(__file__).resolve().parent.parent / "assets" / "icon.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(png)
    print(f"wrote {out} ({len(png) // 1024} kB)")


if __name__ == "__main__":
    main()
