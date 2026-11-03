import { FAMILIES, MALE, FEMALE, BUILDINGS, MEAL, PROFESSIONS } from './defs.js';

function citizen(id, name, sex, age, family, x, y, look) {
  return {
    id, name, sex, age, family, profession: 'laborer', workplace: null, home: null, spouse: null, lastMeal: null,
    // Fome já funciona. Saúde, felicidade e temperatura entram nas versões 0.3 e 0.4.
    health: 100, hunger: 0, happiness: 70, temperature: 37,
    inv: { res: null, amount: 0 }, x, y, px: x, py: y,
    task: null, path: null, pathI: 0, anim: 'idle', tool: 'axe', think: 0.2 + (id % 7) * 0.2,
    faceRight: true, faceFront: true, inside: false, look,
  };
}

// Cria os fundadores e cuida de quem mora onde.
export class PopulationManager {
  constructor(sim) { this.sim = sim; }
  spawnFounders(cx, cy, couples = 5) {
    const S = this.sim, r = S.rng;
    const fams = [...FAMILIES], ms = [...MALE], fs = [...FEMALE];
    const take = l => l.splice(r.int(0, l.length - 1), 1)[0];
    for (let i = 0; i < couples; i++) {
      const fam = take(fams);
      const place = () => {
        for (let t = 0; t < 40; t++) {
          const x = cx + r.int(-4, 5), y = cy + r.int(-4, 5);
          if (!S.world.blocked(x, y)) return [x + 0.5, y + 0.5];
        }
        return [cx + 0.5, cy + 0.5];
      };
      const [ax, ay] = place(), [bx, by] = place();
      const m = citizen(S.newId(), `${take(ms)} ${fam}`, 'M', r.int(21, 44), fam, ax, ay, r.int(0, 2));
      const f = citizen(S.newId(), `${take(fs)} ${fam}`, 'F', r.int(19, 40), fam, bx, by, 3 + r.int(0, 2));
      m.spouse = f.id; f.spouse = m.id;
      S.citizens.push(m, f);
    }
    // Começa com dois construtores: só construtores erguem obras.
    S.citizens.filter(c => c.sex === 'M').slice(0, 2).forEach(c => { c.profession = 'builder'; });
  }
  // Uma casa por família. Casa sem família não recebe ninguém inventado.
  assignHomes() {
    const S = this.sim;
    for (const b of S.buildings) if (b.type === 'house') b.residents = b.residents.filter(id => S.citizen(id));
    const free = S.buildings.filter(b => b.type === 'house' && b.done && b.residents.length === 0);
    const families = new Map();
    for (const c of S.citizens) if (c.home == null) {
      if (!families.has(c.family)) families.set(c.family, []);
      families.get(c.family).push(c);
    }
    for (const members of families.values()) {
      const h = free.shift();
      if (!h) break;
      for (const c of members.slice(0, BUILDINGS.house.residents)) { c.home = h.id; h.residents.push(c.id); }
    }
  }
  pantryTotal(h) { return Object.values(h.pantry || {}).reduce((a, n) => a + n, 0); }
  meal(c, res) {
    this.sim.stats.consumed[res]++;
    c.hunger = Math.max(0, c.hunger - MEAL);
    c.lastMeal = res;
  }
  eatFromPantry(c, home) {
    let best = null, n = 0;
    for (const r in home.pantry || {}) if (home.pantry[r] > n) { n = home.pantry[r]; best = r; }
    if (!best) return false;
    home.pantry[best]--;
    this.meal(c, best);
    return true;
  }
  count(prof) { return this.sim.citizens.filter(c => c.profession === prof).length; }
  setProfession(c, prof) {
    if (!PROFESSIONS[prof] || c.profession === prof) return;
    const k = c.task?.kind;
    if (k === 'build' || k === 'farm' || k === 'forage') this.sim.jobs.abort(c);
    c.profession = prof; c.workplace = null;
  }
  // Muda quantas pessoas têm a profissão, sempre trocando com os trabalhadores gerais.
  changeCount(prof, delta) {
    if (prof === 'laborer') return 0;
    const from = delta > 0 ? 'laborer' : prof, to = delta > 0 ? prof : 'laborer';
    const list = this.sim.citizens.filter(c => c.profession === from);
    const n = Math.min(Math.abs(delta), list.length);
    for (let i = 0; i < n; i++) this.setProfession(list[i], to);
    return n;
  }
  homeless() { return this.sim.citizens.filter(c => c.home == null).length; }
}
