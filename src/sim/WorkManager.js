import { BUILDINGS, CARRY, DAY, FOODS, FORAGE_RADIUS, RES, STEP, VALUE } from './defs.js';

// Oficinas, serviços, caça, pastoreio, silvicultura, escola, mercado e comércio.
export class WorkManager {
  constructor(sim) { this.sim = sim; }

  assign(c, comp) {
    const S = this.sim;
    if (c.workplace == null) return false;
    const b = S.building(c.workplace);
    switch (c.profession) {
      case 'hunter': return this._assignHunt(c, comp, b);
      case 'forester': return this._assignForest(c, comp, b);
      case 'herder': return this._assignHerd(c);
      case 'vendor': return this._assignVend(c, comp, b);
      case 'trader': return this._assignExport(c, comp, b);
      case 'teacher': case 'doctor':
        if (b?.done) return this._keep(c, comp, b) || this._staffTask(c, b);
        return false;
      case 'woodcutter': case 'fisher': case 'smith': case 'tailor': case 'miner':
        return b?.done ? this._assignCraft(c, comp, b) : false;
    }
    return false;
  }

  /* ---------- Oficinas ---------- */
  _assignCraft(c, comp, b) {
    const R = BUILDINGS[b.type].recipe;
    if (this._fetchInput(c, comp, b, R.in, 3)) return true;
    for (const r in R.in) if ((b.input[r] || 0) < R.in[r]) return false;
    // Não produz sem ter onde guardar. Limite evita gastar toda a madeira em lenha.
    const S = this.sim;
    if (!S.storage.nearestWithSpace(b.door.x, b.door.y, comp, R.out)) return false;
    if (R.in.wood && S.storage.total(R.out) >= (b.limit ?? 60)) return false;
    if (!R.in.wood && !R.in.hide && S.storage.total(R.out) >= (b.limit ?? 200)) return false;
    if (R.in.hide && S.storage.total(R.out) >= (b.limit ?? 40)) return false;
    for (const r in R.in) { b.input[r] -= R.in[r]; S.stats.consumed[r] += R.in[r]; }
    c.task = { kind: 'craft', buildingId: b.id, w: 0 };
    return true;
  }
  _fetchInput(c, comp, b, needs, batch) {
    const S = this.sim;
    for (const r in needs) {
      if ((b.input[r] || 0) >= needs[r]) continue;
      const d = S.storage.nearestWith(b.door.x, b.door.y, comp, r);
      if (!d) continue;
      const n = Math.min(batch, CARRY[r], S.storage.available(d, r));
      d.reserved[r] += n;
      c.task = { kind: 'craftFetch', depotId: d.id, buildingId: b.id, res: r, n, step: 0 };
      return true;
    }
    return false;
  }
  _keep(c, comp, b) {
    const k = BUILDINGS[b.type].keep;
    if (!k) return false;
    for (const r in k) if ((b.input[r] || 0) < k[r] && this._fetchInput(c, comp, b, { [r]: k[r] }, 4)) return true;
    return false;
  }
  craftFetch(c, t, ai) {
    const S = this.sim, d = S.building(t.depotId), b = S.building(t.buildingId);
    if (!b) return S.jobs.abort(c);
    if (t.step === 0) {
      if (!d || !d.done) return S.jobs.abort(c);
      const r = ai._go(c, [[d.door.x, d.door.y]]);
      if (r === 'fail') return ai._fail(c);
      if (r !== 'arrived') return;
      d.stock[t.res] -= t.n; d.reserved[t.res] -= t.n;
      c.inv.res = t.res; c.inv.amount = t.n; t.step = 1;
      return;
    }
    const r = ai._go(c, [[b.door.x, b.door.y]]);
    if (r === 'fail') return ai._fail(c);
    if (r !== 'arrived') return;
    b.input[t.res] = (b.input[t.res] || 0) + t.n;
    c.inv.res = null; c.inv.amount = 0; c.task = null; c.think = 0.1;
  }
  craft(c, t, ai) {
    const S = this.sim, b = S.building(t.buildingId);
    if (!b) { c.task = null; return; }
    if (S.isNight()) { this._refund(b); c.task = null; return; }
    if (!t.there) {
      const r = ai._go(c, [[b.door.x, b.door.y]]);
      if (r === 'fail') { this._refund(b); c.task = null; c.think = 1; return; }
      if (r !== 'arrived') return;
      t.there = true;
    }
    c.anim = 'work'; c.tool = 'hammer';
    t.w += STEP * S.population.rate(c) * (1 + 0.35 * ((b.level || 1) - 1));
    S.population.wear(c);
    const def = BUILDINGS[b.type], R = def.recipe;
    if (t.w < R.t) return;
    S.stats.produced[R.out] += R.n;
    c.inv.res = R.out; c.inv.amount = R.n;
    c.task = null; c.think = 0.1; c.anim = 'idle';
    if (def.risky && S.config.events && S.rng.next() < 0.0015) S.eventsMgr.accident(c, def.name);
  }
  _refund(b) {
    const R = BUILDINGS[b.type].recipe;
    for (const r in R.in) { b.input[r] += R.in[r]; this.sim.stats.consumed[r] -= R.in[r]; }
  }
  _staffTask(c, b) { c.task = { kind: 'staff', buildingId: b.id, w: 6 + this.sim.rng.next() * 6 }; return true; }
  staff(c, t, ai) {
    const S = this.sim, b = S.building(t.buildingId);
    if (!b || S.isNight()) { c.task = null; return; }
    const r = ai._go(c, [[b.door.x, b.door.y]]);
    if (r === 'fail') { c.task = null; c.think = 1; return; }
    if (r !== 'arrived') return;
    c.anim = 'idle';
    t.w -= STEP;
    if (t.w <= 0) c.task = null;
  }

  /* ---------- Escola ---------- */
  schools() { return this.sim.buildings.filter(b => b.done && b.type === 'school'); }
  schoolOpen() { return this.schools().some(b => this.sim.farming.workers(b) > 0); }
  schoolSeat() {
    if (!this.schoolOpen()) return null;
    const seats = this.schools().reduce((a, b) => a + BUILDINGS.school.seats + 10 * ((b.level || 1) - 1), 0);
    return this.sim.citizens.filter(c => c.profession === 'student').length < seats ? this.schools()[0] : null;
  }
  study(c, comp) {
    const b = this.schools().find(s => this.sim.world.compAt(s.door.x, s.door.y) === comp);
    if (!b) return false;
    c.task = { kind: 'study', buildingId: b.id, w: 15 };
    return true;
  }
  studyStep(c, t, ai) {
    const S = this.sim, b = S.building(t.buildingId);
    if (!b || S.isNight()) { c.task = null; return; }
    const r = ai._go(c, [[b.door.x, b.door.y]]);
    if (r === 'fail') { c.task = null; c.think = 1; return; }
    if (r !== 'arrived') return;
    c.anim = 'sit';
    t.w -= STEP;
    if (t.w <= 0) c.task = null;
  }

  /* ---------- Mercado e posto ---------- */
  _assignVend(c, comp, m) {
    const S = this.sim;
    if (!m?.done || S.storage.free(m) <= 0) return false;
    for (const res of ['firewood', ...FOODS, 'tools', 'coat']) {
      const lim = res === 'firewood' ? 30 : FOODS.includes(res) ? 30 : 6;
      if (m.stock[res] >= lim) continue;
      const src = S.storage.stores().filter(d => d !== m && BUILDINGS[d.type].stores !== 'market' && BUILDINGS[d.type].stores !== 'trade' && S.storage.available(d, res) > 0 && S.world.compAt(d.door.x, d.door.y) === comp)[0];
      if (!src) continue;
      const n = Math.min(CARRY[res], S.storage.available(src, res), S.storage.free(m), lim - m.stock[res]);
      if (n <= 0) continue;
      src.reserved[res] += n; m.incoming += n;
      c.task = { kind: 'vend', depotId: src.id, toId: m.id, res, n, step: 0 };
      return true;
    }
    return false;
  }
  _assignExport(c, comp, p) {
    const S = this.sim;
    if (!p?.done || !p.exportRes || S.storage.free(p) <= 0) return false;
    if (p.stock[p.exportRes] >= (p.exportMax ?? 60)) return false;
    const res = p.exportRes;
    const src = S.storage.nearestWith(p.door.x, p.door.y, comp, res);
    if (!src) return false;
    const n = Math.min(CARRY[res], S.storage.available(src, res), S.storage.free(p));
    src.reserved[res] += n; p.incoming += n;
    c.task = { kind: 'export', depotId: src.id, toId: p.id, res, n, step: 0 };
    return true;
  }
  carryTo(c, t, ai) {
    const S = this.sim, d = S.building(t.depotId), to = S.building(t.toId);
    if (!to || !to.done) return S.jobs.abort(c);
    if (t.step === 0) {
      if (!d || !d.done) return S.jobs.abort(c);
      const r = ai._go(c, [[d.door.x, d.door.y]]);
      if (r === 'fail') return ai._fail(c);
      if (r !== 'arrived') return;
      d.stock[t.res] -= t.n; d.reserved[t.res] -= t.n;
      c.inv.res = t.res; c.inv.amount = t.n; t.step = 1;
      return;
    }
    const r = ai._go(c, [[to.door.x, to.door.y]]);
    if (r === 'fail') return ai._fail(c);
    if (r !== 'arrived') return;
    to.stock[t.res] += t.n; to.incoming -= t.n;
    c.inv.res = null; c.inv.amount = 0; c.task = null; c.think = 0.1;
  }
  // Mercadores: um barco por ano em cada verão, se houver posto.
  yearStart() {}
  boatTick() {
    const S = this.sim, T = S.trade;
    const posts = S.buildings.filter(b => b.done && b.type === 'trading');
    if (!posts.length) { T.boat = null; return; }
    if (T.boat) {
      if (S.time > T.boat.leave) { T.boat = null; T.next = S.time + DAY * 4; S.population.news('warn', 'O barco mercante foi embora.'); }
      return;
    }
    if (T.next == null) T.next = S.time + DAY;
    if (S.time < T.next) return;
    const all = RES.filter(r => r !== 'hide' || S.rng.chance(0.7));
    const offers = [];
    for (let i = 0; i < 6 && all.length; i++) {
      const r = all.splice(S.rng.int(0, all.length - 1), 1)[0];
      offers.push({ res: r, qty: 10 + S.rng.int(0, 30) });
    }
    T.boat = { leave: S.time + DAY * 2, offers };
    S.population.news('good', 'Um barco mercante chegou ao posto comercial.');
  }
  postValue(p) { return RES.reduce((a, r) => a + p.stock[r] * VALUE[r], 0); }
  buy(p, res, n) {
    const S = this.sim, boat = S.trade.boat;
    if (!boat) return { ok: false, reason: 'Não há barco no porto.' };
    const off = boat.offers.find(o => o.res === res);
    if (!off || off.qty <= 0) return { ok: false, reason: 'O mercador não tem mais isso.' };
    n = Math.min(n, off.qty);
    let due = n * VALUE[res];
    if (this.postValue(p) < due) return { ok: false, reason: 'Falta mercadoria no posto para pagar.' };
    for (const r of RES) {
      while (p.stock[r] > 0 && due > 0) {
        p.stock[r]--; S.stats.consumed[r]++; due -= VALUE[r];
      }
    }
    off.qty -= n;
    S.stats.produced[res] += n;
    S.resources.drop(p.door.x, p.door.y, res, n);
    return { ok: true };
  }

  /* ---------- Caça ---------- */
  _assignHunt(c, comp, b) {
    const S = this.sim;
    if (!b?.done) return false;
    let best = null, bd = 24;
    for (const a of S.animals) {
      if (a.hunter != null) continue;
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d < bd && S.world.compAt(a.x | 0, a.y | 0) === comp) { bd = d; best = a; }
    }
    if (!best) return false;
    best.hunter = c.id;
    c.task = { kind: 'hunt', animalId: best.id, w: 0, buildingId: b.id };
    return true;
  }
  hunt(c, t, ai) {
    const S = this.sim, a = S.animals.find(x => x.id === t.animalId);
    if (!a) { c.task = null; return; }
    if (S.isNight()) { a.hunter = null; c.task = null; return; }
    if (!t.there) {
      if (!c.path) t.goal = [a.x | 0, a.y | 0];
      const r = ai._go(c, [t.goal]);
      if (r === 'fail') { a.hunter = null; c.task = null; c.think = 1; return; }
      if (r !== 'arrived') return;
      t.there = true;
    }
    c.anim = 'work'; c.tool = 'axe';
    t.w += STEP * S.population.rate(c);
    if (t.w < 3) return;
    S.animals.splice(S.animals.indexOf(a), 1);
    S.stats.produced.meat += 5; S.stats.produced.hide += 2;
    c.inv.res = 'meat'; c.inv.amount = 5;
    S.resources.drop(c.x | 0, c.y | 0, 'hide', 2);
    c.task = null; c.think = 0.2; c.anim = 'idle';
  }
  animalsTick() {
    const S = this.sim, W = S.world;
    for (const a of S.animals) {
      if (a.hunter != null) { const h = S.citizen(a.hunter); if (!h || h.task?.animalId !== a.id) a.hunter = null; else continue; }
      if (a.wait > 0) { a.wait -= 1; continue; }
      const tx = (a.x | 0) + S.rng.int(-2, 2), ty = (a.y | 0) + S.rng.int(-2, 2);
      if (!W.blocked(tx, ty) && W.buildingAt[W.idx(tx, ty)] === -1) { a.tx = tx + 0.5; a.ty = ty + 0.5; }
      a.wait = S.rng.int(3, 12);
    }
    // Reprodução lenta: quem caça demais esgota a região.
    if (S.animals.length && S.animals.length < S.animalCap && S.rng.next() < S.animals.length * 0.02 / DAY) {
      const p = S.rng.pick(S.animals);
      S.animals.push({ id: S.newId(), x: p.x, y: p.y, tx: p.x, ty: p.y, wait: 3, hunter: null });
    }
  }
  animalsMove() {
    for (const a of this.sim.animals) {
      a.px = a.x; a.py = a.y;
      if (a.hunter != null) continue;
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      if (d > 0.02) { const s = Math.min(d, 0.04); a.x += dx / d * s; a.y += dy / d * s; a.face = dx - dy >= 0; }
    }
  }

  /* ---------- Pastagem ---------- */
  _assignHerd(c) {
    const f = this.sim.farming.get(c.workplace);
    if (!f) return false;
    c.task = { kind: 'herd', farmId: f.id, w: 0, spot: [f.x + this.sim.rng.int(0, f.w - 1), f.y + this.sim.rng.int(0, f.h - 1)] };
    return true;
  }
  herd(c, t, ai) {
    const S = this.sim, f = S.farming.get(t.farmId);
    if (!f || S.isNight()) { c.task = null; return; }
    if (!t.there) {
      const r = ai._go(c, [t.spot]);
      if (r === 'fail') { c.task = null; c.think = 1; return; }
      if (r !== 'arrived') return;
      t.there = true;
    }
    c.anim = 'work'; c.tool = 'hoe';
    t.w += STEP * S.population.rate(c);
    if (t.w < 6) return;
    const cap = Math.max(2, Math.floor((f.w * f.h) / 6));
    if (f.wool >= 2) {
      const n = Math.floor(Math.min(f.wool, 4));
      f.wool -= n; S.stats.produced.hide += n;
      c.inv.res = 'hide'; c.inv.amount = n;
    } else if (f.herd >= cap && f.herd > 2) {
      f.herd--; S.stats.produced.meat += 4;
      c.inv.res = 'meat'; c.inv.amount = 4;
    }
    c.task = null; c.think = 0.2; c.anim = 'idle';
  }

  /* ---------- Silvicultura ---------- */
  _assignForest(c, comp, b) {
    const S = this.sim, W = S.world;
    if (!b?.done) return false;
    const R = FORAGE_RADIUS - 2;
    let best = null, bd = Infinity, count = 0;
    for (const n of S.nodes.values()) {
      if (n.type !== 'tree' || Math.abs(n.x - b.x) > R || Math.abs(n.y - b.y) > R) continue;
      count++;
      if (n.young || n.reservedBy != null || n.marked) continue;
      const dd = Math.abs(n.x - c.x) + Math.abs(n.y - c.y);
      if (dd < bd && S.jobs.reachable(S.jobs.nodeSpots(n), comp).length) { bd = dd; best = n; }
    }
    // Mantém a mata em pé: corta só quando há árvores bastantes; senão, planta.
    if (best && (count >= 24 || S.rng.chance(0.3))) {
      best.marked = true; S.markedNodes.add(best); best.reservedBy = c.id;
      S.events.push({ t: 'mark', id: best.id, value: true });
      c.task = { kind: 'harvest', nodeId: best.id };
      return true;
    }
    if (S.season.index() === 3) return false;
    for (let i = 0; i < 20; i++) {
      const x = b.x + S.rng.int(-R, R), y = b.y + S.rng.int(-R, R);
      if (!W.inb(x, y)) continue;
      const k = W.idx(x, y);
      if (W.blockedI(k) || W.terrain[k] > 1 || W.nodeAt[k] !== -1 || W.pileAt[k] !== -1 || W.doorAt[k] || W.fieldAt[k] !== -1 || W.road[k] || W.comp[k] !== comp) continue;
      c.task = { kind: 'plant', spot: [x, y], w: 0 };
      return true;
    }
    return false;
  }
  plant(c, t, ai) {
    const S = this.sim, W = S.world;
    if (S.isNight()) { c.task = null; return; }
    if (!t.there) {
      const r = ai._go(c, [t.spot]);
      if (r === 'fail') { c.task = null; c.think = 1; return; }
      if (r !== 'arrived') return;
      t.there = true;
    }
    c.anim = 'work'; c.tool = 'hoe';
    t.w += STEP;
    if (t.w < 3) return;
    const k = W.idx(t.spot[0], t.spot[1]);
    if (W.nodeAt[k] === -1 && W.buildingAt[k] === -1 && W.pileAt[k] === -1 && W.fieldAt[k] === -1 && !W.doorAt[k]) {
      const n = S._addNode({ type: 'tree', x: t.spot[0], y: t.spot[1], variant: S.rng.int(0, 2) * 10 + S.rng.int(0, 2) });
      n.young = true; n.g = 0; n.planted = true;
      S.saplings.add(n);
      S.events.push({ t: 'nodeAdded', id: n.id });
    }
    c.task = null; c.think = 0.2; c.anim = 'idle';
  }
  saplingsTick() {
    const S = this.sim;
    for (const n of S.saplings) {
      n.g++;
      const stage = n.g < DAY * 2 ? 0 : n.g < DAY * 4 ? 1 : 2;
      if (stage !== n.stage) { n.stage = stage; S.events.push({ t: 'nodeGrow', id: n.id }); }
      if (stage === 2) { n.young = false; S.saplings.delete(n); }
    }
  }
}
