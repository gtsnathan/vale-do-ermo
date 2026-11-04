import { Simulation } from './Simulation.js';
import { COAT_LIFE, DIFFICULTY, FOODS, RES, TOOL_LIFE } from './defs.js';

// O mapa é refeito pela semente; salva-se só o que mudou desde a geração.
export const SaveManager = {
  serialize(sim) {
    const original = new Simulation(sim.config);
    const removed = [];
    for (const id of original.nodes.keys()) if (!sim.nodes.has(id)) removed.push(id);
    const changed = [];
    for (const n of sim.nodes.values()) if (!n.planted && (n.marked || n.work > 0)) changed.push({ id: n.id, marked: n.marked, work: n.work, reservedBy: n.reservedBy });
    return JSON.stringify({
      v: 4, worn: sim.wornList.map(i => [i, Math.round(sim.world.worn[i])]), roads: sim.roads, roadJobs: sim.roadJobs, animals: sim.animals, animalCap: sim.animalCap, trade: sim.trade,
      unburied: sim.unburied, griefUntil: sim.griefUntil, winterExtra: sim.winterExtra, badHarvest: sim.badHarvest, reports: sim.reports,
      planted: [...sim.nodes.values()].filter(n => n.planted), chronicle: sim.chronicle, history: sim.history, lastDay: sim.lastDay, config: sim.config, time: sim.time, steps: sim.steps, nextId: sim.nextId, rng: sim.rng.s,
      startStock: sim.startStock, stats: sim.stats, removed, changed,
      buildings: sim.buildings, piles: sim.piles, citizens: sim.citizens, farms: sim.farms,
    });
  },
  load(text) {
    const d = JSON.parse(text);
    if (![1, 2, 3, 4].includes(d.v)) throw new Error('Versão de salvamento desconhecida');
    const sim = new Simulation(d.config);
    const W = sim.world;
    for (const b of sim.buildings) {
      for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) W.buildingAt[W.idx(i, j)] = -1;
      W.doorAt[W.idx(b.door.x, b.door.y)]--;
    }
    sim.buildings = d.buildings; sim.citizens = d.citizens; sim.piles = d.piles; sim.farms = d.farms || [];
    Object.assign(sim, { time: d.time, steps: d.steps, nextId: d.nextId, startStock: d.startStock, stats: d.stats });
    sim.rng.s = d.rng;
    if (d.v === 1) this._fromV1(sim);
    if (d.v < 3) this._toV3(sim);
    if (d.v < 4) this._toV4(sim);
    else Object.assign(sim, { animals: d.animals, animalCap: d.animalCap, trade: d.trade, unburied: d.unburied, griefUntil: d.griefUntil, winterExtra: d.winterExtra, badHarvest: d.badHarvest, reports: d.reports, roadJobs: d.roadJobs });
    for (const r of d.roads || []) { W.road[W.idx(r.x, r.y)] = r.k; sim.roads.push(r); }
    for (const n of d.planted || []) {
      sim.nodes.set(n.id, n);
      W.nodeAt[W.idx(n.x, n.y)] = n.id;
      if (n.young) sim.saplings.add(n);
    }
    for (const [i, v] of d.worn || []) { W.worn[i] = v; sim.wornList.push(i); }
    sim.season.last = sim.season.index();
    sim.chronicle = d.chronicle || []; sim.history = d.history || []; sim.lastDay = d.lastDay ?? sim.day();
    for (const id of d.removed) { const n = sim.nodes.get(id); if (n) sim.removeNode(n); }
    for (const c of d.changed) {
      const n = sim.nodes.get(c.id);
      if (!n) continue;
      Object.assign(n, { marked: c.marked, work: c.work, reservedBy: c.reservedBy });
      if (n.marked) sim.markedNodes.add(n);
    }
    for (const b of sim.buildings) sim.construction.occupy(b);
    for (const p of sim.piles) W.pileAt[W.idx(p.x, p.y)] = p.id;
    for (const f of sim.farms) for (const t of f.tiles) W.fieldAt[W.idx(t.x, t.y)] = f.id;
    W.recomputeComps();
    if (d.v === 1) this._giveBarn(sim);
    sim.events = [];
    W.recomputeComps();
    return sim;
  },
  // Vilas antigas recebem os campos de estação, trabalho e cidade.
  _toV4(sim) {
    const fill = o => { for (const r of RES) o[r] = o[r] || 0; };
    fill(sim.stats.produced); fill(sim.stats.consumed); fill(sim.startStock);
    for (const b of sim.buildings) for (const k of ['stock', 'reserved', 'delivered', 'enroute']) if (b[k]) fill(b[k]);
    for (const f of sim.farms) f.kind = f.kind || 'farm';
    for (const c of sim.citizens) {
      if (c.warmth == null) Object.assign(c, { warmth: 100, warming: false, sick: 0, educated: false, toolLife: TOOL_LIFE, coatLife: COAT_LIFE });
    }
  },
  // Vilas anteriores à 0.3 ganham os dados de família e saúde.
  _toV3(sim) {
    sim.stats.births = sim.stats.births || 0;
    sim.stats.deaths = sim.stats.deaths || {};
    for (const c of sim.citizens) {
      c.diet = c.diet || []; c.parents = c.parents || [];
      c.pregnant = c.pregnant || 0; c.birthRest = c.birthRest || 0;
    }
  },
  // Vilas da versão 0.1 ganham os campos novos e o celeiro inicial.
  _fromV1(sim) {
    const fill = o => { for (const r of RES) o[r] = o[r] || 0; };
    fill(sim.stats.produced); fill(sim.stats.consumed); fill(sim.startStock);
    for (const b of sim.buildings) {
      for (const k of ['stock', 'reserved', 'delivered', 'enroute']) if (b[k]) fill(b[k]);
      if (b.type === 'house' && b.done && !b.pantry) b.pantry = {};
    }
    for (const c of sim.citizens) {
      c.profession = 'laborer'; c.workplace = null; c.lastMeal = null;
    }
    sim.citizens.filter(c => c.sex === 'M').slice(0, 2).forEach(c => { c.profession = 'builder'; });
  },
  _giveBarn(sim) {
    const st = sim.world.start;
    for (let r = 3; r < 40; r++) for (let y = st.y - r; y <= st.y + r; y++) for (let x = st.x - r; x <= st.x + r; x++) {
      if (!sim.construction.validate('barn', x, y, 0).ok) continue;
      const b = sim.construction._create('barn', x, y, 0);
      b.done = true;
      sim.storage.newStock(b);
      const start = DIFFICULTY[sim.config.difficulty].start;
      for (const f of FOODS) { b.stock[f] = start[f] || 0; sim.startStock[f] += b.stock[f]; }
      return;
    }
  },
};
