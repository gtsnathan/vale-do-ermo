import { RNG, Noise } from './rng.js';
import { T } from './defs.js';

// Gera terreno, depósitos naturais e o ponto de fundação a partir da semente.
export function generateTerrain(size, seed) {
  const w = size, h = size, n = w * h;
  const r = new RNG(seed);
  const nA = new Noise(seed + 11), nB = new Noise(seed + 23), nC = new Noise(seed + 37), nD = new Noise(seed + 51);
  const terrain = new Uint8Array(n);
  const I = (x, y) => y * w + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

  // Montanhas nas bordas; lagos fora do centro; solo fértil em manchas.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x / w - 0.5, dy = y / h - 0.5, edge = Math.sqrt(dx * dx + dy * dy) * 2;
    const m = nA.fbm(x * 0.05, y * 0.05, 4);
    if (m + edge * 0.34 > 0.86) terrain[I(x, y)] = T.MOUNTAIN;
    else if (nB.fbm(x * 0.055, y * 0.055, 3) < 0.31 && edge > 0.3) terrain[I(x, y)] = T.WATER;
    else if (nC.fbm(x * 0.09, y * 0.09, 3) > 0.655) terrain[I(x, y)] = T.FERTILE;
  }


  // Rio sinuoso de borda a borda, com vaus transitáveis até existirem pontes.
  const vertical = r.chance(0.5);
  const base = Math.floor(size * (r.chance(0.5) ? 0.26 : 0.74));
  const radius = size > 100 ? 2 : 1;
  let nextFord = r.int(6, 12);
  const crossings = [];
  for (let t = 0; t < size; t++) {
    const off = (nD.fbm(t * 0.035, 3.3, 3) - 0.5) * size * 0.55;
    const c = Math.round(base + off);
    for (let a = -radius; a <= radius; a++) for (let b = -radius; b <= radius; b++) {
      if (a * a + b * b > radius * radius + 1) continue;
      const x = vertical ? c + a : t + b, y = vertical ? t + b : c + a;
      if (inb(x, y)) terrain[I(x, y)] = T.WATER;
    }
    if (t === nextFord) { crossings.push([t, c]); nextFord += r.int(12, 18); }
  }
  for (const [t, c] of crossings) for (const row of [t, t + 1]) {
    for (const dir of [-1, 1]) {
      let a = dir < 0 ? 0 : 1;
      for (; a * dir <= 30; a += dir) {
        const x = vertical ? c + a : row, y = vertical ? row : c + a;
        if (!inb(x, y) || terrain[I(x, y)] !== T.WATER) break;
        terrain[I(x, y)] = T.FORD;
      }
    }
  }

  // Blocos de montanha pequenos (restos cortados pelo rio) viram terra.
  const seenM = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (terrain[s] !== T.MOUNTAIN || seenM[s]) continue;
    const list = [s]; seenM[s] = 1;
    for (let q = 0; q < list.length; q++) {
      const i = list[q], x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < n && terrain[j] === T.MOUNTAIN && !seenM[j]) { seenM[j] = 1; list.push(j); }
      }
    }
    if (list.length < 40) for (const i of list) terrain[i] = T.GRASS;
  }

  // Ponto de fundação: a clareira aberta mais próxima do centro.
  const landScore = (cx, cy) => {
    let ok = 0, all = 0;
    for (let y = cy - 9; y <= cy + 9; y++) for (let x = cx - 9; x <= cx + 9; x++) {
      all++;
      if (inb(x, y) && terrain[I(x, y)] <= T.FERTILE) ok++;
    }
    return ok / all;
  };
  let start = null, best = -1;
  for (let i = 0; i < 400; i++) {
    const a = i * 2.399, d = Math.sqrt(i) * (size * 0.024);
    const cx = Math.round(w / 2 + Math.cos(a) * d), cy = Math.round(h / 2 + Math.sin(a) * d);
    if (!inb(cx, cy) || cx < 12 || cy < 12 || cx > w - 13 || cy > h - 13) continue;
    const s = landScore(cx, cy) - d / (size * 3);
    if (s > best) { best = s; start = { x: cx, y: cy }; }
    if (s > 0.97) break;
  }
  if (!start) start = { x: w >> 1, y: h >> 1 };
  // Garante chão firme no entorno imediato da fundação.
  for (let y = start.y - 6; y <= start.y + 6; y++) for (let x = start.x - 6; x <= start.x + 6; x++) {
    if (inb(x, y) && terrain[I(x, y)] > T.FERTILE) terrain[I(x, y)] = T.GRASS;
  }

  // Nós de recurso.
  const nodes = [];
  const taken = new Uint8Array(n);
  const forest = new Uint8Array(n);
  const distStart = (x, y) => Math.hypot(x - start.x, y - start.y);
  const addNode = (type, x, y, variant) => {
    const i = I(x, y);
    if (!inb(x, y) || taken[i] || terrain[i] > T.FERTILE || distStart(x, y) < 7) return false;
    taken[i] = 1;
    nodes.push({ type, x, y, variant });
    return true;
  };
  const cluster = (type, cx, cy, rad, dens) => {
    let c = 0;
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if (Math.hypot(x - cx, y - cy) <= rad + 0.3 && r.chance(dens) && addNode(type, x, y, r.int(0, 2))) c++;
    }
    return c;
  };
  const scatter = (type, count, rad) => {
    let placed = 0, tries = 0;
    while (placed < count && tries++ < 600) {
      const x = r.int(4, w - 5), y = r.int(4, h - 5);
      if (terrain[I(x, y)] > T.FERTILE) continue;
      let nearRock = false;
      for (let a = -7; a <= 7 && !nearRock; a += 2) for (let b = -7; b <= 7; b += 2) {
        if (inb(x + a, y + b) && terrain[I(x + a, y + b)] === T.MOUNTAIN) { nearRock = true; break; }
      }
      if (!nearRock && r.chance(0.65)) continue;
      if (cluster(type, x, y, rad, 0.72)) placed++;
    }
  };
  const near = (type, minD, maxD, rad) => {
    for (let i = 0; i < 80; i++) {
      const a = r.next() * Math.PI * 2, d = minD + r.next() * (maxD - minD);
      const x = Math.round(start.x + Math.cos(a) * d), y = Math.round(start.y + Math.sin(a) * d);
      if (inb(x, y) && terrain[I(x, y)] <= T.FERTILE && cluster(type, x, y, rad, 0.8) > 2) return;
    }
  };
  // Pedra e ferro acessíveis perto da fundação, para o início nunca travar.
  near('stone', 10, 15, 1);
  near('iron', 14, 21, 1);
  const scale = (size * size) / (96 * 96);
  scatter('stone', Math.round(9 * scale), 2);
  scatter('iron', Math.round(5 * scale), 1);

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = nC.fbm(x * 0.07 + 40, y * 0.07 + 90, 4);
    const inForest = f > 0.5;
    if (inForest) forest[I(x, y)] = 1;
    if (r.chance(inForest ? 0.68 : 0.022)) {
      const kind = nD.fbm(x * 0.05 + 7, y * 0.05, 2);
      const sp = kind > 0.54 ? 0 : kind > 0.44 ? 1 : 2; // 0 pinheiro, 1 carvalho, 2 bétula
      addNode('tree', x, y, sp * 10 + r.int(0, 2));
    }
  }
  // Se a clareira ficou sem floresta por perto, planta um bosque.
  const nearTrees = nodes.filter(o => o.type === 'tree' && distStart(o.x, o.y) < 20).length;
  if (nearTrees < 35) {
    const a = r.next() * 6.28, cx = Math.round(start.x + Math.cos(a) * 13), cy = Math.round(start.y + Math.sin(a) * 13);
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) {
      if (inb(x, y) && Math.hypot(x - cx, y - cy) < 6.5 && r.chance(0.75)) {
        if (addNode('tree', x, y, r.int(0, 1) * 10 + r.int(0, 2))) forest[I(x, y)] = 1;
      }
    }
  }

  // Distância até a margem: positivo em terra, negativo na água. Usado na arte.
  const shore = new Int8Array(n);
  const isW = i => terrain[i] === T.WATER || terrain[i] === T.FORD;
  let frontier = [];
  const dist = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (isW(i)) { dist[i] = 0; frontier.push(i); }
  for (let d = 1; d <= 3; d++) {
    const nx = [];
    for (const i of frontier) for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (j < 0 || j >= n || dist[j] !== -1) continue;
      if (Math.abs((j % w) - (i % w)) > 1) continue;
      dist[j] = d; nx.push(j);
    }
    frontier = nx;
  }
  for (let i = 0; i < n; i++) if (!isW(i)) shore[i] = dist[i] === -1 ? 4 : dist[i];
  const distL = new Int8Array(n).fill(-1);
  frontier = [];
  for (let i = 0; i < n; i++) if (!isW(i)) { distL[i] = 0; frontier.push(i); }
  for (let d = 1; d <= 3; d++) {
    const nx = [];
    for (const i of frontier) for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (j < 0 || j >= n || distL[j] !== -1) continue;
      if (Math.abs((j % w) - (i % w)) > 1) continue;
      distL[j] = d; nx.push(j);
    }
    frontier = nx;
  }
  for (let i = 0; i < n; i++) if (isW(i)) shore[i] = distL[i] === -1 ? -4 : -distL[i];

  return { w, h, terrain, forest, shore, nodes, start };
}
