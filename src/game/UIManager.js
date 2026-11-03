import { iconDataURL } from '../art/sprites.js';
import { BUILDINGS, CROPS, DAY, DIFFICULTY, FARM_MAX, FOODS, MAP_SIZES, MATERIALS, NODE, PROFESSIONS, RES, RES_LABEL } from '../sim/defs.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const icon = n => `<img class="ic" src="${iconDataURL(n, document)}" alt="">`;

// Interface em DOM sobre o canvas. Painéis arrastam, fecham e não pausam o jogo.
export class UIManager {
  constructor(game, actions) {
    this.game = game; this.actions = actions;
    this.scene = null;
    this.lastHTML = {};
    this._topbar(); this._toolbar(); this._menu(); this._panels();
    game.events.on('frame', () => this.onFrame());
    game.events.on('tool', () => this._syncTool());
    game.events.on('placed', r => { if (!r.ok) this.toast(r.reason); else this.toast('Obra marcada. Os aldeões vão buscar o material.'); });
    game.events.on('marked', ({ n, value, types }) => {
      if (!value) return this.toast(n ? `${n} marcas removidas.` : 'Nenhuma marca nesta área.');
      const what = types.includes('tree') ? 'árvores' : 'rochas';
      this.toast(n ? `${n} ${what} marcadas para coleta.` : `Nenhuma ${what === 'árvores' ? 'árvore' : 'rocha'} nesta área.`);
    });
    game.events.on('farmPlaced', r => this.toast(r.ok ? 'Fazenda criada. Escolha o cultivo e defina agricultores em Gestão.' : r.reason));
    game.events.on('toggle-pause', () => this.setSpeed(this.scene.speed === 0 ? (this.prevSpeed || 1) : 0));
    game.events.on('speed', s => this.setSpeed(s));
    this.tickT = 0;
  }
  attach(scene) { this.scene = scene; this._syncTool(); this.setSpeed(scene.speed); }

  _topbar() {
    $('#res').innerHTML = MATERIALS.map(r => `<div class="stat" title="${RES_LABEL[r]} nos depósitos">${icon(r)}<b id="r-${r}">0</b></div>`).join('') +
      `<div class="stat" title="Espaço usado nos depósitos"><span class="lbl">Depósitos</span><b id="r-cap">0/0</b></div>
      <div class="stat" title="Comida guardada, somando celeiros e casas">${icon('food')}<b id="r-food">0</b></div>`;
    $('#vil').innerHTML = `<div class="stat" title="População">${icon('pop')}<b id="v-pop">10</b></div>
      <div class="stat" title="Famílias com casa">${icon('roof')}<b id="v-home">0/5</b></div>`;
    $('#speed').innerHTML = [[0, 'Pausar', '❚❚'], [1, 'Velocidade normal', '1×'], [2, 'Velocidade dupla', '2×'], [5, 'Velocidade máxima', '5×']]
      .map(([v, t, l]) => `<button class="sp" data-s="${v}" title="${t}" aria-label="${t}">${l}</button>`).join('');
    $('#speed').addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.setSpeed(+b.dataset.s); });
  }
  setSpeed(v) {
    if (!this.scene) return;
    if (this.scene.speed > 0) this.prevSpeed = this.scene.speed;
    this.scene.speed = v;
    document.querySelectorAll('.sp').forEach(b => b.classList.toggle('on', +b.dataset.s === v));
  }
  _toolbar() {
    const T = [
      ['select', 'select', 'Ver', 'Clique para ver detalhes. Arraste para mover o mapa.'],
      ['axe', 'trees', 'Cortar', 'Arraste sobre árvores para marcar o corte.'],
      ['pick', 'rocks', 'Minerar', 'Arraste sobre pedra e ferro para marcar a coleta.'],
      ['erase', 'unmark', 'Limpar', 'Arraste para remover marcas.'],
      ['build', 'build', 'Construir', 'Casas, armazéns e produção de comida.'],
      ['manage', 'manage', 'Gestão', 'Profissões e estoques.'],
      ['people', 'people', 'Aldeões', 'Lista de habitantes.'],
    ];
    $('#tools').innerHTML = T.map(([ic, id, label, tip], i) => `${i === 4 || i === 5 ? '<span class="sep"></span>' : ''}<button class="tool" id="t-${id}" title="${tip}">${icon(ic)}<span>${label}</span></button>`).join('');
    $('#tools').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.id.slice(2), S = this.scene;
      if (id === 'build') { $('#drawer').hidden = !$('#drawer').hidden; return; }
      $('#drawer').hidden = true;
      if (id === 'manage') { this.togglePanel('manage'); return; }
      if (id === 'select') S.setTool({ kind: 'select' });
      if (id === 'trees') S.setTool({ kind: 'mark', types: ['tree'], value: true, label: 'Arraste sobre as árvores que serão cortadas' });
      if (id === 'rocks') S.setTool({ kind: 'mark', types: ['stone', 'iron'], value: true, label: 'Arraste sobre pedra e ferro para coletar' });
      if (id === 'unmark') S.setTool({ kind: 'mark', types: ['tree', 'stone', 'iron'], value: false, label: 'Arraste para remover marcas' });
      if (id === 'people') this.togglePanel('people');
    });
    const costOf = t => Object.entries(BUILDINGS[t].cost).map(([r, n]) => `${n} ${RES_LABEL[r].toLowerCase()}`).join(', ');
    const items = [['house', 'house', 'Casa de madeira', costOf('house')], ['depot', 'depot', 'Depósito', costOf('depot')], ['barn', 'barn', 'Celeiro', costOf('barn')], ['gatherer', 'gatherer', 'Cabana de coleta', costOf('gatherer')], ['farm', 'farm', 'Fazenda', 'Só trabalho, sem material']];
    $('#drawer').innerHTML = items.map(([ic, id, label, cost]) => `<button class="dr" id="t-${id}">${icon(ic)}<span><b>${label}</b><em>${cost}</em></span></button>`).join('');
    $('#drawer').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.id.slice(2);
      $('#drawer').hidden = true;
      if (id === 'farm') this.scene.setTool({ kind: 'field', label: `Arraste para desenhar a fazenda, de 3×3 a ${FARM_MAX}×${FARM_MAX}. Solo marrom rende mais.` });
      else this.scene.setTool({ kind: 'place', type: id, rot: 0, tile: null });
    });
    $('#b-rot').innerHTML = `${icon('rotate')}<span>Girar</span>`;
    $('#b-rot').addEventListener('click', () => this.scene.rotate());
    $('#b-ok').addEventListener('click', () => this.scene.confirmPlace());
    $('#b-x').addEventListener('click', () => this.scene.setTool({ kind: 'select' }));
  }
  _syncTool() {
    if (!this.scene) return;
    const t = this.scene.tool;
    const active = t.kind === 'select' ? 'select' : t.kind === 'place' || t.kind === 'field' ? 'build' : t.kind === 'mark' ? (!t.value ? 'unmark' : t.types.includes('tree') ? 'trees' : 'rocks') : '';
    document.querySelectorAll('.tool').forEach(b => { if (b.id !== 't-people' && b.id !== 't-manage') b.classList.toggle('on', b.id === `t-${active}`); });
    const hint = $('#hint');
    hint.hidden = t.kind === 'select';
    if (t.kind === 'mark' || t.kind === 'field') {
      $('#h-text').textContent = t.label;
      $('#b-rot').hidden = true; $('#b-ok').hidden = true;
    } else if (t.kind === 'place') {
      const def = BUILDINGS[t.type];
      const cost = Object.entries(def.cost).map(([r, n]) => `${n} ${RES_LABEL[r].toLowerCase()}`).join(', ');
      $('#h-text').textContent = `${def.name}: ${cost}. Quadrado claro é a entrada.`;
      $('#b-rot').hidden = false; $('#b-ok').hidden = false;
    }
  }
  _menu() {
    const sz = Object.keys(MAP_SIZES).map(k => `<option value="${k}" ${k === 'medio' ? 'selected' : ''}>${{ pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' }[k]} (${MAP_SIZES[k]}×${MAP_SIZES[k]})</option>`).join('');
    const df = Object.keys(DIFFICULTY).map(k => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${DIFFICULTY[k].label}</option>`).join('');
    $('#m-size').innerHTML = sz; $('#m-diff').innerHTML = df;
    $('#m-seed').value = String(Math.floor(Math.random() * 90000) + 10000);
    $('#m-new').addEventListener('click', () => {
      this.actions.newGame({ size: $('#m-size').value, difficulty: $('#m-diff').value, seed: $('#m-seed').value.trim() || 'ermo' });
      this.hideMenu();
    });
    $('#m-dice').addEventListener('click', () => { $('#m-seed').value = String(Math.floor(Math.random() * 90000) + 10000); this.actions.preview($('#m-seed').value, $('#m-size').value, $('#m-diff').value); });
    $('#m-seed').addEventListener('change', () => this.actions.preview($('#m-seed').value, $('#m-size').value, $('#m-diff').value));
    $('#m-size').addEventListener('change', () => this.actions.preview($('#m-seed').value, $('#m-size').value, $('#m-diff').value));
    $('#m-go').addEventListener('click', () => { if (this.actions.resume()) this.hideMenu(); });
    $('#btn-menu').addEventListener('click', () => { this.actions.save(); this.showMenu(); });
    $('#m-back').addEventListener('click', () => this.hideMenu());
    $('#btn-save').addEventListener('click', () => this.toast(this.actions.save() ? 'Vila salva neste navegador.' : 'Não foi possível salvar neste navegador.'));
  }
  showMenu() {
    $('#menu').hidden = false;
    $('#hud').classList.add('dim');
    $('#m-go').hidden = !this.actions.hasSave();
    $('#m-back').hidden = !this.actions.inGame();
  }
  hideMenu() { $('#menu').hidden = true; $('#hud').classList.remove('dim'); }
  _panels() {
    document.querySelectorAll('.panel').forEach(p => {
      const head = $('.ph', p);
      let d = null;
      head.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        const r = p.getBoundingClientRect();
        d = { x: e.clientX - r.left, y: e.clientY - r.top };
        head.setPointerCapture(e.pointerId);
      });
      head.addEventListener('pointermove', e => {
        if (!d) return;
        p.style.left = `${Math.max(0, Math.min(innerWidth - 80, e.clientX - d.x))}px`;
        p.style.top = `${Math.max(0, Math.min(innerHeight - 40, e.clientY - d.y))}px`;
        p.style.right = 'auto'; p.style.bottom = 'auto';
      });
      head.addEventListener('pointerup', () => { d = null; });
      $('.px', p).addEventListener('click', () => {
        p.hidden = true;
        if (p.id === 'inspect' && this.scene) this.scene.selected = null;
      });
    });
    $('#goals').addEventListener('click', () => $('#goals').classList.toggle('min'));
    $('#people .pb').addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const c = this.scene.sim.citizen(+b.dataset.c);
      this.scene.selected = { type: 'citizen', id: c.id };
      this.scene.camMgr.centerTile(c.x, c.y);
    });
    $('#manage .pb').addEventListener('click', e => {
      const b = e.target.closest('[data-prof]');
      if (!b) return;
      const n = this.scene.sim.population.changeCount(b.dataset.prof, +b.dataset.d);
      if (!n) this.toast(+b.dataset.d > 0 ? 'Não há trabalhadores gerais livres. Reduza outra profissão.' : 'Ninguém nesta profissão.');
      this.lastHTML.manageBody = null;
    });
    $('#inspect .pb').addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const S = this.scene, s = S.selected;
      if (s?.type === 'farm') {
        const f = S.sim.farming.get(s.id);
        if (!f) return;
        if (b.dataset.act === 'crop') f.crop = b.dataset.crop;
        if (b.dataset.act === 'wk') f.maxWorkers = Math.max(1, Math.min(4, f.maxWorkers + +b.dataset.d));
        if (b.dataset.act === 'farmdel') {
          if (f.confirm !== true) { f.confirm = true; this.lastHTML = {}; return; }
          S.sim.farming.remove(f); S.selected = null;
          this.toast('Fazenda removida. O que estava plantado se perdeu.');
        }
        if (b.dataset.act === 'farmkeep') f.confirm = false;
        this.lastHTML.inspectBody = null;
        return;
      }
      if (b.dataset.act === 'go') {
        const c = S.sim.citizen(+b.dataset.id);
        if (c) { S.selected = { type: 'citizen', id: c.id }; S.camMgr.centerTile(c.x, c.y); }
      } else if (b.dataset.act === 'remove' && s?.type === 'building') {
        const bd = S.sim.building(s.id);
        if (bd) {
          if (bd.confirm !== true) { bd.confirm = true; this.lastHTML = {}; return; }
          const wasDone = bd.done;
          S.sim.construction.remove(bd);
          S.selected = null;
          this.toast(wasDone ? 'Demolida. Metade dos materiais voltou ao chão.' : 'Obra cancelada. O material entregue voltou ao chão.');
        }
      } else if (b.dataset.act === 'keep' && s?.type === 'building') {
        const bd = S.sim.building(s.id); if (bd) { bd.confirm = false; this.lastHTML = {}; }
      } else if (b.dataset.act === 'mark' && s?.type === 'node') {
        const n = S.sim.nodes.get(s.id);
        if (n) S.sim.mark(n.x, n.y, n.x, n.y, [n.type], !n.marked);
      }
    });
  }
  togglePanel(id) { const p = $(`#${id}`); p.hidden = !p.hidden; this.lastHTML[id] = null; }
  toast(text) {
    const t = $('#toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.hidden = true; }, 3200);
  }
  _set(id, html, el = $(`#${id}`)) {
    if (this.lastHTML[id] === html) return;
    this.lastHTML[id] = html; el.innerHTML = html;
  }
  onFrame() {
    const S = this.scene; if (!S || !S.sim) return;
    this.tickT++;
    const sim = S.sim;
    // Pré-visualização: motivo aparece imediatamente.
    const t = S.tool;
    if (t.kind === 'place') {
      const v = S.placeCheck();
      const reason = t.tile && !v.ok ? v.reason : '';
      const el = $('#h-why');
      if (el.textContent !== reason) el.textContent = reason;
      $('#b-ok').disabled = !v.ok;
    } else if ($('#h-why').textContent) $('#h-why').textContent = '';
    if (this.tickT % 12) return;
    for (const r of MATERIALS) $(`#r-${r}`).textContent = sim.storage.total(r);
    $('#r-food').textContent = sim.foodTotal();
    $('#r-cap').textContent = `${sim.storage.usedTotal()}/${sim.storage.capacity()}`;
    $('#v-pop').textContent = sim.citizens.length;
    const fams = new Set(sim.citizens.map(c => c.family)), housed = new Set(sim.citizens.filter(c => c.home != null).map(c => c.family));
    $('#v-home').textContent = `${housed.size}/${fams.size}`;
    const f = sim.dayFrac(), h = Math.floor(f * 24), m = Math.floor((f * 24 - h) * 6) * 10;
    $('#clock').innerHTML = `<b>Dia ${sim.day()}</b><span>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${sim.isNight() ? ' · noite' : ''}</span>`;
    void DAY;
    this._alerts(sim);
    this._goals(sim);
    this._inspect(sim);
    const pp = $('#people');
    if (!pp.hidden) this._people(sim);
    if (!$('#manage').hidden) this._manage(sim);
  }
  _alerts(sim) {
    this._set('alerts', sim.alerts.map(a => `<div class="al ${a.level}">${esc(a.text)}</div>`).join(''));
  }
  _goals(sim) {
    const housed = new Set(sim.citizens.filter(c => c.home != null).map(c => c.family)).size;
    const G = [
      ['Marque árvores com a ferramenta Cortar', sim.stats.everMarked > 0],
      ['Ordene uma casa perto do depósito', (sim.stats.placed.house || 0) > 0],
      ['Espere o material chegar e a casa subir', (sim.stats.built.house || 0) > 0],
      ['Crie uma fazenda e defina um agricultor em Gestão', sim.farms.length > 0 && sim.population.count('farmer') > 0],
      ['Dê uma casa a cada uma das 5 famílias', housed >= 5],
    ];
    const done = G.every(g => g[1]);
    const html = done ? '' : `<div class="gt">Primeiros dias</div>${G.map(([l, ok]) => `<div class="g ${ok ? 'ok' : ''}"><i></i>${l}</div>`).join('')}`;
    this._set('goals', html);
    $('#goals').hidden = !html;
  }
  _inspect(sim) {
    const S = this.scene, s = S.selected, panel = $('#inspect');
    if (!s) { panel.hidden = true; this.lastHTML.inspectKey = null; return; }
    const k = `${s.type}${s.id}`;
    if (this.lastHTML.inspectKey !== k) { panel.hidden = false; this.lastHTML.inspectKey = k; }
    if (panel.hidden) return;
    let title = '', body = '';
    const row = (a, b) => `<div class="row"><span>${a}</span><b>${b}</b></div>`;
    const person = id => { const c = sim.citizen(id); return c ? `<button class="lnk" data-act="go" data-id="${c.id}">${esc(c.name)}</button>` : '—'; };
    if (s.type === 'citizen') {
      const c = sim.citizen(s.id); if (!c) { S.selected = null; return; }
      title = c.name;
      const home = c.home != null ? sim.building(c.home) : null;
      body = row('Agora', esc(sim.jobs.describe(c))) + row('Profissão', PROFESSIONS[c.profession]) + row('Idade', `${c.age} anos`) + row('Sexo', c.sex === 'M' ? 'Masculino' : 'Feminino') +
        row('Família', esc(c.family)) + row('Cônjuge', person(c.spouse)) + row('Casa', home ? (home.done ? 'Casa da família' : 'Em obra') : 'Sem casa') +
        row('Carregando', c.inv.res ? `${c.inv.amount} ${RES_LABEL[c.inv.res].toLowerCase()}` : 'Nada') +
        (c.lastMeal ? row('Última refeição', RES_LABEL[c.lastMeal]) : '') +
        `<div class="bar hunger"><label>Fome <em>${Math.round(c.hunger)}%</em></label><div><i style="width:${c.hunger}%"></i></div></div>`;
    } else if (s.type === 'building') {
      const b = sim.building(s.id); if (!b) { S.selected = null; return; }
      const def = BUILDINGS[b.type];
      title = def.name;
      if (!b.done) {
        const bars = Object.entries(def.cost).map(([r, n]) => {
          const got = b.delivered[r];
          return `<div class="bar"><label>${RES_LABEL[r]} <em>${got}/${n}</em></label><div><i style="width:${(got / n) * 100}%"></i></div></div>`;
        }).join('');
        const p = sim.construction.progress(b);
        const status = !sim.construction.materialsComplete(b) ? 'Esperando materiais' : b.builders.length ? `${b.builders.length} construindo` : 'Esperando construtores';
        body = row('Situação', status) + bars + `<div class="bar work"><label>Trabalho <em>${Math.round(p * 100)}%</em></label><div><i style="width:${p * 100}%"></i></div></div>`;
      } else if (def.stores) {
        const used = sim.storage.used(b);
        const list = def.stores === 'food' ? FOODS : MATERIALS;
        const shown = list.filter(r => def.stores === 'material' || b.stock[r] > 0);
        body = `<div class="bar"><label>Ocupação <em>${used}/${def.capacity}</em></label><div><i style="width:${(used / def.capacity) * 100}%"></i></div></div>` +
          (shown.length ? shown.map(r => row(RES_LABEL[r], b.stock[r])).join('') : '<p class="note">Vazio.</p>');
      } else if (b.type === 'gatherer') {
        const staff = sim.citizens.filter(c => c.workplace === b.id);
        const trees = sim.farming.forestAround(b);
        body = row('Coletores', `${staff.length}/${def.workers}`) + staff.map(c => `<div class="row">${person(c.id)}</div>`).join('') +
          row('Mata em volta', trees > 60 ? 'Farta' : trees > 15 ? 'Razoável' : trees > 0 ? 'Pouca' : 'Nenhuma');
      } else {
        const pan = Object.entries(b.pantry || {}).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${RES_LABEL[r].toLowerCase()}`).join(', ') || 'Vazia';
        body = row('Despensa', pan) + row('Moradores', `${b.residents.length}/${def.residents}`) + (b.residents.length ? b.residents.map(person).map(x => `<div class="row">${x}</div>`).join('') : '<p class="note">Vazia até haver uma família sem casa.</p>');
      }
      body += `<p class="note">${def.about}</p>`;
      const label = b.done ? 'Demolir' : 'Cancelar obra';
      body += b.confirm
        ? `<div class="acts"><button class="btn warn" data-act="remove">Confirmar: ${label.toLowerCase()}</button><button class="btn" data-act="keep">Manter</button></div>`
        : `<div class="acts"><button class="btn" data-act="remove">${label}</button></div>`;
    } else if (s.type === 'farm') {
      const f = sim.farming.get(s.id); if (!f) { S.selected = null; return; }
      title = `Fazenda ${f.w}×${f.h}`;
      const cnt = [0, 0, 0, 0]; for (const t of f.tiles) cnt[t.st]++;
      const staff = sim.citizens.filter(c => c.workplace === f.id);
      const fert = Math.round(sim.farming.fertility(f) * 100);
      body = `<div class="crops">${Object.keys(CROPS).map(k => `<button class="crop ${f.crop === k ? 'on' : ''}" data-act="crop" data-crop="${k}">${RES_LABEL[k]}</button>`).join('')}</div>` +
        `<p class="note">${RES_LABEL[f.crop]}: colhe em ${CROPS[f.crop].grow / DAY} dias, rende ${CROPS[f.crop].yield} por tile.</p>` +
        row('Solo fértil', `${fert}%`) + row('Sem preparo', cnt[0]) + row('Prontos para plantar', cnt[1]) + row('Crescendo', cnt[2]) + row('Prontos para colher', cnt[3]) +
        `<div class="row"><span>Agricultores</span><b class="step"><button data-act="wk" data-d="-1" aria-label="Menos vagas">−</button>${staff.length}/${f.maxWorkers}<button data-act="wk" data-d="1" aria-label="Mais vagas">+</button></b></div>` +
        (staff.length < f.maxWorkers ? '<p class="note warn">Faltam agricultores. Abra Gestão para definir mais.</p>' : '') +
        (f.confirm ? '<div class="acts"><button class="btn warn" data-act="farmdel">Confirmar remoção</button><button class="btn" data-act="farmkeep">Manter</button></div>' : '<div class="acts"><button class="btn" data-act="farmdel">Remover fazenda</button></div>');
    } else if (s.type === 'node') {
      const n = sim.nodes.get(s.id); if (!n) { S.selected = null; return; }
      const d = NODE[n.type];
      title = d.label;
      body = row('Rende', `${d.yield} ${RES_LABEL[d.res].toLowerCase()}`) + row('Situação', n.marked ? (n.reservedBy ? 'Em trabalho' : 'Marcado para coleta') : 'Intocado') +
        `<div class="acts"><button class="btn" data-act="mark">${n.marked ? 'Desmarcar' : 'Marcar para coleta'}</button></div>`;
    } else if (s.type === 'pile') {
      const p = sim.resources.pile(s.id); if (!p) { S.selected = null; return; }
      title = `${RES_LABEL[p.res]} no chão`;
      body = row('Quantidade', p.amount) + row('A caminho de buscar', p.reserved) + '<p class="note">Só conta no estoque depois de chegar a um depósito.</p>';
    }
    $('#inspect .pt').textContent = title;
    this._set('inspectBody', body, $('#inspect .pb'));
  }
  _manage(sim) {
    const P = sim.population;
    const rows = Object.entries(PROFESSIONS).map(([k, l]) => {
      const n = P.count(k);
      const note = k === 'laborer' ? 'Corta, minera e carrega' : k === 'builder' ? 'Só eles erguem obras' : k === 'farmer' ? 'Trabalham nas fazendas' : 'Trabalham nas cabanas de coleta';
      const ctl = k === 'laborer' ? `<b class="step solo">${n}</b>` : `<b class="step"><button data-prof="${k}" data-d="-1" aria-label="Menos ${l}">−</button>${n}<button data-prof="${k}" data-d="1" aria-label="Mais ${l}">+</button></b>`;
      return `<div class="prof"><span><b>${l}</b><em>${note}</em></span>${ctl}</div>`;
    }).join('');
    const stockRow = r => {
      const pantry = sim.buildings.reduce((a, b) => a + ((b.pantry && b.pantry[r]) || 0), 0);
      const ground = sim.resources.groundTotal(r), inStore = sim.storage.total(r);
      if (!inStore && !pantry && !ground) return '';
      return `<tr><td>${RES_LABEL[r]}</td><td>${inStore}</td><td>${pantry || '–'}</td><td>${ground || '–'}</td></tr>`;
    };
    const capM = `${sim.storage.usedTotal()}/${sim.storage.capacity()}`, capF = `${sim.storage.usedTotal('food')}/${sim.storage.capacity('food')}`;
    const days = sim.foodDays();
    const html = `<h3>Profissões</h3>${rows}
      <h3>Estoques</h3>
      <div class="row"><span>Depósitos</span><b>${capM}</b></div>
      <div class="row"><span>Celeiros</span><b>${capF}</b></div>
      <div class="row"><span>Comida dura cerca de</span><b>${days >= 99 ? '99+' : Math.floor(days)} dias</b></div>
      <div class="tw"><table><thead><tr><th>Recurso</th><th>Guardado</th><th>Casas</th><th>Chão</th></tr></thead><tbody>${RES.map(stockRow).join('')}</tbody></table></div>`;
    this._set('manageBody', html, $('#manage .pb'));
  }
  _people(sim) {
    const html = sim.citizens.map(c => `<button class="person" data-c="${c.id}"><img src="${this.look(c)}" alt=""><span><b>${esc(c.name)}</b><em>${PROFESSIONS[c.profession]} · ${esc(sim.jobs.describe(c))}</em></span></button>`).join('');
    this._set('peopleBody', html, $('#people .pb'));
  }
  look(c) {
    this.lookCache = this.lookCache || {};
    if (this.lookCache[c.look]) return this.lookCache[c.look];
    const S = this.scene, f = S.textures.getFrame('atlas', `c${c.look}_f_i`);
    const cv = document.createElement('canvas');
    cv.width = f.cutWidth * 2; cv.height = f.cutHeight * 2;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(S.textures.get('atlas').getSourceImage(), f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, cv.width, cv.height);
    return (this.lookCache[c.look] = cv.toDataURL());
  }
}
