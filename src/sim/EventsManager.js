import { BUILDINGS, DAY, WELL_RANGE } from './defs.js';

// Acontecimentos: surgem de probabilidades equilibradas e podem ser desligados no menu.
export class EventsManager {
  constructor(sim) { this.sim = sim; }
  yearStart() {
    const S = this.sim;
    if (!S.config.events) return;
    if (S.rng.chance(0.14)) {
      S.badHarvest = true;
      S.population.news('warn', 'Pragas nos campos: as colheitas deste ano renderão metade.');
    }
  }
  winterStart() {
    const S = this.sim;
    if (S.config.events && S.rng.chance(0.2)) {
      S.winterExtra = 10;
      S.population.news('warn', 'O inverno será rigoroso este ano.');
    }
  }
  accident(c, where) {
    const S = this.sim;
    if (S.rng.chance(0.35)) S.population.kill(c, 'accident');
    else { c.health = Math.max(10, c.health - 40); S.population.news('warn', `${c.name} se feriu em um acidente: ${where}.`); }
  }
  burnTick() {
    const S = this.sim;
    for (const b of [...S.buildings]) {
      if (!b.burning) continue;
      const well = S.buildings.some(o => o.done && o.type === 'well' && Math.abs(o.x - b.x) + Math.abs(o.y - b.y) <= WELL_RANGE * (o.level || 1));
      b.burning -= well ? 8 : 1;
      if (b.burning <= 0) {
        b.burning = 0;
        if (well) { S.population.news('good', `O fogo em ${BUILDINGS[b.type].name.toLowerCase()} foi apagado com a água do poço.`); continue; }
        S.population.news('death', `O fogo destruiu ${BUILDINGS[b.type].name.toLowerCase()}.`);
        for (const id of [...(b.residents || [])]) { const c = S.citizen(id); if (c?.inside && S.rng.chance(0.3)) S.population.kill(c, 'fire'); }
        S.construction.remove(b, true);
      }
    }
  }
  daily() {
    const S = this.sim;
    if (!S.config.events) return;
    const houses = S.buildings.filter(b => b.done && BUILDINGS[b.type].residents && !b.burning);
    // Lareira acesa no inverno: pouca chance de incêndio por dia.
    if (S.season.index() === 3) for (const h of houses) {
      if ((h.pantry?.firewood || 0) > 0 && S.rng.chance(0.006)) {
        h.burning = Math.round(DAY * 0.6);
        S.population.news('warn', `Fogo em ${BUILDINGS[h.type].name.toLowerCase()}!`);
      }
    }
    // Epidemia rara começa em uma pessoa e se espalha pela vila.
    if (S.citizens.length >= 20 && S.config.disease && S.rng.chance(0.012)) {
      const n = Math.ceil(S.citizens.length * 0.15);
      for (let i = 0; i < n; i++) S.population.infect(S.rng.pick(S.citizens));
      S.population.news('warn', 'Uma epidemia se espalha pela vila. Hospital e ervas salvam vidas.');
    }
    if (S.season.index() === 1 && S.rng.chance(0.012)) this.storm();
  }
  storm() {
    const S = this.sim, W = S.world;
    const list = S.buildings.filter(b => b.done);
    if (!list.length) return;
    const c = S.rng.pick(list), r = 3;
    S.population.news('death', 'Uma tempestade violenta atingiu a vila.');
    for (const b of [...S.buildings]) {
      if (Math.abs(b.x - c.x) <= r && Math.abs(b.y - c.y) <= r && S.buildings.length > 2 && BUILDINGS[b.type].stores !== 'food') {
        if (S.storage.depots().length === 1 && b.type === 'depot') continue;
        S.construction.remove(b, true);
      }
    }
    for (const n of [...S.nodes.values()]) if (n.type === 'tree' && Math.abs(n.x - c.x) <= r && Math.abs(n.y - c.y) <= r) {
      for (const k of S.citizens) if (k.task?.nodeId === n.id) S.jobs.abort(k);
      S.removeNode(n);
    }
    void W;
  }
}
