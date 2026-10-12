"""앱 아이콘(icon.ico + icon-256.png)을 직접 그려서 만든다. 외부 라이브러리 없음.
디자인: 파란 둥근 사각형 위에 하얀 노트 한 장, 접힌 모서리, 코랄색 책갈피, 노트 안에는 레드마인 느낌의 빨간 아치(둥근 조각 7개),
오른쪽 아래에 "2" 배지(1.x 와 작업 표시줄에서 구분하려고).
실행: python make_icon.py
"""
import math
import struct
import zlib
from pathlib import Path

SIZES = [16, 24, 32, 48, 64, 128, 256]


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def in_rrect(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_poly(x, y, pts):
    ins = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ins = not ins
        j = i
    return ins


PAGE = [(0.25, 0.15), (0.60, 0.15), (0.76, 0.31), (0.76, 0.85), (0.25, 0.85)]  # 오른쪽 위가 접힌 모양
FOLD = [(0.60, 0.15), (0.76, 0.31), (0.60, 0.31)]
RIBBON = [(0.31, 0.15), (0.43, 0.15), (0.43, 0.34), (0.37, 0.28), (0.31, 0.34)]
# 레드마인 로고 느낌: 둥근 조각 7개가 아치를 이룬다 (바깥쪽 진한 빨강 -> 위쪽 밝은 빨강)
ARCH_C, ARCH_R, TILE = (0.505, 0.715), 0.172, 0.118
ARCH_COL = [(162, 0, 0), (204, 0, 0), (221, 12, 0), (227, 0, 13), (221, 12, 0), (204, 0, 0), (162, 0, 0)]
TILES = []
for k in range(7):
    a = math.pi - k * math.pi / 6
    TILES.append((ARCH_C[0] + ARCH_R * math.cos(a), ARCH_C[1] - ARCH_R * math.sin(a), a, ARCH_COL[k]))


# 2.0 배지: 흰 테두리의 남색 원 + 흰색 "2"
BADGE_C, BADGE_R = (0.735, 0.765), 0.205
TWO = [(-0.36, -0.22), (-0.2, -0.42), (0.16, -0.42), (0.36, -0.2), (0.3, 0.04), (-0.38, 0.44), (0.4, 0.44)]   # '2' 모양 선 (배지 안 좌표)


def seg_dist(x, y, a, b):
    ax, ay, bx, by = a[0], a[1], b[0], b[1]
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy or 1)))
    return math.hypot(x - (ax + t * dx), y - (ay + t * dy))


def badge_color(x, y):
    d = math.hypot(x - BADGE_C[0], y - BADGE_C[1])
    if d > BADGE_R:
        return None
    if d > BADGE_R * 0.84:
        return (255, 255, 255)
    k = BADGE_R * 0.52   # '2' 의 크기
    lx, ly = (x - BADGE_C[0]) / k, (y - BADGE_C[1]) / k
    for a, b in zip(TWO, TWO[1:]):
        if seg_dist(lx, ly, a, b) < 0.115:
            return (255, 255, 255)
    return (16, 36, 110)


def tile_color(x, y):
    for cx, cy, a, col in TILES:
        dx, dy = x - cx, y - cy
        u = dx * math.cos(a) + dy * -math.sin(a)   # 조각 방향(접선)에 맞춰 회전한 좌표
        v = dx * math.sin(a) + dy * math.cos(a)
        h = TILE / 2
        if in_rrect(u, v, -h, -h, h, h, TILE * 0.22):
            return col
    return None


def shade(x, y):
    """한 점의 색 (r,g,b,a). 안 그려진 곳은 투명."""
    if not in_rrect(x, y, 0.03, 0.03, 0.97, 0.97, 0.22):
        return (0, 0, 0, 0)
    bc = badge_color(x, y)   # 배지는 맨 위에 그린다
    if bc:
        return (*bc, 255)
    t = (x * 0.6 + y * 0.9) / 1.5
    r, g, b = lerp((98, 128, 255), (36, 56, 168), min(max(t, 0), 1))   # 배경 그라데이션
    if in_poly(x, y, PAGE):
        r, g, b = 255, 255, 255
        if in_poly(x, y, FOLD):
            r, g, b = 205, 214, 245
        col = tile_color(x, y)
        if col:
            r, g, b = col
        if in_poly(x, y, RIBBON):
            r, g, b = 255, 99, 88
    elif x > 0.255 and 0.15 < y < 0.88 and in_poly(x - 0.025, y - 0.03, PAGE):   # 노트 그림자
        r, g, b = r * 0.78, g * 0.78, b * 0.85
    return (r, g, b, 255)


def render(n, ss=4):
    rows = []
    for py in range(n):
        row = bytearray()
        for px in range(n):
            ar = ag = ab = aa = 0
            for sy in range(ss):
                for sx in range(ss):
                    r, g, b, a = shade((px + (sx + 0.5) / ss) / n, (py + (sy + 0.5) / ss) / n)
                    ar += r * a; ag += g * a; ab += b * a; aa += a
            if aa:
                row += bytes((round(ar / aa), round(ag / aa), round(ab / aa), round(aa / (ss * ss))))
            else:
                row += b"\0\0\0\0"
        rows.append(bytes(row))
    return rows


def png(rows, n):
    raw = b"".join(b"\0" + r for r in rows)
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def main():
    here = Path(__file__).parent.parent   # 프로젝트 루트에 icon.ico 를 만든다
    imgs = {n: png(render(n), n) for n in SIZES}
    (here / "icon-256.png").write_bytes(imgs[256])
    (here / "icon-64.png").write_bytes(imgs[64])
    head = struct.pack("<HHH", 0, 1, len(SIZES))
    off = 6 + 16 * len(SIZES)
    ents, data = b"", b""
    for n in SIZES:
        d = imgs[n]
        ents += struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32, len(d), off + len(data))
        data += d
    (here / "icon.ico").write_bytes(head + ents + data)
    print("icon.ico", len(head + ents + data), "bytes")


main()
