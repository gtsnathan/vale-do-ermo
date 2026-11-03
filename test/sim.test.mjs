import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/Simulation.js';
import { SaveManager } from '../src/sim/SaveManager.js';
import { BUILDINGS, RES, STEP, T } from '../src/sim/defs.js';

function invariants(s) {
  const W = s.world;
  for (const r of RES) {
    let carried = 0, inSites = 0, inDepots = 0;
    for (const c of s.citizens) if (c.inv.res === r) carried += c.inv.amount;
    for (const b of s.buildings) {
      if (!b.done) { inSites += b.delivered[r]; assert.ok(b.enroute[r] >= 0, 'enroute negativo'); }
      if (b.done && b.type === 'depot') {
        inDepots += b.stock[r];
        assert.ok(b.stock[r] >= 0, 'estoque negativo');
        assert.ok(b.reserved[r] >= 0, 'reserva negativa');
        assert.ok(b.reserved[r] <= b.stock[r], 'reservou mais do que existe');
      }
    }
    const ground = s.resources.groundTotal(r);
    assert.equal(inDepots + ground + carried + inSites + s.stats.consumed[r], s.startStock[r] + s.stats.produced[r], `conservação de ${r}`);
  }
  for (const b of s.buildings) if (b.done && b.type === 'depot') {
    assert.ok(b.incoming >= 0, 'incoming negativo');
    assert.ok(s.storage.used(b) + b.incoming <= BUILDINGS.depot.capacity, 'capacidade excedida');
  }
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
  d.stock.stone = BUILDINGS.depot.capacity - d.stock.wood - 3;
  s.startStock.stone = d.stock.stone;
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
  assert.equal(s.buildings.filter(b => b.done).length, 7, JSON.stringify(s.buildings.filter(b => !b.done).map(b => [b.delivered, b.work])));
  assert.equal(s.population.homeless(), 0);
  console.log(`  1500 s de jogo simulados em ${Date.now() - t0} ms`);
});
