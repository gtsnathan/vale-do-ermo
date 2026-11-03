// Pequeno rasterizador de pixel art. Toda a arte do jogo é pintada por código.
export const hash = (x, y, s = 0) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const shade = (c, f) => {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return (r << 16) | (g << 8) | b;
};
export const mix = (a, b, t) => {
  const f = (s) => ((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t;
  return (f(16) << 16) | (f(8) << 8) | f(0);
};

export class Pix {
  constructor(w, h, ox = 0, oy = 0) {
    this.w = w; this.h = h; this.ox = ox; this.oy = oy;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  set(x, y, c, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (a >= 255 || d[i + 3] === 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; return; }
    const t = a / 255, oa = d[i + 3] / 255, na = t + oa * (1 - t);
    d[i] = (r * t + d[i] * oa * (1 - t)) / na;
    d[i + 1] = (g * t + d[i + 1] * oa * (1 - t)) / na;
    d[i + 2] = (b * t + d[i + 2] * oa * (1 - t)) / na;
    d[i + 3] = na * 255;
  }
  alpha(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  rect(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  // Plano O + s*A + t*B. fn(s, t, uPx, vPx, x, y) devolve cor ou null.
  plane(O, A, B, fn, a = 255) {
    const xs = [O[0], O[0] + A[0], O[0] + B[0], O[0] + A[0] + B[0]], ys = [O[1], O[1] + A[1], O[1] + B[1], O[1] + A[1] + B[1]];
    const det = A[0] * B[1] - A[1] * B[0];
    if (Math.abs(det) < 1e-6) return;
    const la = Math.hypot(A[0], A[1]), lb = Math.hypot(B[0], B[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        const px = x + 0.5 - O[0], py = y + 0.5 - O[1];
        const s = (px * B[1] - py * B[0]) / det, t = (A[0] * py - A[1] * px) / det;
        if (s < 0 || s > 1 || t < 0 || t > 1) continue;
        const c = fn(s, t, s * la, t * lb, x, y);
        if (c != null) this.set(x, y, c, a);
      }
    }
  }
  poly(pts, c, a = 255) {
    const ys = pts.map(p => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const hits = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        const yy = y + 0.5;
        if ((y0 <= yy && y1 > yy) || (y1 <= yy && y0 > yy)) hits.push(x0 + (yy - y0) / (y1 - y0) * (x1 - x0));
      }
      hits.sort((m, n) => m - n);
      for (let k = 0; k + 1 < hits.length; k += 2) {
        for (let x = Math.round(hits[k]); x < Math.round(hits[k + 1]); x++) {
          const col = typeof c === 'function' ? c(x, y) : c;
          if (col != null) this.set(x, y, col, a);
        }
      }
    }
  }
  line(x0, y0, x1, y1, c, a) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, a);
  }
  ellipse(cx, cy, rx, ry, c, a) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1) this.set(x, y, typeof c === 'function' ? c(u, v, x, y) : c, a);
    }
  }
  // Contorno escuro só por fora de pixels bem opacos: dá leitura de pixel art.
  outline(c = 0x1f1a1c, a = 150) {
    const hits = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) >= 40) continue;
      if (this.alpha(x + 1, y) > 200 || this.alpha(x - 1, y) > 200 || this.alpha(x, y + 1) > 200 || this.alpha(x, y - 1) > 200) hits.push([x, y]);
    }
    for (const [x, y] of hits) this.set(x, y, c, a);
    return this;
  }
  // Inclina as linhas de cima: é o quadro de vento das copas.
  shearTop(rows, dx) {
    const out = new Pix(this.w, this.h, this.ox, this.oy);
    for (let y = 0; y < this.h; y++) {
      const s = y < rows ? dx : 0;
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4, a = this.d[i + 3];
        if (!a) continue;
        const nx = x + s;
        if (nx < 0 || nx >= this.w) continue;
        const j = (y * this.w + nx) * 4;
        out.d[j] = this.d[i]; out.d[j + 1] = this.d[i + 1]; out.d[j + 2] = this.d[i + 2]; out.d[j + 3] = a;
      }
    }
    return out;
  }
  trim(pad = 1) {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.alpha(x, y)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(this.w - 1, x1 + pad); y1 = Math.min(this.h - 1, y1 + pad);
    const out = new Pix(x1 - x0 + 1, y1 - y0 + 1, this.ox - x0, this.oy - y0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * this.w + x) * 4, j = ((y - y0) * out.w + (x - x0)) * 4;
      for (let k = 0; k < 4; k++) out.d[j + k] = this.d[i + k];
    }
    return out;
  }
}

// Projeção isométrica 2:1 dentro de um sprite: x e y em tiles, z em pixels.
export const projector = (ox, oy) => (x, y, z = 0) => [ox + (x - y) * 32, oy + (x + y) * 16 - z];
