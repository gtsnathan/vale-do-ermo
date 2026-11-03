import { Simulation } from './sim/Simulation.js';
import { SaveManager } from './sim/SaveManager.js';
import { GameScene } from './game/GameScene.js';
import { UIManager } from './game/UIManager.js';

const KEY = 'vale-do-ermo.save.v1';
const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); return true; } catch { return false; } },
  del() { try { localStorage.removeItem(KEY); } catch { /* sem armazenamento */ } },
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  backgroundColor: '#12171a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  input: { activePointers: 3 },
  disableContextMenu: true,
  banner: false,
  scene: [GameScene],
  render: { roundPixels: true, antialias: false },
});

let scene = null, inGame = false;
const actions = {
  newGame(cfg) {
    scene.setSim(new Simulation(cfg));
    scene.speed = 1; ui.setSpeed(1); inGame = true; actions.save();
  },
  preview(seed, size, difficulty) {
    if (inGame) return;
    scene.setSim(new Simulation({ seed: seed || 'ermo', size, difficulty }));
    scene.speed = 1;
  },
  resume() {
    if (inGame) return true;
    const t = store.get();
    if (!t) return false;
    try {
      scene.setSim(SaveManager.load(t));
      scene.speed = 1; ui.setSpeed(1); inGame = true;
      return true;
    } catch (e) { ui.toast('Este salvamento não pôde ser carregado.'); return false; }
  },
  save() { return inGame && store.set(SaveManager.serialize(scene.sim)); },
  hasSave() { return inGame || !!store.get(); },
  inGame() { return inGame; },
  ended(sim) {
    inGame = false; store.del(); scene.speed = 0;
    ui.endText = `A vila se extinguiu no ano ${sim.year()}. Nasceram ${sim.stats.births} crianças ao longo da história.`;
    ui.showMenu();
  },
};
const ui = new UIManager(game, actions);

game.events.once('scene-ready', s => {
  scene = s;
  ui.attach(s);
  const seed = document.getElementById('m-seed').value;
  s.setSim(new Simulation({ seed, size: 'medio', difficulty: 'normal' }));
  // Atrás do menu, a vila já está viva: alguns aldeões cortam árvores e erguem uma casa.
  const sim = s.sim, st = sim.world.start;
  sim.mark(st.x - 13, st.y - 13, st.x + 13, st.y + 13, ['tree'], true);
  for (let r = 3; r < 14; r++) {
    const x = st.x + r, y = st.y - 3;
    if (sim.construction.place('house', x, y, 0).ok) break;
  }
  ui.showMenu();
  window.__ermo = { game, scene: s, actions, ui, get sim() { return s.sim; } };
  setInterval(() => { if (inGame) actions.save(); }, 30000);
});
