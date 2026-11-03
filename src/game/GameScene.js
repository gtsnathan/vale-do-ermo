import { buildAll } from '../art/sprites.js';
import { bakeCell, CELL_H, CELL_W } from '../art/terrainBake.js';
import { hash } from '../art/pix.js';
import { BUILDINGS, CROPS, DAY, RES, STEP, T, isFood } from '../sim/defs.js';
import { CameraManager } from './CameraManager.js';

const Phaser = globalThis.Phaser;
const DEPTH = 32;      // profundidade por unidade de (x + y)
const OVER = 1e7, GROUND = -1e6;
const BLEED = 2;

const iso = (x, y) => [(x - y) * 32, (x + y) * 16];

export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    this._buildAtlas();
    this.camMgr = new CameraManager(this);
    this.cameras.main.setBackgroundColor('#12171a');
    this.tool = { kind: 'select' };
    this.selected = null;
    this.speed = 1; this.acc = 0;
    this.input.addPointer(2);
    this.nightRect = this.add.rectangle(0, 0, 10, 10, 0x0c1633, 0).setDepth(OVER).setScrollFactor(0).setOrigin(0.5);
    this.fx = this.add.graphics().setDepth(OVER + 2);
    this.groundFx = this.add.graphics().setDepth(GROUND + 5);
    this._input();
    this.scale.on('resize', () => { this.viewDirty = true; });
    this.keys = {};
    this.input.keyboard?.on('keydown', e => this._key(e));
    this.events.emit('ready');
    this.game.events.emit('scene-ready', this);
  }

  _buildAtlas() {
    const items = [];
    const meta = buildAll((name, pix) => items.push({ name, pix }));
    this.smokeAt = meta.smoke;
    items.sort((a, b) => b.pix.h - a.pix.h);
    const SZ = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SZ;
    const ctx = canvas.getContext('2d');
    let x = 0, y = 0, row = 0;
    this.frames = {};
    const place = [];
    for (const it of items) {
      if (x + it.pix.w + 1 > SZ) { x = 0; y += row + 1; row = 0; }
      if (y + it.pix.h > SZ) throw new Error('Atlas cheio');
      ctx.putImageData(new ImageData(it.pix.d, it.pix.w, it.pix.h), x, y);
      place.push([it.name, x, y, it.pix]);
      x += it.pix.w + 1; row = Math.max(row, it.pix.h);
    }
    const tex = this.textures.addCanvas('atlas', canvas);
    for (const [name, fx, fy, pix] of place) {
      tex.add(name, 0, fx, fy, pix.w, pix.h);
      this.frames[name] = { ox: pix.ox / pix.w, oy: pix.oy / pix.h };
    }
    this.atlasUsed = y + row;
  }

  /* ---------- Novo mundo ---------- */
  setSim(sim, focus = true) {
    this._clearWorld();
    this.sim = sim;
    const W = sim.world;
    this.camMgr.bounds(W.w, W.h);
    this.nodeObj = new Map();
    this.buckets = new Map();
    this.activeCells = new Set();
    this.citizenViews = new Map();
    this.buildingViews = new Map();
    this.pileViews = new Map();
    this.smokes = [];
    this.smokeT = 0;
    this.chunks = new Map();
    this.chunkPool = this.chunkPool || [];
    this.bakeQueue = [];
    this.pool = this.pool || [];
    this.falling = [];
    this.selected = null;
    this.tool = { kind: 'select' };
    this.ghostMark = null;
    this.tileViews = new Map();
    sim.events.length = 0;
    for (const n of sim.nodes.values()) this._addNodeObj(n);
    for (const f of sim.farms) for (let i = 0; i < f.tiles.length; i++) this._syncTile(f, i);
    for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) {
      const i = W.idx(x, y);
      if (W.terrain[i] === T.MOUNTAIN) this._addMountain(x, y);
      else if (W.terrain[i] === T.WATER && hash(x, y, 77) < 0.16) {
        const [sx, sy] = iso(x + hash(x, y, 1), y + hash(x, y, 2));
        this._toBucket({ kind: 'glint', frame: `glint${Math.floor(hash(x, y, 3) * 3)}`, sx, sy, depth: GROUND + 1, phase: hash(x, y, 4) * 3 });
      }
    }
    if (focus) {
      const d = sim.buildings[0];
      this.cameras.main.setZoom(window.innerWidth < 640 ? 1 : 1.5);
      this.camMgr.centerTile(d ? d.x + 1 : W.w / 2, d ? d.y + 3 : W.h / 2);
    }
    this.lastView = '';
    this.viewDirty = true;
    this._updateView(true);
  }
  _clearWorld() {
    if (!this.sim) return;
    this.children.list.filter(o => o.isWorld).forEach(o => o.destroy());
    this.pool = [];
    for (const c of this.chunks.values()) { c.img.setVisible(false); this.chunkPool.push(c); }
    this.chunks.clear();
  }
  _addNodeObj(n) {
    const jx = (hash(n.x, n.y, 21) - 0.5) * 0.44, jy = (hash(n.x, n.y, 22) - 0.5) * 0.44;
    const isTree = n.type === 'tree';
    const [sx, sy] = iso(n.x + 0.5 + (isTree ? jx : 0), n.y + 0.5 + (isTree ? jy : 0));
    const v = isTree ? String(n.variant).padStart(2, '0') : n.variant;
    const o = { kind: 'node', node: n, base: isTree ? `tree${v}` : `${n.type}${v}`, frame: isTree ? `tree${v}_0` : `${n.type}${v}`, tree: isTree, sx, sy, depth: (n.x + n.y + 1) * DEPTH, phase: hash(n.x, n.y, 23) * 4 };
    this.nodeObj.set(n.id, o);
    this._toBucket(o);
  }
  _addMountain(x, y) {
    const W = this.sim.world;
    let d = 0;
    for (let r = 1; r <= 5; r++) {
      let all = true;
      for (const [a, b] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
        if (W.inb(x + a, y + b) && W.terrain[W.idx(x + a, y + b)] !== T.MOUNTAIN) all = false;
      }
      if (all) d = r; else break;
    }
    const [sx, sy] = iso(x + 0.5, y + 0.5);
    // Só o interior sobe um pouco: a borda continua apoiada no chão.
    const lift = d > 0 ? Math.floor(hash(x, y, 33) * 11) : 0;
    this._toBucket({ kind: 'mt', frame: `mt${d}_${Math.floor(hash(x, y, 31) * 4)}`, sx, sy: sy - lift, depth: (x + y + 1) * DEPTH - 1, mountain: true });
  }
  // Cada tile de fazenda tem o solo arado e, quando plantado, a muda.
  _syncTile(f, i) {
    const t = f.tiles[i], W = this.sim.world, key = W.idx(t.x, t.y);
    let v = this.tileViews.get(key);
    if (!v) { v = { soil: null, plant: null }; this.tileViews.set(key, v); }
    const [sx, sy] = iso(t.x, t.y);
    if (t.st >= 1 && !v.soil) { v.soil = { kind: 'soil', frame: 'tilled', sx, sy, depth: GROUND + 2 }; this._toBucket(v.soil); }
    if (t.st === 0 && v.soil) { this._unbucket(v.soil); v.soil = null; }
    let frame = null;
    if (t.st === 2) frame = `crop_${t.crop}_${Math.min(2, Math.floor((t.g / CROPS[t.crop].grow) * 3))}`;
    if (t.st === 3) frame = `crop_${t.crop}_3`;
    if (!frame && v.plant) { this._unbucket(v.plant); v.plant = null; }
    else if (frame && !v.plant) { v.plant = { kind: 'plant', frame, sx, sy, depth: (t.x + t.y + 0.9) * DEPTH }; this._toBucket(v.plant); }
    else if (frame && v.plant.frame !== frame) { v.plant.frame = frame; if (v.plant.img) this._setF(v.plant.img, frame); }
  }
  _clearTile(t) {
    const key = this.sim.world.idx(t.x, t.y), v = this.tileViews.get(key);
    if (!v) return;
    if (v.soil) this._unbucket(v.soil);
    if (v.plant) this._unbucket(v.plant);
    this.tileViews.delete(key);
  }
  _unbucket(o) {
    const b = this.buckets.get(o.key);
    if (b) { const i = b.indexOf(o); if (i >= 0) b.splice(i, 1); }
    this._hide(o);
  }
  _bucketKey(sx, sy) { return (Math.floor(sx / CELL_W) + 512) * 4096 + Math.floor(sy / CELL_H) + 512; }
  _toBucket(o) {
    const k = this._bucketKey(o.sx, o.sy);
    o.key = k;
    if (!this.buckets.has(k)) this.buckets.set(k, []);
    this.buckets.get(k).push(o);
    if (this.activeCells && this.activeCells.has(k)) this._show(o);
  }
  _takeImg() {
    const im = this.pool.pop() || Object.assign(this.add.image(0, 0, 'atlas', 'stone0'), { isWorld: true });
    return im.setVisible(true).clearTint().setAlpha(1).setRotation(0).setScale(1);
  }
  _setF(img, name) {
    const f = this.frames[name];
    img.setFrame(name);
    img.setOrigin(f.ox, f.oy);
    return img;
  }
  _show(o) {
    if (o.img) return;
    const im = this._takeImg();
    this._setF(im, o.frame);
    im.setPosition(o.sx, o.sy).setDepth(o.depth);
    if (o.mountain) im.setOrigin(this.frames[o.frame].ox, this.frames[o.frame].oy);
    o.img = im;
    if (o.kind === 'node' && o.node.marked) this._markOn(o);
  }
  _hide(o) {
    if (!o.img) return;
    o.img.setVisible(false);
    this.pool.push(o.img);
    o.img = null;
    if (o.flag) { o.flag.destroy(); o.flag = null; }
  }
  _markOn(o) {
    if (o.flag || !o.img) return;
    o.flag = Object.assign(this.add.image(o.sx + 7, o.sy - 2, 'atlas', 'mark_flag'), { isWorld: true });
    this._setF(o.flag, 'mark_flag');
    o.flag.setDepth(o.depth + 1);
  }
  _markOff(o) { if (o.flag) { o.flag.destroy(); o.flag = null; } }

  /* ---------- Culling e terreno ---------- */
  _updateView(force) {
    const c = this.cameras.main;
    const v = c.worldView;
    const key = `${Math.round(v.x / 32)},${Math.round(v.y / 32)},${Math.round(v.width / 32)},${Math.round(v.height / 32)}`;
    if (!force && key === this.lastView) return;
    this.lastView = key;
    const cx0 = Math.floor((v.x - 64) / CELL_W), cx1 = Math.floor((v.right + 64) / CELL_W);
    const cy0 = Math.floor((v.y - 64) / CELL_H), cy1 = Math.floor((v.bottom + 200) / CELL_H);
    const wanted = new Set();
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) wanted.add((x + 512) * 4096 + y + 512);
    for (const k of this.activeCells) if (!wanted.has(k)) {
      for (const o of this.buckets.get(k) || []) this._hide(o);
      this.activeCells.delete(k);
    }
    for (const k of wanted) if (!this.activeCells.has(k)) {
      this.activeCells.add(k);
      for (const o of this.buckets.get(k) || []) this._show(o);
    }
    // Terreno
    const need = [];
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      const k = `${x},${y}`;
      if (!this._cellInMap(x, y)) continue;
      need.push(k);
      if (!this.chunks.has(k) && !this.bakeQueue.includes(k)) this.bakeQueue.push(k);
    }
    const midX = (v.x + v.right) / 2, midY = (v.y + v.bottom) / 2;
    const dist = k => { const [a, b] = k.split(',').map(Number); return Math.hypot((a + 0.5) * CELL_W - midX, (b + 0.5) * CELL_H - midY); };
    this.bakeQueue = this.bakeQueue.filter(k => need.includes(k)).sort((a, b) => dist(a) - dist(b));
    if (this.chunks.size > 44) {
      const far = [...this.chunks.keys()].filter(k => !need.includes(k)).sort((a, b) => dist(b) - dist(a));
      for (const k of far.slice(0, this.chunks.size - 40)) {
        const ch = this.chunks.get(k);
        ch.img.setVisible(false); this.chunkPool.push(ch); this.chunks.delete(k);
      }
    }
    if (force) while (this.bakeQueue.length) this._bake(this.bakeQueue.shift());
  }
  _cellInMap(cx, cy) {
    const W = this.sim.world;
    const xmin = -W.h * 32, xmax = W.w * 32, ymax = (W.w + W.h) * 16;
    return (cx + 1) * CELL_W > xmin && cx * CELL_W < xmax && (cy + 1) * CELL_H > 0 && cy * CELL_H < ymax;
  }
  _bake(k) {
    const [cx, cy] = k.split(',').map(Number);
    let ch = this.chunkPool.pop();
    const w = CELL_W + BLEED, h = CELL_H + BLEED;
    if (!ch) {
      const key = `cell${this.cellCount = (this.cellCount || 0) + 1}`;
      const tex = this.textures.createCanvas(key, w, h);
      const data = tex.context.createImageData(w, h);
      ch = { tex, data, u32: new Uint32Array(data.data.buffer), img: this.add.image(0, 0, key).setOrigin(0, 0).setDepth(GROUND) };
    }
    bakeCell(this.sim.world, cx, cy, ch.u32, w, h);
    ch.tex.context.putImageData(ch.data, 0, 0);
    ch.tex.refresh();
    ch.img.setPosition(cx * CELL_W, cy * CELL_H).setVisible(true);
    this.chunks.set(k, ch);
  }

  /* ---------- Quadro ---------- */
  update(time, delta) {
    if (!this.sim) return;
    const dt = Math.min(delta, 100) / 1000;
    if (this.speed > 0) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= STEP && n++ < 120) { this.sim.step(); this.acc -= STEP; }
      if (this.acc > STEP * 4) this.acc = 0;
    }
    const alpha = this.speed > 0 ? this.acc / STEP : 1;
    this._consumeEvents();
    this.cameras.main.preRender();
    this._updateView(false);
    if (this.bakeQueue.length) this._bake(this.bakeQueue.shift());
    this._syncCitizens(alpha, time);
    this._syncBuildings();
    this._syncPiles();
    this._animateStatic(time);
    this._animateFalling(dt);
    this._daylight();
    this._smoke(dt);
    this._drawFx();
    this.game.events.emit('frame', this);
  }

  _consumeEvents() {
    const ev = this.sim.events;
    for (const e of ev) {
      if (e.t === 'news') { this.game.events.emit('news', e); continue; }
      if (e.t === 'crop') { const f = this.sim.farming.get(e.farmId); if (f) this._syncTile(f, e.i); }
      else if (e.t === 'farmRemoved') { for (const t of e.tiles) this._clearTile(t); }
      else if (e.t === 'mark') {
        const o = this.nodeObj.get(e.id);
        if (o) { if (e.value) this._markOn(o); else this._markOff(o); }
      } else if (e.t === 'nodeRemoved') {
        const o = this.nodeObj.get(e.id);
        if (!o) continue;
        const b = this.buckets.get(o.key);
        if (b) b.splice(b.indexOf(o), 1);
        if (o.img && o.tree) this.falling.push({ img: this._cloneFall(o), t: 0 });
        this._hide(o);
        this.nodeObj.delete(e.id);
        if (o.tree) {
          const sp = Math.floor(e.variant / 10);
          this._toBucket({ kind: 'stump', frame: `stump${sp === 2 ? 2 : sp}`, sx: o.sx, sy: o.sy, depth: o.depth - 1 });
        }
      }
    }
    ev.length = 0;
  }
  _cloneFall(o) {
    const im = this._takeImg();
    this._setF(im, o.frame);
    im.setPosition(o.sx, o.sy).setDepth(o.depth);
    im.fallDir = hash(o.node.x, o.node.y, 9) > 0.5 ? 1 : -1;
    return im;
  }
  _animateFalling(dt) {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt * Math.max(1, this.speed);
      const k = Math.min(1, f.t / 0.85);
      f.img.setRotation(f.img.fallDir * k * k * 1.45);
      f.img.setAlpha(f.t > 1.1 ? Math.max(0, 1 - (f.t - 1.1) / 0.5) : 1);
      if (f.t > 1.6) { f.img.setVisible(false); this.pool.push(f.img); this.falling.splice(i, 1); }
    }
  }

  _syncCitizens(alpha, time) {
    const alive = new Set();
    for (const c of this.sim.citizens) {
      alive.add(c.id);
      let v = this.citizenViews.get(c.id);
      if (!v) {
        v = { body: Object.assign(this.add.image(0, 0, 'atlas', 'c0_f_i'), { isWorld: true }), cargo: Object.assign(this.add.image(0, 0, 'atlas', 'carry_wood'), { isWorld: true }), jx: (hash(c.id, 1, 5) - 0.5) * 12, jy: (hash(c.id, 2, 5) - 0.5) * 6 };
        this.citizenViews.set(c.id, v);
      }
      v.body.setVisible(!c.inside);
      v.body.setScale(c.age < 12 ? 0.55 + (c.age / 12) * 0.4 : 1);
      if (c.inside) { v.cargo.setVisible(false); continue; }
      const x = c.px + (c.x - c.px) * alpha, y = c.py + (c.y - c.py) * alpha;
      const [sx, sy] = iso(x, y);
      const px = sx + v.jx, py = sy + v.jy;
      let fr = 'i';
      if (c.anim === 'walk') fr = `w${Math.floor((time / 130 + c.id) % 4)}`;
      else if (c.anim === 'work') fr = `t${Math.floor((time / 280 + c.id * 0.37) % 2)}`;
      else if (c.anim === 'sit') fr = 's';
      const name = `c${c.look}_${c.faceFront ? 'f' : 'b'}_${fr}`;
      if (v.frame !== name) { this._setF(v.body, name); v.frame = name; }
      v.body.setFlipX(!c.faceRight);
      v.body.setPosition(Math.round(px), Math.round(py));
      const d = (x + y + 0.5) * DEPTH;
      if (Math.abs((v.d || 0) - d) > 1) { v.body.setDepth(d); v.cargo.setDepth(d + 0.2); v.d = d; }
      if (c.inv.res) {
        const cn = `carry_${isFood(c.inv.res) ? 'food' : c.inv.res}`;
        if (v.cargoF !== cn) { this._setF(v.cargo, cn); v.cargoF = cn; }
        v.cargo.setVisible(true).setPosition(Math.round(px), Math.round(py) - 21);
      } else v.cargo.setVisible(false);
    }
    for (const [id, v] of this.citizenViews) if (!alive.has(id)) { v.body.destroy(); v.cargo.destroy(); this.citizenViews.delete(id); }
  }

  _stage(b) {
    if (b.done) return 4;
    const p = b.work / BUILDINGS[b.type].work;
    if (p <= 0) return 0;
    return p < 0.34 ? 1 : p < 0.72 ? 2 : 3;
  }
  _syncBuildings() {
    const seen = new Set();
    const vis = this.cameras.main.worldView;
    for (const b of this.sim.buildings) {
      seen.add(b.id);
      let v = this.buildingViews.get(b.id);
      if (!v) {
        const [sx, sy] = iso(b.x, b.y);
        const depth = (b.x + b.y + Math.max(b.w, b.h)) * DEPTH - DEPTH / 2 + 8;
        const base = Object.assign(this.add.image(sx, sy, 'atlas', 'stone0'), { isWorld: true }).setDepth(depth);
        v = { base, depth, sx, sy, extra: [], glow: null };
        this.buildingViews.set(b.id, v);
      }
      const st = this._stage(b), f = `${b.type}_r${b.rot}_s${st}`;
      if (v.f !== f) { this._setF(v.base, f); v.f = f; }
      this._syncContents(b, v, st);
      if (b.type === 'house' && st === 4) {
        const occupied = b.residents.some(id => this.sim.citizen(id)?.inside);
        v.occupied = occupied;
        if (!v.glow) {
          v.glow = Object.assign(this.add.image(v.sx, v.sy, 'atlas', `house_r${b.rot}_glow`), { isWorld: true }).setDepth(OVER + 1).setBlendMode(Phaser.BlendModes.ADD);
          this._setF(v.glow, `house_r${b.rot}_glow`);
        }
        v.glow.setVisible(occupied).setAlpha(0.85);
      }
    }
    void vis;
    for (const [id, v] of this.buildingViews) if (!seen.has(id)) {
      v.base.destroy(); v.glow?.destroy(); v.extra.forEach(e => e.destroy());
      this.buildingViews.delete(id);
    }
  }
  // Estoque visível no pátio e material empilhado na obra.
  _syncContents(b, v, st) {
    const wanted = [];
    const at = (fx, fy, name, dz = 0) => {
      const [sx, sy] = iso(b.x + fx, b.y + fy);
      wanted.push({ sx, sy: sy - dz, name, depth: v.depth + 1 + (fx + fy) });
    };
    if (b.type === 'depot' && b.done) {
      const slots = { wood: [[2.1, 0.7], [2.2, 1.55], [1.3, 2.25]], stone: [[0.75, 2.25], [1.5, 1.45]], iron: [[1.5, 0.75]] };
      const lv = (n, per) => Math.min(3, Math.ceil(n / per));
      const w = b.stock.wood, s = b.stock.stone, ir = b.stock.iron;
      for (let i = 0; i < slots.wood.length; i++) {
        const left = w - i * 30;
        if (left > 0) at(...slots.wood[i], `pile_wood_${left >= 20 ? 9 : left >= 10 ? 6 : left >= 4 ? 3 : 1}`);
      }
      for (let i = 0; i < slots.stone.length; i++) {
        const left = s - i * 25;
        if (left > 0) at(...slots.stone[i], `pile_stone_${lv(left, 8)}`);
      }
      if (ir > 0) at(...slots.iron[0], `pile_iron_${lv(ir, 8)}`);
    } else if (!b.done && st <= 2) {
      const cost = BUILDINGS[b.type].cost;
      const w = b.delivered.wood, s = b.delivered.stone;
      if (w > 0 && cost.wood) at(b.w - 0.45, b.h - 0.35, `pile_wood_${w >= 12 ? 9 : w >= 7 ? 6 : w >= 3 ? 3 : 1}`, -2);
      if (s > 0 && cost.stone) at(0.45, b.h - 0.3, `pile_stone_${Math.min(3, Math.ceil(s / 2))}`, -2);
    }
    const sig = wanted.map(o => o.name).join();
    if (sig === v.sig) return;
    v.sig = sig;
    v.extra.forEach(e => e.destroy());
    v.extra = wanted.map(o => {
      const im = Object.assign(this.add.image(o.sx, o.sy, 'atlas', o.name), { isWorld: true });
      this._setF(im, o.name);
      return im.setDepth(o.depth);
    });
  }
  _syncPiles() {
    const seen = new Set();
    for (const p of this.sim.piles) {
      seen.add(p.id);
      let v = this.pileViews.get(p.id);
      if (!v) {
        const [sx, sy] = iso(p.x + 0.5, p.y + 0.5);
        v = { img: Object.assign(this.add.image(sx, sy + 2, 'atlas', 'pile_wood_1'), { isWorld: true }).setDepth((p.x + p.y + 0.8) * DEPTH) };
        this.pileViews.set(p.id, v);
      }
      const f = p.res === 'wood' ? `pile_wood_${p.amount >= 9 ? 9 : p.amount >= 6 ? 6 : p.amount >= 3 ? 3 : 1}` : `pile_${isFood(p.res) ? 'food' : p.res}_${Math.min(3, Math.ceil(p.amount / 2))}`;
      if (v.f !== f) { this._setF(v.img, f); v.f = f; }
    }
    for (const [id, v] of this.pileViews) if (!seen.has(id)) { v.img.destroy(); this.pileViews.delete(id); }
  }
  _animateStatic(time) {
    const tick = Math.floor(time / 240);
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    for (const k of this.activeCells) for (const o of this.buckets.get(k) || []) {
      if (!o.img) continue;
      if (o.tree) {
        const on = Math.sin(time / 900 + o.phase * 1.57 + o.sx * 0.002) > 0.55 ? 1 : 0;
        if (o.sway !== on) { o.sway = on; o.img.setFrame(`${o.base}_${on}`); }
      } else if (o.kind === 'glint') {
        const f = Math.floor(time / 500 + o.phase) % 3;
        if (o.gf !== f) { o.gf = f; o.img.setFrame(`glint${f}`); }
      }
    }
  }
  _daylight() {
    const f = (this.sim.time / DAY) % 1;
    const cam = this.cameras.main;
    this.nightRect.setPosition(cam.width / 2, cam.height / 2);
    this.nightRect.setSize(cam.width / cam.zoom + 8, cam.height / cam.zoom + 8);
    // Madrugada 0, meio-dia 0: sobe no fim da tarde e desce ao amanhecer.
    let k = 0;
    if (f > 0.8) k = Math.min(1, (f - 0.8) / 0.1);
    else if (f < 0.26) k = f < 0.18 ? 1 : 1 - (f - 0.18) / 0.08;
    this.nightRect.fillColor = k > 0.5 ? 0x0c1633 : 0x3a2440;
    this.nightRect.fillAlpha = k * 0.56;
    this.nightK = k;
    for (const v of this.buildingViews.values()) if (v.glow) v.glow.setAlpha(v.occupied ? Math.max(0, k) : 0);
  }
  _smoke(dt) {
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.55;
      for (const b of this.sim.buildings) {
        if (b.type !== 'house' || !b.done || !this.buildingViews.get(b.id)?.occupied && !b.residents.length) continue;
        const a = this.smokeAt[`house_r${b.rot}`];
        const [sx, sy] = iso(b.x, b.y);
        const im = this._takeImg();
        this._setF(im, 'smoke0');
        im.setPosition(sx + a[0], sy + a[1]).setDepth(OVER - 1).setAlpha(0.6);
        this.smokes.push({ im, t: 0, life: 3 + Math.random() * 1.5, dx: 3 + Math.random() * 4 });
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const k = s.t / s.life;
      s.im.x += s.dx * dt; s.im.y -= 11 * dt;
      s.im.setFrame(`smoke${Math.min(2, Math.floor(k * 3))}`);
      s.im.setAlpha(0.55 * (1 - k));
      if (k >= 1) { s.im.setVisible(false); this.pool.push(s.im); this.smokes.splice(i, 1); }
    }
  }

  /* ---------- Traços de seleção ---------- */
  _diamond(g, x, y, w, h, color, alpha, fill = 0) {
    const a = iso(x, y), b = iso(x + w, y), c = iso(x + w, y + h), d = iso(x, y + h);
    if (fill) { g.fillStyle(color, fill); g.fillPoints([{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, { x: c[0], y: c[1] }, { x: d[0], y: d[1] }], true); }
    g.lineStyle(2 / this.cameras.main.zoom, color, alpha);
    g.strokePoints([{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, { x: c[0], y: c[1] }, { x: d[0], y: d[1] }], true);
  }
  _drawFx() {
    const g = this.groundFx; g.clear();
    const f = this.fx; f.clear();
    const s = this.selected;
    if (s?.type === 'building') {
      const b = this.sim.building(s.id);
      if (b) this._diamond(g, b.x, b.y, b.w, b.h, 0xf0d890, 0.95, 0.12); else this.selected = null;
    } else if (s?.type === 'citizen') {
      const c = this.sim.citizen(s.id);
      if (c && !c.inside) {
        const v = this.citizenViews.get(c.id);
        g.lineStyle(2 / this.cameras.main.zoom, 0xf0d890, 1);
        if (v) g.strokeEllipse(v.body.x, v.body.y, 24, 12);
      }
    } else if (s?.type === 'node') {
      const n = this.sim.nodes.get(s.id);
      if (n) this._diamond(g, n.x, n.y, 1, 1, 0xf0d890, 0.95, 0.1); else this.selected = null;
    } else if (s?.type === 'farm') {
      const fa = this.sim.farming.get(s.id);
      if (fa) this._diamond(g, fa.x, fa.y, fa.w, fa.h, 0xf0d890, 0.95, 0.06); else this.selected = null;
    } else if (s?.type === 'pile') {
      const p = this.sim.resources.pile(s.id);
      if (p) this._diamond(g, p.x, p.y, 1, 1, 0xf0d890, 0.95, 0.1); else this.selected = null;
    }
    const t = this.tool;
    if (t.kind === 'place' && t.tile) {
      const W = this.sim.world;
      const { w, h } = W.footprint(t.type, t.rot);
      const v = this.placeCheck();
      const col = v.ok ? 0x9fd86a : 0xe2553a;
      this._diamond(g, t.tile.x, t.tile.y, w, h, col, 1, 0.28);
      const d = W.doorTile(t.type, t.tile.x, t.tile.y, t.rot);
      this._diamond(g, d.x, d.y, 1, 1, 0xf0d890, 0.95, 0.35);
      const [sx, sy] = iso(t.tile.x, t.tile.y);
      if (!this.ghost) this.ghost = this.add.image(0, 0, 'atlas', 'stone0').setDepth(OVER - 2).setAlpha(0.8);
      this._setF(this.ghost, `${t.type}_r${t.rot}_s4`);
      this.ghost.setPosition(sx, sy).setVisible(true).setTint(v.ok ? 0xffffff : 0xff8a70);
    } else if (this.ghost) this.ghost.setVisible(false);
    if (t.kind === 'mark' && t.rect) {
      const { x0, y0, x1, y1 } = t.rect;
      const col = t.value ? 0xe2733a : 0xbfc8d0;
      this._diamond(f, x0, y0, x1 - x0 + 1, y1 - y0 + 1, col, 1, 0.16);
    }
    if (t.kind === 'field' && t.rect) {
      const { x0, y0, x1, y1 } = t.rect;
      t.check = this.sim.farming.validate(x0, y0, x1, y1);
      const col = t.check.ok ? 0x9fd86a : 0xe2553a;
      this._diamond(f, x0, y0, x1 - x0 + 1, y1 - y0 + 1, col, 1, 0.2);
    }
  }
  placeCheck() {
    const t = this.tool;
    if (t.kind !== 'place' || !t.tile) return { ok: false };
    const k = `${t.tile.x},${t.tile.y},${t.rot},${this.sim.steps >> 3}`;
    if (t.checkKey !== k) {
      t.checkKey = k;
      t.check = this.sim.world.canPlace(t.type, t.tile.x, t.tile.y, t.rot);
    }
    return t.check;
  }

  /* ---------- Entrada ---------- */
  tileAt(sx, sy) {
    const p = this.cameras.main.getWorldPoint(sx, sy);
    const a = p.x / 32, b = p.y / 16;
    return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
  }
  setTool(tool) {
    this.tool = tool;
    this.game.events.emit('tool', tool);
  }
  rotate() {
    if (this.tool.kind !== 'place') return;
    this.tool.rot = (this.tool.rot + 1) % 4;
    this.tool.checkKey = null;
  }
  confirmPlace() {
    const t = this.tool;
    if (t.kind !== 'place' || !t.tile) return;
    const r = this.sim.construction.place(t.type, t.tile.x, t.tile.y, t.rot);
    this.game.events.emit('placed', r);
    t.checkKey = null;
    if (r.ok) { t.tile = null; this.setTool({ kind: 'select' }); this.selected = { type: 'building', id: r.building.id }; }
  }
  _input() {
    const I = this.input;
    const isRect = () => this.tool.kind === 'mark' || this.tool.kind === 'field';
    const drag = { on: false, moved: 0, lastX: 0, lastY: 0, pinch: 0, pan: false };
    I.on('wheel', (p, o, dx, dy) => this.camMgr.zoomAt(dy > 0 ? 0.88 : 1.14, p.x, p.y));
    I.on('pointerdown', p => {
      const touching = [I.pointer1, I.pointer2].filter(q => q && q.isDown).length;
      if (touching >= 2) {
        drag.pinch = Phaser.Math.Distance.Between(I.pointer1.x, I.pointer1.y, I.pointer2.x, I.pointer2.y);
        drag.pan = true; drag.moved = 99;
        if (isRect()) this.tool.rect = null;
        return;
      }
      drag.on = true; drag.moved = 0; drag.lastX = p.x; drag.lastY = p.y;
      drag.pan = !isRect() || p.rightButtonDown() || p.middleButtonDown();
      drag.touch = p.wasTouch;
      if (isRect() && !drag.pan) { const t = this.tileAt(p.x, p.y); this.tool.a = t; this.tool.rect = { x0: t.x, y0: t.y, x1: t.x, y1: t.y }; }
    });
    I.on('pointermove', p => {
      const t = this.tool;
      if (t.kind === 'place' && !p.wasTouch) {
        const fp = this.sim.world.footprint(t.type, t.rot);
        const tile = this.tileAt(p.x, p.y);
        t.tile = { x: tile.x - (fp.w >> 1) + 0, y: tile.y - (fp.h >> 1) + 0 };
        t.checkKey = null;
      }
      if (I.pointer1?.isDown && I.pointer2?.isDown) {
        const d = Phaser.Math.Distance.Between(I.pointer1.x, I.pointer1.y, I.pointer2.x, I.pointer2.y);
        const mx = (I.pointer1.x + I.pointer2.x) / 2, my = (I.pointer1.y + I.pointer2.y) / 2;
        if (drag.pinch > 0) this.camMgr.zoomAt(d / drag.pinch, mx, my);
        if (drag.mx != null) this.camMgr.panBy(mx - drag.mx, my - drag.my);
        drag.pinch = d; drag.mx = mx; drag.my = my;
        return;
      }
      if (!drag.on || !p.isDown) return;
      const dx = p.x - drag.lastX, dy = p.y - drag.lastY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.lastX = p.x; drag.lastY = p.y;
      if (drag.pan) { if (drag.moved > 5) this.camMgr.panBy(dx, dy); }
      else if (isRect() && t.a) {
        const c = this.tileAt(p.x, p.y);
        t.rect = { x0: Math.min(t.a.x, c.x), y0: Math.min(t.a.y, c.y), x1: Math.max(t.a.x, c.x), y1: Math.max(t.a.y, c.y) };
      }
    });
    I.on('pointerup', p => {
      if (!I.pointer1?.isDown && !I.pointer2?.isDown) { drag.pinch = 0; drag.mx = null; }
      if (!drag.on) return;
      drag.on = false;
      const t = this.tool;
      if (p.rightButtonReleased?.() && !isRect()) { if (drag.moved < 6) this.setTool({ kind: 'select' }); return; }
      if (t.kind === 'mark' && t.rect) {
        const r = t.rect;
        const n = this.sim.mark(r.x0, r.y0, r.x1, r.y1, t.types, t.value);
        this.game.events.emit('marked', { n, value: t.value, types: t.types });
        t.rect = null; t.a = null;
        return;
      }
      if (t.kind === 'field' && t.rect) {
        const r = t.rect;
        const res = this.sim.farming.place(r.x0, r.y0, r.x1, r.y1, 'potato');
        t.rect = null; t.a = null;
        this.game.events.emit('farmPlaced', res);
        if (res.ok) { this.setTool({ kind: 'select' }); this.selected = { type: 'farm', id: res.farm.id }; }
        return;
      }
      if (drag.moved > 6) return;
      if (t.kind === 'place') {
        if (p.wasTouch) {
          const fp = this.sim.world.footprint(t.type, t.rot);
          const tile = this.tileAt(p.x, p.y);
          t.tile = { x: tile.x - (fp.w >> 1), y: tile.y - (fp.h >> 1) };
          t.checkKey = null;
          this.game.events.emit('tool', t);
        } else this.confirmPlace();
        return;
      }
      if (t.kind === 'select') this._pick(p.x, p.y);
    });
  }
  _key(e) {
    const k = e.key.toLowerCase();
    if (k === 'r') this.rotate();
    else if (k === 'escape') { this.setTool({ kind: 'select' }); this.selected = null; }
    else if (k === ' ') { e.preventDefault?.(); this.game.events.emit('toggle-pause'); }
    else if (['1', '2', '3', '4'].includes(k)) this.game.events.emit('speed', [1, 2, 5, 10][+k - 1]);
  }
  _pick(sx, sy) {
    const S = this.sim;
    const wp = this.cameras.main.getWorldPoint(sx, sy);
    let best = null, bd = 16;
    for (const c of S.citizens) {
      if (c.inside) continue;
      const v = this.citizenViews.get(c.id);
      if (!v) continue;
      const d = Math.hypot(v.body.x - wp.x, v.body.y - 10 - wp.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { this.selected = { type: 'citizen', id: best.id }; return; }
    const W = S.world;
    for (const z of [0, 12, 24, 36, 48]) {
      const t = this.tileAt(sx, sy + z * this.cameras.main.zoom);
      if (!W.inb(t.x, t.y)) continue;
      const i = W.idx(t.x, t.y);
      if (W.buildingAt[i] !== -1) { this.selected = { type: 'building', id: W.buildingAt[i] }; return; }
      if (z === 0) {
        if (W.pileAt[i] !== -1) { this.selected = { type: 'pile', id: W.pileAt[i] }; return; }
        if (W.nodeAt[i] !== -1) { this.selected = { type: 'node', id: W.nodeAt[i] }; return; }
        if (W.fieldAt[i] !== -1) { this.selected = { type: 'farm', id: W.fieldAt[i] }; return; }
      }
    }
    this.selected = null;
  }
}
void RES; void T;
