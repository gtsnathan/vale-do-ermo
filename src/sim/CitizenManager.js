import { ADULT_AGE, BIRTH_REST, DAY, FAMILIES, FEMALE, FERTILE_MAX, BUILDINGS, MALE, MARRY_AGE, MEAL, OLD_AGE, PREGNANCY, PROFESSIONS, YEAR } from './defs.js';

function citizen(id, name, sex, age, family, x, y, look) {
  return {
    id, name, sex, age, family, profession: 'laborer', workplace: null, home: null, spouse: null, lastMeal: null, diet: [], parents: [], pregnant: 0, birthRest: 0,
    // Fome e saúde já funcionam. Felicidade e temperatura entram nas próximas versões.
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
  isChild(c) { return c.age < ADULT_AGE; }
  _houses() { return this.sim.buildings.filter(b => b.type === 'house' && b.done); }
  _leave(c) {
    const h = c.home != null ? this.sim.building(c.home) : null;
    if (h) h.residents = h.residents.filter(id => id !== c.id);
    c.home = null;
  }
  _enter(c, h) { this._leave(c); c.home = h.id; h.residents.push(c.id); }
  // Adulto que ainda mora na casa dos pais quer casa própria.
  _withParents(c) {
    const h = c.home != null ? this.sim.building(c.home) : null;
    return !!h && h.residents.some(id => c.parents.includes(id));
  }
  // Moradia por família. Casa sem família continua vazia: ninguém é inventado.
  assignHomes() {
    const S = this.sim, max = BUILDINGS.house.residents;
    for (const b of S.buildings) if (b.type === 'house') b.residents = b.residents.filter(id => S.citizen(id));
    const houses = this._houses();
    const adults = S.citizens.filter(c => !this.isChild(c));
    const room = h => h.residents.length < max;
    // Quem casou vai morar com o cônjuge que já tem casa própria.
    for (const c of adults) {
      const sp = c.spouse != null ? S.citizen(c.spouse) : null;
      if (!sp || sp.home == null || sp.home === c.home || this._withParents(sp)) continue;
      if (c.home == null || this._withParents(c)) { const h = S.building(sp.home); if (room(h)) this._enter(c, h); }
    }
    const free = houses.filter(h => h.residents.length === 0);
    for (const c of adults) {
      if (!free.length) break;
      if (c.home != null && !this._withParents(c)) continue;
      const h = free.shift();
      this._enter(c, h);
      const sp = c.spouse != null ? S.citizen(c.spouse) : null;
      if (sp && (sp.home == null || this._withParents(sp))) this._enter(sp, h);
      for (const k of S.citizens) {
        if (this.isChild(k) && k.home == null && k.parents.some(id => id === c.id || id === c.spouse) && room(h)) this._enter(k, h);
      }
    }
    // Crianças sem casa ou sem adulto por perto são acolhidas por outra família.
    const hasAdult = h => h.residents.some(id => { const r = S.citizen(id); return r && !this.isChild(r); });
    for (const k of S.citizens) {
      if (!this.isChild(k)) continue;
      const cur = k.home != null ? S.building(k.home) : null;
      if (cur && hasAdult(cur)) continue;
      const own = houses.find(h => room(h) && h.residents.some(id => k.parents.includes(id)));
      const host = own || houses.find(h => h !== cur && room(h) && hasAdult(h));
      if (host) { this._enter(k, host); this.news('family', `${k.name} foi acolhido por outra família.`); }
    }
  }
  news(kind, text) {
    const S = this.sim;
    const e = { year: S.year(), day: S.dayOfYear(), kind, text };
    S.chronicle.push(e);
    if (S.chronicle.length > 60) S.chronicle.shift();
    S.events.push({ t: 'news', kind, text });
  }
  // Roda uma vez por segundo de jogo.
  tick() {
    const S = this.sim;
    for (const c of [...S.citizens]) {
      const wasChild = this.isChild(c);
      c.age += 1 / YEAR;
      if (wasChild && !this.isChild(c)) {
        c.profession = 'laborer';
        this.news('family', `${c.name} cresceu e já pode trabalhar.`);
        this.assignHomes();
      }
      this._health(c);
      if (c.health <= 0) { this.kill(c, 'hunger'); continue; }
      if (c.age >= OLD_AGE) {
        const yearly = 0.02 + Math.pow((c.age - OLD_AGE) / 16, 2);
        if (S.rng.next() < yearly / YEAR) { this.kill(c, 'age'); continue; }
      }
      if (c.birthRest > 0) c.birthRest--;
      if (c.pregnant > 0 && --c.pregnant <= 0) this._birth(c);
    }
  }
  _health(c) {
    const S = this.sim, k = 1 / DAY;
    if (c.hunger >= 95) c.health -= 40 * k;
    else if (c.hunger < 70) {
      const variety = new Set(c.diet).size;
      c.health += (variety >= 2 ? 22 : 10) * k;
    }
    if (c.home == null && S.isNight()) c.health -= 5 * k;
    c.health = Math.max(0, Math.min(100, c.health));
  }
  kill(c, cause) {
    const S = this.sim;
    S.jobs.abort(c);
    const home = c.home != null ? S.building(c.home) : null;
    if (c.inv.res) {
      const at = c.inside && home ? home.door : { x: c.x | 0, y: c.y | 0 };
      S.resources.drop(at.x, at.y, c.inv.res, c.inv.amount);
      c.inv.res = null; c.inv.amount = 0;
    }
    if (home) home.residents = home.residents.filter(id => id !== c.id);
    const sp = c.spouse != null ? S.citizen(c.spouse) : null;
    if (sp) sp.spouse = null;
    S.citizens.splice(S.citizens.indexOf(c), 1);
    S.stats.deaths[cause] = (S.stats.deaths[cause] || 0) + 1;
    const age = Math.floor(c.age);
    this.news('death', cause === 'hunger' ? `${c.name} morreu de fome aos ${age} anos.` : `${c.name} morreu de velhice aos ${age} anos.`);
    this.assignHomes();
  }
  _kin(a, b) {
    if (a.parents.includes(b.id) || b.parents.includes(a.id)) return true;
    return a.parents.some(id => b.parents.includes(id));
  }
  // Roda uma vez por dia de jogo.
  daily() {
    const S = this.sim;
    const single = S.citizens.filter(c => c.spouse == null && c.age >= MARRY_AGE);
    for (const m of single.filter(c => c.sex === 'M')) {
      const f = single.find(o => o.sex === 'F' && o.spouse == null && Math.abs(o.age - m.age) <= 20 && !this._kin(m, o));
      if (!f) continue;
      m.spouse = f.id; f.spouse = m.id;
      this.news('family', `${m.name} e ${f.name} se casaram.`);
    }
    this.assignHomes();
    for (const w of S.citizens) {
      if (w.sex !== 'F' || w.spouse == null || w.pregnant > 0 || w.birthRest > 0 || w.age > FERTILE_MAX || w.home == null) continue;
      const m = S.citizen(w.spouse), h = S.building(w.home);
      if (!m || m.home !== w.home || !h?.done) continue;
      // Precisa haver espaço para a criança e a mãe precisa estar bem alimentada.
      if (h.residents.length >= BUILDINGS.house.residents || w.hunger >= 80 || w.health < 50) continue;
      if (S.rng.chance(0.45)) w.pregnant = PREGNANCY;
    }
    S.history.push({ d: S.day(), n: S.citizens.length });
    if (S.history.length > 240) S.history.shift();
  }
  _birth(mother) {
    const S = this.sim, r = S.rng, h = mother.home != null ? S.building(mother.home) : null;
    mother.birthRest = BIRTH_REST;
    if (!h) return;
    const father = mother.spouse != null ? S.citizen(mother.spouse) : null;
    const surname = father ? father.family : mother.family;
    const sex = r.chance(0.5) ? 'M' : 'F';
    const first = r.pick(sex === 'M' ? MALE : FEMALE);
    const k = citizen(S.newId(), `${first} ${surname}`, sex, 0, surname, h.door.x + 0.5, h.door.y + 0.5, sex === 'M' ? r.int(0, 2) : 3 + r.int(0, 2));
    k.profession = 'child';
    k.parents = father ? [mother.id, father.id] : [mother.id];
    k.inside = mother.inside;
    S.citizens.push(k);
    if (h.residents.length < BUILDINGS.house.residents) { k.home = h.id; h.residents.push(k.id); }
    S.stats.births++;
    this.news('birth', `Nasceu ${first}, filho${sex === 'F' ? 'a' : ''} de ${mother.name}.`.replace('filhoa', 'filha'));
  }
  waitingHome() {
    return this.sim.citizens.filter(c => !this.isChild(c) && (c.home == null || this._withParents(c)) && c.age >= MARRY_AGE).length;
  }
  children(c) { return this.sim.citizens.filter(k => k.parents.includes(c.id)); }
  pantryTotal(h) { return Object.values(h.pantry || {}).reduce((a, n) => a + n, 0); }
  meal(c, res) {
    this.sim.stats.consumed[res]++;
    c.hunger = Math.max(0, c.hunger - MEAL);
    c.lastMeal = res;
    c.diet.push(res);
    if (c.diet.length > 4) c.diet.shift();
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
