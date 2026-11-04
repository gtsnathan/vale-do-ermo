import { DAY, SEASONS, SEASON_LEN, SEASON_TEMP } from './defs.js';

// Estações, temperatura e o calendário do clima.
export class SeasonManager {
  constructor(sim) { this.sim = sim; this.last = this.index(); }
  index() { return Math.floor(this.sim.time / SEASON_LEN) % 4; }
  name() { return SEASONS[this.index()]; }
  // Temperatura em graus: média da estação, oscilação do dia e inverno rigoroso.
  temp() {
    const S = this.sim, i = this.index(), f = (S.time % SEASON_LEN) / SEASON_LEN;
    const a = SEASON_TEMP[i], b = SEASON_TEMP[(i + 1) % 4];
    const base = a + (b - a) * Math.max(0, f - 0.85) / 0.15;
    const dayWave = Math.sin(((S.time / DAY) % 1) * Math.PI * 2 - Math.PI / 2) * 3;
    return base + dayWave - (i === 3 ? S.winterExtra : 0);
  }
  tick() {
    const i = this.index();
    if (i === this.last) return;
    this.last = i;
    const S = this.sim;
    S.events.push({ t: 'season', index: i });
    if (i === 3) { S.farming.frost(); S.eventsMgr.winterStart(); }
    if (i === 0) { S.winterExtra = 0; S.badHarvest = false; S.eventsMgr.yearStart(); S.work.yearStart(); }
  }
}
