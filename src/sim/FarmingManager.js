import { ORCHARD_CROPS, PROFESSIONS, BUILDINGS, CROPS, FARM_MAX, FARM_MIN, FORAGE_RADIUS, DAY, T } from './defs.js';

// Fazendas, cabanas de coleta e distribuição de agricultores e coletores.
export class FarmingManager {
  constructor(sim) { this.sim = sim; this.forageRest = DAY * 1.5; }
  get(id) { return this.sim.farms.find(f => f.id === id); }

  validate(x0, y0, x1, y1) {
    const W = this.sim.world, w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < FARM_MIN || h < FARM_MIN) return { ok: false, reason: `A fazenda precisa de pelo menos ${FARM_MIN}×${FARM_MIN}` };
    if (w > FARM_MAX || h > FARM_MAX) return { ok: false, reason: `A fazenda pode ter no máximo ${FARM_MAX}×${FARM_MAX}` };
    const c0 = this.sim.citizens.find(c => !c.inside) || this.sim.citizens[0];
    const main = W.compAt(c0.x | 0, c0.y | 0);
    let reach = false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!W.inb(x, y)) return { ok: false, reason: 'Fora do mapa' };
      const i = W.idx(x, y), t = W.terrain[i];
      if (t === T.WATER || t === T.FORD || t === T.MOUNTAIN) return { ok: false, reason: 'Só dá para plantar em terra firme' };
      if (W.buildingAt[i] !== -1 || W.doorAt[i]) return { ok: false, reason: 'Há uma construção ou entrada aqui' };
      if (W.nodeAt[i] !== -1) return { ok: false, reason: 'Limpe árvores e rochas desta área primeiro' };
      if (W.pileAt[i] !== -1) return { ok: false, reason: 'Há materiais no chão aqui' };
      if (W.fieldAt[i] !== -1) return { ok: false, reason: 'Já existe uma fazenda aqui' };
      if (W.comp[i] === main) reach = true;
    }
    if (!reach) return { ok: false, reason: 'Os aldeões não conseguem chegar aqui' };
    return { ok: true };
  }
  place(x0, y0, x1, y1, crop = 'potato', kind = 'farm') {
    const v = this.validate(x0, y0, x1, y1);
    if (!v.ok) return v;
    const W = this.sim.world, S = this.sim;
    const f = { id: S.newId(), x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, crop, kind, tiles: [], maxWorkers: 1, cooldown: 0 };
    if (kind === 'pasture') { f.herd = 2; f.wool = 0; f.crop = null; }
    if (kind === 'orchard') f.crop = ORCHARD_CROPS.includes(crop) ? crop : 'apple';
    f.maxWorkers = Math.min(4, Math.max(1, Math.round((f.w * f.h) / 16)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      W.fieldAt[W.idx(x, y)] = f.id;
      f.tiles.push({ x, y, st: kind === 'pasture' ? -1 : 0, g: 0, crop: null, reservedBy: null });
    }
    S.farms.push(f);
    S.stats.placed.farm = (S.stats.placed.farm || 0) + 1;
    S.events.push({ t: 'farmAdded', id: f.id });
    return { ok: true, farm: f };
  }
  remove(f) {
    const S = this.sim, W = S.world;
    S.construction.cancelUpgrade(f);
    for (const c of S.citizens) {
      if (c.task?.farmId === f.id) S.jobs.abort(c);
      if (c.workplace === f.id) c.workplace = null;
    }
    for (const t of f.tiles) W.fieldAt[W.idx(t.x, t.y)] = -1;
    S.farms.splice(S.farms.indexOf(f), 1);
    S.events.push({ t: 'farmRemoved', id: f.id, tiles: f.tiles });
  }
  workers(place) { return this.sim.citizens.filter(c => c.workplace === place.id).length; }
  // Ordem de trabalho: colher, plantar, preparar. Pega o tile mais perto.
  pickTile(f, c, comp) {
    const W = this.sim.world, season = this.sim.season.index();
    let best = -1, bs = Infinity;
    const carrying = c.inv.res;
    const left = carrying ? 6 - c.inv.amount : 6;
    for (let i = 0; i < f.tiles.length; i++) {
      const t = f.tiles[i];
      if (t.reservedBy != null || t.st === 2 || t.st === -1) continue;
      if (t.st === 0 && season === 3) continue;
      if (t.st === 1 && season >= 2 && !CROPS[f.crop].tree) continue;
      if (t.st === 1 && season === 3) continue;
      if (carrying && (t.st !== 3 || t.crop !== carrying || this.tileYield(t) > left)) continue;
      if (W.comp[W.idx(t.x, t.y)] !== comp) continue;
      const rank = t.st === 3 ? 0 : t.st === 1 ? 1000 : 2000;
      const s = rank + Math.abs(t.x - c.x) + Math.abs(t.y - c.y);
      if (s < bs) { bs = s; best = i; }
    }
    return best;
  }
  tileYield(t) {
    const W = this.sim.world, base = CROPS[t.crop].yield;
    const y = W.terrain[W.idx(t.x, t.y)] === T.FERTILE ? Math.ceil(base * 1.5) : base;
    const f = this.get(W.fieldAt[W.idx(t.x, t.y)]);
    const up = f ? Math.ceil(y * (1 + 0.3 * ((f.level || 1) - 1))) : y;
    return this.sim.badHarvest ? Math.max(1, Math.floor(up / 2)) : up;
  }
  fertility(f) {
    const W = this.sim.world;
    return f.tiles.filter(t => W.terrain[W.idx(t.x, t.y)] === T.FERTILE).length / f.tiles.length;
  }
  finishTile(f, i, c) {
    const t = f.tiles[i], S = this.sim;
    t.reservedBy = null;
    if (t.st === 0) t.st = 1;
    else if (t.st === 1) { t.st = 2; t.crop = f.crop; t.g = 0; }
    else if (t.st === 3) {
      const y = this.tileYield(t);
      S.stats.produced[t.crop] += y;
      c.inv.res = t.crop; c.inv.amount += y;
      if (CROPS[t.crop].tree) { t.st = 2; t.g = 0; }
      else { t.st = 1; t.crop = null; t.g = 0; }
    }
    S.events.push({ t: 'crop', farmId: f.id, i });
  }
  // Roda uma vez por segundo de jogo.
  tick() {
    const S = this.sim, winter = S.season.index() === 3;
    for (const f of S.farms) {
      if (f.kind === 'pasture') {
        f.wool += f.herd * (f.level || 1) * (2 / (DAY * 6));
        const cap = Math.max(2, Math.floor((f.w * f.h) / 6));
        if (S.season.index() === 0 && f.herd < cap && S.rng.next() < f.herd * 0.25 / (DAY * 1.5)) f.herd++;
        continue;
      }
      for (let i = 0; i < f.tiles.length; i++) {
        const t = f.tiles[i];
        if (t.st !== 2) continue;
        if (winter && !CROPS[t.crop].tree) continue;
        if (winter) continue;
        const grow = CROPS[t.crop].grow, a = Math.floor((t.g / grow) * 3);
        t.g += 1;
        if (t.g >= grow) { t.st = 3; S.events.push({ t: 'crop', farmId: f.id, i }); }
        else if (Math.floor((t.g / grow) * 3) !== a) S.events.push({ t: 'crop', farmId: f.id, i });
      }
    }
    this.balance();
  }
  // A geada mata o que não foi colhido. Pomares só perdem os frutos.
  frost() {
    const S = this.sim;
    let lost = 0;
    for (const f of S.farms) for (let i = 0; i < f.tiles.length; i++) {
      const t = f.tiles[i];
      if (t.st < 2 || !t.crop) continue;
      if (CROPS[t.crop].tree) { if (t.st === 3) { t.st = 2; t.g = 0; lost++; S.events.push({ t: 'crop', farmId: f.id, i }); } continue; }
      lost++;
      t.st = 1; t.crop = null; t.g = 0; t.reservedBy = null;
      S.events.push({ t: 'crop', farmId: f.id, i });
    }
    if (lost) S.population.news('warn', `A geada destruiu ${lost} canteiros que não foram colhidos.`);
  }
  places(prof) {
    const S = this.sim;
    const out = S.buildings.filter(b => b.done && BUILDINGS[b.type].prof === prof).map(b => ({ ref: b, max: (b.maxWorkers ?? BUILDINGS[b.type].workers) + ((b.level || 1) - 1) }));
    if (prof === 'farmer') for (const f of S.farms) if (f.kind !== 'pasture') out.push({ ref: f, max: f.maxWorkers });
    if (prof === 'herder') for (const f of S.farms) if (f.kind === 'pasture') out.push({ ref: f, max: f.maxWorkers });
    return out;
  }
  // Cada profissional recebe automaticamente um local com vaga.
  balance() {
    const S = this.sim;
    for (const prof of Object.keys(PROFESSIONS)) {
      if (prof === 'laborer' || prof === 'builder') continue;
      const places = this.places(prof);
      const list = S.citizens.filter(c => c.profession === prof);
      if (!list.length) continue;
      const count = new Map(places.map(p => [p.ref.id, 0]));
      for (const c of list) {
        const p = places.find(q => q.ref.id === c.workplace);
        if (!p || count.get(p.ref.id) >= p.max) c.workplace = null;
        else count.set(p.ref.id, count.get(p.ref.id) + 1);
      }
      for (const c of list) {
        if (c.workplace != null) continue;
        const p = places.filter(q => count.get(q.ref.id) < q.max).sort((a, b) => count.get(a.ref.id) - count.get(b.ref.id))[0];
        if (!p) break;
        c.workplace = p.ref.id; count.set(p.ref.id, count.get(p.ref.id) + 1);
      }
    }
  }
  vacancies() {
    const out = {};
    for (const prof of Object.keys(PROFESSIONS)) {
      if (prof === 'laborer' || prof === 'builder') continue;
      let n = 0;
      for (const p of this.places(prof)) n += Math.max(0, p.max - this.workers(p.ref));
      if (n) out[prof] = n;
    }
    return out;
  }
  forestAround(hut) {
    const W = this.sim.world;
    let n = 0;
    for (let y = hut.y - FORAGE_RADIUS; y <= hut.y + FORAGE_RADIUS; y++) for (let x = hut.x - FORAGE_RADIUS; x <= hut.x + FORAGE_RADIUS; x++) {
      if (W.inb(x, y) && W.forest[W.idx(x, y)] && !W.blocked(x, y)) n++;
    }
    return n;
  }
  forageSpot(hut, c, comp) {
    const W = this.sim.world, r = this.sim.rng, now = this.sim.time;
    for (let i = 0; i < 30; i++) {
      const x = hut.x + r.int(-FORAGE_RADIUS, FORAGE_RADIUS), y = hut.y + r.int(-FORAGE_RADIUS, FORAGE_RADIUS);
      if (!W.inb(x, y)) continue;
      const k = W.idx(x, y);
      if (W.forest[k] && !W.blockedI(k) && W.comp[k] === comp && W.forageUntil[k] <= now && W.fieldAt[k] === -1) return [x, y];
    }
    return null;
  }
}
