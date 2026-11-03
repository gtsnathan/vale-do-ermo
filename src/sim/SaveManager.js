import { Simulation } from './Simulation.js';

// O mapa é refeito pela semente; salva-se só o que mudou desde a geração.
export const SaveManager = {
  serialize(sim) {
    const original = new Simulation(sim.config);
    const removed = [];
    for (const id of original.nodes.keys()) if (!sim.nodes.has(id)) removed.push(id);
    const changed = [];
    for (const n of sim.nodes.values()) if (n.marked || n.work > 0) changed.push({ id: n.id, marked: n.marked, work: n.work, reservedBy: n.reservedBy });
    return JSON.stringify({
      v: 1, config: sim.config, time: sim.time, steps: sim.steps, nextId: sim.nextId, rng: sim.rng.s,
      startStock: sim.startStock, stats: sim.stats, removed, changed,
      buildings: sim.buildings, piles: sim.piles, citizens: sim.citizens,
    });
  },
  load(text) {
    const d = JSON.parse(text);
    if (d.v !== 1) throw new Error('Versão de salvamento desconhecida');
    const sim = new Simulation(d.config);
    const W = sim.world;
    for (const b of sim.buildings) {
      for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) W.buildingAt[W.idx(i, j)] = -1;
      W.doorAt[W.idx(b.door.x, b.door.y)]--;
    }
    sim.buildings = d.buildings; sim.citizens = d.citizens; sim.piles = d.piles;
    Object.assign(sim, { time: d.time, steps: d.steps, nextId: d.nextId, startStock: d.startStock, stats: d.stats });
    sim.rng.s = d.rng;
    for (const id of d.removed) { const n = sim.nodes.get(id); if (n) sim.removeNode(n); }
    for (const c of d.changed) {
      const n = sim.nodes.get(c.id);
      if (!n) continue;
      Object.assign(n, { marked: c.marked, work: c.work, reservedBy: c.reservedBy });
      if (n.marked) sim.markedNodes.add(n);
    }
    for (const b of sim.buildings) sim.construction.occupy(b);
    for (const p of sim.piles) W.pileAt[W.idx(p.x, p.y)] = p.id;
    sim.events = [];
    W.recomputeComps();
    return sim;
  },
};
