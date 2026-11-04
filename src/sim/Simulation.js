import { RNG, hashSeed } from './rng.js';
import { MATERIALS, ADULT_AGE, BUILDINGS, DAY, DIFFICULTY, YEAR, YEAR_DAYS, FOODS, HUNGRY, MAP_SIZES, NIGHT_END, NIGHT_START, NODE, PROFESSIONS, RES, STEP } from './defs.js';
import { generateTerrain } from './TerrainGenerator.js';
import { WorldManager } from './WorldManager.js';
import { PathfindingSystem } from './PathfindingSystem.js';
import { StorageManager, ResourceManager } from './StorageManager.js';
import { ConstructionManager } from './ConstructionManager.js';
import { JobManager } from './JobManager.js';
import { AIManager } from './AIManager.js';
import { PopulationManager } from './CitizenManager.js';
import { FarmingManager } from './FarmingManager.js';
import { SeasonManager } from './SeasonManager.js';
import { WorkManager } from './WorkManager.js';
import { InfraManager } from './InfraManager.js';
import { EventsManager } from './EventsManager.js';

// Núcleo sem renderização: roda igual no navegador e nos testes em Node.
export class Simulation {
  constructor(config = {}) {
    this.config = { size: 'medio', difficulty: 'normal', seed: 'ermo', events: false, disease: false, ...config };
    const seed = hashSeed(this.config.seed);
    this.seed = seed;
    const gen = generateTerrain(MAP_SIZES[this.config.size], seed);
    this.world = new WorldManager(gen);
    this.rng = new RNG(seed ^ 0x9E3779B9);
    this.nextId = 1;
    this.time = DAY * 0.27;     // começa às 6h30
    this.season = new SeasonManager(this);
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
    this.work = new WorkManager(this);
    this.infra = new InfraManager(this);
    this.eventsMgr = new EventsManager(this);
    this.wornList = []; this.roads = []; this.roadJobs = []; this.animals = []; this.saplings = new Set();
    this.trade = { boat: null, next: null }; this.unburied = 0; this.griefUntil = 0;
    this.winterExtra = 0; this.badHarvest = false; this.reports = [];
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
    stock(this.construction._create('depot', s.x - 1, s.y - 1, 0), MATERIALS);
    stock(this.construction._create('barn', s.x + 4, s.y - 1, 0), FOODS);
    this.startStock = Object.fromEntries(RES.map(r => [r, start[r] || 0]));
    this.population.spawnFounders(s.x, s.y + 4);
    this._spawnAnimals();
  }
  _spawnAnimals() {
    const W = this.world, r = this.rng;
    this.animalCap = Math.round((W.w * W.h) / 256);
    for (let i = 0; i < this.animalCap * 0.8; i++) {
      for (let t = 0; t < 30; t++) {
        const x = r.int(0, W.w - 1), y = r.int(0, W.h - 1);
        if (W.blocked(x, y) || Math.hypot(x - W.start.x, y - W.start.y) < 12) continue;
        this.animals.push({ id: this.newId(), x: x + 0.5, y: y + 0.5, tx: x + 0.5, ty: y + 0.5, wait: r.int(1, 8), hunter: null });
        break;
      }
    }
  }
  building(id) { return this.buildings.find(b => b.id === id) || this.farms.find(f => f.id === id); }
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
    for (const c of [...this.citizens]) this.ai.update(c);
    this.work.animalsMove();
    if (this.steps % 20 === 0) {
      this.farming.tick();
      this.population.tick();
      this.season.tick();
      this.work.animalsTick();
      this.work.saplingsTick();
      this.work.boatTick();
      this.eventsMgr.burnTick();
      this._burnFuel();
      const d = this.day();
      if (d !== this.lastDay) { this.lastDay = d; this.population.daily(); this.eventsMgr.daily(); this.infra.wearDaily(); this._report(); }
      this._alerts();
    }
  }
  // Casa com gente e frio gasta lenha; casa de pedra gasta metade.
  _burnFuel() {
    if (this.season.temp() >= 8) return;
    for (const b of this.buildings) {
      if (!b.pantry || !(b.pantry.firewood > 0)) continue;
      if (!b.residents.length) continue;
      b.fuelT = (b.fuelT || 0) + 1 / (DAY * (BUILDINGS[b.type].warm ? 1 : 0.5));
      if (b.fuelT >= 1) { b.fuelT = 0; b.pantry.firewood--; this.stats.consumed.firewood++; }
    }
  }
  _report() {
    const P = this.stats.produced, C = this.stats.consumed;
    this.reports.push({ d: this.day(), food: this.foodTotal(), wood: this.storage.total('wood'), firewood: this.storage.total('firewood'), p: { ...P }, c: { ...C } });
    if (this.reports.length > 80) this.reports.shift();
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
    for (const p in vac) out.push({ id: `vac-${p}`, level: 'warn', text: `Faltam ${vac[p]} vagas de ${PROFESSIONS[p].toLowerCase()}. Abra Gestão.` });
    const spare = this.citizens.filter(c => !['laborer', 'builder', 'child', 'student'].includes(c.profession) && c.workplace == null).length;
    const season = this.season.index(), fw = this.storage.total('firewood');
    if (season >= 1 && fw < this.buildings.filter(b => b.pantry).length * 6) out.push({ id: 'firewood', level: season === 3 ? 'bad' : 'warn', text: 'Pouca lenha para o inverno. Construa um cortador de lenha.' });
    const cold = this.citizens.filter(c => c.warmth < 25).length;
    if (cold) out.push({ id: 'cold', level: 'bad', text: `${cold} aldeões estão congelando. Precisam de casa, lenha e roupas.` });
    const sick = this.citizens.filter(c => c.sick > 0).length;
    if (sick) out.push({ id: 'sick', level: 'warn', text: `${sick} aldeões doentes. Hospital com ervas cura mais rápido.` });
    const noTool = this.citizens.filter(c => c.toolLife <= 0 && c.age >= 12).length;
    if (noTool) out.push({ id: 'tools', level: 'warn', text: `${noTool} aldeões sem ferramenta rendem menos. Construa mina e ferreiro.` });
    if (this.unburied > 0) out.push({ id: 'unburied', level: 'warn', text: `${this.unburied} mortos sem sepultura. Construa um cemitério.` });
    if (this.trade.boat) out.push({ id: 'boat', level: 'info', text: 'Há um barco mercante no posto comercial.' });
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
