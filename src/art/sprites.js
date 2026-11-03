import { Pix, hash, shade, mix, projector } from './pix.js';

// Biblioteca de sprites originais. Cada função devolve um Pix com ponto de ancoragem (ox, oy).
const SHADOW = 0x10131f;

const levels = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))];

/* ---------- Árvores ---------- */
const PINE = [0x1c3a2f, 0x234634, 0x2c5539, 0x37663e, 0x4a7a45, 0x668f50];
const OAK = [0x2f4a22, 0x3a5a27, 0x4a6e2c, 0x5e8333, 0x7a9a3f, 0x98b052];
const BIRCH = [0x4a6a2b, 0x5e8032, 0x76953a, 0x90aa45, 0xacbf58, 0xc8d070];

function groundShadow(p, cx, cy, rx, ry) {
  p.ellipse(cx + rx * 0.35, cy, rx, ry, (u, v) => SHADOW, 62);
  p.ellipse(cx + rx * 0.2, cy, rx * 0.65, ry * 0.65, SHADOW, 50);
}
function trunk(p, cx, base, h, w, col, dark) {
  for (let y = 0; y < h; y++) {
    const flare = y < 2 ? 1 : 0;
    for (let x = -w - flare; x <= w + flare; x++) {
      const light = x < 0 ? shade(col, 1.15) : x > 0 ? dark : col;
      p.set(cx + x, base - y, hash(x, y, 3) > 0.82 ? dark : light);
    }
  }
}
function pine(v) {
  const p = new Pix(52, 86, 26, 80), seed = v * 7 + 1;
  groundShadow(p, 26, 79, 17, 6);
  trunk(p, 26, 80, 15, 1, 0x5a4230, 0x3a2a22);
  const tiers = 4 + (v % 2), H = 58 + v * 3;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const top = 80 - 12 - H + f * (H * 0.62), bottom = top + H * (0.34 + 0.08 * f);
    const R = 7 + f * 12;
    for (let y = Math.floor(top); y <= bottom; y++) {
      const k = (y - top) / (bottom - top);
      const edge = R * Math.pow(k, 0.85);
      for (let x = -Math.ceil(edge) - 1; x <= edge + 1; x++) {
        const jag = (hash(x, y >> 1, seed) - 0.5) * 3 * k;
        if (Math.abs(x) > edge + jag) continue;
        const nx = x / Math.max(edge, 1);
        let l = 0.62 - nx * 0.42 - k * 0.3 + (1 - f) * 0.1;
        if (hash(x >> 1, y, seed + 5) > 0.72) l -= 0.14;
        if (hash(x, y, seed + 2) > 0.92) l += 0.17;
        p.set(26 + x, y, levels(PINE, l));
      }
    }
  }
  return p.outline(0x10201c, 130);
}
function blob(p, circles, pal, seed) {
  // Copa por esferas: cada pixel usa a normal da esfera de cima e vira um tom da paleta.
  for (const [cx, cy, r] of circles) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, dd = nx * nx + ny * ny;
      const rough = (hash(x >> 1, y >> 1, seed) - 0.5) * 0.3;
      if (dd > 1 + rough) continue;
      let l = 0.55 - nx * 0.32 - ny * 0.42;
      const q = hash(x >> 1, y >> 1, seed + 3);
      if (q > 0.78) l -= 0.14; else if (q < 0.1) l += 0.16;
      p.set(x, y, levels(pal, l));
    }
  }
}
function oak(v) {
  const p = new Pix(64, 76, 32, 70), s = v * 11 + 3;
  groundShadow(p, 32, 69, 22, 8);
  trunk(p, 32, 70, 25, 2, 0x5b4432, 0x38291f);
  p.line(32, 50, 23, 38, 0x4a3628); p.line(32, 50, 41, 39, 0x4a3628);
  const offs = [[-10, 32, 11], [10, 33, 11], [0, 37, 13], [-5, 22, 11], [7, 21, 11], [0, 14, 10], [-14, 26, 7], [14, 26, 7]];
  blob(p, offs.map(([x, y, r], i) => [32 + x + (hash(i, v, 1) - 0.5) * 4, y + 4 + (hash(i, v, 2) - 0.5) * 3, r + v % 2]), OAK, s);
  return p.outline(0x151f12, 130);
}
function birch(v) {
  const p = new Pix(48, 78, 24, 72), s = v * 13 + 9;
  groundShadow(p, 24, 71, 15, 5);
  for (let y = 0; y < 44; y++) for (let x = -1; x <= 1; x++) {
    const stripe = hash(y >> 1, x > 0 ? 1 : 0, 44 + v) > 0.74;
    p.set(24 + x, 72 - y, stripe ? 0x2c2a2a : x < 0 ? 0xe8e4d6 : x > 0 ? 0xa6a194 : 0xcfcabb);
  }
  const offs = [[-5, 28, 9], [6, 27, 9], [0, 18, 10], [-3, 9, 7], [4, 11, 7], [-8, 36, 5], [8, 36, 5]];
  blob(p, offs.map(([x, y, r], i) => [24 + x + (hash(i, v, 5) - 0.5) * 3, y, r]), BIRCH, s);
  return p.outline(0x20280f, 120);
}
export function stump(kind) {
  const p = new Pix(24, 16, 12, 12);
  p.ellipse(13, 12, 9, 3, SHADOW, 60);
  const bark = kind === 2 ? 0xcfcabb : 0x503a2a;
  p.rect(8, 7, 8, 5, bark);
  p.rect(8, 7, 2, 5, shade(bark, 1.2));
  p.rect(14, 7, 2, 5, shade(bark, 0.7));
  p.ellipse(12, 7, 4.5, 2.2, (u, v) => (u * u + v * v < 0.3 ? 0xc99d62 : 0xb08450));
  return p.outline(0x1a1411, 120);
}

/* ---------- Rochas ---------- */
const STONE = [0x4a4c56, 0x5c5f69, 0x6f727b, 0x878a90, 0xa2a4a6, 0xbfc0bc];
const IRON = [0x362d31, 0x4a3a39, 0x5d4641, 0x76544a, 0x8a6653, 0x9d7a60];
function rock(v, pal, flecks) {
  const p = new Pix(64, 52, 32, 40), s = v * 5 + (flecks ? 90 : 20);
  p.ellipse(34, 39, 25, 9, SHADOW, 60);
  const cs = [[-13, 32, 10], [12, 33, 11], [0, 26, 15], [-7, 18, 9], [8, 18, 8], [-1, 35, 12]];
  for (const [i, [x, y, r]] of cs.entries()) {
    const cx = 32 + x + (hash(i, v, 8) - 0.5) * 5, cy = y + 2 + (hash(i, v, 9) - 0.5) * 4, R = r + (hash(i, v, 7)) * 2;
    for (let py = Math.floor(cy - R); py <= cy + R; py++) for (let px = Math.floor(cx - R); px <= cx + R; px++) {
      const nx = (px + 0.5 - cx) / R, ny = (py + 0.5 - cy) / R;
      if (nx * nx + ny * ny > 1) continue;
      if (py > 41) continue;
      // Facetas: quantiza a normal para parecer rocha lascada, não bolha.
      const fx = Math.round(nx * 3) / 3, fy = Math.round(ny * 3) / 3;
      let l = 0.56 - fx * 0.38 - fy * 0.42 + (hash(Math.round(nx * 3), Math.round(ny * 3), s + i) - 0.5) * 0.2;
      if (hash(px, py, s) > 0.93) l -= 0.15;
      let col = levels(pal, l);
      if (flecks && hash(px >> 1, py >> 1, s + 1) > 0.76) col = hash(px, py, 4) > 0.5 ? 0xc0713c : 0xa2522f;
      p.set(px, py, col);
    }
  }
  return p.outline(0x171519, 150);
}

/* ---------- Montanha (blocos em degraus) ---------- */
const CLIFF = [0x3b3c48, 0x4a4b57, 0x585966, 0x696a75];
export const MT_H = [18, 32, 46, 62, 80, 98];
export function mountainBlock(H, variant, level) {
  const EXTRA = 14, p = new Pix(68, 40 + H + EXTRA, 34, H + 2);
  const P = projector(34, H + 2);
  const seed = variant * 17 + H;
  const snowy = level >= 4;
  const strata = (light, skew, sd) => (u, v, x, y) => {
    const band = Math.floor((v + hash(u >> 3, 1, sd) * 5) / 6);
    const n = hash(x >> 2, band + (skew * x >> 3), sd) * 0.6 + hash(x, y, sd + 1) * 0.4;
    let col = CLIFF[Math.floor(n * 3.99)];
    if (hash(x >> 1, band, sd + 2) > 0.86) col = shade(col, 0.68);
    if (snowy && v < 6 + hash(x >> 1, 3, sd) * 16) col = hash(x, y, sd) > 0.2 ? 0xdfe6ec : 0xbcc7d4;
    else if (level === 0 && v > H - 8 && hash(x >> 1, y >> 1, sd) > 0.6) col = 0x4d6a38;
    return shade(col, light);
  };
  const a = P(0, 1, H), b = P(1, 1, H), e = P(0, 0, H);
  const faceL = strata(1.22, 1, seed), faceR = strata(0.76, -1, seed + 4);
  p.plane(a, [32, 16], [0, H + 1 + EXTRA], (s, t, u, v, x, y) => faceL(u, v, x, y));
  p.plane(b, [32, -16], [0, H + 1 + EXTRA], (s, t, u, v, x, y) => faceR(u, v, x, y));
  const tone = 0.9 + hash(variant, H, 3) * 0.22;
  p.plane(e, [32, 16], [-32, 16], (s, t, u, v, x, y) => {
    const n = hash(x >> 1, y >> 1, seed + 8), q = hash(x >> 3, y >> 2, seed + 9);
    const rim = Math.max(s, t) > 0.93;
    if (snowy) {
      if (q > 0.86 && level === 4) return n > 0.5 ? 0x70717a : 0x85868c;
      return rim ? 0xffffff : n > 0.82 ? 0xc6d0dc : n > 0.25 ? 0xe2e8ee : 0xf1f4f6;
    }
    let c = n > 0.72 ? 0x62636c : n > 0.3 ? 0x74757c : 0x868686;
    if (level <= 1 && q > 0.62) c = n > 0.5 ? 0x56713f : 0x65814a;
    if (q < 0.09) c = 0x484952;
    return shade(rim ? shade(c, 1.2) : c, tone);
  });
  return p.trim();
}

/* ---------- Pilhas e cargas ---------- */
function logStack(n) {
  const p = new Pix(44, 30, 22, 20);
  p.ellipse(23, 21, 15, 6, SHADOW, 55);
  const rows = n <= 2 ? [[0, 2, n]] : n <= 5 ? [[0, 3, 3], [8, 0, n - 3]] : [[0, 4, 3], [7, 1, 3], [14, 0, n - 6]];
  rows.forEach(([z, off, cnt]) => {
    for (let i = 0; i < cnt; i++) {
      const ox = 14 - i * 6 + off, oy = 17 - z + i * 3 - cnt;
      p.plane([ox, oy], [13, 6.5], [0, 5], (s, t, u, v) => v < 1 ? 0x8e6a45 : v > 3.6 ? 0x4a3425 : hash(u, i, 3) > 0.8 ? 0x5a412d : 0x70533a);
      p.ellipse(ox + 13.5, oy + 8.8, 2.4, 2.8, (u, v) => (u * u + v * v < 0.28 ? 0xcea56b : 0xb48a56));
    }
  });
  return p.outline(0x1a1411, 120);
}
function heap(pal, n, seed, flecks) {
  const p = new Pix(36, 26, 18, 18);
  p.ellipse(19, 19, 12, 5, SHADOW, 55);
  const count = 2 + n * 2;
  for (let i = 0; i < count; i++) {
    const a = hash(i, 1, seed) * 6.28, d = hash(i, 2, seed) * (3 + n * 1.5);
    const x = 18 + Math.cos(a) * d * 1.5, y = 18 - i * (0.6 + n * 0.16) + Math.sin(a) * d * 0.5, r = 2.6 + hash(i, 3, seed) * 1.6;
    p.ellipse(x, y, r, r * 0.85, (u, v, px, py) => {
      let c = levels(pal, 0.55 - u * 0.35 - v * 0.42);
      if (flecks && hash(px, py, seed) > 0.72) c = 0xb9643a;
      return c;
    });
  }
  return p.outline(0x171519, 130);
}
function carried(res) {
  const p = new Pix(14, 10, 7, 8);
  if (res === 'wood') {
    p.plane([1, 4], [11, -3], [0, 3], (s, t, u, v) => (v < 1 ? 0x8e6a45 : 0x64492f));
    p.ellipse(1.5, 5.5, 1.5, 1.8, 0xcea56b);
    p.plane([2, 1], [10, -1], [0, 2], (s, t, u, v) => (v < 1 ? 0x9a7650 : 0x6b4f33));
  } else {
    p.ellipse(7, 5, 4.5, 3.4, (u, v, x, y) => (res === 'iron' && hash(x, y, 7) > 0.6 ? 0xb9643a : levels(res === 'iron' ? IRON : STONE, 0.6 - u * 0.3 - v * 0.4)));
  }
  return p.outline(0x171519, 140);
}

/* ---------- Aldeões ---------- */
const TUNICS = [[0x6d4a35, 0x8a6246], [0x4a5f70, 0x617b8e], [0x75663a, 0x94834d], [0x7f3f35, 0xa35445], [0x4f6647, 0x69855e], [0x5b4a6d, 0x77638d]];
const SKINS = [0xe2b48c, 0xc99671, 0xa97453];
const HAIRS = [0x2c221c, 0x5e3d24, 0x8a6a3a, 0x3a2c2a];
export function citizenFrame(look, dir, frame) {
  const p = new Pix(22, 28, 11, 25);
  const female = look >= 3;
  const [dark, light] = TUNICS[look % TUNICS.length];
  const skin = SKINS[look % 3], hair = HAIRS[(look * 3 + 1) % 4];
  const back = dir === 'b';
  p.ellipse(12, 25, 5, 2, SHADOW, 80);
  const walk = frame.startsWith('w') ? +frame[1] : -1;
  const work = frame.startsWith('t') ? +frame[1] : -1;
  const sit = frame === 's';
  const bob = walk === 1 || walk === 3 ? -1 : sit ? 3 : 0;
  const swing = walk === 0 ? 1 : walk === 2 ? -1 : 0;
  const by = 24 + bob;
  // Pernas
  if (!sit) {
    const legC = 0x3a3028, shoe = 0x241c18;
    const ly = female ? 2 : 4;
    for (let i = 0; i < ly; i++) {
      p.set(9 - (i > 1 ? swing : 0), 24 - i, i === 0 ? shoe : legC);
      p.set(10 - (i > 1 ? swing : 0), 24 - i, i === 0 ? shoe : legC);
      p.set(12 + (i > 1 ? swing : 0), 24 - i, i === 0 ? shoe : legC);
      p.set(13 + (i > 1 ? swing : 0), 24 - i, i === 0 ? shoe : legC);
    }
  }
  // Corpo
  const top = by - 14, bottom = female ? by - 1 : by - 3;
  for (let y = top; y <= bottom; y++) {
    const widen = female ? Math.floor((y - top) / 5) : y > top + 7 ? 1 : 0;
    for (let x = 8 - widen; x <= 14 + widen; x++) {
      const edge = x <= 8 - widen ? light : x >= 14 + widen ? shade(dark, 0.72) : (x + y) % 5 === 0 ? shade(dark, 0.9) : dark;
      p.set(x, y, edge);
    }
  }
  if (!female) { p.rect(8, top + 7, 7, 1, 0x2c2019); p.set(11, top + 7, 0xb99a58); }
  else if (!back) p.rect(9, top + 3, 5, 6, 0xcbbf9f);
  // Braços e ferramenta
  if (work >= 0) {
    const up = work === 0;
    const ax = 15, ay = top + (up ? -2 : 5);
    p.rect(14, top + 1, 2, up ? 3 : 5, dark);
    p.rect(ax, ay, 2, 2, skin);
    const tx = up ? 16 : 18, ty = up ? ay - 6 : ay - 1;
    p.line(ax + 1, ay, tx, ty, 0x7a5a3c);
    p.rect(tx - 1, ty - 1, 3, 3, 0x9a9da3);
    p.set(tx - 1, ty - 1, 0xd4d6d8);
  } else {
    p.rect(7, top + 1 - (swing > 0 ? 1 : 0), 2, 7, shade(dark, 1.15));
    p.set(7, top + 8 - (swing > 0 ? 1 : 0), skin);
    p.rect(15, top + 1 + (swing > 0 ? 1 : 0), 2, 7, shade(dark, 0.78));
    p.set(16, top + 8 + (swing > 0 ? 1 : 0), skin);
  }
  // Cabeça
  const hy = top - 7;
  p.rect(9, hy + 1, 6, 6, back ? hair : skin);
  p.rect(10, hy, 4, 1, back ? hair : skin);
  if (female) {
    const scarf = 0xd8cfb6;
    p.rect(9, hy, 6, 2, scarf); p.rect(8, hy + 1, 1, 6, shade(scarf, 0.9)); p.rect(15, hy + 1, 1, 6, shade(scarf, 0.75));
    if (back) p.rect(9, hy + 2, 6, 5, scarf);
  } else {
    p.rect(9, hy, 6, 2, hair); p.rect(8, hy + 1, 1, 3, hair); p.rect(15, hy + 1, 1, 3, hair);
    if ((look + 1) % 3 === 0 && !back) p.rect(10, hy + 5, 4, 2, hair);
  }
  if (!back) { p.set(10, hy + 3, 0x241a18); p.set(13, hy + 3, 0x241a18); }
  return p.outline(0x14100f, 170);
}

/* ---------- Texturas de construção ---------- */
const LOG = [0x5a402b, 0x6d4e34, 0x80603f, 0x936f4a];
const logWall = (light, seed) => (s, t, u, v, x, y) => {
  const row = Math.floor(v / 5), rv = v % 5;
  const base = LOG[Math.floor(hash(row, Math.floor(u / 18), seed) * 3.99)];
  let c = rv < 1 ? shade(base, 1.22) : rv >= 4 ? 0x2f2219 : base;
  if (hash(x, y, seed + 2) > 0.94) c = shade(c, 0.85);
  return shade(c, light);
};
const thatch = (light, seed) => (s, t, u, v, x, y) => {
  const row = Math.floor(v / 4);
  const n = hash(Math.floor((u + row * 3) / 2), row, seed);
  const base = n > 0.72 ? 0xb99a55 : n > 0.3 ? 0xa2843f : 0x8a6f34;
  let c = v % 4 < 1 ? shade(base, 0.72) : base;
  c = mix(c, 0x6a5a30, t * 0.18);
  return shade(c, light);
};
const STAKE = 0x8a6a45;
function dirtPad(p, P, w, h) {
  const A = P(-0.1, -0.1), B = P(w + 0.1, -0.1), D = P(-0.1, h + 0.1);
  const vecA = [B[0] - A[0], B[1] - A[1]], vecB = [D[0] - A[0], D[1] - A[1]];
  p.plane(A, vecA, vecB, (s, t, u, v, x, y) => {
    const edge = Math.min(s, 1 - s, t, 1 - t) * 40;
    if (edge < 2.5 && hash(x >> 1, y >> 1, 3) < 0.5) return null;
    const q = hash(x >> 1, y, 2);
    return q > 0.78 ? 0x7e6647 : q > 0.25 ? 0x6e583c : 0x5f4b33;
  });
}
function post(p, P, x, y, z0, z1, c = STAKE) {
  const [sx, sy0] = P(x, y, z0), [, sy1] = P(x, y, z1);
  for (let yy = Math.round(sy1); yy <= sy0; yy++) { p.set(sx, yy, shade(c, 1.15)); p.set(sx + 1, yy, shade(c, 0.7)); }
}
function beam(p, P, a, b, c = 0x6d4e34) {
  const A = P(...a), B = P(...b);
  p.line(A[0], A[1], B[0], B[1], shade(c, 1.1));
  p.line(A[0], A[1] + 1, B[0], B[1] + 1, shade(c, 0.7));
}

// Casa: rotação define onde fica a porta. stage 0 a 4 mostra a obra evoluindo.
const planks = (light, seed) => (s, t, u, v, x, y) => {
  const b = Math.floor(u / 6);
  let c = [0x7a3f2c, 0x83462f, 0x703827][Math.floor(hash(b, 2, seed) * 2.99)];
  if (u % 6 < 1) c = 0x3a2017;
  if (hash(x, y, seed) > 0.95) c = shade(c, 0.85);
  return shade(c, light);
};
const shingle = (light, seed) => (s, t, u, v) => {
  const row = Math.floor(v / 5), n = hash(Math.floor((u + row * 4) / 7), row, seed);
  const base = n > 0.65 ? 0x5e6068 : n > 0.3 ? 0x50525b : 0x45474f;
  return shade(v % 5 < 1 ? shade(base, 0.62) : base, light);
};
const mossThatch = (light, seed) => (s, t, u, v, x, y) => {
  const row = Math.floor(v / 4), n = hash(Math.floor((u + row * 3) / 2), row, seed);
  const base = n > 0.7 ? 0x7c8a4a : n > 0.3 ? 0x687a3d : 0x566631;
  return shade(v % 4 < 1 ? shade(base, 0.7) : base, light);
};
const STYLES = {
  house: { T: 2, ox: 80, oy: 98, W: 160, Hh: 176, H: 30, R: 30, wall: logWall, roof: thatch, doorW: 11, doorH: 21, chimney: true, win: true },
  barn: { T: 3, ox: 112, oy: 122, W: 224, Hh: 236, H: 42, R: 42, wall: planks, roof: shingle, doorW: 26, doorH: 32, chimney: false, win: false },
  gatherer: { T: 2, ox: 80, oy: 90, W: 160, Hh: 168, H: 22, R: 24, wall: logWall, roof: mossThatch, doorW: 12, doorH: 17, chimney: false, win: false },
};
function house(rot, stage, style = 'house') {
  const o = STYLES[style];
  const wT = o.T, hT = o.T, ox = o.ox, oy = o.oy;
  const p = new Pix(o.W, o.Hh, ox, oy), glow = new Pix(o.W, o.Hh, ox, oy);
  const P = projector(ox, oy);
  const I = 0.2, x0 = I, y0 = I, x1 = wT - I, y1 = hT - I;
  const H = o.H, R = o.R, E = 0.2;
  dirtPad(p, P, wT, hT);
  const ridgeX = rot % 2 === 0;
  const doorOnLeft = rot === 0, doorOnRight = rot === 1;

  const s0 = P(x1 + 0.9, y1 + 0.2);
  if (stage >= 2) {
    p.poly([P(x0, y1), P(x1, y1), P(x1, y0), [s0[0] + 16, s0[1] - 18], [s0[0], s0[1] + 6]], SHADOW, 55);
  }
  if (stage === 0) {
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, y1], [x1, (y0 + y1) / 2]]) post(p, P, x, y, 0, 9);
    beam(p, P, [x0, y1, 1], [x1, y1, 1], 0x8a7a55); beam(p, P, [x1, y1, 1], [x1, y0, 1], 0x8a7a55);
    return { p: p.outline(0x1a1411, 70) };
  }
  if (stage === 1) {
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, y1], [x1, (y0 + y1) / 2], [(x0 + x1) / 2, y0], [x0, (y0 + y1) / 2]]) post(p, P, x, y, 0, H);
    for (const [a, b] of [[[x0, y1, H], [x1, y1, H]], [[x1, y1, H], [x1, y0, H]], [[x0, y0, H], [x1, y0, H]], [[x0, y0, H], [x0, y1, H]], [[x0, y1, 12], [x1, y1, 12]], [[x1, y1, 12], [x1, y0, 12]]]) beam(p, P, a, b);
    return { p: p.outline(0x1a1411, 90) };
  }

  const wallH = stage === 2 ? 16 : H;
  const leftLen = 32 * (x1 - x0), rightLen = 32 * (y1 - y0);
  const doorW = o.doorW, doorH = o.doorH, winW = 10, winH = 9;
  const wallFn = (base, hasDoor, light, seed) => (s, t, u, v, x, y) => {
    const len = base;
    const uu = s * len, vv = t * H;
    if (hasDoor && stage >= 3) {
      const d0 = len / 2 - doorW / 2;
      if (uu >= d0 - 1 && uu <= d0 + doorW + 1 && vv <= doorH + 1) {
        if (uu < d0 || uu > d0 + doorW || vv > doorH) return shade(0x3c2a1c, light);
        const pl = Math.floor((uu - d0) / 3.5);
        let c = pl % 2 ? 0x4a3020 : 0x583a26;
        if (Math.abs(vv - 7) < 0.8 || Math.abs(vv - 16) < 0.8) c = 0x2b2622;
        return shade(c, light);
      }
    } else if (stage >= 3 && o.win) {
      const cx = len / 2;
      if (Math.abs(uu - cx) <= winW / 2 + 1 && vv >= 11 && vv <= 12 + winH) {
        if (Math.abs(uu - cx) > winW / 2 || vv < 12 || vv > 11 + winH) return shade(0x3c2a1c, light);
        glow.set(x, y, Math.abs(uu - cx) < 0.8 || Math.abs(vv - 16) < 0.6 ? 0x3c2a1c : 0xffd38a);
        if (Math.abs(uu - cx) < 0.8 || Math.abs(vv - 16) < 0.6) return shade(0x3c2a1c, light);
        return shade(0x1e2730, light * 1.1);
      }
    }
    return o.wall(light, seed)(s, t, u, H - vv, x, y);
  };
  const orig = (vec) => vec;
  // Face esquerda (y=y1) e direita (x=x1), de baixo para cima.
  const FL = P(x0, y1, wallH), FR = P(x1, y1, wallH);
  p.plane(FL, [leftLen, leftLen / 2], [0, wallH], (s, t, u, v, x, y) => wallFn(leftLen, doorOnLeft, 1.08, 3)(s, 1 - t, u, v, x, y));
  p.plane(FR, [rightLen, -rightLen / 2], [0, wallH], (s, t, u, v, x, y) => wallFn(rightLen, doorOnRight, 0.74, 7)(s, 1 - t, u, v, x, y));
  void orig;
  // Pedras da base
  for (let i = 0; i <= leftLen; i += 1) {
    const a = P(x0 + i / 32, y1, 0);
    const skip = doorOnLeft && Math.abs(i - leftLen / 2) < doorW / 2;
    if (!skip) for (let k = 0; k < 3; k++) p.set(a[0], a[1] - k, hash(i >> 2, k, 4) > 0.45 ? 0x7c7a74 : 0x5c5a56);
  }
  for (let i = 0; i <= rightLen; i += 1) {
    const a = P(x1, y1 - i / 32, 0);
    const skip = doorOnRight && Math.abs(i - rightLen / 2) < doorW / 2;
    if (!skip) for (let k = 0; k < 3; k++) p.set(a[0], a[1] - k, hash(i >> 2, k, 5) > 0.45 ? 0x5e5c58 : 0x45433f);
  }
  if (stage === 2) return { p: p.outline(0x1a1411, 110) };

  // Empena triangular e telhado
  const midY = (y0 + y1) / 2, midX = (x0 + x1) / 2;
  if (ridgeX) {
    p.poly([P(x1, y1, H), P(x1, y0, H), P(x1, midY, H + R)], (x, y) => (style === 'barn' ? (hash(x >> 2, 1, 3) > 0.5 ? 0x5c3022 : 0x53291c) : hash(x, y >> 2, 3) > 0.5 ? 0x6b5038 : 0x5d4530));
  } else {
    p.poly([P(x0, y1, H), P(x1, y1, H), P(midX, y1, H + R)], (x, y) => (style === 'barn' ? (hash(x >> 2, 1, 4) > 0.5 ? 0x8a4a33 : 0x7d4230) : hash(x, y >> 2, 4) > 0.5 ? 0x967352 : 0x866547));
  }
  const roofStage3 = stage === 3;
  const rafter = (light) => (s, t, u, v) => (u % 12 < 2 || v % 11 < 1.2 ? shade(0x856545, light) : null);
  const plane = (a, b, c, fn) => p.plane(a, [b[0] - a[0], b[1] - a[1]], [c[0] - a[0], c[1] - a[1]], fn);
  let chimneyBase;
  if (ridgeX) {
    // Lado de trás, depois lado da frente.
    plane(P(x0 - E, midY, H + R), P(x1 + E, midY, H + R), P(x0 - E, y0 - E, H - 3), roofStage3 ? rafter(0.8) : o.roof(0.72, 2));
    plane(P(x0 - E, midY, H + R), P(x1 + E, midY, H + R), P(x0 - E, y1 + E, H - 3), roofStage3 ? rafter(1.05) : o.roof(1.1, 5));
    chimneyBase = [x1 - 0.42, midY - 0.2];
  } else {
    plane(P(midX, y0 - E, H + R), P(midX, y1 + E, H + R), P(x0 - E, y0 - E, H - 3), roofStage3 ? rafter(1.0) : o.roof(1.02, 6));
    plane(P(midX, y0 - E, H + R), P(midX, y1 + E, H + R), P(x1 + E, y0 - E, H - 3), roofStage3 ? rafter(0.72) : o.roof(0.76, 8));
    chimneyBase = [midX - 0.2, y0 + 0.4];
  }
  let smoke = null;
  if (stage === 4 && o.chimney) {
    const [cx, cy] = chimneyBase;
    const zb = H + R - 16, zt = H + R + 11, c = 0.13;
    const a0 = P(cx - c, cy + c, zt), b0 = P(cx + c, cy + c, zt), c0 = P(cx + c, cy - c, zt);
    const stoneFn = (l) => (s, t, u, v, x, y) => shade(hash(x >> 1, y >> 1, 11) > 0.5 ? 0x8a8780 : 0x6f6c66, l);
    p.plane(a0, [b0[0] - a0[0], b0[1] - a0[1]], [0, zt - zb], stoneFn(1.05));
    p.plane(b0, [c0[0] - b0[0], c0[1] - b0[1]], [0, zt - zb], stoneFn(0.68));
    p.poly([a0, b0, c0, P(cx - c, cy - c, zt)], 0x25201d);
    smoke = P(cx, cy, zt + 2);
  }
  return { p: p.outline(0x1a1411, 130), glow, smoke };
}

// Depósito: pátio cercado com um telheiro no fundo.
function depot(rot, stage) {
  const T_ = 3, ox = 112, oy = 76;
  const p = new Pix(224, 200, ox, oy);
  const P = projector(ox, oy);
  dirtPad(p, P, T_, T_);
  const I = 0.12, a = I, b = T_ - I;
  const door = rot === 0 ? 'y1' : rot === 1 ? 'x1' : rot === 2 ? 'y0' : 'x0';
  const fence = (from, to, side, zTop) => {
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      if (side === door && Math.abs(f - 0.5) < 0.17) continue;
      const x = from[0] + (to[0] - from[0]) * f, y = from[1] + (to[1] - from[1]) * f;
      post(p, P, x, y, 0, zTop);
    }
    if (stage >= 3) {
      for (const z of [zTop - 3, 6]) {
        if (side === door) {
          const m0 = 0.33, m1 = 0.67;
          beam(p, P, [from[0], from[1], z], [from[0] + (to[0] - from[0]) * m0, from[1] + (to[1] - from[1]) * m0, z]);
          beam(p, P, [from[0] + (to[0] - from[0]) * m1, from[1] + (to[1] - from[1]) * m1, z], [to[0], to[1], z]);
        } else beam(p, P, [from[0], from[1], z], [to[0], to[1], z]);
      }
    }
  };
  const lean = () => {
    const c = 1.15, H = 28;
    const pole = (x, y) => post(p, P, x, y, 0, H, 0x5d4530);
    pole(a + 0.05, a + 0.05); pole(a + c, a + 0.05); pole(a + 0.05, a + c); pole(a + c, a + c);
    if (stage < 4) return;
    const O = P(a - 0.15, a - 0.15, H + 12), A = P(a + c + 0.2, a - 0.15, H + 4), B = P(a - 0.15, a + c + 0.2, H + 4);
    const C = [A[0] + B[0] - O[0], A[1] + B[1] - O[1] + 8];
    p.poly([O, A, C, B], (x, y) => {
      const row = (y + (x >> 1)) >> 2;
      const n = hash(x >> 2, row, 5);
      const base = n > 0.6 ? 0x7b6a58 : n > 0.3 ? 0x6b5a48 : 0x5c4c3c;
      return (y + (x >> 1)) % 4 === 0 ? shade(base, 0.72) : base;
    });
  };
  if (stage === 0) {
    for (const [x, y] of [[a, a], [b, a], [b, b], [a, b]]) post(p, P, x, y, 0, 10);
    beam(p, P, [a, b, 2], [b, b, 2], 0x8a7a55); beam(p, P, [b, b, 2], [b, a, 2], 0x8a7a55);
    return { p: p.outline(0x1a1411, 70) };
  }
  fence([a, a], [b, a], 'y0', stage === 1 ? 8 : 15);
  fence([a, a], [a, b], 'x0', stage === 1 ? 8 : 15);
  lean();
  if (stage >= 2) {
    fence([a, b], [b, b], 'y1', 15);
    fence([b, a], [b, b], 'x1', 15);
  }
  return { p: p.outline(0x1a1411, 100) };
}

/* ---------- Campos e cultivos ---------- */
function tilled() {
  const p = new Pix(66, 34, 33, 1);
  const P = projector(33, 1);
  const A = P(0, 0);
  p.plane(A, [32, 16], [-32, 16], (s, t, u, v, x, y) => {
    const row = t * 8 % 1;
    const n = hash(x >> 1, y, 4);
    const base = row < 0.34 ? (n > 0.6 ? 0x4b3524 : 0x432f20) : row < 0.72 ? (n > 0.6 ? 0x6e5238 : 0x634a33) : 0x7d6044;
    return base;
  });
  return p;
}
const PLANTS = {
  wheat(p, x, y, g, ripe) {
    const c = ripe ? 0xd9b65a : g === 0 ? 0x7fa24b : g === 1 ? 0x8aa84c : 0xa5ad50, d = ripe ? 0xa98438 : 0x5e7e38;
    const h = [3, 7, 11][g] + (ripe ? 1 : 0);
    for (const dx of [-1, 1, 0]) { p.line(x + dx * 2, y, x + dx * 3, y - h, d); if (g >= 1) p.line(x + dx * 3, y - h, x + dx * 3, y - h - (ripe ? 3 : 1), c); }
    if (g === 0) p.set(x, y - 3, c);
  },
  corn(p, x, y, g, ripe) {
    const h = [4, 11, 18][g];
    p.line(x, y, x, y - h, 0x5e8a3a); p.line(x + 1, y, x + 1, y - h, 0x4b7330);
    for (let k = 2; k < h; k += 4) { p.line(x, y - k, x - 4, y - k + 2, 0x79a549); p.line(x + 1, y - k - 1, x + 5, y - k + 1, 0x5e8a3a); }
    if (ripe) { p.rect(x + 2, y - h + 5, 2, 5, 0xe4c24d); p.rect(x - 2, y - h + 8, 2, 4, 0xd2ae3c); p.line(x, y - h, x, y - h - 2, 0xc9a659); }
  },
  potato(p, x, y, g, ripe) {
    const r = [1.6, 3.2, 4.4][g];
    p.ellipse(x, y - r * 0.7, r + 0.8, r * 0.8, (u, v) => (u + v < -0.2 ? 0x7da04d : u + v < 0.5 ? 0x5f8439 : 0x4a6c2e));
    if (ripe) { p.set(x - 1, y - 4, 0xe9e2c8); p.set(x + 2, y - 3, 0xe9e2c8); p.rect(x + 3, y, 2, 1, 0xa98a5a); }
  },
  pumpkin(p, x, y, g, ripe) {
    p.ellipse(x, y - 1, 2 + g * 1.2, 1.3 + g * 0.6, 0x4f7a33);
    if (g >= 1) { p.ellipse(x - 2, y - 2, 2, 1.3, 0x6a9642); p.ellipse(x + 2, y - 2, 2, 1.3, 0x5b8539); }
    const col = ripe ? [0xf0a13c, 0xd97f28, 0xb5621c] : [0xa7b04d, 0x8e9a3e, 0x74832f];
    if (g === 2 || ripe) p.ellipse(x + 1, y - 2.5, ripe ? 4.4 : 3, ripe ? 3.4 : 2.4, (u, v) => col[u + v < -0.2 ? 0 : u + v < 0.5 ? 1 : 2]);
    if (ripe) p.set(x + 1, y - 6, 0x4f7a33);
  },
  beans(p, x, y, g, ripe) {
    const h = [3, 9, 14][g];
    if (g >= 1) p.line(x, y, x, y - h, 0x8a6d47);
    for (let k = 1; k < h; k += 2) p.ellipse(x + (k % 4 < 2 ? -1 : 1), y - k, 1.9, 1.3, k % 3 ? 0x5f8c3d : 0x76a44b);
    if (ripe) for (let k = 3; k < h; k += 4) { p.set(x + 2, y - k, 0x9dbd5c); p.set(x + 2, y - k + 1, 0x9dbd5c); p.set(x - 2, y - k + 2, 0x9dbd5c); }
  },
  cabbage(p, x, y, g, ripe) {
    const r = [1.6, 3, 4.2 + (ripe ? 0.6 : 0)][g];
    p.ellipse(x, y - r * 0.6, r + 0.8, r * 0.75, (u, v) => (u * u + v * v < 0.2 ? (ripe ? 0xcfe39a : 0x9cc36c) : u + v < 0 ? 0x86b35c : 0x5f9148));
    if (g === 2) p.line(x - 2, y - 2, x + 2, y - 3, 0x4c7a3b);
  },
};
function crop(name, stage) {
  const p = new Pix(66, 44, 33, 30);
  const P = projector(33, 30);
  const ripe = stage === 3, g = Math.min(2, stage);
  for (const [a, b] of [[0.25, 0.3], [0.62, 0.22], [0.3, 0.68], [0.72, 0.62], [0.5, 0.48], [0.12, 0.55], [0.55, 0.85], [0.85, 0.35]]) {
    const [x, y] = P(a, b);
    PLANTS[name](p, Math.round(x), Math.round(y), g, ripe);
  }
  return p;
}

export function buildAll(add) {
  const addPix = (name, pix) => add(name, pix.trim());
  for (let v = 0; v < 3; v++) {
    const a = pine(v); addPix(`tree0${v}_0`, a); addPix(`tree0${v}_1`, a.shearTop(38, 1));
    const b = oak(v); addPix(`tree1${v}_0`, b); addPix(`tree1${v}_1`, b.shearTop(30, -1));
    const c = birch(v); addPix(`tree2${v}_0`, c); addPix(`tree2${v}_1`, c.shearTop(30, 1));
    addPix(`stone${v}`, rock(v, STONE, false));
    addPix(`iron${v}`, rock(v, IRON, true));
    addPix(`stump${v}`, stump(v));
  }
  MT_H.forEach((h, l) => { for (let v = 0; v < 4; v++) add(`mt${l}_${v}`, mountainBlock(h, v, l)); });
  for (const n of [1, 3, 6, 9]) addPix(`pile_wood_${n}`, logStack(n));
  [1, 2, 3].forEach(n => { addPix(`pile_stone_${n}`, heap(STONE, n, 3, false)); addPix(`pile_iron_${n}`, heap(IRON, n, 7, true)); });
  for (const r of ['wood', 'stone', 'iron']) addPix(`carry_${r}`, carried(r));
  for (let look = 0; look < 6; look++) for (const dir of ['f', 'b']) {
    for (const fr of ['i', 'w0', 'w1', 'w2', 'w3', 't0', 't1', 's']) addPix(`c${look}_${dir}_${fr}`, citizenFrame(look, dir, fr));
  }
  addPix('carry_food', (() => {
    const p = new Pix(14, 12, 7, 9);
    p.ellipse(7, 6, 5, 4, (u, v, x, y) => (y % 2 ? 0xa07c48 : 0xbb9558));
    p.ellipse(7, 3, 4, 1.8, (u, v, x, y) => [0xd9863a, 0xc2483a, 0xa7b04d][Math.floor(hash(x, y, 2) * 3)]);
    return p.outline(0x1a1411, 150);
  })());
  [1, 2, 3].forEach(n => addPix(`pile_food_${n}`, heap([0x7a5b34, 0x93703f, 0xad884f, 0xc7a264, 0xd9863a, 0xe0a14c], n, 11, false)));
  add('tilled', tilled());
  for (const name of Object.keys(PLANTS)) for (let st = 0; st < 4; st++) addPix(`crop_${name}_${st}`, crop(name, st));
  const meta = { smoke: {} };
  for (let rot = 0; rot < 4; rot++) {
    for (let st = 0; st <= 4; st++) {
      const h = house(rot, st);
      addPix(`house_r${rot}_s${st}`, h.p);
      if (st === 4) {
        addPix(`house_r${rot}_glow`, h.glow);
        meta.smoke[`house_r${rot}`] = [h.smoke[0] - h.p.ox, h.smoke[1] - h.p.oy];
      }
      addPix(`depot_r${rot}_s${st}`, depot(rot, st).p);
      addPix(`barn_r${rot}_s${st}`, house(rot, st, 'barn').p);
      addPix(`gatherer_r${rot}_s${st}`, house(rot, st, 'gatherer').p);
    }
  }
  // Fumaça, brilho na água, marcadores
  for (let i = 0; i < 3; i++) {
    const s = new Pix(12, 12, 6, 6);
    s.ellipse(6, 6, 2 + i * 1.5, 2 + i * 1.5, (u, v) => (u + v < 0 ? 0xdedbd2 : 0xb7b3ab));
    addPix(`smoke${i}`, s);
  }
  for (let i = 0; i < 3; i++) {
    const g = new Pix(22, 10, 11, 5);
    const n = 4 + i * 3;
    g.line(11 - n, 5 + i - 1, 11 + n, 5 + i - 1 + n / 2 - 2, 0xa6c8d8, 150 - i * 40);
    g.line(9 - n / 2, 8 - i, 9 + n / 2, 8 - i + n / 4, 0xd4e6ea, 120 - i * 25);
    addPix(`glint${i}`, g);
  }
  const axe = new Pix(16, 22, 8, 22);
  axe.rect(7, 2, 2, 20, 0x5a3f2a);
  axe.poly([[8, 1], [15, 1], [8, 9]], 0xe2733a);
  axe.outline(0x1a1411, 180);
  addPix('mark_flag', axe);
  return meta;
}

// Ícones da interface, desenhados à mão em grade 16×16.
const pal = { a: 0x3b2a1c, b: 0x7a5a3c, c: 0xc8cbcf, d: 0x8d9198, e: 0xd9b872, f: 0x6d9a4e, g: 0xe2733a, h: 0xf0e4c4, i: 0x8c6239, j: 0x62544a, k: 0xb4b1aa };
const ICONS = {
  build: ['................', '........cc......', '.......cccc.....', '......ccccc.....', '.....ccb.cc.....', '....bbb..c......', '...bbb..........', '..bbb...........', '.bbb............', '.bb....ee.......', '......eeee......', '.....eeeeee.....', '......bbbb......', '......baab......', '......baab......', '................'],
  manage: ['................', '...aaaaaaaaaa...', '..hhhhhhhhhhhh..', '..h..........h..', '..h.ff.aaaaa.h..', '..h.ff.......h..', '..h..........h..', '..h.ee.aaaaa.h..', '..h.ee.......h..', '..h..........h..', '..h.gg.aaaaa.h..', '..h.gg.......h..', '..h..........h..', '..hhhhhhhhhhhh..', '................', '................'],
  food: ['................', '.......b........', '......fb........', '.....ffb........', '....ggggggg.....', '...ggggggggg....', '..gggggggggg....', '..gggeggggggg...', '..ggeegggggggg..', '..gggggggggggg..', '..ggggggggggg...', '...gggggggggg...', '....ggggggg.....', '................', '................', '................'],
  barn: ['................', '......jjjj......', '....jjjjjjjj....', '..jjjjjjjjjjjj..', '.jjjjjjjjjjjjjj.', '..gggggggggggg..', '..gggghhhhgggg..', '..gggh....hggg..', '..gghh....hhgg..', '..ggh.a..a.hgg..', '..ggha.aa.ahgg..', '..gghaa..aahgg..', '..ggha.aa.ahgg..', '..gghhhhhhhhgg..', '................', '................'],
  gatherer: ['................', '......ff........', '....ffffff......', '..ffffffffff....', '.ffffffffffff...', '...bbbbbbbb.....', '...bbaabbbb.....', '...bbaabbbb.gg..', '...bbaabbb.gggg.', '...........ggggg', '..........jjjjjj', '...........jjjj.', '................', '................', '................', '................'],
  farm: ['................', '.....e...e...e..', '....eee.eee.eee.', '.....e...e...e..', '.....f...f...f..', '.aaaaaaaaaaaaaa.', '.ibibibibibibib.', '.aaaaaaaaaaaaaa.', '.ibibibibibibib.', '.aaaaaaaaaaaaaa.', '.ibibibibibibib.', '.aaaaaaaaaaaaaa.', '................', '................', '................', '................'],
  select: ['................', '...hh...........', '...hah..........', '...haah.........', '...haaah........', '...haaaah.......', '...haaaaah......', '...haaaaaah.....', '...haaaaaaah....', '...haaaahhhh....', '...haahah.......', '...hah.hah......', '...hh..hah......', '........hh......', '................', '................'],
  axe: ['................', '.........cccc...', '.......ccccccc..', '......cckkccccc.', '......cckbbcccc.', '.......cbbbccc..', '.......bbb.cc...', '......bbb.......', '.....bbb........', '....bbb.........', '...bbb..........', '..bbb...........', '.bbb............', '.bb.............', '................', '................'],
  pick: ['................', '...cccccccc.....', '.cccc....bbcc...', 'ccc.....bbb.ccc.', 'cc.....bbb...ccc', '......bbb.....cc', '.....bbb.......c', '....bbb.........', '...bbb..........', '..bbb...........', '.bbb............', 'bbb.............', 'bb..............', '................', '................', '................'],
  erase: ['................', '................', '.......ggg......', '......ggggg.....', '.....ggggggg....', '....hhggggggg...', '...hhhhgggggg...', '..hhhhhhggggg...', '..hhhhhhhggg....', '...hhhhhhhg.....', '....hhhhhh......', '.....hhhh.......', '................', '.aaaaaaaaaaaaa..', '................', '................'],
  house: ['................', '.......ee.......', '......eeee..jj..', '.....eeeeee.jj..', '....eeeeeeeejj..', '...eeeeeeeeee...', '..eeeeeeeeeeee..', '.eeeeeeeeeeeeee.', '...bbbbbbbbbb...', '...biibbbbiib...', '...biibbaabbb...', '...bbbbbaabbb...', '...biibbaabbb...', '...bbbbbaabbb...', '................', '................'],
  depot: ['................', '................', '..jjjjjjjjjjjj..', '.jjjjjjjjjjjjjj.', '.bb..........bb.', '.bb.ii.......bb.', '.bb.iiii.....bb.', '.bb.iiiii.kk.bb.', '.bb.iiiii.kkkbb.', '.bb.iiiiikkkkbb.', '.bbbbbbbbbbbbbb.', '.b.b.b.b.b.b.bb.', '.bbbbbbbbbbbbbb.', '................', '................', '................'],
  people: ['................', '....hh.....hh...', '...hhhh...hhhh..', '...hhhh...hhhh..', '....hh.....hh...', '...bbbb...gggg..', '..bbbbbb.gggggg.', '..bbbbbb.gggggg.', '..bbbbbb.gggggg.', '...bbbb...gggg..', '...b..b...g..g..', '...b..b...g..g..', '...a..a...a..a..', '................', '................', '................'],
  rotate: ['................', '.....hhhhh......', '...hhh...hhh.h..', '..hh.......hhh..', '..h........hhh..', '.hh.....hhhhhh..', '.h..............', '.h..............', '.h..............', '.hh.........h...', '..h........hh...', '..hh.......h....', '...hhh...hhh....', '.....hhhhh......', '................', '................'],
  wood: ['................', '................', '.....bbbbbbbbe..', '....bbbbbbbbeee.', '...iiiiiiiieeee.', '..iiiiiiiieeee..', '.iiiiiiiieeee...', '.bbbbbbbbbee....', 'beeebbbbbbbb....', 'eeeeeiiiiiii....', 'eeeeeiiiiii.....', '.eeebbbbbb......', '................', '................', '................', '................'],
  stone: ['................', '................', '.......kkk......', '.....kkkkkkk....', '....kckkkkkkd...', '...kcckkkkkddd..', '..kkkkkkkkkdddd.', '..kkkkkkkdddddd.', '.dkkkkkdddddddd.', '.ddddddddddddjj.', '.jjjjjjjjjjjjj..', '................', '................', '................', '................', '................'],
  iron: ['................', '................', '.......jjj......', '.....jjjgjjj....', '....jgjjjjjjd...', '...jjjjjgjjddd..', '..jjgjjjjjjdgdd.', '..jjjjjgjjdddjd.', '.djjgjjjjdddgdd.', '.ddjjjdddgddjjj.', '.jjjjjjjjjjjjj..', '................', '................', '................', '................', '................'],
  pop: ['................', '.....hhhhh......', '....hhhhhhh.....', '....hhhhhhh.....', '.....hhhhh......', '......hhh.......', '...bbbbbbbbb....', '..bbbbbbbbbbb...', '..bbbbbbbbbbb...', '..bb.bbbbb.bb...', '..hh.bbbbb.hh...', '.....bbbbb......', '.....aa.aa......', '.....aa.aa......', '................', '................'],
  roof: ['................', '................', '.......ee.......', '......eeee......', '.....eeeeee.....', '....eeeeeeee....', '...eeeeeeeeee...', '..eeeeeeeeeeee..', '.eeeeeeeeeeeeee.', '...bbbbbbbbbb...', '...bbbaabbbbb...', '...bbbaabbbbb...', '...bbbaabbbbb...', '................', '................', '................'],
};
export function iconDataURL(name, doc, scale = 2) {
  const rows = ICONS[name];
  const c = doc.createElement('canvas');
  c.width = c.height = 16 * scale;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.') return;
    x.fillStyle = `#${pal[ch].toString(16).padStart(6, '0')}`;
    x.fillRect(i * scale, j * scale, scale, scale);
  }));
  return c.toDataURL();
}
