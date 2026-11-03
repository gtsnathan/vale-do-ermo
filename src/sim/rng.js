export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
}

export function hashSeed(text) {
  const s = String(text);
  if (/^\d+$/.test(s)) return Number(s) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class Noise {
  constructor(seed) {
    const r = new RNG(seed);
    this.t = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) this.t[i] = r.next();
  }
  at(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const g = (a, b) => this.t[((a & 255) << 8) | (b & 255)];
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  fbm(x, y, oct = 4) {
    let v = 0, amp = 0.5, tot = 0;
    for (let i = 0; i < oct; i++) {
      v += this.at(x, y) * amp; tot += amp;
      x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; amp *= 0.5;
    }
    return v / tot;
  }
}
