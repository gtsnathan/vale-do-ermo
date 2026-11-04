import { T, BUILDINGS } from './defs.js';

// Grade do mundo: quem ocupa cada tile e o que dá para atravessar.
export class WorldManager {
  constructor(gen) {
    Object.assign(this, { w: gen.w, h: gen.h, terrain: gen.terrain, forest: gen.forest, shore: gen.shore, start: gen.start });
    const n = this.w * this.h;
    this.nodeAt = new Int32Array(n).fill(-1);
    this.buildingAt = new Int32Array(n).fill(-1);
    this.pileAt = new Int32Array(n).fill(-1);
    this.doorAt = new Uint8Array(n);
    this.comp = new Int32Array(n).fill(-1);
    this.nodeBlocks = new Uint8Array(n);
    this.road = new Uint8Array(n); // 1 terra, 2 pedra, 3 ponte, 4 túnel, 5 trilha
    this.worn = new Float32Array(n);
    this.fieldAt = new Int32Array(n).fill(-1);
    this.forageUntil = new Float32Array(n);
    this.compDirty = true;
  }
  idx(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  blockedI(i) {
    const t = this.terrain[i];
    if (t === T.WATER && this.road[i] !== 3) return true;
    if (t === T.MOUNTAIN && this.road[i] !== 4) return true;
    return this.buildingAt[i] !== -1 || this.nodeBlocks[i] === 1;
  }
  blocked(x, y) { return !this.inb(x, y) || this.blockedI(this.idx(x, y)); }
  costI(i) {
    const r = this.road[i];
    if (r === 5) return 0.82;
    if (r === 1) return 0.65;
    if (r >= 2) return 0.5;
    if (this.terrain[i] === T.FORD) return 2.1;
    if (this.nodeAt[i] !== -1) return 1.5;
    return 1;
  }
  recomputeComps() {
    this.compDirty = false;
    this._label(this.comp);
  }
  _label(out, extraBlocked = null) {
    const { w, h } = this, n = w * h;
    out.fill(-1);
    const stack = new Int32Array(n);
    let c = 0;
    for (let s = 0; s < n; s++) {
      if (out[s] !== -1 || this.blockedI(s) || (extraBlocked && extraBlocked.has(s))) continue;
      let sp = 0; stack[sp++] = s; out[s] = c;
      while (sp) {
        const i = stack[--sp], x = i % w;
        const try_ = j => {
          if (out[j] === -1 && !this.blockedI(j) && !(extraBlocked && extraBlocked.has(j))) { out[j] = c; stack[sp++] = j; }
        };
        if (x > 0) try_(i - 1);
        if (x < w - 1) try_(i + 1);
        if (i >= w) try_(i - w);
        if (i < n - w) try_(i + w);
      }
      c++;
    }
  }
  compAt(x, y) {
    if (this.compDirty) this.recomputeComps();
    return this.inb(x, y) ? this.comp[this.idx(x, y)] : -1;
  }
  footprint(type, rot) {
    const b = BUILDINGS[type];
    return rot % 2 === 0 ? { w: b.w, h: b.h } : { w: b.h, h: b.w };
  }
  doorTile(type, x, y, rot) {
    const { w, h } = this.footprint(type, rot);
    switch (rot) {
      case 0: return { x: x + (w >> 1), y: y + h };
      case 1: return { x: x + w, y: y + (h >> 1) };
      case 2: return { x: x + (w >> 1), y: y - 1 };
      default: return { x: x - 1, y: y + (h >> 1) };
    }
  }
  // Verificação barata, usada na pré-visualização a cada movimento do cursor.
  canPlace(type, x, y, rot) {
    const { w, h } = this.footprint(type, rot);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (!this.inb(i, j)) return { ok: false, reason: 'Fora do mapa' };
      const k = this.idx(i, j), t = this.terrain[k];
      if (t === T.WATER || t === T.FORD) return { ok: false, reason: 'Não dá para construir na água' };
      if (this.road[k] === 3 || this.road[k] === 4) return { ok: false, reason: 'Há uma ponte ou túnel aqui' };
      if (t === T.MOUNTAIN) return { ok: false, reason: 'Não dá para construir na montanha' };
      if (this.buildingAt[k] !== -1) return { ok: false, reason: 'Já existe uma construção aqui' };
      if (this.nodeAt[k] !== -1) return { ok: false, reason: 'Limpe árvores e rochas deste terreno primeiro' };
      if (this.pileAt[k] !== -1) return { ok: false, reason: 'Há materiais no chão aqui' };
      if (this.fieldAt[k] !== -1) return { ok: false, reason: 'Há uma fazenda aqui' };
      if (this.doorAt[k]) return { ok: false, reason: 'Isto bloquearia a entrada de outra construção' };
    }
    const need = BUILDINGS[type].needs;
    if (need) {
      const tt = need === 'water' ? T.WATER : T.MOUNTAIN;
      let near = false;
      for (let j = y - 2; j < y + h + 2 && !near; j++) for (let i = x - 2; i < x + w + 2; i++) {
        if (this.inb(i, j) && this.terrain[this.idx(i, j)] === tt) { near = true; break; }
      }
      if (!near) return { ok: false, reason: need === 'water' ? 'Precisa ficar à beira da água' : 'Precisa encostar na montanha' };
    }
    const d = this.doorTile(type, x, y, rot);
    if (this.blocked(d.x, d.y)) return { ok: false, reason: 'A entrada ficaria bloqueada. Gire a construção' };
    return { ok: true, door: d };
  }
}
