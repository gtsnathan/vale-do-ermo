import { RNG, Noise } from '../sim/rng.js';
import { T } from '../sim/defs.js';
import { hash } from './pix.js';

// O chão é pintado pixel a pixel a partir da grade 64×32. Assim as bordas entre
// grama, areia e água são orgânicas, sem nenhum padrão repetido de azulejo.
export const CELL_W = 1024, CELL_H = 512;
const SIZE = 256, MASK = 255;

const rgb = c => (0xff000000 | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;

function table(fn) {
  const t = new Uint32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) t[y * SIZE + x] = rgb(fn(x, y));
  return t;
}
function tiled(n, x, y, f) {
  // Amostra de ruído que fecha em 256 px.
  const u = x / SIZE, v = y / SIZE;
  const a = n.at(x * f, y * f), b = n.at((x - SIZE) * f, y * f), c = n.at(x * f, (y - SIZE) * f), d = n.at((x - SIZE) * f, (y - SIZE) * f);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function stamp(t, count, seed, painter) {
  const r = new RNG(seed);
  const put = (x, y, c) => { t[((y & MASK) << 8) | (x & MASK)] = rgb(c); };
  for (let i = 0; i < count; i++) painter(r.int(0, 255), r.int(0, 255), put, r);
}

let cache = null;
function materials() {
  if (cache) return cache;
  const n = new Noise(4242);
  const pick = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))];
  const G1 = [0x4e6e35, 0x557639, 0x5c7e3c, 0x638640, 0x6c8e45];
  const G2 = [0x47652f, 0x4d6c33, 0x547436, 0x5a7b39, 0x62843e];
  const FF = [0x3b5329, 0x41592c, 0x47602f, 0x4e6833, 0x566f37];
  const SO = [0x6b5236, 0x72593b, 0x7a6040, 0x826845, 0x6f6a3a];
  const SA = [0xb9a678, 0xc2af80, 0xcbb888, 0xd4c292, 0xdbc99a];
  const RK = [0x55555c, 0x5f5f65, 0x69696e, 0x737377];
  const field = (pal, f, seed, grain) => table((x, y) => {
    const v = tiled(n, x + seed, y + seed * 3, f) * 0.72 + hash(x >> 1, y, seed) * grain + 0.12 - grain / 2;
    return pick(pal, (v - 0.15) * 1.5);
  });
  const grassA = field(G1, 1 / 26, 9, 0.28), grassB = field(G2, 1 / 22, 31, 0.28), floor = field(FF, 1 / 16, 51, 0.3), soil = field(SO, 1 / 13, 71, 0.34), sand = field(SA, 1 / 18, 91, 0.22), rock = field(RK, 1 / 11, 111, 0.36);
  const blades = (t, count, seed, lightC, darkC) => stamp(t, count, seed, (x, y, put, r) => {
    const h = r.int(2, 4), lean = r.chance(0.5) ? 1 : -1;
    for (let i = 0; i < h; i++) put(x + (i > 1 ? lean : 0), y - i, i === h - 1 ? lightC : darkC);
  });
  blades(grassA, 2300, 3, 0x83a452, 0x4a6a33);
  blades(grassB, 2300, 4, 0x77984b, 0x42602d);
  blades(floor, 1300, 5, 0x5e7a3a, 0x324824);
  // Flores miúdas e folhas no chão: detalhe que só se vê de perto.
  stamp(grassA, 140, 6, (x, y, put, r) => { const c = r.pick([0xe6d77b, 0xd8d8e8, 0xc97d9a]); put(x, y, c); put(x + 1, y, c); put(x, y + 1, 0x3f5a2b); });
  stamp(floor, 340, 7, (x, y, put, r) => { const c = r.pick([0x7a6a34, 0x6b5526, 0x8a7a3a]); put(x, y, c); put(x + 1, y, c); });
  stamp(soil, 800, 8, (x, y, put) => { put(x, y, 0x4e3d29); put(x + 1, y, 0x93784f); });
  stamp(sand, 420, 9, (x, y, put, r) => { const c = r.pick([0xa39268, 0xe4d5ac, 0x8f8a7a]); put(x, y, c); });
  stamp(rock, 700, 10, (x, y, put) => { put(x, y, 0x3f3f46); put(x + 1, y, 0x3f3f46); put(x + 1, y + 1, 0x85858a); });

  const wave = (deep) => table((x, y) => {
    const v = tiled(n, x + 400, y + 200, 1 / 30);
    const c = deep
      ? (v < 0.4 ? 0x24495f : v < 0.55 ? 0x284f66 : 0x2d566d)
      : (v < 0.4 ? 0x3f7a84 : v < 0.55 ? 0x47838b : 0x508c92);
    return c;
  });
  const deep = wave(true), shallow = wave(false);
  const dashes = (t, count, seed, c) => stamp(t, count, seed, (x, y, put, r) => {
    const l = r.int(4, 13);
    for (let i = 0; i < l; i++) put(x + i, y + (i >> 1), c);
  });
  dashes(deep, 420, 12, 0x3a6a80);
  dashes(deep, 90, 13, 0x5b8aa0);
  dashes(shallow, 300, 14, 0x74aeb0);
  const ford = table((x, y) => (tiled(n, x + 90, y + 10, 1 / 20) < 0.5 ? 0x6a9288 : 0x769d90));
  stamp(ford, 1200, 15, (x, y, put, r) => { const c = r.pick([0x8a8678, 0x9d9988, 0x6f6c60]); put(x, y, c); put(x + 1, y, c); put(x, y + 1, c); put(x + 1, y + 1, 0x565447); });
  dashes(ford, 240, 16, 0xa8cdc8);

  // Dois campos de ruído para tremer as bordas entre terrenos.
  const j1 = new Float32Array(SIZE * SIZE), j2 = new Float32Array(SIZE * SIZE), macro = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    j1[y * SIZE + x] = (tiled(n, x + 7, y + 3, 1 / 15) - 0.5) * 1.25 + (hash(x >> 1, y >> 1, 81) - 0.5) * 0.25;
    j2[y * SIZE + x] = (tiled(n, x + 77, y + 33, 1 / 15) - 0.5) * 1.25 + (hash(x >> 1, y >> 1, 82) - 0.5) * 0.25;
    macro[y * SIZE + x] = tiled(n, x + 170, y + 90, 1 / 42);
  }
  cache = { grassA, grassB, floor, soil, sand, rock, deep, shallow, ford, j1, j2, macro };
  return cache;
}

export function bakeCell(world, cx, cy, out, W, H) {
  const M = materials();
  const { terrain, forest, shore, w, h } = world;
  const VOID = rgb(0x12171a);
  const sx0 = cx * CELL_W, sy0 = cy * CELL_H;
  for (let py = 0; py < H; py++) {
    const sy = sy0 + py;
    for (let px = 0; px < W; px++) {
      const sx = sx0 + px;
      const a = sx / 32, b = sy / 16;
      const u = (b + a) / 2, v = (b - a) / 2;
      const o = py * W + px;
      if (u < -0.02 || v < -0.02 || u >= w + 0.02 || v >= h + 0.02) { out[o] = VOID; continue; }
      const qx = sx & MASK, qy = sy & MASK, q = (qy << 8) | qx;
      const tx = Math.max(0, Math.min(w - 1, Math.floor(u + M.j1[q]))), ty = Math.max(0, Math.min(h - 1, Math.floor(v + M.j2[q])));
      const i = ty * w + tx, t = terrain[i], sh = shore[i];
      let col;
      if (t === T.WATER) col = sh <= -2 ? M.deep[q] : M.shallow[q];
      else if (t === T.FORD) col = M.ford[q];
      else if (t === T.MOUNTAIN) col = M.rock[q];
      else if (sh === 1) col = M.sand[q];
      else if (t === T.FERTILE) col = M.soil[q];
      else if (forest[i]) col = M.floor[q];
      else col = M.macro[q] > 0.5 ? M.grassA[q] : M.grassB[q];
      out[o] = col;
    }
  }
}
