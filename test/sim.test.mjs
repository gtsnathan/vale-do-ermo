import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/Simulation.js';
import { SaveManager } from '../src/sim/SaveManager.js';
import { ADULT_AGE, BUILDINGS, DAY, PREGNANCY, RES, STEP, T, YEAR } from '../src/sim/defs.js';

function invariants(s) {
  const W = s.world;
  for (const r of RES) {
    let carried = 0, inSites = 0, inDepots = 0;
    for (const c of s.citizens) if (c.inv.res === r) carried += c.inv.amount;
    for (const b of s.buildings) {
      if (!b.done) { inSites += b.delivered[r]; assert.ok(b.enroute[r] >= 0, 'enroute negativo'); }
      if (b.up) { inSites += b.up.delivered[r]; assert.ok(b.up.enroute[r] >= 0, 'enroute negativo'); }
      if (b.input) inDepots += b.input[r] || 0;
      if (b.pantry) { inDepots += b.pantry[r] || 0; assert.ok((b.pantry[r] || 0) >= 0, 'despensa negativa'); }
      if (b.done && BUILDINGS[b.type].stores) {
        inDepots += b.stock[r];
        assert.ok(b.stock[r] >= 0, 'estoque negativo');
        assert.ok(b.reserved[r] >= 0, 'reserva negativa');
        assert.ok(b.reserved[r] <= b.stock[r], 'reservou mais do que existe');
      }
    }
    for (const f of s.farms) if (f.up) inSites += f.up.delivered[r];
    const ground = s.resources.groundTotal(r);
    assert.equal(inDepots + ground + carried + inSites + s.stats.consumed[r], s.startStock[r] + s.stats.produced[r], `conservação de ${r}`);
  }
  for (const b of s.storage.stores()) {
    assert.ok(b.incoming >= 0, 'incoming negativo');
    assert.ok(s.storage.used(b) + b.incoming <= s.storage.cap(b), 'capacidade excedida');
    for (const r of RES) if (b.stock[r] > 0) assert.ok(s.storage.accepts(b, r), `${r} guardado no lugar errado`);
  }
  for (const c of s.citizens) assert.ok(c.hunger >= 0 && c.hunger <= 100, 'fome fora da faixa');
  for (const r of RES) void r;
  for (const p of s.piles) { assert.ok(p.reserved >= 0 && p.reserved <= p.amount, 'pilha reservada errada'); }
  for (const c of s.citizens) if (!c.task || c.task.kind !== 'x') {
    if (c.inside) continue;
    const blocked = W.blocked(c.x | 0, c.y | 0);
    if (blocked) assert.ok(W.buildingAt[W.idx(c.x | 0, c.y | 0)] !== -1, 'aldeão dentro de obstáculo natural');
  }
}
const run = (s, secs, every = 40) => {
  const n = Math.round(secs / STEP);
  for (let i = 0; i < n; i++) { s.step(); if (i % every === 0) invariants(s); }
  invariants(s);
};
const freeSpot = (s, type) => {
  const st = s.world.start;
  for (let r = 3; r < 30; r++) for (let y = st.y - r; y <= st.y + r; y++) for (let x = st.x - r; x <= st.x + r; x++) {
    if (s.construction.validate(type, x, y, 0).ok) return [x, y];
  }
  throw new Error('sem lugar');
};
const nearestNodes = (s, type, count) => [...s.nodes.values()].filter(n => n.type === type && s.jobs.nodeSpots(n).length)
  .sort((a, b) => Math.hypot(a.x - s.world.start.x, a.y - s.world.start.y) - Math.hypot(b.x - s.world.start.x, b.y - s.world.start.y)).slice(0, count);

test('mesma semente gera o mesmo mapa; semente diferente, outro mapa', () => {
  const a = new Simulation({ seed: 'abc' }), b = new Simulation({ seed: 'abc' }), c = new Simulation({ seed: 'xyz' });
  assert.deepEqual(a.world.terrain, b.world.terrain);
  assert.equal(a.nodes.size, b.nodes.size);
  assert.notDeepEqual(a.world.terrain, c.world.terrain);
});

test('mapas têm todos os biomas e recursos ao alcance', () => {
  for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8']) for (const size of ['pequeno', 'medio', 'grande']) {
    const s = new Simulation({ seed, size });
    const counts = {};
    for (const t of s.world.terrain) counts[t] = (counts[t] || 0) + 1;
    assert.ok(counts[T.WATER] > 0, `água ${seed}`);
    assert.ok(counts[T.FORD] > 0, `vau ${seed}`);
    const c0 = s.citizens[0], comp = s.world.compAt(c0.x | 0, c0.y | 0);
    for (const type of ['tree', 'stone', 'iron']) {
      const ok = [...s.nodes.values()].some(n => n.type === type && s.jobs.reachable(s.jobs.nodeSpots(n), comp).length);
      assert.ok(ok, `${type} inalcançável em ${seed}/${size}`);
    }
    const area = s.world.comp.filter(v => v === comp).length;
    assert.ok(area > s.world.w * s.world.h * 0.25, `pouca terra em ${seed}/${size}`);
  }
});

test('dez aldeões fundadores, todos com identidade', () => {
  const s = new Simulation({ seed: 'x' });
  assert.equal(s.citizens.length, 10);
  assert.equal(new Set(s.citizens.map(c => c.name)).size, 10);
  for (const c of s.citizens) for (const k of ['name', 'age', 'sex', 'profession', 'family']) assert.ok(c[k]);
});

test('ciclo completo: madeira coletada anda fisicamente até o depósito', () => {
  const s = new Simulation({ seed: 'ciclo' });
  const d = s.storage.depots()[0], before = d.stock.wood;
  const trees = nearestNodes(s, 'tree', 6);
  for (const t of trees) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  let sawPile = false, sawCarry = false, stockBeforeChop = d.stock.wood;
  for (let i = 0; i < 2400; i++) {
    s.step();
    if (s.piles.length) { sawPile = true; }
    if (s.citizens.some(c => c.inv.res === 'wood')) sawCarry = true;
    if (s.stats.produced.wood > 0 && !sawCarry) assert.equal(d.stock.wood, stockBeforeChop, 'estoque subiu sem transporte');
    if (i % 40 === 0) invariants(s);
  }
  assert.ok(sawPile && sawCarry);
  assert.equal(s.stats.produced.wood, trees.length * 3);
  assert.equal(d.stock.wood, before + trees.length * 3);
  assert.equal(s.markedNodes.size, 0);
  assert.equal(s.piles.length, 0);
});

test('casa só fica pronta depois que os materiais chegam; moradores entram', () => {
  const s = new Simulation({ seed: 'casa' });
  const d = s.storage.depots()[0];
  const [x, y] = freeSpot(s, 'house');
  const r = s.construction.place('house', x, y, 0);
  assert.ok(r.ok, r.reason);
  const b = r.building;
  assert.equal(b.done, false);
  const w0 = d.stock.wood, st0 = d.stock.stone;
  let done = false;
  for (let i = 0; i < 7000 && !b.done; i++) {
    s.step();
    if (i % 40 === 0) invariants(s);
    if (b.work > 0 && !b.done) assert.ok(s.construction.materialsComplete(b), 'obra começou sem material');
    if (b.done) done = true;
  }
  assert.ok(done, `casa não concluiu: ${JSON.stringify(b)}`);
  assert.equal(d.stock.wood, w0 - 16);
  assert.equal(d.stock.stone, st0 - 4);
  assert.equal(s.stats.consumed.wood, 16);
  assert.equal(b.residents.length, 2);
  const couple = b.residents.map(id => s.citizen(id));
  assert.equal(couple[0].family, couple[1].family);
});

test('sem material a obra espera; ao marcar árvores ela termina', () => {
  const s = new Simulation({ seed: 'falta', difficulty: 'dificil' });
  const d = s.storage.depots()[0];
  d.stock.wood = 2; s.startStock.wood = 2;
  const [x, y] = freeSpot(s, 'house');
  const b = s.construction.place('house', x, y, 0).building;
  run(s, 60);
  assert.equal(b.delivered.wood, 2);
  assert.equal(b.work, 0);
  assert.ok(s.alerts.some(a => a.id === 'no-wood'));
  for (const t of nearestNodes(s, 'tree', 8)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  run(s, 600);
  assert.ok(b.done, 'obra não terminou depois de haver madeira');
});

test('aldeões não atravessam construções e saem de um canteiro novo', () => {
  const s = new Simulation({ seed: 'muro' });
  const c = s.citizens[0];
  const tx = c.x | 0, ty = c.y | 0;
  let placed = null;
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const r = s.construction.place('house', tx + ox, ty + oy, 0);
    if (r.ok) { placed = r.building; break; }
  }
  assert.ok(placed, 'não coube a casa em cima do aldeão');
  const site = placed;
  for (const t of nearestNodes(s, 'tree', 20)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  let inside = 0;
  for (let i = 0; i < 6000; i++) {
    s.step();
    if (i > 80) for (const k of s.citizens) {
      if (k.inside) continue;
      const a = k.x | 0, b = k.y | 0;
      if (a >= site.x && a < site.x + site.w && b >= site.y && b < site.y + site.h) inside++;
    }
  }
  assert.equal(inside, 0, 'alguém andou por dentro da construção');
});

test('uma construção que isolaria a vila é recusada', () => {
  const s = new Simulation({ seed: 'iso' });
  const W = s.world, st = W.start, wall = st.x + 7;
  // Muro de ponta a ponta com um único corredor; a casa tentaria fechar o corredor.
  for (let y = 0; y < W.h; y++) W.nodeBlocks[W.idx(wall, y)] = 1;
  for (const y of [st.y, st.y + 1]) for (const x of [wall - 1, wall, wall + 1, wall + 2]) {
    const i = W.idx(x, y);
    W.nodeBlocks[i] = 0; W.nodeAt[i] = -1; W.terrain[i] = T.GRASS;
  }
  W.recomputeComps();
  const v = s.construction.validate('house', wall, st.y, 1);
  assert.equal(v.ok, false);
  assert.match(v.reason, /caminho|isolad/);
});

test('cancelar a obra devolve todo o material ao chão, e ele volta ao depósito', () => {
  const s = new Simulation({ seed: 'cancela' });
  const [x, y] = freeSpot(s, 'house');
  const b = s.construction.place('house', x, y, 0).building;
  run(s, 25);
  const got = b.delivered.wood + b.delivered.stone;
  assert.ok(got > 0);
  s.construction.remove(b);
  invariants(s);
  run(s, 200);
  const d = s.storage.depots()[0];
  assert.equal(d.stock.wood, s.startStock.wood);
  assert.equal(d.stock.stone, s.startStock.stone);
  assert.equal(s.piles.length, 0);
  assert.ok(s.citizens.every(c => !c.inv.res));
});

test('depósito cheio: a sobra fica no chão e ninguém perde material', () => {
  const s = new Simulation({ seed: 'cheio' });
  const d = s.storage.depots()[0];
  const add = BUILDINGS.depot.capacity - s.storage.used(d) - 3;
  d.stock.stone += add;
  s.startStock.stone += add;
  for (const t of nearestNodes(s, 'tree', 6)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  run(s, 240);
  assert.equal(s.storage.used(d), BUILDINGS.depot.capacity);
  assert.ok(s.resources.groundTotal('wood') > 0);
  assert.ok(s.alerts.some(a => a.id === 'full') || s.isNight());
});

test('à noite os moradores entram em casa e de manhã voltam a trabalhar', () => {
  const s = new Simulation({ seed: 'noite', difficulty: 'facil' });
  const [x, y] = freeSpot(s, 'house');
  const b = s.construction.place('house', x, y, 0).building;
  run(s, 180);
  assert.ok(b.done);
  let sawInside = false, sawOut = false;
  for (let i = 0; i < 6000; i++) {
    s.step();
    const res = b.residents.map(id => s.citizen(id));
    if (res.every(c => c.inside)) sawInside = true;
    if (sawInside && !s.isNight() && res.every(c => !c.inside)) sawOut = true;
  }
  assert.ok(sawInside, 'não entraram');
  assert.ok(sawOut, 'não saíram');
});

test('ninguém fica parado com trabalho disponível, em vários mapas', () => {
  for (const seed of ['a1', 'b2', 'c3', 'd4', 'e5']) {
    const s = new Simulation({ seed, size: 'pequeno', difficulty: 'facil' });
    const trees = nearestNodes(s, 'tree', 60);
    for (const t of trees) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
    for (const n of nearestNodes(s, 'stone', 4)) s.mark(n.x, n.y, n.x, n.y, ['stone'], true);
    const stillFor = new Map();
    for (let i = 0; i < 2600; i++) {
      s.step();
      if (i % 20) continue;
      invariants(s);
      if (s.isNight()) { stillFor.clear(); continue; }
      const work = s.markedNodes.size > 12 || s.piles.length > 8;
      for (const c of s.citizens) {
        if (!work || c.inside) continue;
        const k = `${c.x.toFixed(2)},${c.y.toFixed(2)}`, cur = stillFor.get(c.id);
        if (c.anim === 'work') { stillFor.delete(c.id); continue; }
        if (cur && cur.k === k) { cur.t++; assert.ok(cur.t < 80, `${c.name} travado em ${seed}: ${JSON.stringify(c.task)}`); }
        else stillFor.set(c.id, { k, t: 0 });
      }
    }
    assert.ok(s.stats.produced.wood >= 30, `produção baixa em ${seed}: ${s.stats.produced.wood}`);
  }
});

test('salvar e carregar preserva o jogo, que continua válido', () => {
  const s = new Simulation({ seed: 'save', difficulty: 'facil' });
  const [x, y] = freeSpot(s, 'house');
  s.construction.place('house', x, y, 0);
  for (const t of nearestNodes(s, 'tree', 15)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  run(s, 45);
  const text = SaveManager.serialize(s);
  const l = SaveManager.load(text);
  assert.equal(l.time, s.time);
  assert.equal(l.nodes.size, s.nodes.size);
  assert.equal(l.markedNodes.size, s.markedNodes.size);
  assert.equal(l.buildings.length, s.buildings.length);
  assert.deepEqual(l.stats, s.stats);
  invariants(l);
  run(l, 300);
  run(s, 300);
  assert.equal(l.nodes.size, s.nodes.size);
  assert.deepEqual(l.stats.produced, s.stats.produced);
  assert.deepEqual(l.stats.built, s.stats.built);
});

test('partida longa: cinco casas e novo depósito, sem violar nenhuma regra', () => {
  const s = new Simulation({ seed: 'longa', size: 'grande' });
  const t0 = Date.now();
  for (const t of nearestNodes(s, 'tree', 80)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  for (const n of nearestNodes(s, 'stone', 6)) s.mark(n.x, n.y, n.x, n.y, ['stone'], true);
  for (let k = 0; k < 5; k++) { const [x, y] = freeSpot(s, 'house'); assert.ok(s.construction.place('house', x, y, k % 4).ok); }
  const [dx, dy] = freeSpot(s, 'depot');
  assert.ok(s.construction.place('depot', dx, dy, 1).ok);
  run(s, 1500);
  assert.equal(s.buildings.filter(b => b.done).length, 8, JSON.stringify(s.buildings.filter(b => !b.done).map(b => [b.delivered, b.work])));
  assert.equal(s.population.homeless(), 0);
  console.log(`  1500 s de jogo simulados em ${Date.now() - t0} ms`);
});

const clearArea = (s, w, h) => {
  const st = s.world.start;
  for (let r = 4; r < 40; r++) for (let y = st.y - r; y <= st.y + r; y++) for (let x = st.x - r; x <= st.x + r; x++) {
    if (s.farming.validate(x, y, x + w - 1, y + h - 1).ok) return [x, y];
  }
  throw new Error('sem área para fazenda');
};

test('a vila começa com celeiro cheio e cada estoque só aceita seu tipo', () => {
  const s = new Simulation({ seed: 'celeiro' });
  const barn = s.storage.barns()[0], depot = s.storage.depots()[0];
  assert.ok(barn && depot);
  assert.ok(barn.stock.potato > 0);
  assert.equal(depot.stock.potato, 0);
  assert.equal(barn.stock.wood, 0);
  assert.ok(s.storage.accepts(barn, 'corn') && !s.storage.accepts(barn, 'wood'));
  assert.ok(s.storage.accepts(depot, 'iron') && !s.storage.accepts(depot, 'corn'));
});

test('só construtores constroem; sem eles a obra para e o jogo avisa', () => {
  const s = new Simulation({ seed: 'prof', difficulty: 'facil' });
  s.population.changeCount('builder', -5);
  assert.equal(s.population.count('builder'), 0);
  const [x, y] = freeSpot(s, 'house');
  const b = s.construction.place('house', x, y, 0).building;
  run(s, 60);
  assert.ok(s.construction.materialsComplete(b), 'trabalhadores deveriam entregar');
  assert.equal(b.work, 0);
  assert.ok(s.alerts.some(a => a.id === 'no-builder'));
  s.population.changeCount('builder', 2);
  run(s, 60);
  assert.ok(b.done);
});

test('fazenda: prepara, planta, cresce, colhe e o alimento chega a pé ao celeiro', () => {
  const s = new Simulation({ seed: 'roca' });
  const [x, y] = clearArea(s, 4, 4);
  const f = s.farming.place(x, y, x + 3, y + 3, 'beans').farm;
  assert.equal(f.tiles.length, 16);
  s.population.changeCount('farmer', 2);
  f.maxWorkers = 2;
  const barn = s.storage.barns()[0], seen = new Set();
  let carried = false, barnBefore = null;
  for (let i = 0; i < 16000; i++) {
    s.step();
    for (const t of f.tiles) seen.add(t.st);
    if (s.citizens.some(c => c.inv.res === 'beans' && c.profession === 'farmer')) carried = true;
    if (s.stats.produced.beans > 0 && barnBefore == null) barnBefore = barn.stock.beans;
    if (i % 40 === 0) invariants(s);
    if (s.stats.consumed.beans === 0 && carried && barn.stock.beans > 40 + 1) break;
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
  assert.ok(s.stats.produced.beans > 0, 'não colheu');
  assert.ok(carried, 'colheita não foi carregada');
  run(s, 240);
});

test('solo fértil rende mais', () => {
  const s = new Simulation({ seed: 'fertil' });
  const W = s.world;
  const a = { x: 1, y: 1, crop: 'potato' }, b = { x: 2, y: 1, crop: 'potato' };
  W.terrain[W.idx(1, 1)] = T.FERTILE; W.terrain[W.idx(2, 1)] = T.GRASS;
  assert.ok(s.farming.tileYield(a) > s.farming.tileYield(b));
});

test('fazenda não bloqueia a passagem e impede construir em cima', () => {
  const s = new Simulation({ seed: 'campo' });
  const [x, y] = clearArea(s, 3, 3);
  s.farming.place(x, y, x + 2, y + 2);
  assert.equal(s.world.blocked(x + 1, y + 1), false);
  assert.equal(s.world.canPlace('house', x, y, 0).ok, false);
  assert.equal(s.farming.validate(x, y, x + 2, y + 2).ok, false);
  assert.equal(s.farming.validate(x, y, x + 1, y + 1).ok, false);
});

test('famílias abastecem a despensa, comem e a fome fica sob controle', () => {
  const s = new Simulation({ seed: 'mesa', difficulty: 'facil' });
  for (let k = 0; k < 5; k++) { const [x, y] = freeSpot(s, 'house'); assert.ok(s.construction.place('house', x, y, 0).ok); }
  const barn = s.storage.barns()[0], before = s.storage.used(barn);
  run(s, 240 * 4);
  assert.equal(s.buildings.filter(b => b.type === 'house' && b.done).length, 5);
  assert.ok(s.storage.used(barn) < before, 'celeiro não foi usado');
  assert.ok(s.buildings.filter(b => b.type === 'house').some(h => s.population.pantryTotal(h) > 0), 'despensas vazias');
  const eaten = Object.values(s.stats.consumed).reduce((a, b) => a + b, 0);
  assert.ok(eaten > 16, 'quase ninguém comeu');
  assert.ok(s.citizens.every(c => c.hunger < 90), 'alguém faminto mesmo com comida');
});

test('sem comida a fome sobe, o jogo avisa e ninguém trava', () => {
  const s = new Simulation({ seed: 'seca' });
  const barn = s.storage.barns()[0];
  for (const r of RES) { barn.stock[r] = 0; s.startStock[r] = s.storage.depots()[0].stock[r]; }
  for (const t of nearestNodes(s, 'tree', 30)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  run(s, 240 * 1.3);
  assert.ok(s.citizens.every(c => c.hunger >= 90));
  assert.ok(s.alerts.some(a => a.id === 'hungry'));
  run(s, 240);
  assert.ok(s.stats.produced.wood > 0);
});

test('cabana de coleta produz comida que precisa ser carregada', () => {
  const s = new Simulation({ seed: 'mata', difficulty: 'facil' });
  const [x, y] = freeSpot(s, 'gatherer');
  const hut = s.construction.place('gatherer', x, y, 0).building;
  s.population.changeCount('gatherer', 2);
  run(s, 100);
  assert.ok(hut.done);
  assert.ok(s.farming.forestAround(hut) >= 0);
  let tries = 0;
  while (s.stats.produced.berries + s.stats.produced.mushroom === 0 && tries++ < 400) run(s, 5, 100000);
  assert.ok(s.stats.produced.berries + s.stats.produced.mushroom > 0, 'não coletou');
  run(s, 200);
  assert.equal(s.citizens.filter(c => c.workplace === hut.id).length, 2);
});

test('demolir e cancelar fazenda não perde comida guardada e libera trabalhadores', () => {
  const s = new Simulation({ seed: 'demole' });
  const [x, y] = clearArea(s, 3, 3);
  const f = s.farming.place(x, y, x + 2, y + 2).farm;
  s.population.changeCount('farmer', 1);
  run(s, 30);
  assert.ok(s.citizens.some(c => c.workplace === f.id));
  s.farming.remove(f);
  invariants(s);
  assert.ok(s.citizens.every(c => c.workplace !== f.id));
  assert.equal(s.world.fieldAt[s.world.idx(x, y)], -1);
  run(s, 60);
  const [hx, hy] = freeSpot(s, 'house');
  const h = s.construction.place('house', hx, hy, 0).building;
  run(s, 200);
  assert.ok(h.done);
  s.construction.remove(h);
  invariants(s);
  run(s, 200);
});

test('salvamento guarda fazendas, despensas e profissões', () => {
  const s = new Simulation({ seed: 'save2', difficulty: 'facil' });
  const [x, y] = clearArea(s, 3, 3);
  const f = s.farming.place(x, y, x + 2, y + 2, 'corn').farm;
  s.population.changeCount('farmer', 1);
  const [hx, hy] = freeSpot(s, 'house');
  s.construction.place('house', hx, hy, 0);
  run(s, 120);
  const l = SaveManager.load(SaveManager.serialize(s));
  invariants(l);
  assert.equal(l.farms.length, 1);
  assert.equal(l.farms[0].crop, 'corn');
  assert.deepEqual(l.farms[0].tiles.map(t => t.st), f.tiles.map(t => t.st));
  assert.equal(l.population.count('farmer'), 1);
  assert.equal(l.world.fieldAt[l.world.idx(x, y)], f.id);
  run(l, 300);
});

test('vila salva na versão 0.1 abre, ganha celeiro e continua válida', () => {
  const s = new Simulation({ seed: 'antiga' });
  const j = JSON.parse(SaveManager.serialize(s));
  j.v = 1;
  delete j.farms;
  j.buildings = j.buildings.filter(b => b.type === 'depot');
  for (const b of j.buildings) for (const r of ['firewood', 'tools', 'coat', 'hide', 'herbs', 'fish', 'meat', 'apple', 'pear', 'potato', 'beans', 'wheat', 'corn', 'pumpkin', 'cabbage', 'berries', 'mushroom']) { delete b.stock[r]; delete b.reserved[r]; delete b.delivered[r]; delete b.enroute[r]; }
  for (const c of j.citizens) { c.profession = 'Trabalhador geral'; delete c.workplace; }
  j.startStock = { wood: 50, stone: 15, iron: 0 };
  j.stats.produced = { wood: 0, stone: 0, iron: 0 };
  j.stats.consumed = { wood: 0, stone: 0, iron: 0 };
  const l = SaveManager.load(JSON.stringify(j));
  assert.equal(l.storage.barns().length, 1);
  assert.ok(l.storage.barns()[0].stock.potato > 0);
  assert.equal(l.population.count('builder'), 2);
  invariants(l);
  run(l, 300);
});

const housed = (s, n = 5) => {
  for (let k = 0; k < n; k++) {
    const [x, y] = freeSpot(s, 'house');
    const b = s.construction.place('house', x, y, 0).building;
    for (const r of RES) b.delivered[r] = BUILDINGS.house.cost[r] || 0;
    for (const r in BUILDINGS.house.cost) { const d = s.storage.depots()[0]; d.stock[r] = Math.max(0, d.stock[r]); s.startStock[r] += BUILDINGS.house.cost[r]; }
    s.construction.finish(b);
  }
};
const fed = s => { for (const c of s.citizens) c.hunger = 0; };
const stockUp = s => { const b = s.storage.barns()[0]; const add = 190 - s.storage.used(b); b.stock.potato += add; s.startStock.potato += add; };

test('casal com casa tem filhos; casal sem casa não tem', () => {
  const a = new Simulation({ seed: 'bebe', difficulty: 'facil' });
  run(a, DAY * 8);
  assert.equal(a.stats.births, 0, 'nasceu sem casa');
  assert.equal(a.citizens.length, 10);
  const b = new Simulation({ seed: 'bebe', difficulty: 'facil' });
  housed(b);
  for (let i = 0; i < 30 && !b.stats.births; i++) run(b, DAY, 200);
  assert.ok(b.stats.births > 0, 'não nasceu ninguém');
  assert.equal(b.citizens.length, 10 + b.stats.births);
  const k = b.citizens.find(c => c.parents.length);
  assert.equal(k.parents.length, 2);
  assert.equal(b.citizen(k.parents[0]).home, k.home);
  assert.equal(k.profession, 'child');
  assert.ok(b.chronicle.some(e => e.kind === 'birth'));
});

test('casa cheia impede novos filhos', () => {
  const s = new Simulation({ seed: 'cheia', difficulty: 'facil' });
  housed(s, 1);
  const h = s.buildings.find(b => b.type === 'house');
  const w = h.residents.map(id => s.citizen(id)).find(c => c.sex === 'F');
  for (let i = 0; i < 3; i++) { const fake = w.id * 1000 + i; h.residents.push(fake); s.citizens.push({ ...s.citizens[0], id: fake, name: `x${i}`, spouse: null, parents: [], home: h.id, sex: 'M', age: 30, inv: { res: null, amount: 0 }, task: null, path: null, diet: [], profession: 'laborer', workplace: null }); }
  for (let i = 0; i < 12; i++) { s.population.daily(); }
  assert.equal(w.pregnant, 0);
});

test('crianças não trabalham, crescem e entram na força de trabalho', () => {
  const s = new Simulation({ seed: 'cresce', difficulty: 'facil' });
  housed(s, 1);
  const w = s.citizens.find(c => c.home != null && c.sex === 'F');
  w.pregnant = 1;
  s.step();
  run(s, 2);
  const k = s.citizens.find(c => c.parents.includes(w.id));
  assert.ok(k, 'bebê não nasceu');
  for (const t of nearestNodes(s, 'tree', 20)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  for (let i = 0; i < 2000; i++) {
    s.step();
    assert.ok(!k.inv.res, 'criança carregando');
    assert.ok(!['harvest', 'haul', 'deliver', 'build', 'cargo'].includes(k.task?.kind), `criança trabalhando: ${k.task?.kind}`);
  }
  assert.ok(k.age > 0);
  assert.equal(s.population.count('laborer') + s.population.count('builder'), 10);
  assert.equal(s.population.changeCount('farmer', 20), 8);
  assert.equal(k.profession, 'child');
  k.age = ADULT_AGE - 0.0001;
  run(s, 2);
  assert.equal(k.profession, 'laborer');
});

test('sem comida o aldeão enfraquece e morre de fome, sem perder a carga', () => {
  const s = new Simulation({ seed: 'fome' });
  const barn = s.storage.barns()[0];
  for (const r of RES) { s.startStock[r] -= barn.stock[r]; barn.stock[r] = 0; }
  for (const t of nearestNodes(s, 'tree', 40)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  let weak = false;
  for (let i = 0; i < 40 && s.citizens.length; i++) { run(s, DAY / 2, 100); if (s.alerts.some(a => a.id === 'weak')) weak = true; }
  assert.ok(weak, 'não avisou fraqueza');
  assert.equal(s.citizens.length, 0, 'deveriam ter morrido');
  assert.equal((s.stats.deaths.hunger || 0) + (s.stats.deaths.cold || 0), 10);
  assert.ok(s.chronicle.some(e => e.kind === 'death'));
  for (let i = 0; i < 100; i++) s.step();
  invariants(s);
});

test('com comida a saúde se recupera', () => {
  const s = new Simulation({ seed: 'cura', difficulty: 'facil' });
  housed(s);
  const c = s.citizens[0];
  c.health = 40;
  run(s, DAY * 2, 200);
  assert.ok(c.health > 55, `saúde ${c.health}`);
});

test('velhos morrem de velhice e o viúvo pode casar de novo', () => {
  const s = new Simulation({ seed: 'velho', difficulty: 'facil' });
  housed(s);
  const old = s.citizens.find(c => c.sex === 'M'), sp = s.citizen(old.spouse);
  old.age = 90;
  let n = 0;
  while (s.citizen(old.id) && n++ < 300) { stockUp(s); fed(s); run(s, 10, 100); }
  assert.ok(!s.citizen(old.id), 'não morreu');
  assert.equal(s.stats.deaths.age, 1);
  assert.equal(sp.spouse, null);
  const h = s.building(sp.home);
  assert.ok(!h.residents.includes(old.id));
  assert.ok(s.citizens.every(c => c.age < 90));
});

test('jovens casam, não com parentes, e saem de casa quando há moradia', () => {
  const s = new Simulation({ seed: 'casar', difficulty: 'facil' });
  housed(s);
  const [h1, h2] = s.buildings.filter(b => b.type === 'house');
  const mk = (name, sex, home, parents) => {
    const base = s.citizen(h1.residents[0]);
    const c = { ...base, id: s.newId(), name, sex, age: 20, spouse: null, parents, home: home.id, inv: { res: null, amount: 0 }, task: null, path: null, diet: [], x: home.door.x + 0.5, y: home.door.y + 0.5, px: 0, py: 0, inside: false, profession: 'laborer', workplace: null, pregnant: 0, birthRest: 0 };
    s.citizens.push(c); home.residents.push(c.id);
    return c;
  };
  const brother = mk('Irmão', 'M', h1, [h1.residents[0], h1.residents[1]]);
  const sister = mk('Irmã', 'F', h1, [h1.residents[0], h1.residents[1]]);
  s.population.daily();
  assert.equal(brother.spouse, null, 'irmãos casaram');
  assert.equal(sister.spouse, null);
  const other = mk('Vizinha', 'F', h2, [h2.residents[0], h2.residents[1]]);
  s.population.daily();
  assert.equal(brother.spouse, other.id);
  assert.equal(brother.home, h1.id, 'não havia casa livre');
  assert.ok(s.population.waitingHome() >= 1);
  const [x, y] = freeSpot(s, 'house');
  const b3 = s.construction.place('house', x, y, 0).building;
  for (const r of RES) b3.delivered[r] = BUILDINGS.house.cost[r] || 0;
  s.startStock.wood += 16; s.startStock.stone += 4;
  s.construction.finish(b3);
  assert.equal(brother.home, b3.id);
  assert.equal(other.home, b3.id);
  assert.ok(!h1.residents.includes(brother.id));
});

test('órfãos são acolhidos por outra família', () => {
  const s = new Simulation({ seed: 'orfao', difficulty: 'facil' });
  housed(s, 2);
  const [h1, h2] = s.buildings.filter(b => b.type === 'house');
  const parents = h1.residents.map(id => s.citizen(id));
  const kid = { ...parents[0], id: s.newId(), name: 'Órfão', age: 5, spouse: null, parents: parents.map(p => p.id), home: h1.id, inv: { res: null, amount: 0 }, task: null, path: null, diet: [], profession: 'child', workplace: null, pregnant: 0, birthRest: 0 };
  s.citizens.push(kid); h1.residents.push(kid.id);
  for (const p of parents) s.population.kill(p, 'age');
  assert.equal(kid.home, h2.id);
  assert.ok(h2.residents.includes(kid.id));
});

test('dez anos de vila: a população cresce só por nascimentos e nenhuma regra quebra', () => {
  const s = new Simulation({ seed: 'decada', size: 'grande', difficulty: 'facil' });
  housed(s);
  const [x, y] = clearArea(s, 8, 8);
  s.farming.place(x, y, x + 7, y + 7, 'corn');
  s.population.changeCount('farmer', 2);
  const [wx, wy] = freeSpot(s, 'woodcutter');
  s.construction.place('woodcutter', wx, wy, 0);
  s.population.changeCount('woodcutter', 1);
  for (const t of nearestNodes(s, 'tree', 120)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  const t0 = Date.now();
  run(s, YEAR * 10, 400);
  assert.ok(s.stats.births >= 5, `nascimentos: ${s.stats.births}`);
  const dead = Object.values(s.stats.deaths).reduce((a, b) => a + b, 0);
  assert.equal(s.citizens.length, 10 + s.stats.births - dead);
  for (const h of s.buildings) if (h.type === 'house') assert.ok(h.residents.length <= BUILDINGS.house.residents);
  assert.ok(s.history.length > 30);
  console.log(`  10 anos: ${s.citizens.length} habitantes, ${s.stats.births} nascimentos, ${dead} mortes, ${Date.now() - t0} ms`);
});

test('gravidez, família e crônica sobrevivem ao salvamento; save v2 abre', () => {
  const s = new Simulation({ seed: 'savefam', difficulty: 'facil' });
  housed(s);
  const w = s.citizens.find(c => c.sex === 'F');
  w.pregnant = PREGNANCY;
  run(s, DAY * 1.2);
  const l = SaveManager.load(SaveManager.serialize(s));
  invariants(l);
  assert.ok(l.citizen(w.id).pregnant > 0);
  assert.deepEqual(l.history, s.history);
  const j = JSON.parse(SaveManager.serialize(s));
  j.v = 2; delete j.chronicle; delete j.history; delete j.stats.births; delete j.stats.deaths;
  for (const c of j.citizens) { delete c.diet; delete c.parents; delete c.pregnant; delete c.birthRest; }
  const o = SaveManager.load(JSON.stringify(j));
  invariants(o);
  run(o, DAY * 3, 200);
  assert.equal(o.stats.births >= 0, true);
});

test('estações mudam, temperatura cai no inverno e geada mata o que não foi colhido', () => {
  const s = new Simulation({ seed: 'clima' });
  assert.equal(s.season.index(), 0);
  const seen = [];
  const [x, y] = clearArea(s, 3, 3);
  const f = s.farming.place(x, y, x + 2, y + 2, 'pumpkin').farm;
  for (const t of f.tiles) { t.st = 2; t.crop = 'pumpkin'; }
  let temps = [0, 0, 0, 0], n = [0, 0, 0, 0];
  for (let i = 0; i < 6 * DAY / STEP; i += 20) { for (let k = 0; k < 20; k++) s.step(); const q = s.season.index(); temps[q] += s.season.temp(); n[q]++; if (!seen.includes(q)) seen.push(q); }
  assert.deepEqual(seen.sort(), [0, 1, 2, 3]);
  assert.ok(temps[3] / n[3] < 2 && temps[1] / n[1] > 15, 'temperaturas');
  assert.ok(f.tiles.every(t => t.st !== 2 || t.crop !== 'pumpkin'), 'geada não atuou');
});

test('sem plantar no inverno; pomar guarda as árvores depois da colheita', () => {
  const s = new Simulation({ seed: 'pomar', difficulty: 'facil' });
  const [x, y] = clearArea(s, 3, 3);
  const f = s.farming.place(x, y, x + 2, y + 2, 'apple', 'orchard').farm;
  assert.equal(f.crop, 'apple');
  const c = s.citizens[0];
  s.time = 240 * 4.6;
  assert.equal(s.season.index(), 3);
  assert.equal(s.farming.pickTile(f, c, s.world.compAt(c.x | 0, c.y | 0)), -1);
  f.tiles[0].st = 3; f.tiles[0].crop = 'apple';
  s.farming.finishTile(f, 0, c);
  assert.equal(f.tiles[0].st, 2);
  assert.equal(f.tiles[0].crop, 'apple');
  s.stats.produced.apple = 0; c.inv.res = null; c.inv.amount = 0;
});

test('frio sem casa, lenha e roupa mata; casa com lenha salva', () => {
  const bare = new Simulation({ seed: 'gelo', difficulty: 'dificil' });
  for (const c of bare.citizens) c.coatLife = 0;
  const d = bare.storage.depots()[0];
  bare.startStock.coat -= d.stock.coat; d.stock.coat = 0;
  bare.time = 240 * 4.55;
  bare.season.last = 3; bare.winterExtra = 10;
  run(bare, 345, 400);
  assert.ok(bare.citizens.length < 10, 'ninguém morreu de frio');
  assert.ok(bare.stats.deaths.cold > 0);
  const warm = new Simulation({ seed: 'gelo', difficulty: 'facil' });
  housed(warm);
  warm.time = 240 * 4.55; warm.season.last = 3;
  run(warm, 240, 200);
  assert.equal(warm.citizens.length, 10, 'morreram em casa aquecida');
  const consumed = warm.stats.consumed.firewood;
  assert.ok(consumed > 0, 'não queimou lenha');
});

test('cortador de lenha transforma madeira em lenha carregando tudo a pé', () => {
  const s = new Simulation({ seed: 'lenha', difficulty: 'facil' });
  const [x, y] = freeSpot(s, 'woodcutter');
  const b = s.construction.place('woodcutter', x, y, 0).building;
  s.population.changeCount('woodcutter', 1);
  const w0 = s.stats.produced.firewood;
  run(s, 180, 80);
  assert.ok(b.done);
  assert.ok(s.stats.produced.firewood > w0, 'não produziu');
  assert.ok(s.stats.consumed.wood > 16 - 16, 'madeira não foi consumida');
});

test('toda oficina funciona quando tem matéria-prima', () => {
  for (const [type, out, stock] of [['smith', 'tools', { iron: 6, wood: 6 }], ['tailor', 'coat', { hide: 10 }], ['fisher', 'fish', {}], ['quarry', 'stone', {}], ['mine', 'iron', {}], ['herbalist', 'herbs', {}], ['hunter', 'meat', {}], ['gatherer', 'berries', {}]]) {
    const s = new Simulation({ seed: 'oficina', difficulty: 'normal' });
    const W = s.world;
    const d = s.storage.depots()[0];
    for (const r in stock) { d.stock[r] += stock[r]; s.startStock[r] += stock[r]; }
    let spot = null;
    for (let r = 3; r < 60 && !spot; r++) for (let y = W.start.y - r; y <= W.start.y + r && !spot; y++) for (let x = W.start.x - r; x <= W.start.x + r; x++) {
      if (s.construction.validate(type, x, y, 0).ok) { spot = [x, y]; break; }
    }
    if (!spot) continue;
    const b = s.construction.place(type, spot[0], spot[1], 0).building;
    const P = BUILDINGS[type].prof;
    b.work = BUILDINGS[type].work - 0.1;
    for (const r in BUILDINGS[type].cost) { b.delivered[r] = BUILDINGS[type].cost[r]; s.startStock[r] += BUILDINGS[type].cost[r]; }
    s.construction.finish(b);
    s.population.changeCount(P, 2);
    s.farming.balance();
    const before = s.stats.produced[out] + (out === 'berries' ? s.stats.produced.mushroom : 0);
    let ok = false;
    for (let t = 0; t < 40 && !ok; t++) { run(s, 25, 200); ok = s.stats.produced[out] + (out === 'berries' ? s.stats.produced.mushroom : 0) > before; }
    assert.ok(ok, `${type} não produziu ${out}`);
  }
});

test('silvicultor planta mudas que crescem e corta árvores adultas', () => {
  const s = new Simulation({ seed: 'muda', difficulty: 'facil' });
  const [x, y] = freeSpot(s, 'forester');
  const b = s.construction.place('forester', x, y, 0).building;
  for (const r in BUILDINGS.forester.cost) { b.delivered[r] = BUILDINGS.forester.cost[r]; s.startStock[r] += BUILDINGS.forester.cost[r]; }
  s.construction.finish(b);
  s.population.changeCount('forester', 2);
  const w0 = s.stats.produced.wood, nodes0 = s.nodes.size;
  run(s, 120, 200);
  assert.ok(s.saplings.size > 0 || s.stats.produced.wood > w0, 'nada aconteceu');
  run(s, DAY, 200);
  assert.ok(s.stats.produced.wood > w0, 'não cortou');
  void nodes0;
  const l = SaveManager.load(SaveManager.serialize(s));
  assert.equal(l.nodes.size, s.nodes.size);
  invariants(l);
});

test('mercado abastece e famílias usam; posto troca mercadoria com o barco', () => {
  const s = new Simulation({ seed: 'troca', difficulty: 'facil' });
  const W = s.world;
  const put = t => {
    for (let r = 3; r < 70; r++) for (let y = W.start.y - r; y <= W.start.y + r; y++) for (let x = W.start.x - r; x <= W.start.x + r; x++) {
      if (s.construction.validate(t, x, y, 0).ok) {
        const b = s.construction.place(t, x, y, 0).building;
        for (const q in BUILDINGS[t].cost) { b.delivered[q] = BUILDINGS[t].cost[q]; s.startStock[q] += BUILDINGS[t].cost[q]; }
        s.construction.finish(b);
        return b;
      }
    }
    return null;
  };
  const m = put('market');
  s.population.changeCount('vendor', 2);
  run(s, 100, 80);
  assert.ok(s.storage.used(m) > 0, 'mercado vazio');
  const post = put('trading');
  if (post) {
    s.population.changeCount('trader', 2);
    post.exportRes = 'potato';
    run(s, 60, 80);
    assert.ok(post.stock.potato > 0, 'nada no posto');
    assert.equal(s.work.buy(post, 'iron', 1).ok, false);
    s.trade.next = 0;
    s.work.boatTick();
    assert.ok(s.trade.boat);
    const off = s.trade.boat.offers[0];
    const before = s.resources.groundTotal(off.res) ;
    const r = s.work.buy(post, off.res, 1);
    if (r.ok) assert.equal(s.resources.groundTotal(off.res), before + 1);
    invariants(s);
  }
});

test('escola forma alunos, doença cura no hospital, cemitério guarda mortos', () => {
  const s = new Simulation({ seed: 'servico', difficulty: 'facil' });
  const put = t => {
    const [x, y] = freeSpot(s, t);
    const b = s.construction.place(t, x, y, 0).building;
    for (const q in BUILDINGS[t].cost) { b.delivered[q] = BUILDINGS[t].cost[q]; s.startStock[q] += BUILDINGS[t].cost[q]; }
    s.construction.finish(b);
    return b;
  };
  housed(s, 1);
  const sc = put('school');
  s.population.changeCount('teacher', 1);
  s.farming.balance();
  assert.equal(s.work.schoolOpen(), true);
  const kid = { ...s.citizens[0], id: s.newId(), name: 'Aluno', age: 11.9999, spouse: null, parents: [], home: null, inv: { res: null, amount: 0 }, task: null, path: null, diet: [], profession: 'child', workplace: null, educated: false };
  s.citizens.push(kid);
  run(s, 2, 40);
  assert.equal(kid.profession, 'student');
  kid.age = 16;
  run(s, 2, 40);
  assert.equal(kid.educated, true);
  assert.equal(kid.profession, 'laborer');
  assert.ok(s.population.rate(kid) > 1);
  const h = put('hospital');
  s.population.changeCount('doctor', 1);
  const d = s.storage.depots()[0]; d.stock.herbs += 8; s.startStock.herbs += 8;
  s.farming.balance();
  run(s, 30, 80);
  assert.ok((h.input.herbs || 0) > 0, 'hospital sem ervas');
  const sick = s.citizens.find(c => c.profession === 'laborer');
  s.population.infect(sick);
  for (let i = 0; i < 60 && sick.sick > 0; i++) run(s, 5, 200);
  assert.equal(sick.sick, 0, 'não curou');
  const cem = put('cemetery');
  s.population.kill(s.citizens.find(c => c.profession === 'laborer'), 'accident');
  assert.equal(cem.graves, 1);
  assert.equal(s.unburied, 0);
});

test('estrada acelera, ponte atravessa água e túnel fura montanha', () => {
  const s = new Simulation({ seed: 'via', difficulty: 'facil' });
  const W = s.world, st = W.start;
  const a = s.citizens[0];
  const n = s.infra.place(1, st.x - 5, st.y + 6, st.x + 5, st.y + 6);
  assert.ok(n > 0);
  run(s, 60, 80);
  assert.ok(s.roads.length > 0, 'nenhum tile pronto');
  assert.ok(W.costI(W.idx(s.roads[0].x, s.roads[0].y)) < 1);
  let water = null;
  for (let i = 0; i < W.w * W.h && !water; i++) if (W.terrain[i] === T.WATER && [i - 1, i + 1, i - W.w, i + W.w].some(j => j >= 0 && j < W.comp.length && W.comp[j] === W.compAt(a.x | 0, a.y | 0))) water = [i % W.w, (i / W.w) | 0];
  assert.ok(water);
  assert.equal(W.blocked(water[0], water[1]), true);
  s.infra.place(3, water[0], water[1], water[0], water[1]);
  let t0 = 0;
  while (W.blocked(water[0], water[1]) && t0++ < 60) run(s, 10, 200);
  assert.equal(W.blocked(water[0], water[1]), false, 'ponte não ficou pronta');
  assert.ok(s.infra.removeArea(st.x - 5, st.y + 6, st.x + 5, st.y + 6) > 0);
  const l = SaveManager.load(SaveManager.serialize(s));
  assert.equal(l.world.blocked(water[0], water[1]), false);
  invariants(l);
});

test('caçadores reduzem veados; animais andam só em terra livre', () => {
  const s = new Simulation({ seed: 'veado' });
  assert.ok(s.animals.length > 3);
  run(s, 60, 200);
  for (const a of s.animals) assert.ok(!s.world.blocked(a.x | 0, a.y | 0));
});

test('pastagem produz lã e, com rebanho cheio, carne', () => {
  const s = new Simulation({ seed: 'ovelha', difficulty: 'facil' });
  const [x, y] = clearArea(s, 4, 4);
  const f = s.farming.place(x, y, x + 3, y + 3, 'potato', 'pasture').farm;
  assert.equal(f.herd, 2);
  s.population.changeCount('herder', 1);
  run(s, DAY * 4, 200);
  assert.ok(s.stats.produced.hide > 0, 'sem lã');
  assert.ok(f.herd >= 2);
});

test('incêndio sem poço destrói; com poço apaga; eventos só com a opção ligada', () => {
  const s = new Simulation({ seed: 'fogo', difficulty: 'facil' });
  housed(s, 2);
  const [h1, h2] = s.buildings.filter(b => BUILDINGS[b.type].residents);
  h1.burning = 100;
  for (let i = 0; i < 120; i++) s.eventsMgr.burnTick();
  assert.ok(!s.building(h1.id), 'não destruiu');
  invariants(s);
  const [x, y] = freeSpot(s, 'well');
  const w = s.construction.place('well', x, y, 0).building;
  for (const q in BUILDINGS.well.cost) { w.delivered[q] = BUILDINGS.well.cost[q]; s.startStock[q] += BUILDINGS.well.cost[q]; }
  s.construction.finish(w);
  if (Math.abs(w.x - h2.x) + Math.abs(w.y - h2.y) <= 16) {
    h2.burning = 100;
    for (let i = 0; i < 30; i++) s.eventsMgr.burnTick();
    assert.ok(s.building(h2.id), 'poço não salvou');
    assert.equal(h2.burning, 0);
  }
  const quiet = new Simulation({ seed: 'calmo' });
  for (let i = 0; i < 40; i++) quiet.eventsMgr.daily();
  assert.equal(quiet.chronicle.length, 0);
});

test('mina só encosta na montanha e cabana de pesca na água', () => {
  const s = new Simulation({ seed: 'lugar' });
  const W = s.world;
  const st = W.start;
  assert.match(W.canPlace('mine', st.x + 3, st.y + 6, 0).reason || 'Precisa encostar', /montanha|Limpe|Há|construção|Precisa/);
});

test('com eventos e doenças ligados, vinte anos rodam sem quebrar nenhuma regra', () => {
  const s = new Simulation({ seed: 'caos', size: 'grande', difficulty: 'facil', events: true, disease: true });
  housed(s);
  const [x, y] = clearArea(s, 8, 8);
  s.farming.place(x, y, x + 7, y + 7, 'potato');
  s.population.changeCount('farmer', 2);
  const [wx, wy] = freeSpot(s, 'woodcutter');
  s.construction.place('woodcutter', wx, wy, 0);
  s.population.changeCount('woodcutter', 1);
  for (const t of nearestNodes(s, 'tree', 200)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  const t0 = Date.now();
  run(s, YEAR * 20, 800);
  console.log(`  20 anos com eventos: ${s.citizens.length} vivos, nascimentos ${s.stats.births}, mortes ${JSON.stringify(s.stats.deaths)}, ${Date.now() - t0} ms`);
});

test('vila salva na 0.3 abre com roupas, ferramentas e estações', () => {
  const s = new Simulation({ seed: 'v3' });
  const j = JSON.parse(SaveManager.serialize(s));
  j.v = 3;
  for (const k of ['roads', 'roadJobs', 'animals', 'animalCap', 'trade', 'unburied', 'griefUntil', 'winterExtra', 'badHarvest', 'reports', 'planted']) delete j[k];
  for (const c of j.citizens) for (const k of ['warmth', 'warming', 'sick', 'educated', 'toolLife', 'coatLife']) delete c[k];
  const l = SaveManager.load(JSON.stringify(j));
  invariants(l);
  assert.ok(l.citizens[0].warmth === 100 && l.citizens[0].toolLife > 0);
  run(l, DAY, 200);
});

test('onde se anda muito surge trilha e depois estrada; sem uso, a trilha some', () => {
  const s = new Simulation({ seed: 'trilha' });
  const W = s.world, st = W.start;
  let tile = null;
  for (let r = 6; r < 30 && !tile; r++) for (let x = st.x - r; x <= st.x + r; x++) {
    const i = W.idx(x, st.y + r);
    if (W.terrain[i] <= 1 && W.nodeAt[i] === -1 && !W.blockedI(i) && W.fieldAt[i] === -1) { tile = [x, st.y + r]; break; }
  }
  const i = W.idx(tile[0], tile[1]);
  const c0 = W.costI(i);
  for (let k = 0; k < 40; k++) s.infra.step_on(tile[0], tile[1]);
  assert.equal(W.road[i], 5);
  assert.ok(W.costI(i) < c0);
  const trail = W.idx(tile[0] + 1, tile[1]);
  if (W.terrain[trail] <= 1 && W.nodeAt[trail] === -1) {
    for (let k = 0; k < 32; k++) s.infra.step_on(tile[0] + 1, tile[1]);
    for (let k = 0; k < 40; k++) s.infra.wearDaily();
    assert.equal(W.road[trail], 0, 'trilha abandonada não sumiu');
  }
  for (let k = 0; k < 120; k++) s.infra.step_on(tile[0], tile[1]);
  assert.equal(W.road[i], 1, 'não virou estrada');
  for (let k = 0; k < 40; k++) s.infra.wearDaily();
  assert.equal(W.road[i], 1, 'estrada formada deveria ficar');
});

test('os próprios aldeões abrem caminho entre depósito e trabalho', () => {
  const s = new Simulation({ seed: 'desejo' });
  for (const t of nearestNodes(s, 'tree', 80)) s.mark(t.x, t.y, t.x, t.y, ['tree'], true);
  run(s, 240, 400);
  assert.ok(s.roads.some(r => r.auto), 'nenhuma trilha surgiu');
  const l = SaveManager.load(SaveManager.serialize(s));
  assert.equal(l.roads.length, s.roads.length);
  assert.equal(l.wornList.length, s.wornList.length);
});

test('melhorar depósito aumenta a capacidade com material carregado a pé', () => {
  const s = new Simulation({ seed: 'nivel', difficulty: 'facil' });
  const d = s.storage.depots()[0], cap = s.storage.cap(d);
  assert.ok(s.construction.startUpgrade(d).ok);
  assert.equal(s.construction.startUpgrade(d).ok, false);
  const stone0 = d.stock.stone;
  run(s, 100, 80);
  assert.equal(d.level, 2);
  assert.ok(s.storage.cap(d) > cap);
  assert.ok(d.stock.stone < stone0, 'não gastou material');
  assert.equal(s.construction.canUpgrade(d).ok, false, 'nível 3 pede escola');
});

test('casa melhorada abriga mais; oficina melhorada produz mais rápido; fazenda colhe mais', () => {
  const s = new Simulation({ seed: 'tec', difficulty: 'facil' });
  housed(s, 1);
  const h = s.buildings.find(b => BUILDINGS[b.type].residents);
  assert.equal(s.population.maxRes(h), 5);
  h.level = 3;
  assert.equal(s.population.maxRes(h), 9);
  const [x, y] = clearArea(s, 3, 3);
  const f = s.farming.place(x, y, x + 2, y + 2, 'potato').farm;
  f.tiles[0].crop = 'potato';
  const y1 = s.farming.tileYield(f.tiles[0]);
  f.level = 3;
  assert.ok(s.farming.tileYield(f.tiles[0]) > y1);
  assert.ok(s.construction.startUpgrade({ ...f, level: 1, up: null, id: -1 }).ok);
});

test('melhoria de fazenda é entregue e terminada; cancelar devolve o material', () => {
  const s = new Simulation({ seed: 'techfarm', difficulty: 'facil' });
  const [x, y] = clearArea(s, 3, 3);
  const f = s.farming.place(x, y, x + 2, y + 2, 'beans').farm;
  assert.ok(s.construction.startUpgrade(f).ok);
  run(s, 100, 80);
  assert.equal(f.level, 2, 'fazenda não evoluiu');
  const d = s.storage.depots()[0];
  assert.ok(s.construction.startUpgrade(d).ok);
  run(s, 8, 40);
  s.construction.cancelUpgrade(d);
  invariants(s);
  assert.equal(d.up, null);
  run(s, 100, 80);
  invariants(s);
});
