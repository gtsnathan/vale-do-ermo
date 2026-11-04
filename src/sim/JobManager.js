import { CARRY, FARM_WORK, FORAGE_RADIUS, HUNGRY, NODE, PANTRY_LOW, PANTRY_TRIP, RES, RES_LABEL, BUILDINGS, isFood } from './defs.js';

// Decide o que cada aldeão faz a seguir e reserva tudo antes de ele sair andando.
// Reserva antes de caminhar é o que impede dois aldeões de buscarem a mesma carga.
export class JobManager {
  constructor(sim) { this.sim = sim; }

  assign(c) {
    const S = this.sim, W = S.world;
    const comp = W.compAt(c.x | 0, c.y | 0);
    if (c.inv.res) {
      if (!S.isNight() && (this._farmNext(c, comp) || this._forage(c, comp))) return true;
      if (c.task) return true;
      return this._cargo(c, comp);
    }
    if (S.isNight()) return this._rest(c);
    if (S.population.isChild(c)) return this._warmUp(c) || this._cure(c, comp) || this._eat(c, comp) || this._idle(c);
    if (c.profession === 'student') return this._warmUp(c) || this._eat(c, comp) || S.work.study(c, comp) || this._idle(c);
    return this._warmUp(c) || this._cure(c, comp) || this._eat(c, comp) || this._fetch(c, comp) || this._equip(c, comp)
      || S.work.assign(c, comp)
      || (c.profession === 'builder' && this._build(c, comp))
      || (c.profession === 'farmer' && this._farmNext(c, comp))
      || ((c.profession === 'gatherer' || c.profession === 'herbalist') && this._forage(c, comp))
      || this._atPost(c) || this._supply(c, comp) || this._supplyInput(c, comp) || S.infra.assign(c, comp) || this._haul(c, comp) || this._harvest(c, comp) || this._idle(c);
  }

  // Comer em casa se houver despensa; sem isso, come direto no celeiro.
  _eat(c, comp) {
    if (c.hunger < HUNGRY) return false;
    const S = this.sim, home = c.home != null ? S.building(c.home) : null;
    if (home && home.done && S.population.foodIn(home) > 0) {
      c.task = { kind: 'eat', buildingId: home.id };
      return true;
    }
    const d = S.storage.nearestFood(c.x, c.y, comp);
    if (!d) return false;
    const res = S.storage.bestFood(d);
    d.reserved[res]++;
    c.task = { kind: 'eatBarn', depotId: d.id, res };
    return true;
  }
  // Quem tem posto fica nele esperando trabalho. Só ofícios parados pelo inverno ajudam em outros serviços.
  _atPost(c) {
    const S = this.sim;
    if (c.workplace == null || c.profession === 'laborer' || c.profession === 'builder') return false;
    const place = S.building(c.workplace);
    if (!place) return false;
    if (S.season.index() === 3 && ['farmer', 'gatherer', 'herbalist', 'forester', 'herder'].includes(c.profession)) return false;
    c.task = { kind: 'staff', buildingId: place.id, w: 3 + S.rng.next() * 3 };
    return true;
  }
  // Trabalhadores gerais abastecem as oficinas: o artesão não sai do posto.
  _supplyInput(c, comp) {
    const S = this.sim;
    for (const b of S.buildings) {
      if (!b.done || !b.input || !S.farming.workers(b) || S.world.compAt(b.door.x, b.door.y) !== comp) continue;
      const def = BUILDINGS[b.type];
      const wants = def.keep || Object.fromEntries(Object.entries(def.recipe.in).map(([r, n]) => [r, n * 4]));
      for (const r in wants) {
        b.enr = b.enr || {};
        const short = wants[r] - (b.input[r] || 0) - (b.enr[r] || 0);
        if (short <= 0) continue;
        const d = S.storage.nearestWith(b.door.x, b.door.y, comp, r);
        if (!d) continue;
        const n = Math.min(short, CARRY[r], S.storage.available(d, r));
        d.reserved[r] += n;
        b.enr[r] = (b.enr[r] || 0) + n;
        c.task = { kind: 'craftFetch', depotId: d.id, buildingId: b.id, res: r, n, step: 0 };
        return true;
      }
    }
    return false;
  }
  // Com frio demais, volta para casa para se aquecer.
  _warmUp(c) {
    const S = this.sim;
    if (c.warmth > 30 || c.home == null) return false;
    const h = S.building(c.home);
    if (!h || !h.done || S.season.temp() > 8) return false;
    c.task = { kind: 'warm', buildingId: h.id };
    return true;
  }
  _cure(c, comp) {
    if (c.sick <= 0) return false;
    const S = this.sim;
    const h = S.buildings.find(b => b.done && b.type === 'hospital' && (b.input?.herbs || 0) - (b.resv || 0) > 0 && S.farming.workers(b) > 0 && S.world.compAt(b.door.x, b.door.y) === comp);
    if (!h) return false;
    h.resv = (h.resv || 0) + 1;
    c.task = { kind: 'cure', buildingId: h.id };
    return true;
  }
  // Um morador por vez abastece a casa com comida e, antes do frio, com lenha.
  _fetch(c, comp) {
    const S = this.sim, home = c.home != null ? S.building(c.home) : null;
    if (!home || !home.done || home.fetching != null) return false;
    if (S.world.compAt(home.door.x, home.door.y) !== comp) return false;
    const P = S.population;
    let d = null, res = null;
    if (P.foodIn(home) < PANTRY_LOW && (d = S.storage.nearestFood(home.door.x, home.door.y, comp))) res = S.storage.bestFood(d);
    if (!res && (home.pantry.firewood || 0) < 5) {
      d = S.storage.nearestWith(home.door.x, home.door.y, comp, 'firewood');
      if (d) res = 'firewood';
    }
    if (!res) return false;
    const n = Math.min(res === 'firewood' ? 5 : PANTRY_TRIP, S.storage.available(d, res));
    d.reserved[res] += n;
    home.fetching = c.id;
    c.task = { kind: 'fetch', depotId: d.id, buildingId: home.id, res, n, step: 0 };
    return true;
  }
  // Ferramenta gasta ou roupa rasgada: pega outra no estoque.
  _equip(c, comp) {
    const S = this.sim;
    const res = c.toolLife <= 0 ? 'tools' : c.coatLife <= 0 && S.season.index() >= 2 ? 'coat' : null;
    if (!res) return false;
    const d = S.storage.nearestWith(c.x, c.y, comp, res);
    if (!d) return false;
    d.reserved[res]++;
    c.task = { kind: 'equip', depotId: d.id, res };
    return true;
  }
  _farmNext(c, comp) {
    if (c.profession !== 'farmer' || c.workplace == null) return false;
    const S = this.sim, farm = S.farming.get(c.workplace);
    if (!farm) return false;
    const pick = S.farming.pickTile(farm, c, comp);
    if (pick < 0) return false;
    farm.tiles[pick].reservedBy = c.id;
    c.task = { kind: 'farm', farmId: farm.id, i: pick, w: 0 };
    return true;
  }
  _forage(c, comp) {
    if ((c.profession !== 'gatherer' && c.profession !== 'herbalist') || c.workplace == null) return false;
    if (this.sim.season.index() === 3) return false;
    if (c.inv.res && c.inv.amount + 2 > CARRY[c.inv.res]) return false;
    const S = this.sim, hut = S.building(c.workplace);
    if (!hut || !hut.done) return false;
    const spot = S.farming.forageSpot(hut, c, comp);
    if (!spot) return false;
    S.world.forageUntil[S.world.idx(spot[0], spot[1])] = S.time + S.farming.forageRest;
    c.task = { kind: 'forage', spot, w: 0 };
    return true;
  }

  ring(b) {
    const out = [], W = this.sim.world;
    for (let i = b.x; i < b.x + b.w; i++) { out.push([i, b.y - 1]); out.push([i, b.y + b.h]); }
    for (let j = b.y; j < b.y + b.h; j++) { out.push([b.x - 1, j]); out.push([b.x + b.w, j]); }
    return out.filter(([x, y]) => !W.blocked(x, y));
  }
  reachable(list, comp) { return list.filter(([x, y]) => this.sim.world.compAt(x, y) === comp); }

  _cargo(c, comp) {
    const d = this.sim.storage.nearestWithSpace(c.x, c.y, comp, c.inv.res);
    if (!d) { c.task = { kind: 'dropCargo' }; return true; }
    // Reserva só o espaço que existe; o que sobrar sai em outra viagem ou fica no chão.
    const n = Math.min(c.inv.amount, this.sim.storage.free(d));
    d.incoming += n;
    c.task = { kind: 'cargo', depotId: d.id, n };
    return true;
  }
  _rest(c) {
    const S = this.sim;
    const home = c.home != null ? S.building(c.home) : null;
    if (home) { c.task = { kind: 'home', buildingId: home.id }; return true; }
    c.task = { kind: 'camp' };
    return true;
  }
  _sites() { const C = this.sim.construction; return [...this.sim.buildings, ...this.sim.farms].filter(b => C.proj(b)); }

  _build(c, comp) {
    const S = this.sim;
    for (const b of this._sites()) {
      if (b.cooldown > S.time || !S.construction.materialsComplete(b)) continue;
      const pj = S.construction.proj(b);
      if (pj.builders.length >= (BUILDINGS[b.type]?.builders ?? 3)) continue;
      const spots = this.reachable(this.ring(b), comp);
      if (!spots.length) continue;
      pj.builders.push(c.id);
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
        S.construction.proj(b).enroute[res] += n;
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
      if (dist >= bd || !S.storage.nearestWithSpace(p.x, p.y, comp, p.res)) continue;
      bd = dist; best = p;
    }
    if (!best) return false;
    const d = S.storage.nearestWithSpace(best.x, best.y, comp, best.res);
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
        const pj = S.construction.proj(S.building(t.siteId));
        if (pj) pj.enroute[t.res] -= t.n;
        if (t.step === 0) {
          if (t.srcType === 'depot') { const d = S.building(t.srcId); if (d && d.done) d.reserved[t.res] -= t.n; }
          else { const p = S.resources.pile(t.srcId); if (p) p.reserved -= t.n; }
        }
        break;
      }
      case 'build': {
        const pj = S.construction.proj(S.building(t.siteId));
        if (pj) pj.builders = pj.builders.filter(id => id !== c.id);
        break;
      }
      case 'harvest': { const n = S.nodes.get(t.nodeId); if (n) n.reservedBy = null; break; }
      case 'equip': { const d = S.building(t.depotId); if (d && d.done) d.reserved[t.res]--; break; }
      case 'cure': { const h = S.building(t.buildingId); if (h) h.resv = Math.max(0, (h.resv || 0) - 1); break; }
      case 'craftFetch': case 'vend': case 'export': {
        const d = S.building(t.depotId), to = S.building(t.toId);
        if (t.kind !== 'craftFetch' && to && to.done) to.incoming -= t.n;
        if (t.step === 0 && d && d.done) d.reserved[t.res] -= t.n;
        if (t.kind === 'craftFetch') { const b = S.building(t.buildingId); if (b?.enr) b.enr[t.res] = Math.max(0, (b.enr[t.res] || 0) - t.n); }
        break;
      }
      case 'road': S.infra.release(t); break;
      case 'plant': { const k = S.world; void k; break; }
      case 'eatBarn': { const d = S.building(t.depotId); if (d && d.done) d.reserved[t.res]--; break; }
      case 'fetch': {
        const h = S.building(t.buildingId);
        if (h) h.fetching = null;
        if (t.step === 0) { const d = S.building(t.depotId); if (d && d.done) d.reserved[t.res] -= t.n; }
        break;
      }
      case 'farm': { const f = S.farming.get(t.farmId); if (f && f.tiles[t.i]) f.tiles[t.i].reservedBy = null; break; }
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
    if (this.sim.population.isChild(c) && c.task?.kind === 'idle') return 'Brincando perto de casa';
    if (!t) return 'Decidindo o que fazer';
    const S = this.sim;
    const low = r => (RES_LABEL[r] || 'carga').toLowerCase();
    switch (t.kind) {
      case 'cargo': return `Levando ${low(c.inv.res)} para guardar`;
      case 'dropCargo': return 'Sem espaço para guardar, soltando a carga';
      case 'home': return 'Voltando para casa';
      case 'camp': return 'Sem casa, passando a noite ao relento';
      case 'build': return `Construindo ${BUILDINGS[S.building(t.siteId)?.type]?.name?.toLowerCase() || 'obra'}`;
      case 'deliver': return t.step === 0 ? `Buscando ${low(t.res)} para a obra` : `Levando ${low(t.res)} à obra`;
      case 'haul': return t.step === 0 ? `Indo recolher ${low(t.res)}` : `Levando ${low(t.res)} para guardar`;
      case 'harvest': { const n = S.nodes.get(t.nodeId); return n ? ({ tree: 'Cortando árvore', stone: 'Quebrando pedra', iron: 'Extraindo ferro' })[n.type] : 'Coletando'; }
      case 'idle': return 'Sem tarefa, aguardando';
      case 'warm': return 'Voltando para se aquecer';
      case 'cure': return 'Indo ao hospital';
      case 'equip': return `Buscando ${low(t.res)}`;
      case 'craft': return `Produzindo ${low(BUILDINGS[S.building(t.buildingId)?.type]?.recipe?.out)}`;
      case 'craftFetch': return t.step === 0 ? `Buscando ${low(t.res)} para a oficina` : `Levando ${low(t.res)} à oficina`;
      case 'staff': return ({ teacher: 'Dando aula', doctor: 'Atendendo no hospital' })[c.profession] || 'No posto, esperando trabalho';
      case 'study': return 'Estudando na escola';
      case 'vend': return `Levando ${low(t.res)} ao mercado`;
      case 'export': return `Levando ${low(t.res)} ao posto`;
      case 'hunt': return 'Caçando';
      case 'herd': return 'Cuidando dos animais';
      case 'plant': return 'Plantando uma muda';
      case 'road': return ({ 1: 'Abrindo estrada', 2: 'Calçando estrada', 3: 'Construindo ponte', 4: 'Abrindo túnel' })[t.k];
      case 'eat': return 'Indo comer em casa';
      case 'eatBarn': return 'Indo comer no celeiro';
      case 'fetch': return t.step === 0 ? `Buscando ${low(t.res)} no celeiro` : 'Levando comida para casa';
      case 'forage': return 'Coletando na mata';
      case 'farm': {
        const f = S.farming.get(t.farmId), st = f?.tiles[t.i]?.st;
        return st === 0 ? 'Preparando a terra' : st === 1 ? 'Plantando' : 'Colhendo';
      }
    }
    return '';
  }
}
export { NODE, FARM_WORK, FORAGE_RADIUS, isFood };
