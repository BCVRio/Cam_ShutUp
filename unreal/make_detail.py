"""Write unreal/detail_normal.png: a tileable 512 x 512 micro-surface normal map (grain, pits and a faint mortar-scale
ripple) that the street materials layer over their 1024 textures at a fine tiling, so brick, slate, tarmac and
pavement keep surface detail when Cam stands next to them. DirectX convention (green down), as Unreal expects.
Standard library only:   python unreal\\make_detail.py"""
import math, os, random, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
N = 512


def png(width, height, rgb_rows):
    def chunk(tag, data): return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes(row) for row in rgb_rows)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def value_noise(n, cells, rnd):
    """Tileable value noise: a random lattice of cells x cells, smoothstep-interpolated, wrapped at the edges."""
    g = [[rnd.random() for _ in range(cells)] for _ in range(cells)]
    out = [[0.0] * n for _ in range(n)]
    for y in range(n):
        fy = y * cells / n; y0 = int(fy); ty = fy - y0; ty = ty * ty * (3 - 2 * ty); y1 = (y0 + 1) % cells
        for x in range(n):
            fx = x * cells / n; x0 = int(fx); tx = fx - x0; tx = tx * tx * (3 - 2 * tx); x1 = (x0 + 1) % cells
            a = g[y0][x0] + (g[y0][x1] - g[y0][x0]) * tx; b = g[y1][x0] + (g[y1][x1] - g[y1][x0]) * tx
            out[y][x] = a + (b - a) * ty
    return out


def height_field(seed=11):
    rnd = random.Random(seed)
    layers = [(8, 0.5), (32, 0.3), (96, 0.15), (256, 0.08)]     # cells per tile, amplitude: broad undulation down to grain
    h = [[0.0] * N for _ in range(N)]
    for cells, amp in layers:
        v = value_noise(N, cells, rnd)
        for y in range(N):
            for x in range(N): h[y][x] += amp * (v[y][x] - 0.5)
    for _ in range(900):     # small pits
        cx, cy, r, d = rnd.uniform(0, N), rnd.uniform(0, N), rnd.uniform(1.5, 5.0), rnd.uniform(0.05, 0.18)
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                dx, dy = x - cx, y - cy; q = (dx * dx + dy * dy) / (r * r)
                if q < 1: h[y % N][x % N] -= d * (1 - q) ** 2
    return h


def normal_map(h, strength=2.2):
    rows = []
    for y in range(N):
        row = []
        for x in range(N):
            dx = (h[y][(x + 1) % N] - h[y][(x - 1) % N]) * strength
            dy = (h[(y + 1) % N][x] - h[(y - 1) % N][x]) * strength
            nx, ny, nz = -dx, dy, 1.0                    # green down: +dy slopes read as facing -Y in DirectX convention
            l = math.sqrt(nx * nx + ny * ny + nz * nz); nx, ny, nz = nx / l, ny / l, nz / l
            row += [int(255 * (nx * 0.5 + 0.5)), int(255 * (ny * 0.5 + 0.5)), int(255 * (nz * 0.5 + 0.5))]
        rows.append(row)
    return png(N, N, rows)


if __name__ == '__main__':
    out = os.path.join(HERE, 'detail_normal.png')
    with open(out, 'wb') as f: f.write(normal_map(height_field()))
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')
