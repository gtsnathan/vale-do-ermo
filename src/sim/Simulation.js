import { RNG, hashSeed } from './rng.js';
import { ADULT_AGE, BUILDINGS, DAY, DIFFICULTY, YEAR, YEAR_DAYS, FOODS, HUNGRY, MAP_SIZES, NIGHT_END, NIGHT_START, NODE, PROFESSIONS, RES, STEP } from './defs.js';
import { generateTerrain } from './TerrainGenerator.js';
import { WorldManager } from './WorldManager.js';
import { PathfindingSystem } from './PathfindingSystem.js';
import { StorageManager, ResourceManager } from './StorageManager.js';
import { ConstructionManager } from './ConstructionManager.js';
import { JobManager } from './JobManager.js';
import { AIManager } from './AIManager.js';
import { PopulationManager } from './CitizenManager.js';
import { FarmingManager } from './FarmingManager.js';

// Núcleo sem renderização: roda igual no navegador e nos testes em Node.
export class Simulation {
  constructor(config = {}) {
    this.config = { size: 'medio', difficulty: 'normal', seed: 'ermo', ...config };
    const seed = hashSeed(this.config.seed);
    this.seed = seed;
    const gen = generateTerrain(MAP_SIZES[this.config.size], seed);
    this.world = new WorldManager(gen);
    this.rng = new RNG(seed ^ 0x9E3779B9);
    this.nextId = 1;
    this.time = DAY * 0.27;     // começa às 6h30
    this.steps = 0;
    this.events = [];
    this.alerts = [];
    this.buildings = []; this.citizens = []; this.piles = []; this.farms = [];
    this.nodes = new Map(); this.markedNodes = new Set();
    this.stats = { produced: Object.fromEntries(RES.map(r => [r, 0])), consumed: Object.fromEntries(RES.map(r => [r, 0])), placed: {}, built: {}, everMarked: 0, births: 0, deaths: {} };
    this.chronicle = []; this.history = [];
    this.pathfinding = new PathfindingSystem(this.world);
    this.storage = new StorageManager(this);
    this.resources = new ResourceManager(this);
    this.construction = new ConstructionManager(this);
    this.jobs = new JobManager(this);
    this.ai = new AIManager(this);
    this.population = new PopulationManager(this);
    this.farming = new FarmingManager(this);
    this.pathBudget = 0;
    for (const n of gen.nodes) this._addNode(n);
    this._found(gen.start);
    this.world.recomputeComps();
  }
  newId() { return this.nextId++; }
  // Referências mantidas para os módulos de versões futuras.
  static get HUNGRY() { return HUNGRY; }
  static get PROFESSIONS() { return PROFESSIONS; }
  _addNode(n) {
    const node = { id: this.newId(), type: n.type, x: n.x, y: n.y, variant: n.variant, marked: false, work: 0, reservedBy: null, cooldown: 0 };
    this.nodes.set(node.id, node);
    const i = this.world.idx(n.x, n.y);
    this.world.nodeAt[i] = node.id;
    this.world.nodeBlocks[i] = NODE[n.type].blocks ? 1 : 0;
    return node;
  }
  _found(s) {
    const start = DIFFICULTY[this.config.difficulty].start;
    const stock = (b, list) => {
      b.done = true;
      this.storage.newStock(b);
      for (const r of list) b.stock[r] = start[r] || 0;
    };
    stock(this.construction._create('depot', s.x - 1, s.y - 1, 0), ['wood', 'stone', 'iron']);
    stock(this.construction._create('barn', s.x + 4, s.y - 1, 0), FOODS);
    this.startStock = Object.fromEntries(RES.map(r => [r, start[r] || 0]));
    this.population.spawnFounders(s.x, s.y + 4);
  }
  building(id) { return this.buildings.find(b => b.id === id); }
  citizen(id) { return this.citizens.find(c => c.id === id); }
  dayFrac() { return (this.time / DAY) % 1; }
  day() { return Math.floor(this.time / DAY) + 1; }
  year() { return Math.floor(this.time / YEAR) + 1; }
  dayOfYear() { return (this.day() - 1) % YEAR_DAYS + 1; }
  isNight() { const f = this.dayFrac(); return f >= NIGHT_START || f < NIGHT_END; }

  mark(x0, y0, x1, y1, types, value) {
    const W = this.world;
    let count = 0;
    for (let y = Math.max(0, y0); y <= Math.min(W.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W.w - 1, x1); x++) {
      const id = W.nodeAt[W.idx(x, y)];
      if (id === -1) continue;
      const n = this.nodes.get(id);
      if (!types.includes(n.type) || n.marked === value) continue;
      n.marked = value;
      if (value) { this.markedNodes.add(n); this.stats.everMarked++; } else this.markedNodes.delete(n);
      this.events.push({ t: 'mark', id: n.id, value });
      count++;
    }
    return count;
  }
  removeNode(n) {
    const i = this.world.idx(n.x, n.y);
    this.world.nodeAt[i] = -1;
    if (this.world.nodeBlocks[i]) { this.world.nodeBlocks[i] = 0; this.world.compDirty = true; }
    this.nodes.delete(n.id);
    this.markedNodes.delete(n);
    this.events.push({ t: 'nodeRemoved', id: n.id, type: n.type, x: n.x, y: n.y, variant: n.variant });
  }

  step() {
    this.steps++;
    this.time += STEP;
    this.pathBudget = 8;
    if (this.world.compDirty) this.world.recomputeComps();
    for (const c of this.citizens) this.ai.update(c);
    if (this.steps % 20 === 0) {
      this.farming.tick();
      this.population.tick();
      const d = this.day();
      if (d !== this.lastDay) { this.lastDay = d; this.population.daily(); }
      this._alerts();
    }
  }
  foodTotal() {
    let n = 0;
    for (const r of FOODS) n += this.storage.total(r);
    for (const b of this.buildings) if (b.pantry) n += this.population.pantryTotal(b);
    return n;
  }
  foodDays() { return this.citizens.length ? this.foodTotal() / (this.citizens.length * 0.9) : 0; }
  _alerts() {
    const out = [];
    const sites = this.buildings.filter(b => !b.done);
    for (const res of ['wood', 'stone']) {
      const missing = sites.some(b => (BUILDINGS[b.type].cost[res] || 0) > b.delivered[res] + b.enroute[res]);
      if (!missing) continue;
      const have = this.storage.depots().some(d => this.storage.available(d, res) > 0) || this.piles.some(p => p.res === res && p.amount > p.reserved);
      if (!have) out.push({ id: `no-${res}`, level: 'warn', text: res === 'wood' ? 'Falta madeira para a obra. Marque árvores para corte.' : 'Falta pedra para a obra. Marque afloramentos para coleta.' });
    }
    const cap = this.storage.capacity();
    if (cap === 0) out.push({ id: 'no-depot', level: 'bad', text: 'A vila não tem depósito. Os materiais ficam no chão.' });
    else if (this.storage.usedTotal() >= cap * 0.95) out.push({ id: 'full', level: 'warn', text: 'Os depósitos estão quase cheios. Construa outro.' });
    const capF = this.storage.capacity('food');
    if (capF === 0) out.push({ id: 'no-barn', level: 'bad', text: 'A vila não tem celeiro. Colheitas ficam no chão.' });
    else if (this.storage.usedTotal('food') >= capF * 0.95) out.push({ id: 'full-food', level: 'warn', text: 'Os celeiros estão quase cheios. Construa outro.' });
    const days = this.foodDays();
    const hungry = this.citizens.filter(c => c.hunger >= 85).length;
    if (hungry) out.push({ id: 'hungry', level: 'bad', text: `${hungry} aldeões passam fome e andam mais devagar. Falta comida ou caminho até o celeiro.` });
    else if (days < 4) out.push({ id: 'low-food', level: 'warn', text: `Comida para cerca de ${Math.floor(days)} dias. Crie fazendas ou uma cabana de coleta.` });
    if (sites.some(b => this.construction.materialsComplete(b)) && this.population.count('builder') === 0) out.push({ id: 'no-builder', level: 'bad', text: 'Há obra parada: a vila não tem construtores. Abra Gestão e defina alguns.' });
    const vac = this.farming.vacancies();
    if (vac.farm > 0) out.push({ id: 'vac-farm', level: 'warn', text: `Faltam ${vac.farm} agricultores nas fazendas. Abra Gestão.` });
    if (vac.gather > 0) out.push({ id: 'vac-gather', level: 'warn', text: `Faltam ${vac.gather} coletores nas cabanas. Abra Gestão.` });
    const spare = this.citizens.filter(c => (c.profession === 'farmer' || c.profession === 'gatherer') && c.workplace == null).length;
    if (spare) out.push({ id: 'spare', level: 'info', text: `${spare} profissionais sem local de trabalho estão ajudando em outros serviços.` });
    const hl = this.population.homeless();
    if (hl > 0 && this.isNight()) out.push({ id: 'homeless', level: 'warn', text: `${hl} aldeões dormem ao relento. Construa casas.` });
    const grown = this.citizens.filter(c => c.age >= ADULT_AGE);
    const wait = this.population.waitingHome();
    if (wait > 0 && !this.isNight()) out.push({ id: 'wait-home', level: 'info', text: `${wait} adultos esperam casa própria. Sem casa, a família não cresce.` });
    const weak = this.citizens.filter(c => c.health < 30).length;
    if (weak) out.push({ id: 'weak', level: 'bad', text: `${weak} aldeões estão muito fracos e podem morrer.` });
    const idle = grown.filter(c => c.task && c.task.kind === 'idle').length;
    if (grown.length && idle >= grown.length && !this.isNight()) out.push({ id: 'idle', level: 'info', text: 'Todos estão sem tarefa. Marque recursos ou ordene uma construção.' });
    this.alerts = out;
  }
}
