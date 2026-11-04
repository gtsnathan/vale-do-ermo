import { ROAD_WEAR, T, TRAIL_WEAR } from './defs.js';

// Estradas, pontes e túneis. Cada tile é uma pequena obra feita a pé.
const WORK = { 1: 1.5, 2: 2.5, 3: 5, 4: 9 };
const MAT = { 2: 'stone', 3: 'wood', 4: 'stone' };

export class InfraManager {
  constructor(sim) { this.sim = sim; }
  // Traça um caminho em L entre dois tiles.
  line(x0, y0, x1, y1) {
    const out = [];
    const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
    for (let x = x0; ; x += sx || 1) { out.push([x, y0]); if (x === x1) break; }
    if (sy) for (let y = y0 + sy; ; y += sy) { out.push([x1, y]); if (y === y1) break; }
    return out;
  }
  fits(k, x, y) {
    const W = this.sim.world;
    if (!W.inb(x, y)) return false;
    const i = W.idx(x, y), t = W.terrain[i];
    if (W.buildingAt[i] !== -1 || W.road[i] === 3 || W.road[i] === 4) return false;
    if (W.road[i] === k) return false;
    if (this.sim.roadJobs.some(j => j.x === x && j.y === y)) return false;
    if (k === 3) return t === T.WATER || t === T.FORD;
    if (k === 4) return t === T.MOUNTAIN;
    if (W.fieldAt[i] !== -1 || W.nodeBlocks[i] || W.nodeAt[i] !== -1) return false;
    return t === T.GRASS || t === T.FERTILE;
  }
  place(k, x0, y0, x1, y1) {
    const S = this.sim;
    let n = 0;
    for (const [x, y] of this.line(x0, y0, x1, y1)) {
      if (!this.fits(k, x, y)) continue;
      S.roadJobs.push({ id: S.newId(), x, y, k, work: 0, has: !MAT[k], by: null, cooldown: 0 });
      n++;
    }
    S.events.push({ t: 'roadJobs' });
    return n;
  }
  removeArea(x0, y0, x1, y1) {
    const S = this.sim, W = S.world;
    let n = 0;
    for (const j of [...S.roadJobs]) {
      if (j.x < x0 || j.x > x1 || j.y < y0 || j.y > y1) continue;
      for (const c of S.citizens) if (c.task?.kind === 'road' && c.task.jobId === j.id) S.jobs.abort(c);
      S.roadJobs.splice(S.roadJobs.indexOf(j), 1);
      n++;
    }
    for (let y = Math.max(0, y0); y <= Math.min(W.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W.w - 1, x1); x++) {
      const i = W.idx(x, y);
      if (!W.road[i] || W.road[i] === 3 || W.road[i] === 4) continue;
      W.worn[i] = 0;
      W.road[i] = 0;
      S.roads = S.roads.filter(r => r.x !== x || r.y !== y);
      S.events.push({ t: 'road', x, y, k: 0 });
      n++;
    }
    if (n) S.events.push({ t: 'roadJobs' });
    return n;
  }
  // Trilhas de desejo: de tanto passarem, o chão gasta, vira trilha e depois estrada.
  step_on(x, y) {
    const S = this.sim, W = S.world, i = W.idx(x, y);
    if (W.terrain[i] > T.FERTILE || W.road[i] > 0 && W.road[i] !== 5) return;
    if (W.fieldAt[i] !== -1 || W.nodeAt[i] !== -1 || W.doorAt[i] && W.road[i] === 0 && W.worn[i] < 0) return;
    if (W.worn[i] === 0) S.wornList.push(i);
    W.worn[i] += 1;
    const v = W.worn[i];
    if (W.road[i] === 0 && v >= TRAIL_WEAR) this._setAuto(x, y, 5);
    else if (W.road[i] === 5 && v >= ROAD_WEAR) this._setAuto(x, y, 1);
  }
  _setAuto(x, y, k) {
    const S = this.sim;
    S.world.road[S.world.idx(x, y)] = k;
    S.roads = S.roads.filter(r => r.x !== x || r.y !== y);
    S.roads.push({ x, y, k, auto: true });
    S.events.push({ t: 'road', x, y, k });
    if (k === 1) S.stats.autoRoads = (S.stats.autoRoads || 0) + 1;
  }
  // Uma vez por dia: o que deixa de ser usado volta a ser mato. Estrada formada fica.
  wearDaily() {
    const S = this.sim, W = S.world, keep = [];
    for (const i of S.wornList) {
      if (W.road[i] === 1 || W.road[i] === 2) { W.worn[i] = 0; continue; }
      W.worn[i] *= 0.93;
      if (W.worn[i] < 1) { W.worn[i] = 0; continue; }
      keep.push(i);
      if (W.road[i] === 5 && W.worn[i] < TRAIL_WEAR * 0.45) {
        const x = i % W.w, y = (i / W.w) | 0;
        W.road[i] = 0;
        S.roads = S.roads.filter(r => r.x !== x || r.y !== y);
        S.events.push({ t: 'road', x, y, k: 0 });
      }
    }
    S.wornList = keep;
  }
  _spots(j) {
    const W = this.sim.world, out = [];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!W.blocked(j.x + a, j.y + b)) out.push([j.x + a, j.y + b]);
    return out;
  }
  assign(c, comp) {
    const S = this.sim, W = S.world;
    let best = null, bd = Infinity;
    for (const j of S.roadJobs) {
      if (j.by != null || j.cooldown > S.time) continue;
      const d = Math.abs(j.x - c.x) + Math.abs(j.y - c.y);
      if (d >= bd) continue;
      if (!this._spots(j).some(([x, y]) => W.compAt(x, y) === comp)) continue;
      if (!j.has && !S.storage.nearestWith(j.x, j.y, comp, MAT[j.k])) continue;
      bd = d; best = j;
    }
    if (!best) return false;
    best.by = c.id;
    const t = { kind: 'road', jobId: best.id, k: best.k, step: best.has ? 1 : 0, w: 0 };
    if (!best.has) {
      const d = S.storage.nearestWith(best.x, best.y, comp, MAT[best.k]);
      d.reserved[MAT[best.k]]++;
      t.depotId = d.id; t.res = MAT[best.k];
    }
    c.task = t;
    return true;
  }
  release(t) {
    const S = this.sim, j = S.roadJobs.find(x => x.id === t.jobId);
    if (j) j.by = null;
    if (t.step === 0 && t.depotId) { const d = S.building(t.depotId); if (d && d.done) d.reserved[t.res]--; }
    if (t.carried && j) j.has = true;
  }
  step(c, t, ai) {
    const S = this.sim, W = S.world, j = S.roadJobs.find(x => x.id === t.jobId);
    if (!j || S.isNight()) return S.jobs.abort(c);
    if (t.step === 0) {
      const d = S.building(t.depotId);
      if (!d || !d.done) return S.jobs.abort(c);
      const r = ai._go(c, [[d.door.x, d.door.y]]);
      if (r === 'fail') return ai._fail(c, j);
      if (r !== 'arrived') return;
      d.stock[t.res]--; d.reserved[t.res]--;
      S.stats.consumed[t.res]++;
      t.step = 1; j.has = true;
      return;
    }
    if (!t.there) {
      const r = ai._go(c, this._spots(j));
      if (r === 'fail') return ai._fail(c, j);
      if (r !== 'arrived') return;
      t.there = true;
    }
    c.anim = 'work'; c.tool = 'hammer';
    j.work += STEP_ * S.population.rate(c);
    if (j.work < WORK[j.k]) return;
    const i = W.idx(j.x, j.y);
    W.road[i] = j.k;
    S.roads = S.roads.filter(r => r.x !== j.x || r.y !== j.y);
    S.roads.push({ x: j.x, y: j.y, k: j.k });
    if (j.k >= 3) W.compDirty = true;
    S.roadJobs.splice(S.roadJobs.indexOf(j), 1);
    S.events.push({ t: 'road', x: j.x, y: j.y, k: j.k });
    S.events.push({ t: 'roadJobs' });
    c.task = null; c.think = 0.1; c.anim = 'idle';
  }
}
const STEP_ = 0.05;
