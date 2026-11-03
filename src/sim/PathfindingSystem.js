// A* com 8 direções, sem cortar quinas, sobre arrays reutilizados.
const SQ2 = Math.SQRT2;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export class PathfindingSystem {
  constructor(world) {
    this.world = world;
    const n = world.w * world.h;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.goal = new Uint32Array(n);
    this.stamp = 0;
    this.heap = new Int32Array(n * 4);
    this.f = new Float32Array(n);
    this.size = 0;
  }
  _push(i) {
    const { heap, f } = this;
    let k = this.size++;
    heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (f[heap[p]] <= f[heap[k]]) break;
      const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p;
    }
  }
  _pop() {
    const { heap, f } = this;
    const top = heap[0];
    heap[0] = heap[--this.size];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1, r = l + 1;
      let m = k;
      if (l < this.size && f[heap[l]] < f[heap[m]]) m = l;
      if (r < this.size && f[heap[r]] < f[heap[m]]) m = r;
      if (m === k) break;
      const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m;
    }
    return top;
  }
  // goals: lista de [x, y]. Devolve lista de tiles ou null se não houver caminho.
  find(sx, sy, goals) {
    const W = this.world, w = W.w;
    if (!goals.length) return null;
    this.stamp++;
    const st = this.stamp;
    let hx = 0, hy = 0, valid = 0;
    for (const [x, y] of goals) {
      if (W.blocked(x, y)) continue;
      this.goal[W.idx(x, y)] = st; hx += x; hy += y; valid++;
    }
    if (!valid) return null;
    hx /= valid; hy /= valid;
    const single = valid === 1;
    const h = (x, y) => {
      const dx = Math.abs(x - hx), dy = Math.abs(y - hy);
      const d = Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
      return single ? d : Math.max(0, d - 3);
    };
    const s = W.idx(sx, sy);
    if (this.goal[s] === st) return [];
    this.size = 0;
    this.g[s] = 0; this.from[s] = -1; this.seen[s] = st;
    this.f[s] = h(sx, sy);
    this._push(s);
    while (this.size) {
      const c = this._pop();
      if (this.closed[c] === st) continue;
      this.closed[c] = st;
      if (this.goal[c] === st) {
        const path = [];
        for (let i = c; i !== s; i = this.from[i]) path.push([i % w, (i / w) | 0]);
        return path.reverse();
      }
      const cx = c % w, cy = (c / w) | 0;
      for (const [dx, dy, len] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (W.blocked(nx, ny)) continue;
        if (dx && dy && (W.blocked(cx + dx, cy) || W.blocked(cx, cy + dy))) continue;
        const j = W.idx(nx, ny);
        if (this.closed[j] === st) continue;
        const ng = this.g[c] + len * W.costI(j);
        if (this.seen[j] === st && ng >= this.g[j]) continue;
        this.seen[j] = st; this.g[j] = ng; this.from[j] = c;
        this.f[j] = ng + h(nx, ny);
        this._push(j);
      }
    }
    return null;
  }
}
