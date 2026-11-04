import { GROW_SPEED, COAT_LIFE, TOOL_LIFE, isFood, ADULT_AGE, BIRTH_REST, DAY, FAMILIES, FEMALE, FERTILE_MAX, BUILDINGS, MALE, MARRY_AGE, MEAL, OLD_AGE, PREGNANCY, PROFESSIONS, YEAR } from './defs.js';

function citizen(id, name, sex, age, family, x, y, look) {
  return {
    id, name, sex, age, family, profession: 'laborer', workplace: null, home: null, spouse: null, lastMeal: null, diet: [], parents: [], pregnant: 0, birthRest: 0, warmth: 100, warming: false, sick: 0, educated: false, toolLife: TOOL_LIFE, coatLife: COAT_LIFE,
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
  _houses() { return this.sim.buildings.filter(b => BUILDINGS[b.type].residents && b.done); }
  maxRes(h) { return BUILDINGS[h.type].residents + 2 * ((h.level || 1) - 1); }
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
    const S = this.sim;
    for (const b of S.buildings) if (BUILDINGS[b.type].residents) b.residents = b.residents.filter(id => S.citizen(id));
    const houses = this._houses();
    const adults = S.citizens.filter(c => !this.isChild(c));
    const room = h => h.residents.length < this.maxRes(h);
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
      c.age += (c.age < MARRY_AGE ? GROW_SPEED : 1) / YEAR;
      if (wasChild && !this.isChild(c)) {
        const school = S.work.schoolSeat();
        if (school) c.profession = 'student';
        else c.profession = 'laborer';
        this.news('family', school ? `${c.name} entrou na escola.` : `${c.name} cresceu e já pode trabalhar.`);
        this.assignHomes();
      }
      if (c.profession === 'student' && (c.age >= 16 || !S.work.schoolOpen())) {
        c.educated = c.age >= 16 || c.educated;
        c.profession = 'laborer';
        if (c.age >= 16) this.news('family', `${c.name} se formou na escola.`);
      }
      this._warmth(c);
      this._sickness(c);
      this._mood(c);
      this._health(c);
      if (c.health <= 0) { this.kill(c, c.harm || 'hunger'); continue; }
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
    if (c.hunger >= 95) { c.health -= 40 * k; c.harm = 'hunger'; }
    else if (c.hunger < 70) {
      const variety = new Set(c.diet).size;
      c.health += (variety >= 2 ? 22 : 10) * k;
    }
    if (c.home == null && S.isNight()) c.health -= 5 * k;
    if (c.warmth <= 0) { c.health -= 150 * k; c.harm = 'cold'; }
    if (c.sick > 0) { c.health -= 26 * k; if (c.hunger < 95 && c.warmth > 0) c.harm = 'disease'; }
    c.health = Math.max(0, Math.min(100, c.health));
  }
  // Frio: perde calor fora de casa; roupa ajuda; casa com lenha devolve.
  _warmth(c) {
    const S = this.sim, t = S.season.temp(), k = 1 / DAY;
    const home = c.home != null ? S.building(c.home) : null;
    if (c.inside && home) {
      const stone = BUILDINGS[home.type].warm || (home.level || 1) >= 3;
      if (t >= 8 || (home.pantry?.firewood || 0) > 0) c.warmth += (stone ? 260 : 170) * k;
      else c.warmth += (t < -2 ? -20 : 5) * k;
    } else if (t < 8) {
      c.warmth -= (8 - t) * (c.coatLife > 0 ? 3.2 : 7.5) * k;
    } else c.warmth += 60 * k;
    c.warmth = Math.max(0, Math.min(100, c.warmth));
    if (c.coatLife > 0 && t < 8) c.coatLife--;
  }
  _sickness(c) {
    const S = this.sim, k = 1 / DAY;
    if (c.sick > 0) {
      c.sick--;
      if (c.sick <= 0) this.news('family', `${c.name} se recuperou da doença.`);
      else if (S.rng.next() < 0.3 * k) {
        const near = S.citizens.filter(o => o !== c && !o.sick && (o.home === c.home || Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 3));
        if (near.length) this.infect(S.rng.pick(near));
      }
      return;
    }
    if (!S.config.disease) return;
    const variety = new Set(c.diet).size;
    const risk = 0.012 + (variety < 2 ? 0.02 : 0) + (c.home == null ? 0.02 : 0) + (c.hunger > 80 ? 0.03 : 0) + (c.warmth < 25 ? 0.03 : 0);
    if (S.rng.next() < risk * k) this.infect(c);
  }
  infect(c) {
    if (c.sick > 0) return;
    c.sick = Math.round(DAY * (1 + this.sim.rng.next()));
    this.news('sick', `${c.name} adoeceu.`);
  }
  _mood(c) {
    const S = this.sim;
    const chapel = S.buildings.filter(b => b.done && b.type === 'chapel').reduce((a, b) => a + BUILDINGS.chapel.faith * (b.level || 1), 0);
    let aim = 45;
    if (c.home != null) aim += 10;
    if (new Set(c.diet).size >= 3) aim += 10;
    if (chapel >= S.citizens.length) aim += 15;
    if (S.buildings.some(b => b.done && b.type === 'market')) aim += 5;
    if (S.buildings.some(b => b.done && b.type === 'hospital')) aim += 5;
    if (S.buildings.some(b => b.done && b.type === 'school')) aim += 5;
    if (c.hunger > 80) aim -= 25;
    if (c.sick > 0) aim -= 15;
    if (c.warmth < 25) aim -= 15;
    if (S.unburied > 0) aim -= 15;
    if (S.griefUntil > S.time) aim -= 10;
    c.happiness += (aim - c.happiness) * 0.004;
  }
  // Quanto o aldeão rende. Ferramenta, estudo, saúde e ânimo pesam aqui.
  rate(c) {
    return (c.toolLife > 0 ? 1 : 0.6) * (c.educated ? 1.25 : 1) * (c.sick > 0 ? 0.6 : 1) * (c.happiness < 30 ? 0.85 : 1);
  }
  wear(c) { if (c.toolLife > 0) c.toolLife -= 0.05; }
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
    const how = { hunger: 'de fome', age: 'de velhice', cold: 'de frio', disease: 'de doença', accident: 'em um acidente', fire: 'em um incêndio', storm: 'na tempestade' }[cause] || '';
    this.news('death', `${c.name} morreu ${how} aos ${age} anos.`);
    const cem = S.buildings.find(b => b.done && b.type === 'cemetery' && b.graves < BUILDINGS.cemetery.graves * (b.level || 1));
    if (cem) cem.graves++; else S.unburied++;
    S.griefUntil = S.time + DAY;
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
      if (h.residents.length >= this.maxRes(h) || w.hunger >= 80 || w.health < 50) continue;
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
    if (h.residents.length < this.maxRes(h)) { k.home = h.id; h.residents.push(k.id); }
    S.stats.births++;
    this.news('birth', `Nasceu ${first}, filho${sex === 'F' ? 'a' : ''} de ${mother.name}.`.replace('filhoa', 'filha'));
  }
  // Migrantes: vêm famílias quando há casa vazia ou a vila cresce bem alimentada.
  migrate() {
    const S = this.sim, W = S.world, r = S.rng;
    if (!S.config.migration || !S.citizens.length) return false;
    const days = S.foodDays();
    const happy = S.citizens.reduce((a, c) => a + c.happiness, 0) / S.citizens.length;
    if (days < 6 || happy < 40) return false;
    const empty = this._houses().filter(h => !h.residents.length).length;
    const boom = days > 14 && this.waitingHome() < 2 && S.citizens.length >= 15;
    if (!(empty > 0 ? r.chance(0.3) : boom && r.chance(0.05))) return false;
    const c0 = S.citizens.find(c => !c.inside) || S.citizens[0];
    const comp = W.compAt(c0.x | 0, c0.y | 0);
    let spot = null;
    for (let i = 0; i < 200 && !spot; i++) {
      const side = r.int(0, 3), t = r.int(0, W.w - 1);
      const [x, y] = side === 0 ? [t, 1] : side === 1 ? [t, W.h - 2] : side === 2 ? [1, t] : [W.w - 2, t];
      if (W.compAt(x, y) === comp) spot = [x, y];
    }
    if (!spot) return false;
    const fam = r.pick(FAMILIES);
    const add = (first, sex, age) => {
      const k = citizen(S.newId(), `${first} ${fam}`, sex, age, fam, spot[0] + 0.5, spot[1] + 0.5, sex === 'M' ? r.int(0, 2) : 3 + r.int(0, 2));
      S.citizens.push(k);
      return k;
    };
    const m = add(r.pick(MALE), 'M', r.int(20, 42)), f = add(r.pick(FEMALE), 'F', r.int(18, 38));
    m.spouse = f.id; f.spouse = m.id;
    const kids = r.int(0, 2);
    for (let i = 0; i < kids; i++) {
      const sex = r.chance(0.5) ? 'M' : 'F';
      const k = add(r.pick(sex === 'M' ? MALE : FEMALE), sex, r.int(1, 10));
      k.profession = 'child'; k.parents = [f.id, m.id];
    }
    if (r.chance(0.12) && S.config.disease) this.infect(m);
    S.stats.migrants = (S.stats.migrants || 0) + 2 + kids;
    this.news('good', `A família ${fam} chegou de longe com ${2 + kids} pessoas e quer ficar na vila.`);
    this.assignHomes();
    return true;
  }
  waitingHome() {
    return this.sim.citizens.filter(c => !this.isChild(c) && (c.home == null || this._withParents(c)) && c.age >= MARRY_AGE).length;
  }
  children(c) { return this.sim.citizens.filter(k => k.parents.includes(c.id)); }
  pantryTotal(h) { return Object.values(h.pantry || {}).reduce((a, n) => a + n, 0); }
  foodIn(h) { let n = 0; for (const r in h.pantry || {}) if (isFood(r)) n += h.pantry[r]; return n; }
  meal(c, res) {
    this.sim.stats.consumed[res]++;
    c.hunger = Math.max(0, c.hunger - MEAL);
    c.lastMeal = res;
    c.diet.push(res);
    if (c.diet.length > 4) c.diet.shift();
  }
  eatFromPantry(c, home) {
    let best = null, n = 0;
    for (const r in home.pantry || {}) if (isFood(r) && home.pantry[r] > n) { n = home.pantry[r]; best = r; }
    if (!best) return false;
    home.pantry[best]--;
    this.meal(c, best);
    return true;
  }
  count(prof) { return this.sim.citizens.filter(c => c.profession === prof).length; }
  setProfession(c, prof) {
    if (!PROFESSIONS[prof] || c.profession === prof) return;
    if (c.task?.kind === 'craftFetch' || c.task?.kind === 'craft') this.sim.jobs.abort(c);
    const k = c.task?.kind;
    if (k && !['fetch', 'eat', 'eatBarn', 'home', 'cargo'].includes(k)) this.sim.jobs.abort(c);
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
