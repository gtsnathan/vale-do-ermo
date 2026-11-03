import { RNG, hashSeed } from './rng.js';
import { BUILDINGS, DAY, DIFFICULTY, MAP_SIZES, NIGHT_END, NIGHT_START, NODE, RES, STEP } from './defs.js';
import { generateTerrain } from './TerrainGenerator.js';
import { WorldManager } from './WorldManager.js';
import { PathfindingSystem } from './PathfindingSystem.js';
import { StorageManager, ResourceManager } from './StorageManager.js';
import { ConstructionManager } from './ConstructionManager.js';
import { JobManager } from './JobManager.js';
import { AIManager } from './AIManager.js';
import { PopulationManager } from './CitizenManager.js';

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
    this.buildings = []; this.citizens = []; this.piles = [];
    this.nodes = new Map(); this.markedNodes = new Set();
    this.stats = { produced: { wood: 0, stone: 0, iron: 0 }, consumed: { wood: 0, stone: 0, iron: 0 }, placed: {}, built: {}, everMarked: 0 };
    this.pathfinding = new PathfindingSystem(this.world);
    this.storage = new StorageManager(this);
    this.resources = new ResourceManager(this);
    this.construction = new ConstructionManager(this);
    this.jobs = new JobManager(this);
    this.ai = new AIManager(this);
    this.population = new PopulationManager(this);
    this.pathBudget = 0;
    for (const n of gen.nodes) this._addNode(n);
    this._found(gen.start);
    this.world.recomputeComps();
  }
  newId() { return this.nextId++; }
  _addNode(n) {
    const node = { id: this.newId(), type: n.type, x: n.x, y: n.y, variant: n.variant, marked: false, work: 0, reservedBy: null, cooldown: 0 };
    this.nodes.set(node.id, node);
    const i = this.world.idx(n.x, n.y);
    this.world.nodeAt[i] = node.id;
    this.world.nodeBlocks[i] = NODE[n.type].blocks ? 1 : 0;
    return node;
  }
  _found(s) {
    const d = this.construction._create('depot', s.x - 1, s.y - 1, 0);
    d.done = true; d.stock = {}; d.reserved = {}; d.incoming = 0;
    const start = DIFFICULTY[this.config.difficulty].start;
    for (const r of RES) { d.stock[r] = start[r]; d.reserved[r] = 0; }
    this.startStock = { ...start };
    this.population.spawnFounders(s.x, s.y + 3);
  }
  building(id) { return this.buildings.find(b => b.id === id); }
  citizen(id) { return this.citizens.find(c => c.id === id); }
  dayFrac() { return (this.time / DAY) % 1; }
  day() { return Math.floor(this.time / DAY) + 1; }
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
    if (this.steps % 20 === 0) this._alerts();
  }
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
    const hl = this.population.homeless();
    if (hl > 0 && this.isNight()) out.push({ id: 'homeless', level: 'warn', text: `${hl} aldeões dormem ao relento. Construa casas.` });
    const idle = this.citizens.filter(c => c.task && c.task.kind === 'idle').length;
    if (idle >= this.citizens.length && !this.isNight()) out.push({ id: 'idle', level: 'info', text: 'Todos estão sem tarefa. Marque recursos ou ordene uma construção.' });
    this.alerts = out;
  }
}
