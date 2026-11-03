// Joga de verdade no navegador, usando só cliques e arrastos.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const OUT = process.env.OUT || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });
const phaser = fs.readFileSync('vendor/phaser.min.js');

async function open(ctxOpts) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-proxy-server'] });
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(`pageerror ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('phaser.min.js')) return r.fulfill({ body: phaser, contentType: 'text/javascript' });
    if (u.startsWith('file:')) return r.continue();
    return r.abort();
  });
  await page.goto('file://' + process.cwd() + '/dist/index.html');
  await page.waitForFunction(() => window.__ermo?.sim, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return { browser, page, errs };
}
const tileXY = (page, x, y) => page.evaluate(([x, y]) => {
  const s = __ermo.scene, c = s.cameras.main;
  c.preRender();
  const wx = (x - y) * 32, wy = (x + y) * 16;
  return [(wx - c.worldView.x) * c.zoom, (wy - c.worldView.y) * c.zoom];
}, [x, y]);

(async () => {
  const { browser, page, errs } = await open({ viewport: { width: 1280, height: 760 } });
  await page.screenshot({ path: `${OUT}/1-menu.png` });
  await page.fill('#m-seed', '4711');
  await page.click('#m-new');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/2-start.png` });

  const info = await page.evaluate(() => {
    const s = __ermo.sim, st = s.world.start;
    const trees = [...s.nodes.values()].filter(n => n.type === 'tree').sort((a, b) => Math.hypot(a.x - st.x, a.y - st.y) - Math.hypot(b.x - st.x, b.y - st.y)).slice(0, 12);
    let spot = null;
    for (let r = 3; r < 20 && !spot; r++) for (const [x, y] of [[st.x + r, st.y], [st.x - r, st.y], [st.x, st.y + r], [st.x, st.y - r]]) {
      if (s.construction.validate('house', x, y, 0).ok) { spot = [x, y]; break; }
    }
    const b = trees.reduce((a, t) => [Math.min(a[0], t.x), Math.min(a[1], t.y), Math.max(a[2], t.x), Math.max(a[3], t.y)], [1e9, 1e9, -1, -1]);
    return { st, b, spot, first: trees[0] };
  });
  console.log('info', JSON.stringify(info));
  // Centraliza a mata e marca arrastando.
  await page.evaluate(({ first }) => __ermo.scene.camMgr.centerTile(first.x, first.y), info);
  await page.waitForTimeout(200);
  await page.click('#t-trees');
  const a = await tileXY(page, info.first.x - 4 + 0.5, info.first.y - 4 + 0.5), b = await tileXY(page, info.first.x + 4 + 0.5, info.first.y + 4 + 0.5);
  await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 4 }); await page.mouse.move(b[0], b[1], { steps: 4 });
  await page.screenshot({ path: `${OUT}/3-marking.png` });
  await page.mouse.up();
  const marked = await page.evaluate(() => __ermo.sim.markedNodes.size);
  console.log('marcadas por arrasto:', marked);
  if (!marked) throw new Error('arrasto não marcou árvores');
  await page.click('#t-select');

  // Ordena a casa pelo menu e clique.
  await page.evaluate(({ spot }) => __ermo.scene.camMgr.centerTile(spot[0], spot[1]), info);
  await page.waitForTimeout(200);
  await page.click('#t-house');
  const h = await tileXY(page, info.spot[0] + 1, info.spot[1] + 1);
  await page.mouse.move(h[0] - 2, h[1]); await page.mouse.move(h[0], h[1]);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/4-ghost.png` });
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(200);
  const house = await page.evaluate(() => __ermo.sim.buildings.filter(b => b.type === 'house').map(b => ({ id: b.id, x: b.x, y: b.y })));
  console.log('casas:', JSON.stringify(house));
  if (house.length !== 1) throw new Error('clique não criou a casa');

  // Acelera em 5× e acompanha o estado real em cada fase.
  await page.click('.sp[data-s="5"]');
  const wait = (fn, label, ms = 150000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => console.log('✓', label));
  await wait(() => { const b = __ermo.sim.buildings.find(b => b.type === 'house'); return b.delivered.wood >= 4; }, 'madeira chegando ao canteiro');
  await page.click('.sp[data-s="1"]'); await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/5-delivery.png` });
  await page.click('.sp[data-s="5"]');
  await wait(() => { const b = __ermo.sim.buildings.find(b => b.type === 'house'); return b.work > 0; }, 'obra iniciada com materiais completos');
  await wait(() => { const b = __ermo.sim.buildings.find(b => b.type === 'house'); return b.work / 40 > 0.5; }, 'obra na metade');
  await page.click('.sp[data-s="1"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/6-building.png` });
  await page.click('.sp[data-s="5"]');
  await wait(() => __ermo.sim.buildings.find(b => b.type === 'house').done, 'casa concluída');
  await page.click('.sp[data-s="1"]'); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/7-done.png` });
  await page.click('.sp[data-s="5"]');
  await wait(() => __ermo.sim.stats.produced.wood > 0, 'árvore cortada');
  await wait(() => __ermo.sim.stats.produced.wood >= 9 && __ermo.sim.piles.length === 0, 'madeira transportada ao depósito');
  await wait(() => __ermo.sim.isNight(), 'anoiteceu');
  await page.waitForFunction(() => { const s = __ermo.sim; const b = s.buildings.find(b => b.type === 'house'); return b.residents.every(id => s.citizen(id).inside); }, null, { timeout: 60000 });
  await page.click('.sp[data-s="1"]');
  await page.evaluate(() => { const b = __ermo.sim.buildings.find(b => b.type === 'house'); __ermo.scene.camMgr.centerTile(b.x + 1, b.y + 1); __ermo.scene.cameras.main.setZoom(2); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/8-night.png` });
  // Clique no aldeão/edifício abre painel.
  await page.evaluate(() => { const b = __ermo.sim.buildings.find(b => b.type === 'house'); __ermo.scene.selected = { type: 'building', id: b.id }; });
  await page.click('#t-people');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/9-panels.png` });
  // Salvar e recarregar.
  await page.click('#btn-save');
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => ({ b: __ermo.sim.buildings.length, n: __ermo.sim.nodes.size }));
  await page.reload();
  await page.waitForFunction(() => window.__ermo?.sim, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.click('#m-go');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ b: __ermo.sim.buildings.length, n: __ermo.sim.nodes.size }));
  console.log('save', JSON.stringify(before), JSON.stringify(after));
  if (after.b !== before.b || Math.abs(after.n - before.n) > 2) throw new Error('save falhou');
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) r(n / 2); else requestAnimationFrame(f); }; f(); }));
  console.log('fps (software, sem GPU):', fps, 'renderer', await page.evaluate(() => __ermo.game.renderer.type === 2 ? 'WebGL' : 'Canvas'), 'atlas', await page.evaluate(() => __ermo.scene.atlasUsed));
  console.log('erros:', errs.length ? errs : 'nenhum');
  await browser.close();

  // Celular: toque.
  const pw = require('/opt/npm-tools/node_modules/playwright');
  const m = await open({ ...pw.devices['Pixel 7'] });
  await m.page.screenshot({ path: `${OUT}/m1-menu.png` });
  await m.page.tap('#m-new');
  await m.page.waitForTimeout(800);
  await m.page.screenshot({ path: `${OUT}/m2-game.png` });
  await m.page.tap('#t-house');
  const spot = await m.page.evaluate(() => {
    const s = __ermo.sim, st = s.world.start;
    for (let r = 3; r < 20; r++) for (const [x, y] of [[st.x + r, st.y], [st.x - r, st.y], [st.x, st.y + r], [st.x, st.y - r]]) if (s.construction.validate('house', x, y, 0).ok) return [x, y];
  });
  await m.page.evaluate(([x, y]) => __ermo.scene.camMgr.centerTile(x, y), spot);
  await m.page.waitForTimeout(200);
  const t = await tileXY(m.page, spot[0] + 1, spot[1] + 1);
  await m.page.touchscreen.tap(t[0], t[1]);
  await m.page.waitForTimeout(300);
  await m.page.screenshot({ path: `${OUT}/m3-place.png` });
  await m.page.tap('#b-rot');
  await m.page.tap('#b-ok');
  await m.page.waitForTimeout(300);
  const mh = await m.page.evaluate(() => __ermo.sim.buildings.filter(b => b.type === 'house').length);
  console.log('celular: casa criada por toque:', mh);
  if (mh !== 1) throw new Error('toque não criou a casa');
  await m.page.screenshot({ path: `${OUT}/m4-site.png` });
  const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log('overflow horizontal:', overflow, 'erros celular:', m.errs.length ? m.errs : 'nenhum');
  await m.browser.close();
})().catch(e => { console.error('FALHOU', e); process.exit(1); });
