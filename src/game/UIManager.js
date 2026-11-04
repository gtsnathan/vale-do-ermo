import { iconDataURL } from '../art/sprites.js';
import { BUILDINGS, CROPS, DAY, DIFFICULTY, FARM_MAX, FIELD_CROPS, FOODS, LEVEL_MAX, MAP_SIZES, MATERIALS, NODE, ORCHARD_CROPS, PROFESSIONS, PROF_NOTE, RES, RES_LABEL, TOP_RES, VALUE } from '../sim/defs.js';

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
    game.events.on('farmPlaced', r => this.toast(r.ok ? 'Área criada. Defina os trabalhadores em Gestão.' : r.reason));
    game.events.on('news', e => { if (e.kind !== 'family' && e.kind !== 'sick') this.toast(e.text); });
    game.events.on('roadPlaced', ({ n }) => this.toast(n ? `${n} tiles encomendados.` : 'Nada a construir neste trecho.'));
    game.events.on('toggle-pause', () => this.setSpeed(this.scene.speed === 0 ? (this.prevSpeed || 1) : 0));
    game.events.on('speed', s => this.setSpeed(s));
    this.tickT = 0;
  }
  attach(scene) { this.scene = scene; this._syncTool(); this.setSpeed(scene.speed); }

  _topbar() {
    $('#res').innerHTML = TOP_RES.map(r => `<div class="stat" title="${RES_LABEL[r]} nos depósitos">${icon(r)}<b id="r-${r}">0</b></div>`).join('') +
      `<div class="stat" title="Espaço usado nos depósitos"><span class="lbl">Depósitos</span><b id="r-cap">0/0</b></div>
      <div class="stat" title="Comida guardada, somando celeiros e casas">${icon('food')}<b id="r-food">0</b></div>`;
    $('#vil').innerHTML = `<div class="stat" title="População">${icon('pop')}<b id="v-pop">10</b></div>
      <div class="stat" title="Pessoas com casa">${icon('roof')}<b id="v-home">0/5</b></div>`;
    $('#speed').innerHTML = [[0, 'Pausar', '❚❚'], [1, 'Velocidade normal', '1×'], [2, 'Velocidade dupla', '2×'], [5, 'Velocidade rápida', '5×'], [10, 'Velocidade máxima', '10×']]
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
    const ICON = { house: 'house', stonehouse: 'house', depot: 'depot', barn: 'barn', market: 'depot', gatherer: 'gatherer', fisher: 'food', hunter: 'food', woodcutter: 'firewood', forester: 'axe', smith: 'pick', tailor: 'people', quarry: 'pick', mine: 'pick', school: 'manage', hospital: 'manage', townhall: 'manage', chapel: 'manage', trading: 'depot', cemetery: 'manage', well: 'erase', herbalist: 'gatherer' };
    const cats = ['Moradia', 'Armazém', 'Alimento', 'Indústria', 'Serviços'];
    const btn = (ic, id, label, cost) => `<button class="dr" id="t-${id}">${icon(ic)}<span><b>${label}</b><em>${cost}</em></span></button>`;
    const extra = { Alimento: [['farm', 'farm', 'Fazenda', 'Só trabalho'], ['farm', 'orchard', 'Pomar', 'Só trabalho'], ['people', 'pasture', 'Pastagem', 'Só trabalho']] };
    let html = '';
    for (const cat of cats) {
      html += `<h4>${cat}</h4><div class="dg">`;
      for (const t in BUILDINGS) if (BUILDINGS[t].cat === cat) html += btn(ICON[t] || 'build', t, BUILDINGS[t].name, costOf(t));
      for (const e of extra[cat] || []) html += btn(...e);
      html += '</div>';
    }
    html += `<h4>Caminhos</h4><div class="dg">${btn('road', 'road1', 'Estrada de terra', 'Mais rápida')}${btn('road', 'road2', 'Estrada de pedra', '1 pedra por tile')}${btn('road', 'road3', 'Ponte', '1 madeira por tile')}${btn('road', 'road4', 'Túnel', '1 pedra por tile')}</div>`;
    $('#drawer').innerHTML = html;
    $('#drawer').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.id.slice(2);
      $('#drawer').hidden = true;
      if (id.startsWith('road')) {
        const k = +id[4];
        this.scene.setTool({ kind: 'road', k, label: `Arraste para traçar ${{ 1: 'a estrada', 2: 'a estrada de pedra', 3: 'a ponte sobre a água', 4: 'o túnel na montanha' }[k]}. Limpar remove estradas.` });
      } else if (id === 'farm' || id === 'orchard' || id === 'pasture') this.scene.setTool({ kind: 'field', farmKind: id, label: `Arraste para desenhar: ${{ farm: 'fazenda', orchard: 'pomar', pasture: 'pastagem' }[id]}, de 3×3 a ${FARM_MAX}×${FARM_MAX}.` });
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
    const active = t.kind === 'select' ? 'select' : t.kind === 'place' || t.kind === 'field' || t.kind === 'road' ? 'build' : t.kind === 'mark' ? (!t.value ? 'unmark' : t.types.includes('tree') ? 'trees' : 'rocks') : '';
    document.querySelectorAll('.tool').forEach(b => { if (b.id !== 't-people' && b.id !== 't-manage') b.classList.toggle('on', b.id === `t-${active}`); });
    const hint = $('#hint');
    hint.hidden = t.kind === 'select';
    if (t.kind === 'mark' || t.kind === 'field' || t.kind === 'road') {
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
      this.actions.newGame({ size: $('#m-size').value, difficulty: $('#m-diff').value, seed: $('#m-seed').value.trim() || 'ermo', disease: true, events: $('#m-dis').checked });
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
    $('#m-end').hidden = !this.endText; $('#m-end').textContent = this.endText || '';
    $('#m-back').hidden = !this.actions.inGame();
  }
  hideMenu() { this.endText = null; $('#menu').hidden = true; $('#hud').classList.remove('dim'); }
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
      if (b.dataset.act === 'up' || b.dataset.act === 'upx') {
        const t = s?.type === 'farm' ? S.sim.farming.get(s.id) : S.sim.building(s?.id);
        if (t) {
          if (b.dataset.act === 'upx') S.sim.construction.cancelUpgrade(t);
          else { const r = S.sim.construction.startUpgrade(t); this.toast(r.ok ? 'Melhoria encomendada. Os aldeões vão trazer o material.' : r.reason); }
        }
        this.lastHTML.inspectBody = null;
        return;
      }
      if (s?.type === 'building' && ['slots', 'exp', 'buy', 'lim'].includes(b.dataset.act)) {
        const t = S.sim.building(s.id);
        if (!t) return;
        if (b.dataset.act === 'slots') t.maxWorkers = Math.max(0, Math.min(BUILDINGS[t.type].workers, (t.maxWorkers ?? BUILDINGS[t.type].workers) + +b.dataset.d));
        if (b.dataset.act === 'exp') t.exportRes = t.exportRes === b.dataset.r ? null : b.dataset.r;
        if (b.dataset.act === 'buy') { const r = S.sim.work.buy(t, b.dataset.r, 5); this.toast(r.ok ? 'Compra feita. A mercadoria está no cais.' : r.reason); }
        this.lastHTML.inspectBody = null;
        return;
      }
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
    for (const r of TOP_RES) $(`#r-${r}`).textContent = sim.storage.total(r);
    $('#r-food').textContent = sim.foodTotal();
    $('#r-cap').textContent = `${sim.storage.usedTotal()}/${sim.storage.capacity()}`;
    $('#v-pop').textContent = sim.citizens.length;
    $('#v-home').textContent = `${sim.citizens.filter(c => c.home != null).length}/${sim.citizens.length}`;
    if (!sim.citizens.length && this.actions.inGame()) { this.actions.ended(sim); return; }
    const temp = Math.round(sim.season.temp());
    const f = sim.dayFrac(), h = Math.floor(f * 24), m = Math.floor((f * 24 - h) * 6) * 10;
    $('#clock').innerHTML = `<b>Ano ${sim.year()} · Dia ${sim.dayOfYear()}</b><span>${sim.season.name()} · ${temp}°C · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</span>`;
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
      ['Crie uma fazenda e defina um agricultor em Gestão', sim.farms.length > 0 && sim.population.count('farmer') > 0],
      ['Dê uma casa a cada uma das 5 famílias', housed >= 5],
      ['Veja nascer a primeira criança da vila', sim.stats.births > 0],
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
      body = row('Agora', esc(sim.jobs.describe(c))) + row('Profissão', PROFESSIONS[c.profession] || (c.profession === 'student' ? 'Estudante' : 'Criança')) + row('Idade', `${Math.floor(c.age)} anos`) + row('Sexo', c.sex === 'M' ? 'Masculino' : 'Feminino') +
        row('Família', esc(c.family)) + row('Cônjuge', person(c.spouse)) +
        (c.parents?.some(id => sim.citizen(id)) ? row('Pais', c.parents.filter(id => sim.citizen(id)).map(person).join(', ')) : '') +
        (sim.population.children(c).length ? row('Filhos', sim.population.children(c).map(k => person(k.id)).join(', ')) : '') +
        (c.pregnant > 0 ? row('Gravidez', `nasce em ${Math.max(1, Math.ceil(c.pregnant / DAY))} dias`) : '') + row('Casa', home ? (home.done ? 'Casa da família' : 'Em obra') : 'Sem casa') +
        row('Carregando', c.inv.res ? `${c.inv.amount} ${RES_LABEL[c.inv.res].toLowerCase()}` : 'Nada') +
        (c.lastMeal ? row('Última refeição', RES_LABEL[c.lastMeal]) : '') +
        `<div class="bar health"><label>Saúde <em>${Math.round(c.health)}%</em></label><div><i style="width:${c.health}%"></i></div></div>` +
        `<div class="bar warm"><label>Calor <em>${Math.round(c.warmth)}%</em></label><div><i style="width:${c.warmth}%"></i></div></div>` +
        row('Ânimo', `${Math.round(c.happiness)}%`) + row('Ferramenta', c.toolLife > 0 ? 'Em uso' : 'Sem') + row('Roupa', c.coatLife > 0 ? 'Em uso' : 'Sem') +
        (c.educated ? row('Estudo', 'Formado') : '') + (c.sick > 0 ? row('Estado', 'Doente') : '') +
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
        const used = sim.storage.used(b), cap = sim.storage.cap(b);
        const shown = RES.filter(r => b.stock[r] > 0);
        body = `<div class="bar"><label>Ocupação <em>${used}/${cap}</em></label><div><i style="width:${(used / cap) * 100}%"></i></div></div>` +
          (shown.length ? shown.map(r => row(RES_LABEL[r], b.stock[r])).join('') : '<p class="note">Vazio.</p>');
        if (def.prof) body += this._staffRows(sim, b, def, person);
        if (b.type === 'trading') {
          const boat = sim.trade.boat;
          body += `<h5>Levar ao posto</h5><div class="crops">${['wood', 'firewood', 'stone', 'iron', 'tools', 'coat', 'potato', 'hide', 'fish'].map(r => `<button class="crop ${b.exportRes === r ? 'on' : ''}" data-act="exp" data-r="${r}">${RES_LABEL[r]}</button>`).join('')}</div>` +
            row('Valor no posto', sim.work.postValue(b)) +
            (boat ? `<h5>Barco no porto</h5>${boat.offers.map(o => `<div class="row"><span>${RES_LABEL[o.res]} · resta ${o.qty}</span><button class="btn" data-act="buy" data-r="${o.res}">Comprar 5 (${VALUE[o.res] * 5})</button></div>`).join('')}` : '<p class="note">Nenhum barco no momento.</p>');
        }
      } else if (!def.residents) {
        body = def.prof ? this._staffRows(sim, b, def, person) : '';
        if (b.type === 'gatherer' || b.type === 'herbalist') {
          const trees = sim.farming.forestAround(b);
          body += row('Mata em volta', trees > 60 ? 'Farta' : trees > 15 ? 'Razoável' : trees > 0 ? 'Pouca' : 'Nenhuma');
        }
        if (def.recipe) {
          const R = def.recipe, inp = Object.keys(R.in).map(r => `${R.in[r]} ${RES_LABEL[r].toLowerCase()}`).join(' + ') || 'nada';
          body += row('Receita', `${inp} → ${R.n} ${RES_LABEL[R.out].toLowerCase()}`) + Object.keys(R.in).map(r => row(`Na oficina: ${RES_LABEL[r]}`, b.input?.[r] || 0)).join('');
        }
        if (b.type === 'school') body += row('Alunos', sim.citizens.filter(c => c.profession === 'student').length);
        if (b.type === 'hospital') body += row('Ervas', b.input?.herbs || 0) + row('Doentes', sim.citizens.filter(c => c.sick > 0).length);
        if (b.type === 'cemetery') body += row('Sepulturas', `${b.graves}/${def.graves * (b.level || 1)}`);
      } else {
        const pan = Object.entries(b.pantry || {}).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${RES_LABEL[r].toLowerCase()}`).join(', ') || 'Vazia';
        body = row('Despensa', pan) + row('Moradores', `${b.residents.length}/${sim.population.maxRes(b)}`) + (b.residents.length ? b.residents.map(person).map(x => `<div class="row">${x}</div>`).join('') : '<p class="note">Vazia até haver uma família sem casa.</p>');
      }
      body += `<p class="note">${def.about}</p>`;
      if (b.done) body += this._upgrade(sim, b, row);
      const label = b.done ? 'Demolir' : 'Cancelar obra';
      body += b.confirm
        ? `<div class="acts"><button class="btn warn" data-act="remove">Confirmar: ${label.toLowerCase()}</button><button class="btn" data-act="keep">Manter</button></div>`
        : `<div class="acts"><button class="btn" data-act="remove">${label}</button></div>`;
    } else if (s.type === 'farm') {
      const f = sim.farming.get(s.id); if (!f) { S.selected = null; return; }
      title = `${{ farm: 'Fazenda', orchard: 'Pomar', pasture: 'Pastagem' }[f.kind]} ${f.w}×${f.h}`;
      const cnt = [0, 0, 0, 0]; for (const t of f.tiles) cnt[t.st]++;
      const staff = sim.citizens.filter(c => c.workplace === f.id);
      const fert = Math.round(sim.farming.fertility(f) * 100);
      body = `<div class="crops">${(f.kind === 'pasture' ? [] : f.kind === 'orchard' ? ORCHARD_CROPS : FIELD_CROPS).map(k => `<button class="crop ${f.crop === k ? 'on' : ''}" data-act="crop" data-crop="${k}">${RES_LABEL[k]}</button>`).join('')}</div>` +
        (f.kind === 'pasture' ? row('Rebanho', `${f.herd} ovelhas`) + row('Lã pronta', Math.floor(f.wool)) :
        `<p class="note">${RES_LABEL[f.crop]}: colhe em ${CROPS[f.crop].grow / DAY} dias, rende ${CROPS[f.crop].yield} por tile. Parado no inverno.</p>` +
        row('Solo fértil', `${fert}%`) + row('Sem preparo', cnt[0]) + row('Prontos para plantar', cnt[1]) + row('Crescendo', cnt[2]) + row('Prontos para colher', cnt[3])) +
        `<div class="row"><span>Agricultores</span><b class="step"><button data-act="wk" data-d="-1" aria-label="Menos vagas">−</button>${staff.length}/${f.maxWorkers}<button data-act="wk" data-d="1" aria-label="Mais vagas">+</button></b></div>` +
        (staff.length < f.maxWorkers ? '<p class="note warn">Faltam agricultores. Abra Gestão para definir mais.</p>' : '') +
        this._upgrade(sim, f, row) +
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
  _staffRows(sim, b, def, person) {
    const staff = sim.citizens.filter(c => c.workplace === b.id);
    const max = (b.maxWorkers ?? def.workers) + ((b.level || 1) - 1);
    return `<div class="row"><span>${PROFESSIONS[def.prof]}</span><b class="step"><button data-act="slots" data-d="-1" aria-label="Menos vagas">−</button>${staff.length}/${max}<button data-act="slots" data-d="1" aria-label="Mais vagas">+</button></b></div>` +
      (staff.length < max ? '<p class="note warn">Faltam trabalhadores. Abra Gestão.</p>' : '');
  }
  _upgrade(sim, b, row) {
    const C = sim.construction, lv = b.level || 1;
    let h = `<h5>Tecnologia · nível ${lv}/${LEVEL_MAX}</h5>` + row('Atual', C.techName(b));
    if (b.up) {
      const bars = Object.entries(b.up.cost).map(([r, n]) => `<div class="bar"><label>${RES_LABEL[r]} <em>${b.up.delivered[r]}/${n}</em></label><div><i style="width:${(b.up.delivered[r] / n) * 100}%"></i></div></div>`).join('');
      const p = C.progress(b);
      return `${h}${bars}<div class="bar work"><label>Melhoria <em>${Math.round(p * 100)}%</em></label><div><i style="width:${p * 100}%"></i></div></div><div class="acts"><button class="btn" data-act="upx">Cancelar melhoria</button></div>`;
    }
    if (lv >= LEVEL_MAX) return h;
    const cost = Object.entries(C.upgradeCost(b)).map(([r, n]) => `${n} ${RES_LABEL[r].toLowerCase()}`).join(', ');
    const v = C.canUpgrade(b);
    h += `<p class="note">Próximo: ${C.techName(b, lv + 1)}. Custa ${cost}.${v.ok ? '' : ` ${v.reason}`}</p><div class="acts"><button class="btn go" data-act="up" ${v.ok ? '' : 'disabled'}>Melhorar</button></div>`;
    return h;
  }
  _manage(sim) {
    const P = sim.population;
    const rows = Object.entries(PROFESSIONS).map(([k, l]) => {
      const n = P.count(k);
      if (n === 0 && !['laborer', 'builder'].includes(k) && !sim.farming.places(k).length) return '';
      const note = PROF_NOTE[k];
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
    const kids = sim.citizens.filter(c => P.isChild(c)).length, elders = sim.citizens.filter(c => c.age >= 55).length;
    const dead = Object.values(sim.stats.deaths).reduce((a, b) => a + b, 0);
    const H = sim.history, maxN = Math.max(10, ...H.map(h => h.n));
    const pts = H.map((h, i) => `${H.length > 1 ? (i / (H.length - 1)) * 280 : 0},${44 - (h.n / maxN) * 40}`).join(' ');
    const chart = H.length > 1 ? `<svg class="spark" viewBox="0 0 280 46" role="img" aria-label="População ao longo do tempo"><polyline points="${pts}"/></svg><div class="row sm"><span>Dia ${H[0].d}</span><span>máx. ${maxN}</span><span>Dia ${H[H.length - 1].d}</span></div>` : '';
    const log = sim.chronicle.slice(-10).reverse().map(e => `<li class="${e.kind}"><span>A${e.year} D${e.day}</span>${esc(e.text)}</li>`).join('') || '<li>Nada a registrar ainda.</li>';
    const html = `<h3>População</h3>
      <div class="row"><span>Crianças</span><b>${kids}</b></div>
      <div class="row"><span>Adultos</span><b>${sim.citizens.length - kids - elders}</b></div>
      <div class="row"><span>Idosos (55+)</span><b>${elders}</b></div>
      <div class="row"><span>Nascimentos / mortes</span><b>${sim.stats.births} / ${dead}</b></div>
      ${chart}
      <h3>Profissões</h3>${rows}
      <h3>Estoques</h3>
      <div class="row"><span>Depósitos</span><b>${capM}</b></div>
      <div class="row"><span>Celeiros</span><b>${capF}</b></div>
      <div class="row"><span>Comida dura cerca de</span><b>${days >= 99 ? '99+' : Math.floor(days)} dias</b></div>
      <div class="tw"><table><thead><tr><th>Recurso</th><th>Guardado</th><th>Casas</th><th>Chão</th></tr></thead><tbody>${RES.map(stockRow).join('')}</tbody></table></div>
      ${this._report(sim)}
      <h3>Crônica</h3><ul class="log">${log}</ul>`;
    this._set('manageBody', html, $('#manage .pb'));
  }
  _report(sim) {
    if (!sim.buildings.some(b => b.done && b.type === 'townhall')) return '<h3>Relatórios</h3><p class="note">Construa a Prefeitura para ver produção, consumo e gráficos.</p>';
    const R = sim.reports;
    if (R.length < 2) return '<h3>Relatórios</h3><p class="note">Os dados aparecem depois de alguns dias.</p>';
    const last = R[R.length - 1], base = R[Math.max(0, R.length - 7)];
    const rows = RES.map(r => {
      const p = last.p[r] - (base.p[r] || 0), c = last.c[r] - (base.c[r] || 0);
      return p || c ? `<tr><td>${RES_LABEL[r]}</td><td>${p || '–'}</td><td>${c || '–'}</td></tr>` : '';
    }).join('');
    const line = (key, col) => { const m = Math.max(10, ...R.map(x => x[key])); return `<polyline style="stroke:${col}" points="${R.map((x, i) => `${(i / (R.length - 1)) * 280},${44 - (x[key] / m) * 40}`).join(' ')}"/>`; };
    return `<h3>Relatórios</h3><svg class="spark" viewBox="0 0 280 46" role="img" aria-label="Estoque ao longo do tempo">${line('food', '#e2733a')}${line('wood', '#e0c078')}${line('firewood', '#8fb6c4')}</svg>
      <p class="note"><span style="color:#e2733a">comida</span> · <span style="color:#e0c078">madeira</span> · <span style="color:#8fb6c4">lenha</span></p>
      <div class="tw"><table><thead><tr><th>Último ano</th><th>Feito</th><th>Gasto</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  _people(sim) {
    const html = sim.citizens.map(c => `<button class="person" data-c="${c.id}"><img src="${this.look(c)}" alt=""><span><b>${esc(c.name)}</b><em>${Math.floor(c.age)} anos · ${PROFESSIONS[c.profession] || (c.profession === 'student' ? 'Estudante' : 'Criança')} · ${esc(sim.jobs.describe(c))}</em></span></button>`).join('');
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
