import { FARM_WORK, HUNGER_RATE, NODE, STEP, WALK } from './defs.js';

// Máquina de estados dos aldeões: anda, pega, carrega, entrega, trabalha.
export class AIManager {
  constructor(sim) { this.sim = sim; }

  update(c) {
    const S = this.sim, W = S.world;
    c.px = c.x; c.py = c.y;
    c.hunger = Math.min(100, c.hunger + HUNGER_RATE * STEP * (c.inside ? 0.5 : 1));
    if (c.inside) {
      const home = S.building(c.home);
      if (home && c.hunger > 45) S.population.eatFromPantry(c, home);
      if (!S.isNight()) { c.inside = false; c.task = null; c.think = S.rng.next() * 2; }
      return;
    }
    const tx = c.x | 0, ty = c.y | 0;
    if (W.blocked(tx, ty)) return this._evict(c);
    if (!c.task) {
      if (c.think > 0) { c.think -= STEP; c.anim = 'idle'; return; }
      S.jobs.assign(c);
      if (!c.task) { c.think = 0.5; return; }
    }
    const fn = this[`_${c.task.kind}`];
    fn.call(this, c, c.task);
  }

  // Quem ficou dentro de um canteiro novo sai pelo tile livre mais próximo.
  _evict(c) {
    const W = this.sim.world;
    c.path = null;
    let best = null, bd = Infinity;
    for (let r = 1; r < 12 && !best; r++) {
      for (let y = (c.y | 0) - r; y <= (c.y | 0) + r; y++) for (let x = (c.x | 0) - r; x <= (c.x | 0) + r; x++) {
        if (W.blocked(x, y)) continue;
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
        if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
      }
    }
    if (!best) return;
    const step = WALK * STEP * 1.5;
    if (bd <= step) { c.x = best[0]; c.y = best[1]; return; }
    c.x += (best[0] - c.x) / bd * step;
    c.y += (best[1] - c.y) / bd * step;
    c.anim = 'walk'; this._face(c, best[0] - c.px, best[1] - c.py);
  }
  _face(c, dx, dy) {
    const sx = dx - dy, sy = dx + dy;
    if (sx !== 0) c.faceRight = sx > 0;
    if (Math.abs(sy) > 1e-4) c.faceFront = sy > 0;
  }

  // Devolve 'arrived', 'moving' ou 'fail'.
  _go(c, goals) {
    const S = this.sim, W = S.world;
    if (!c.path) {
      if (S.pathBudget <= 0) { c.anim = 'idle'; return 'moving'; }
      S.pathBudget--;
      const p = S.pathfinding.find(c.x | 0, c.y | 0, goals);
      if (!p) return 'fail';
      c.path = p; c.pathI = 0;
    }
    if (c.pathI >= c.path.length) { c.path = null; c.anim = 'idle'; return 'arrived'; }
    const [nx, ny] = c.path[c.pathI];
    if (W.blocked(nx, ny)) { c.path = null; return 'moving'; }
    const tx = nx + 0.5, ty = ny + 0.5;
    const cur = W.idx(c.x | 0, c.y | 0);
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    // Quem passa fome anda mais devagar. Doenças e mortes por fome entram na versão 0.3.
    const step = (WALK * STEP) / W.costI(cur) * (c.hunger >= 95 ? 0.7 : 1);
    this._face(c, dx, dy);
    c.anim = 'walk';
    if (d <= step) { c.x = tx; c.y = ty; c.pathI++; }
    else { c.x += dx / d * step; c.y += dy / d * step; }
    return 'moving';
  }
  _fail(c, target) {
    if (target) target.cooldown = this.sim.time + 20;
    this.sim.jobs.abort(c);
    c.think = 1;
  }

  _cargo(c, t) {
    const S = this.sim, d = S.building(t.depotId);
    if (!d || !d.done) return S.jobs.abort(c);
    const r = this._go(c, [[d.door.x, d.door.y]]);
    if (r === 'fail') return this._fail(c);
    if (r !== 'arrived') return;
    d.stock[c.inv.res] += t.n;
    d.incoming -= t.n;
    c.inv.amount -= t.n;
    if (c.inv.amount <= 0) { c.inv.res = null; c.inv.amount = 0; }
    c.task = null; c.think = 0.2;
  }
  _dropCargo(c) {
    const S = this.sim;
    S.resources.drop(c.x | 0, c.y | 0, c.inv.res, c.inv.amount);
    c.inv.res = null; c.inv.amount = 0; c.task = null; c.think = 1;
  }
  _haul(c, t) {
    const S = this.sim, d = S.building(t.depotId);
    if (!d || !d.done) return S.jobs.abort(c);
    if (t.step === 0) {
      const p = S.resources.pile(t.pileId);
      if (!p) return S.jobs.abort(c);
      const r = this._go(c, [[p.x, p.y]]);
      if (r === 'fail') return this._fail(c, p);
      if (r !== 'arrived') return;
      S.resources.take(p, t.n);
      c.inv.res = t.res; c.inv.amount = t.n;
      t.step = 1;
      return;
    }
    const r = this._go(c, [[d.door.x, d.door.y]]);
    if (r === 'fail') return this._fail(c);
    if (r !== 'arrived') return;
    d.stock[t.res] += t.n;
    d.incoming -= t.n;
    c.inv.res = null; c.inv.amount = 0; c.task = null; c.think = 0.2;
  }
  _deliver(c, t) {
    const S = this.sim, site = S.building(t.siteId);
    if (!site || site.done) return S.jobs.abort(c);
    if (t.step === 0) {
      let goal;
      const src = t.srcType === 'depot' ? S.building(t.srcId) : S.resources.pile(t.srcId);
      if (!src) return S.jobs.abort(c);
      goal = t.srcType === 'depot' ? [src.door.x, src.door.y] : [src.x, src.y];
      const r = this._go(c, [goal]);
      if (r === 'fail') return this._fail(c, src);
      if (r !== 'arrived') return;
      if (t.srcType === 'depot') { src.stock[t.res] -= t.n; src.reserved[t.res] -= t.n; }
      else S.resources.take(src, t.n);
      c.inv.res = t.res; c.inv.amount = t.n;
      t.step = 1;
      return;
    }
    const spots = S.jobs.ring(site);
    const r = this._go(c, spots);
    if (r === 'fail') return this._fail(c, site);
    if (r !== 'arrived') return;
    site.delivered[t.res] += t.n;
    site.enroute[t.res] -= t.n;
    c.inv.res = null; c.inv.amount = 0; c.task = null; c.think = 0.2;
  }
  _build(c, t) {
    const S = this.sim, site = S.building(t.siteId);
    if (!site || site.done) return S.jobs.abort(c);
    if (S.isNight()) return S.jobs.abort(c);
    if (!t.there) {
      const r = this._go(c, [t.spot]);
      if (r === 'fail') return this._fail(c, site);
      if (r !== 'arrived') return;
      t.there = true;
    }
    this._face(c, site.x + site.w / 2 - c.x, site.y + site.h / 2 - c.y);
    c.anim = 'work'; c.tool = 'hammer';
    S.construction.addWork(site, STEP);
  }
  _harvest(c, t) {
    const S = this.sim, n = S.nodes.get(t.nodeId);
    if (!n || !n.marked) return S.jobs.abort(c);
    if (!t.there) {
      const r = this._go(c, S.jobs.nodeSpots(n));
      if (r === 'fail') return this._fail(c, n);
      if (r !== 'arrived') return;
      t.there = true;
    }
    this._face(c, n.x + 0.5 - c.x, n.y + 0.5 - c.y);
    c.anim = 'work'; c.tool = n.type === 'tree' ? 'axe' : 'pick';
    n.work += STEP;
    if (n.work >= NODE[n.type].work) {
      const res = NODE[n.type].res, amount = NODE[n.type].yield;
      S.stats.produced[res] += amount;
      S.removeNode(n);
      S.resources.drop(n.x, n.y, res, amount);
      c.task = null; c.think = 0.3; c.anim = 'idle';
    }
  }
  _home(c, t) {
    const S = this.sim, b = S.building(t.buildingId);
    if (!b || !S.isNight()) { c.task = null; return; }
    const r = this._go(c, [[b.door.x, b.door.y]]);
    if (r === 'fail') return this._fail(c);
    if (r !== 'arrived') return;
    if (c.hunger > 25) S.population.eatFromPantry(c, b);
    c.inside = true; c.task = null; c.anim = 'idle';
  }
  _camp(c, t) {
    const S = this.sim;
    if (!S.isNight()) { c.task = null; return; }
    if (t.there) { c.anim = 'sit'; return; }
    if (!t.spot) {
      const d = S.storage.depots()[0];
      const comp = S.world.compAt(c.x | 0, c.y | 0);
      const spots = d ? S.jobs.reachable(S.jobs.ring(d), comp) : [];
      t.spot = spots.length ? spots[c.id % spots.length] : [c.x | 0, c.y | 0];
    }
    const r = this._go(c, [t.spot]);
    if (r === 'fail') { t.there = true; return; }
    if (r === 'arrived') t.there = true;
  }
  _eat(c, t) {
    const S = this.sim, b = S.building(t.buildingId);
    if (!b || !b.done) return S.jobs.abort(c);
    const r = this._go(c, [[b.door.x, b.door.y]]);
    if (r === 'fail') return this._fail(c);
    if (r !== 'arrived') return;
    S.population.eatFromPantry(c, b);
    c.task = null; c.think = 0.5;
  }
  _eatBarn(c, t) {
    const S = this.sim, d = S.building(t.depotId);
    if (!d || !d.done) return S.jobs.abort(c);
    const r = this._go(c, [[d.door.x, d.door.y]]);
    if (r === 'fail') return this._fail(c);
    if (r !== 'arrived') return;
    d.stock[t.res]--; d.reserved[t.res]--;
    S.population.meal(c, t.res);
    c.task = null; c.think = 0.5;
  }
  _fetch(c, t) {
    const S = this.sim, d = S.building(t.depotId), home = S.building(t.buildingId);
    if (!home || !home.done) return S.jobs.abort(c);
    if (t.step === 0) {
      if (!d || !d.done) return S.jobs.abort(c);
      const r = this._go(c, [[d.door.x, d.door.y]]);
      if (r === 'fail') return this._fail(c);
      if (r !== 'arrived') return;
      d.stock[t.res] -= t.n; d.reserved[t.res] -= t.n;
      c.inv.res = t.res; c.inv.amount = t.n;
      t.step = 1;
      return;
    }
    const r = this._go(c, [[home.door.x, home.door.y]]);
    if (r === 'fail') return this._fail(c);
    if (r !== 'arrived') return;
    home.pantry[t.res] = (home.pantry[t.res] || 0) + t.n;
    home.fetching = null;
    c.inv.res = null; c.inv.amount = 0; c.task = null; c.think = 0.2;
  }
  _farm(c, t) {
    const S = this.sim, farm = S.farming.get(t.farmId), tile = farm?.tiles[t.i];
    if (!tile || S.isNight()) return S.jobs.abort(c);
    if (!t.there) {
      const r = this._go(c, [[tile.x, tile.y]]);
      if (r === 'fail') return this._fail(c, farm);
      if (r !== 'arrived') return;
      t.there = true;
    }
    c.anim = 'work'; c.tool = 'hoe';
    t.w += STEP;
    if (t.w < FARM_WORK[tile.st]) return;
    S.farming.finishTile(farm, t.i, c);
    c.task = null; c.think = 0.1; c.anim = 'idle';
  }
  _forage(c, t) {
    const S = this.sim;
    if (S.isNight()) return S.jobs.abort(c);
    if (!t.there) {
      const r = this._go(c, [t.spot]);
      if (r === 'fail') { S.jobs.abort(c); c.think = 0.5; return; }
      if (r !== 'arrived') return;
      t.there = true;
    }
    c.anim = 'work'; c.tool = 'hoe';
    t.w += STEP;
    if (t.w < 7) return;
    const res = c.inv.res || (S.rng.chance(0.6) ? 'berries' : 'mushroom');
    c.inv.res = res; c.inv.amount += 2;
    S.stats.produced[res] += 2;
    c.task = null; c.think = 0.2; c.anim = 'idle';
  }
  _idle(c, t) {
    const S = this.sim;
    if (t.wait > 0) { t.wait -= STEP; c.anim = 'idle'; return; }
    if (!t.moved) {
      t.moved = true;
      const W = S.world;
      const a = S.storage.depots()[0] || { door: { x: c.x | 0, y: c.y | 0 } };
      for (let i = 0; i < 8; i++) {
        const x = a.door.x + S.rng.int(-5, 5), y = a.door.y + S.rng.int(-5, 5);
        if (W.compAt(x, y) === W.compAt(c.x | 0, c.y | 0) && W.compAt(x, y) >= 0 && !W.doorAt[W.idx(x, y)]) { t.goal = [x, y]; break; }
      }
      if (!t.goal) { c.task = null; return; }
    }
    const r = this._go(c, [t.goal]);
    if (r !== 'moving') { c.task = null; c.think = 0.5; }
  }
}
