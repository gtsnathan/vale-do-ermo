import { CARRY, NODE, RES, BUILDINGS } from './defs.js';

// Decide o que cada aldeão faz a seguir e reserva tudo antes de ele sair andando.
// Reserva antes de caminhar é o que impede dois aldeões de buscarem a mesma carga.
export class JobManager {
  constructor(sim) { this.sim = sim; }

  assign(c) {
    const S = this.sim, W = S.world;
    const comp = W.compAt(c.x | 0, c.y | 0);
    if (c.inv.res) return this._cargo(c, comp);
    if (S.isNight()) return this._rest(c);
    return this._build(c, comp) || this._supply(c, comp) || this._haul(c, comp) || this._harvest(c, comp) || this._idle(c);
  }

  ring(b) {
    const out = [], W = this.sim.world;
    for (let i = b.x; i < b.x + b.w; i++) { out.push([i, b.y - 1]); out.push([i, b.y + b.h]); }
    for (let j = b.y; j < b.y + b.h; j++) { out.push([b.x - 1, j]); out.push([b.x + b.w, j]); }
    return out.filter(([x, y]) => !W.blocked(x, y));
  }
  reachable(list, comp) { return list.filter(([x, y]) => this.sim.world.compAt(x, y) === comp); }

  _cargo(c, comp) {
    const d = this.sim.storage.nearestWithSpace(c.x, c.y, comp);
    if (!d) { c.task = { kind: 'dropCargo' }; return true; }
    d.incoming += c.inv.amount;
    c.task = { kind: 'cargo', depotId: d.id, n: c.inv.amount };
    return true;
  }
  _rest(c) {
    const S = this.sim;
    const home = c.home != null ? S.building(c.home) : null;
    if (home) { c.task = { kind: 'home', buildingId: home.id }; return true; }
    c.task = { kind: 'camp' };
    return true;
  }
  _sites() { return this.sim.buildings.filter(b => !b.done); }

  _build(c, comp) {
    const S = this.sim;
    for (const b of this._sites()) {
      if (b.cooldown > S.time || !S.construction.materialsComplete(b)) continue;
      if (b.builders.length >= BUILDINGS[b.type].builders) continue;
      const spots = this.reachable(this.ring(b), comp);
      if (!spots.length) continue;
      b.builders.push(c.id);
      c.task = { kind: 'build', siteId: b.id, spot: spots[(c.id * 3 + b.id) % spots.length] };
      return true;
    }
    return false;
  }
  _supply(c, comp) {
    const S = this.sim;
    for (const b of this._sites()) {
      if (b.cooldown > S.time || !this.reachable(this.ring(b), comp).length) continue;
      for (const res of RES) {
        const need = S.construction.needs(b, res);
        if (need <= 0) continue;
        const src = this._source(c, res, comp);
        if (!src) continue;
        const n = Math.min(CARRY[res], need, src.avail);
        if (src.type === 'depot') src.ref.reserved[res] += n; else src.ref.reserved += n;
        b.enroute[res] += n;
        c.task = { kind: 'deliver', srcType: src.type, srcId: src.ref.id, siteId: b.id, res, n, step: 0 };
        return true;
      }
    }
    return false;
  }
  _source(c, res, comp) {
    const S = this.sim, W = S.world;
    let best = null, bd = Infinity;
    for (const d of S.storage.depots()) {
      const avail = S.storage.available(d, res);
      if (avail <= 0 || W.compAt(d.door.x, d.door.y) !== comp) continue;
      const dist = Math.abs(d.door.x - c.x) + Math.abs(d.door.y - c.y);
      if (dist < bd) { bd = dist; best = { type: 'depot', ref: d, avail }; }
    }
    for (const p of S.piles) {
      if (p.res !== res || p.amount - p.reserved <= 0 || p.cooldown > S.time || W.compAt(p.x, p.y) !== comp) continue;
      const dist = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
      if (dist < bd) { bd = dist; best = { type: 'pile', ref: p, avail: p.amount - p.reserved }; }
    }
    return best;
  }
  _haul(c, comp) {
    const S = this.sim, W = S.world;
    let best = null, bd = Infinity;
    for (const p of S.piles) {
      if (p.amount - p.reserved <= 0 || p.cooldown > S.time || W.compAt(p.x, p.y) !== comp) continue;
      const dist = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
      if (dist < bd) { bd = dist; best = p; }
    }
    if (!best) return false;
    const d = S.storage.nearestWithSpace(best.x, best.y, comp);
    if (!d) return false;
    const n = Math.min(CARRY[best.res], best.amount - best.reserved, S.storage.free(d));
    best.reserved += n;
    d.incoming += n;
    c.task = { kind: 'haul', pileId: best.id, depotId: d.id, res: best.res, n, step: 0 };
    return true;
  }
  nodeSpots(n) {
    return [[n.x + 1, n.y], [n.x - 1, n.y], [n.x, n.y + 1], [n.x, n.y - 1]].filter(([x, y]) => !this.sim.world.blocked(x, y));
  }
  _harvest(c, comp) {
    const S = this.sim;
    let best = null, bd = Infinity;
    for (const n of S.markedNodes) {
      if (n.reservedBy != null || n.cooldown > S.time) continue;
      const dist = Math.abs(n.x - c.x) + Math.abs(n.y - c.y);
      if (dist >= bd) continue;
      if (!this.reachable(this.nodeSpots(n), comp).length) continue;
      bd = dist; best = n;
    }
    if (!best) return false;
    best.reservedBy = c.id;
    c.task = { kind: 'harvest', nodeId: best.id };
    return true;
  }
  _idle(c) {
    c.task = { kind: 'idle', wait: 1.5 + this.sim.rng.next() * 3, moved: false };
    return true;
  }

  // Devolve reservas do aldeão. Chamado em qualquer interrupção de tarefa.
  abort(c) {
    const S = this.sim, t = c.task;
    c.path = null; c.anim = 'idle';
    if (!t) return;
    switch (t.kind) {
      case 'cargo': { const d = S.building(t.depotId); if (d && d.done) d.incoming -= t.n; break; }
      case 'haul': {
        const d = S.building(t.depotId);
        if (d && d.done) d.incoming -= t.n;
        if (t.step === 0) { const p = S.resources.pile(t.pileId); if (p) p.reserved -= t.n; }
        break;
      }
      case 'deliver': {
        const b = S.building(t.siteId);
        if (b && !b.done) b.enroute[t.res] -= t.n;
        if (t.step === 0) {
          if (t.srcType === 'depot') { const d = S.building(t.srcId); if (d && d.done) d.reserved[t.res] -= t.n; }
          else { const p = S.resources.pile(t.srcId); if (p) p.reserved -= t.n; }
        }
        break;
      }
      case 'build': {
        const b = S.building(t.siteId);
        if (b && !b.done) b.builders = b.builders.filter(id => id !== c.id);
        break;
      }
      case 'harvest': { const n = S.nodes.get(t.nodeId); if (n) n.reservedBy = null; break; }
    }
    c.task = null;
  }
  abortFor(buildingId) {
    for (const c of this.sim.citizens) {
      const t = c.task;
      if (t && (t.siteId === buildingId || t.depotId === buildingId || t.buildingId === buildingId || (t.srcType === 'depot' && t.srcId === buildingId))) this.abort(c);
    }
  }
  describe(c) {
    const t = c.task;
    if (c.inside) return 'Descansando em casa';
    if (!t) return 'Decidindo o que fazer';
    const S = this.sim;
    const lab = { wood: 'madeira', stone: 'pedra', iron: 'ferro' };
    switch (t.kind) {
      case 'cargo': return `Levando ${lab[c.inv.res] || 'carga'} ao depósito`;
      case 'dropCargo': return 'Depósitos cheios, soltando a carga';
      case 'home': return 'Voltando para casa';
      case 'camp': return 'Sem casa, passando a noite ao relento';
      case 'build': return `Construindo ${BUILDINGS[S.building(t.siteId)?.type]?.name?.toLowerCase() || 'obra'}`;
      case 'deliver': return t.step === 0 ? `Buscando ${lab[t.res]} para a obra` : `Levando ${lab[t.res]} à obra`;
      case 'haul': return t.step === 0 ? `Indo recolher ${lab[t.res]}` : `Levando ${lab[t.res]} ao depósito`;
      case 'harvest': { const n = S.nodes.get(t.nodeId); return n ? ({ tree: 'Cortando árvore', stone: 'Quebrando pedra', iron: 'Extraindo ferro' })[n.type] : 'Coletando'; }
      case 'idle': return 'Sem tarefa, aguardando';
    }
    return '';
  }
}
export { NODE };
