import { RES, BUILDINGS, isFood } from './defs.js';

// Estoque por edifício. Nada é global: cada unidade está em um lugar físico.
// Depósitos guardam materiais; celeiros guardam alimentos.
export class StorageManager {
  constructor(sim) { this.sim = sim; }
  stores() { return this.sim.buildings.filter(b => b.done && BUILDINGS[b.type].stores); }
  depots() { return this.sim.buildings.filter(b => b.done && b.type === 'depot'); }
  barns() { return this.sim.buildings.filter(b => b.done && b.type === 'barn'); }
  accepts(b, res) { return BUILDINGS[b.type].stores === (isFood(res) ? 'food' : 'material'); }
  used(d) { return RES.reduce((a, r) => a + d.stock[r], 0); }
  free(d) { return BUILDINGS[d.type].capacity - this.used(d) - d.incoming; }
  available(d, res) { return d.stock[res] - d.reserved[res]; }
  total(res) { return this.stores().reduce((a, d) => a + d.stock[res], 0); }
  _ofKind(kind) { return this.stores().filter(b => BUILDINGS[b.type].stores === kind); }
  capacity(kind = 'material') { return this._ofKind(kind).reduce((a, b) => a + BUILDINGS[b.type].capacity, 0); }
  usedTotal(kind = 'material') { return this._ofKind(kind).reduce((a, d) => a + this.used(d), 0); }
  // Local acessível mais próximo que aceita o recurso e tem espaço, contando cargas a caminho.
  nearestWithSpace(x, y, comp, res) {
    let best = null, bd = Infinity;
    for (const d of this.stores()) {
      if (!this.accepts(d, res) || this.free(d) <= 0 || this.sim.world.compAt(d.door.x, d.door.y) !== comp) continue;
      const dd = Math.abs(d.door.x - x) + Math.abs(d.door.y - y);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  // Celeiro acessível mais próximo com comida livre.
  nearestFood(x, y, comp) {
    let best = null, bd = Infinity;
    for (const d of this.barns()) {
      if (this.sim.world.compAt(d.door.x, d.door.y) !== comp) continue;
      if (!RES.some(r => isFood(r) && this.available(d, r) > 0)) continue;
      const dd = Math.abs(d.door.x - x) + Math.abs(d.door.y - y);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  bestFood(d) {
    let best = null, n = 0;
    for (const r of RES) if (isFood(r) && this.available(d, r) > n) { n = this.available(d, r); best = r; }
    return best;
  }
  newStock(b) {
    b.stock = {}; b.reserved = {}; b.incoming = 0;
    for (const r of RES) { b.stock[r] = 0; b.reserved[r] = 0; }
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
      if (!W.blockedI(i) && W.terrain[i] <= 1 && W.nodeAt[i] === -1 && !W.doorAt[i] && W.fieldAt[i] === -1) {
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
