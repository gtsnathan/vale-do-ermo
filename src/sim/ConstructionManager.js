import { BUILDINGS, FARM_COST, LEVEL_MAX, RES, TECH } from './defs.js';

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
  // Obra em andamento: canteiro novo ou melhoria de construção pronta.
  proj(b) { if (!b) return null; return b.done === false ? b : b.up || null; }
  costOf(b) { return b.done === false ? BUILDINGS[b.type].cost : b.up.cost; }
  workOf(b) { return b.done === false ? BUILDINGS[b.type].work : b.up.total; }
  needs(b, res) {
    const p = this.proj(b);
    return (this.costOf(b)[res] || 0) - p.delivered[res] - p.enroute[res];
  }
  materialsComplete(b) {
    const cost = this.costOf(b), p = this.proj(b);
    return Object.keys(cost).every(r => p.delivered[r] >= cost[r]);
  }
  progress(b) {
    const p = this.proj(b);
    return p ? Math.min(1, p.work / this.workOf(b)) : 1;
  }
  addWork(b, dt) {
    const p = this.proj(b);
    p.work += dt;
    if (p.work < this.workOf(b)) return;
    if (b.done === false) this.finish(b); else this._finishUp(b);
  }
  techName(b, level = b.level || 1) {
    const key = b.kind || b.type;
    return (TECH[key] || ['Básico', 'Melhorado', 'Avançado'])[level - 1];
  }
  upgradeCost(b) {
    const base = b.kind ? FARM_COST : BUILDINGS[b.type].cost, to = (b.level || 1) + 1, out = {};
    for (const r in base) out[r] = Math.ceil(base[r] * (to === 2 ? 0.7 : 1.1));
    out.stone = (out.stone || 0) + (to === 2 ? 4 : 10);
    if (to === 3) out.iron = 4;
    return out;
  }
  // Nível 3 exige conhecimento: a vila precisa de uma escola funcionando.
  canUpgrade(b) {
    if ((b.level || 1) >= LEVEL_MAX) return { ok: false, reason: 'Já está no nível máximo.' };
    if (b.up) return { ok: false, reason: 'Já há uma melhoria em andamento.' };
    if (b.done === false) return { ok: false, reason: 'Termine a obra primeiro.' };
    if ((b.level || 1) === 2 && !this.sim.work.schools().length) return { ok: false, reason: 'A tecnologia do nível 3 exige uma escola.' };
    return { ok: true };
  }
  startUpgrade(b) {
    const v = this.canUpgrade(b);
    if (!v.ok) return v;
    const up = { to: (b.level || 1) + 1, cost: this.upgradeCost(b), total: 22 + 14 * (b.level || 1), work: 0, delivered: {}, enroute: {}, builders: [] };
    for (const r of RES) { up.delivered[r] = 0; up.enroute[r] = 0; }
    b.up = up;
    return { ok: true };
  }
  cancelUpgrade(b) {
    if (!b.up) return;
    const up = b.up, S = this.sim, at = b.door || { x: b.x, y: b.y };
    for (const c of S.citizens) if (c.task?.siteId === b.id) S.jobs.abort(c);
    b.up = null;
    for (const r of RES) if (up.delivered[r] > 0) S.resources.drop(at.x, at.y, r, up.delivered[r]);
  }
  _finishUp(b) {
    const up = b.up, S = this.sim;
    for (const r of RES) S.stats.consumed[r] += up.delivered[r];
    b.level = up.to;
    b.up = null;
    for (const c of S.citizens) if (c.task?.siteId === b.id) S.jobs.abort(c);
    S.population.news('good', `${b.kind ? 'Fazenda' : BUILDINGS[b.type].name} melhorou: ${this.techName(b)}.`);
    S.events.push({ t: 'upgraded', id: b.id });
    if (BUILDINGS[b.type]?.residents) S.population.assignHomes();
  }
  finish(b) {
    b.done = true;
    for (const r of RES) { this.sim.stats.consumed[r] += b.delivered[r]; b.delivered[r] = 0; }
    b.builders = [];
    if (BUILDINGS[b.type].stores) this.sim.storage.newStock(b);
    if (BUILDINGS[b.type].residents) b.pantry = {};
    if (BUILDINGS[b.type].recipe || BUILDINGS[b.type].keep) b.input = {};
    if (b.type === 'cemetery') b.graves = 0;
    this.sim.stats.built[b.type] = (this.sim.stats.built[b.type] || 0) + 1;
    this.sim.events.push({ t: 'built', id: b.id });
    if (BUILDINGS[b.type].residents) this.sim.population.assignHomes();
    this.sim.jobs.abortFor(b.id);
  }
  // Cancela uma obra ou demole uma construção. Todo material volta ao chão.
  remove(b, burned = false) {
    const S = this.sim, W = S.world;
    this.cancelUpgrade(b);
    S.jobs.abortFor(b.id);
    if (BUILDINGS[b.type].stores && b.done) for (const r of RES) if (b.stock[r] > 0) S.resources.drop(b.door.x, b.door.y, r, b.stock[r]);
    if (b.input) for (const r in b.input) if (b.input[r] > 0) S.resources.drop(b.door.x, b.door.y, r, b.input[r]);
    if (b.pantry) for (const r in b.pantry) if (b.pantry[r] > 0) S.resources.drop(b.door.x, b.door.y, r, b.pantry[r]);
    if (!b.done) for (const r of RES) if (b.delivered[r] > 0) S.resources.drop(b.door.x, b.door.y, r, b.delivered[r]);
    if (b.done && !burned) {
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
