import { iconDataURL } from '../art/sprites.js';
import { BUILDINGS, DAY, DIFFICULTY, MAP_SIZES, NODE, RES, RES_LABEL } from '../sim/defs.js';

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
    game.events.on('toggle-pause', () => this.setSpeed(this.scene.speed === 0 ? (this.prevSpeed || 1) : 0));
    game.events.on('speed', s => this.setSpeed(s));
    this.tickT = 0;
  }
  attach(scene) { this.scene = scene; this._syncTool(); this.setSpeed(scene.speed); }

  _topbar() {
    $('#res').innerHTML = RES.map(r => `<div class="stat" title="${RES_LABEL[r]} nos depósitos">${icon(r)}<b id="r-${r}">0</b></div>`).join('') +
      `<div class="stat" title="Espaço usado nos depósitos"><span class="lbl">Depósitos</span><b id="r-cap">0/0</b></div>`;
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
      ['house', 'house', 'Casa', `Casa de madeira: ${BUILDINGS.house.cost.wood} madeira, ${BUILDINGS.house.cost.stone} pedra.`],
      ['depot', 'depot', 'Depósito', `Depósito: ${BUILDINGS.depot.cost.wood} madeira. Guarda ${BUILDINGS.depot.capacity} unidades.`],
      ['people', 'people', 'Aldeões', 'Lista de habitantes.'],
    ];
    $('#tools').innerHTML = T.map(([ic, id, label, tip], i) => `${i === 4 || i === 6 ? '<span class="sep"></span>' : ''}<button class="tool" id="t-${id}" title="${tip}">${icon(ic)}<span>${label}</span></button>`).join('');
    $('#tools').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.id.slice(2), S = this.scene;
      if (id === 'select') S.setTool({ kind: 'select' });
      if (id === 'trees') S.setTool({ kind: 'mark', types: ['tree'], value: true, label: 'Arraste sobre as árvores que serão cortadas' });
      if (id === 'rocks') S.setTool({ kind: 'mark', types: ['stone', 'iron'], value: true, label: 'Arraste sobre pedra e ferro para coletar' });
      if (id === 'unmark') S.setTool({ kind: 'mark', types: ['tree', 'stone', 'iron'], value: false, label: 'Arraste para remover marcas' });
      if (id === 'house' || id === 'depot') S.setTool({ kind: 'place', type: id, rot: 0, tile: null });
      if (id === 'people') this.togglePanel('people');
    });
    $('#b-rot').innerHTML = `${icon('rotate')}<span>Girar</span>`;
    $('#b-rot').addEventListener('click', () => this.scene.rotate());
    $('#b-ok').addEventListener('click', () => this.scene.confirmPlace());
    $('#b-x').addEventListener('click', () => this.scene.setTool({ kind: 'select' }));
  }
  _syncTool() {
    if (!this.scene) return;
    const t = this.scene.tool;
    const active = t.kind === 'select' ? 'select' : t.kind === 'place' ? t.type : t.kind === 'mark' ? (!t.value ? 'unmark' : t.types.includes('tree') ? 'trees' : 'rocks') : '';
    document.querySelectorAll('.tool').forEach(b => { if (b.id !== 't-people') b.classList.toggle('on', b.id === `t-${active}`); });
    const hint = $('#hint');
    hint.hidden = t.kind === 'select';
    if (t.kind === 'mark') {
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
    $('#inspect .pb').addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const S = this.scene, s = S.selected;
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
    for (const r of RES) $(`#r-${r}`).textContent = sim.storage.total(r);
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
      body = row('Agora', esc(sim.jobs.describe(c))) + row('Profissão', c.profession) + row('Idade', `${c.age} anos`) + row('Sexo', c.sex === 'M' ? 'Masculino' : 'Feminino') +
        row('Família', esc(c.family)) + row('Cônjuge', person(c.spouse)) + row('Casa', home ? (home.done ? 'Casa da família' : 'Em obra') : 'Sem casa') +
        row('Carregando', c.inv.res ? `${c.inv.amount} ${RES_LABEL[c.inv.res].toLowerCase()}` : 'Nada');
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
      } else if (b.type === 'depot') {
        const used = sim.storage.used(b);
        body = `<div class="bar"><label>Ocupação <em>${used}/${def.capacity}</em></label><div><i style="width:${(used / def.capacity) * 100}%"></i></div></div>` +
          RES.map(r => row(RES_LABEL[r], b.stock[r])).join('');
      } else {
        body = row('Moradores', `${b.residents.length}/${def.residents}`) + (b.residents.length ? b.residents.map(person).map(x => `<div class="row">${x}</div>`).join('') : '<p class="note">Vazia até haver uma família sem casa.</p>');
      }
      body += `<p class="note">${def.about}</p>`;
      const label = b.done ? 'Demolir' : 'Cancelar obra';
      body += b.confirm
        ? `<div class="acts"><button class="btn warn" data-act="remove">Confirmar: ${label.toLowerCase()}</button><button class="btn" data-act="keep">Manter</button></div>`
        : `<div class="acts"><button class="btn" data-act="remove">${label}</button></div>`;
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
  _people(sim) {
    const html = sim.citizens.map(c => `<button class="person" data-c="${c.id}"><img src="${this.look(c)}" alt=""><span><b>${esc(c.name)}</b><em>${esc(sim.jobs.describe(c))}</em></span></button>`).join('');
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
