"""Generate OpenConductor's neutral app icon (a four-point star on a rounded square).

Pure standard library so it runs anywhere: `python3 assets/make_icon.py`.
Then `npx tauri icon assets/icon-1024.png -o src-tauri/icons` expands it.
"""
import math, struct, zlib, pathlib

N = 1024
SS = 3  # supersampling per axis for anti-aliasing
MARGIN, RADIUS = 100, 190  # macOS-style inset and corner radius
TOP, BOTTOM = (43, 52, 72), (22, 27, 40)  # slate gradient
STAR = (245, 239, 222)
ACCENT = (232, 176, 75)


def in_rounded_square(x, y):
    lo, hi = MARGIN, N - MARGIN
    if not (lo <= x <= hi and lo <= y <= hi):
        return False
    cx = min(max(x, lo + RADIUS), hi - RADIUS)
    cy = min(max(y, lo + RADIUS), hi - RADIUS)
    return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2


def in_star(x, y, cx=N / 2, cy=N / 2, r_out=300, r_in=62):
    # Four-point star: |dx|^p + |dy|^p astroid-like shape plus thin core.
    dx, dy = abs(x - cx) / r_out, abs(y - cy) / r_out
    astroid = dx ** 0.5 + dy ** 0.5 <= 1.0
    core = (x - cx) ** 2 + (y - cy) ** 2 <= r_in ** 2
    return astroid or core


def in_dot(x, y):
    return (x - 700) ** 2 + (y - 330) ** 2 <= 34 ** 2


rows = []
for py in range(N):
    row = bytearray([0])
    t = py / N
    bg = tuple(int(TOP[i] * (1 - t) + BOTTOM[i] * t) for i in range(3))
    for px in range(N):
        cov = star = dot = 0
        for sy in range(SS):
            for sx in range(SS):
                x, y = px + (sx + 0.5) / SS, py + (sy + 0.5) / SS
                if in_rounded_square(x, y):
                    cov += 1
                    if in_star(x, y):
                        star += 1
                    elif in_dot(x, y):
                        dot += 1
        total = SS * SS
        if cov == 0:
            row += b"\0\0\0\0"
            continue
        c = [bg[i] * (cov - star - dot) + STAR[i] * star + ACCENT[i] * dot for i in range(3)]
        row += bytes(int(v / cov) for v in c) + bytes([int(255 * cov / total)])
    rows.append(bytes(row))

def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
out = pathlib.Path(__file__).with_name("icon-1024.png")
out.write_bytes(png)
print("wrote", out)
