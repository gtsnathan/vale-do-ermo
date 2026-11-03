// Dados do jogo. Nenhum módulo em src/sim toca em DOM ou Phaser.
export const T = { GRASS: 0, FERTILE: 1, FORD: 2, WATER: 3, MOUNTAIN: 4 };
export const RES = ['wood', 'stone', 'iron'];
export const RES_LABEL = { wood: 'Madeira', stone: 'Pedra', iron: 'Ferro' };

export const STEP = 0.05;          // segundos de simulação por passo
export const DAY = 240;            // segundos de simulação por dia
export const NIGHT_START = 0.917;  // 22h
export const NIGHT_END = 0.208;    // 5h
export const WALK = 1.7;           // tiles por segundo
export const CARRY = { wood: 4, stone: 3, iron: 3 };

export const NODE = {
  tree:  { label: 'Árvore', res: 'wood',  yield: 3, work: 6,  blocks: false },
  stone: { label: 'Afloramento de pedra', res: 'stone', yield: 5, work: 11, blocks: true },
  iron:  { label: 'Veio de ferro', res: 'iron', yield: 4, work: 14, blocks: true },
};

export const BUILDINGS = {
  depot: { name: 'Depósito', w: 3, h: 3, cost: { wood: 12 }, work: 20, builders: 3, capacity: 150,
    about: 'Guarda madeira, pedra e ferro. Cada unidade ocupa espaço.' },
  house: { name: 'Casa de madeira', w: 2, h: 2, cost: { wood: 16, stone: 4 }, work: 40, builders: 3, residents: 5,
    about: 'Abriga uma família. Os moradores voltam para casa à noite.' },
};

export const DIFFICULTY = {
  facil:   { label: 'Fácil',   start: { wood: 80, stone: 30, iron: 0 } },
  normal:  { label: 'Normal',  start: { wood: 50, stone: 15, iron: 0 } },
  dificil: { label: 'Difícil', start: { wood: 28, stone: 8,  iron: 0 } },
};
export const MAP_SIZES = { pequeno: 64, medio: 96, grande: 128 };

export const FAMILIES = ['Alvarenga', 'Bastos', 'Coutinho', 'Drummond', 'Esteves', 'Figueira', 'Galvão', 'Horta'];
export const MALE = ['Afonso', 'Bento', 'Caetano', 'Diogo', 'Estêvão', 'Fernão', 'Gaspar', 'Henrique', 'Inácio', 'Jorge', 'Lourenço', 'Martim', 'Nuno', 'Paio', 'Rodrigo', 'Simão', 'Tomé', 'Vasco'];
export const FEMALE = ['Aldonça', 'Beatriz', 'Catarina', 'Dulce', 'Elvira', 'Filipa', 'Guiomar', 'Helena', 'Inês', 'Joana', 'Leonor', 'Mécia', 'Oriana', 'Petronilha', 'Sancha', 'Teresa', 'Urraca', 'Violante'];
