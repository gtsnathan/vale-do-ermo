import { BUILDINGS, RES } from './defs.js';

// Canteiros, conclusão, cancelamento e demolição.
export class ConstructionManager {
  constructor(sim) { this.sim = sim; }

  validate(type, x, y, rot) {
    const W = this.sim.world;
    const base = W.canPlace(type, x, y, rot);
    if (!base.ok) return base;
    const { w, h } = W.footprint(type, rot);
    const extra = new Set();
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) extra.add(W.idx(i, j));
    const tmp = new Int32Array(W.w * W.h);
    W._label(tmp, extra);
    const main = tmp[W.idx(base.door.x, base.door.y)];
    // Quem ainda está saindo de um canteiro recém-criado não conta: logo volta ao chão livre.
    const out = this.sim.citizens.map(c => tmp[W.idx(c.x | 0, c.y | 0)]).filter(v => v !== -1);
    if (out.length && !out.includes(main)) return { ok: false, reason: 'A entrada ficaria sem caminho para os aldeões' };
    if (out.some(v => v !== main)) return { ok: false, reason: 'Isto deixaria aldeões isolados' };
    for (const b of this.sim.buildings) {
      if (tmp[W.idx(b.door.x, b.door.y)] !== main) return { ok: false, reason: 'Isto bloquearia o caminho até outra construção' };
    }
    return base;
  }

  place(type, x, y, rot) {
    const v = this.validate(type, x, y, rot);
    if (!v.ok) return v;
    const b = this._create(type, x, y, rot);
    this.sim.stats.placed[type] = (this.sim.stats.placed[type] || 0) + 1;
    this.sim.events.push({ t: 'placed', id: b.id });
    return { ok: true, building: b };
  }

  _create(type, x, y, rot) {
    const W = this.sim.world;
    const { w, h } = W.footprint(type, rot);
    const door = W.doorTile(type, x, y, rot);
    const def = BUILDINGS[type];
    const b = {
      id: this.sim.newId(), type, x, y, w, h, rot, door,
      done: false, delivered: {}, enroute: {}, work: 0, builders: [],
      residents: [], stock: null, reserved: null, incoming: 0, cooldown: 0,
    };
    for (const r of RES) { b.delivered[r] = 0; b.enroute[r] = 0; }
    this.sim.buildings.push(b);
    this.occupy(b);
    void def;
    return b;
  }
  occupy(b) {
    const W = this.sim.world;
    for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) W.buildingAt[W.idx(i, j)] = b.id;
    if (W.inb(b.door.x, b.door.y)) W.doorAt[W.idx(b.door.x, b.door.y)]++;
    W.compDirty = true;
  }
  needs(b, res) {
    const cost = BUILDINGS[b.type].cost[res] || 0;
    return cost - b.delivered[res] - b.enroute[res];
  }
  materialsComplete(b) {
    const cost = BUILDINGS[b.type].cost;
    return Object.keys(cost).every(r => b.delivered[r] >= cost[r]);
  }
  progress(b) {
    if (b.done) return 1;
    return Math.min(1, b.work / BUILDINGS[b.type].work);
  }
  addWork(b, dt) {
    b.work += dt;
    if (b.work >= BUILDINGS[b.type].work) this.finish(b);
  }
  finish(b) {
    b.done = true;
    for (const r of RES) { this.sim.stats.consumed[r] += b.delivered[r]; b.delivered[r] = 0; }
    b.builders = [];
    if (BUILDINGS[b.type].stores) this.sim.storage.newStock(b);
    if (b.type === 'house') b.pantry = {};
    this.sim.stats.built[b.type] = (this.sim.stats.built[b.type] || 0) + 1;
    this.sim.events.push({ t: 'built', id: b.id });
    if (b.type === 'house') this.sim.population.assignHomes();
    this.sim.jobs.abortFor(b.id);
  }
  // Cancela uma obra ou demole uma construção. Todo material volta ao chão.
  remove(b) {
    const S = this.sim, W = S.world;
    S.jobs.abortFor(b.id);
    if (BUILDINGS[b.type].stores && b.done) for (const r of RES) if (b.stock[r] > 0) S.resources.drop(b.door.x, b.door.y, r, b.stock[r]);
    if (b.pantry) for (const r in b.pantry) if (b.pantry[r] > 0) S.resources.drop(b.door.x, b.door.y, r, b.pantry[r]);
    if (!b.done) for (const r of RES) if (b.delivered[r] > 0) S.resources.drop(b.door.x, b.door.y, r, b.delivered[r]);
    if (b.done) {
      const cost = BUILDINGS[b.type].cost;
      for (const r in cost) {
        const back = Math.floor(cost[r] / 2);
        if (back > 0) { S.resources.drop(b.door.x, b.door.y, r, back); S.stats.consumed[r] -= back; }
      }
      S.stats.consumed.wood += 0;
    }
    for (const c of S.citizens) if (c.workplace === b.id) c.workplace = null;
    for (const id of b.residents) {
      const c = S.citizen(id);
      if (c) { c.home = null; if (c.inside) { c.inside = false; c.x = b.door.x + 0.5; c.y = b.door.y + 0.5; } }
    }
    for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) W.buildingAt[W.idx(i, j)] = -1;
    if (W.inb(b.door.x, b.door.y)) W.doorAt[W.idx(b.door.x, b.door.y)]--;
    W.compDirty = true;
    S.buildings.splice(S.buildings.indexOf(b), 1);
    S.events.push({ t: 'removed', id: b.id });
    S.population.assignHomes();
  }
}
