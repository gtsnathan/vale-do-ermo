import { RES, BUILDINGS } from './defs.js';

// Estoque por depósito. Nada é global: cada unidade está em um lugar físico.
export class StorageManager {
  constructor(sim) { this.sim = sim; }
  depots() { return this.sim.buildings.filter(b => b.done && b.type === 'depot'); }
  used(d) { return RES.reduce((a, r) => a + d.stock[r], 0); }
  free(d) { return BUILDINGS.depot.capacity - this.used(d) - d.incoming; }
  available(d, res) { return d.stock[res] - d.reserved[res]; }
  total(res) { return this.depots().reduce((a, d) => a + d.stock[res], 0); }
  capacity() { return this.depots().length * BUILDINGS.depot.capacity; }
  usedTotal() { return this.depots().reduce((a, d) => a + this.used(d), 0); }
  // Depósito acessível mais próximo com espaço, considerando cargas já a caminho.
  nearestWithSpace(x, y, comp) {
    let best = null, bd = Infinity;
    for (const d of this.depots()) {
      if (this.free(d) <= 0 || this.sim.world.compAt(d.door.x, d.door.y) !== comp) continue;
      const dd = Math.abs(d.door.x - x) + Math.abs(d.door.y - y);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
}

// Materiais soltos no chão, esperando transporte.
export class ResourceManager {
  constructor(sim) { this.sim = sim; }
  pile(id) { return this.sim.piles.find(p => p.id === id); }
  drop(x, y, res, amount) {
    const W = this.sim.world;
    if (amount <= 0) return null;
    const seen = new Set([W.idx(x, y)]);
    const queue = [[x, y]];
    while (queue.length) {
      const [cx, cy] = queue.shift();
      const i = W.idx(cx, cy);
      if (!W.blockedI(i) && W.terrain[i] <= 1 && W.nodeAt[i] === -1 && !W.doorAt[i]) {
        const here = W.pileAt[i];
        if (here === -1) {
          const p = { id: this.sim.newId(), x: cx, y: cy, res, amount, reserved: 0, cooldown: 0 };
          this.sim.piles.push(p);
          W.pileAt[i] = p.id;
          return p;
        }
        const p = this.pile(here);
        if (p.res === res) { p.amount += amount; return p; }
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!W.inb(nx, ny)) continue;
        const k = W.idx(nx, ny);
        if (!seen.has(k)) { seen.add(k); queue.push([nx, ny]); }
      }
    }
    throw new Error('Sem tile livre para soltar material');
  }
  take(p, n) {
    p.amount -= n; p.reserved -= n;
    if (p.amount <= 0) {
      this.sim.world.pileAt[this.sim.world.idx(p.x, p.y)] = -1;
      this.sim.piles.splice(this.sim.piles.indexOf(p), 1);
    }
  }
  groundTotal(res) { return this.sim.piles.reduce((a, p) => a + (p.res === res ? p.amount : 0), 0); }
}
