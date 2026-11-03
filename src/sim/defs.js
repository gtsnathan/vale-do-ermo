// Dados do jogo. Nenhum módulo em src/sim toca em DOM ou Phaser.
export const T = { GRASS: 0, FERTILE: 1, FORD: 2, WATER: 3, MOUNTAIN: 4 };
export const MATERIALS = ['wood', 'stone', 'iron'];
export const FOODS = ['potato', 'wheat', 'corn', 'pumpkin', 'beans', 'cabbage', 'berries', 'mushroom'];
export const RES = [...MATERIALS, ...FOODS];
export const isFood = r => FOODS.includes(r);
export const RES_LABEL = {
  wood: 'Madeira', stone: 'Pedra', iron: 'Ferro', potato: 'Batata', wheat: 'Trigo', corn: 'Milho',
  pumpkin: 'Abóbora', beans: 'Feijão', cabbage: 'Repolho', berries: 'Frutas silvestres', mushroom: 'Cogumelos',
};

export const STEP = 0.05;          // segundos de simulação por passo
export const DAY = 240;            // segundos de simulação por dia
export const NIGHT_START = 0.917;  // 22h
export const NIGHT_END = 0.208;    // 5h
export const WALK = 1.7;           // tiles por segundo
export const CARRY = { wood: 4, stone: 3, iron: 3, potato: 6, wheat: 6, corn: 6, pumpkin: 6, beans: 6, cabbage: 6, berries: 6, mushroom: 6 };
export const HUNGER_RATE = 100 / (DAY * 1.1);  // fome por segundo: cerca de uma refeição por dia
export const MEAL = 75;
export const HUNGRY = 60;
export const PANTRY_LOW = 4;
export const PANTRY_TRIP = 4;
export const FARM_WORK = { 0: 3, 1: 2, 3: 2.5 };  // preparar, plantar, colher (segundos por tile)
export const CROPS = {
  potato:  { grow: DAY * 2,   yield: 2 },
  wheat:   { grow: DAY * 2,   yield: 2 },
  corn:    { grow: DAY * 2.5, yield: 3 },
  pumpkin: { grow: DAY * 3,   yield: 4 },
  beans:   { grow: DAY * 1.5, yield: 2 },
  cabbage: { grow: DAY * 1.5, yield: 2 },
};
export const FARM_MIN = 3, FARM_MAX = 8;
export const FORAGE_RADIUS = 14;
export const PROFESSIONS = { laborer: 'Trabalhador geral', builder: 'Construtor', farmer: 'Agricultor', gatherer: 'Coletor' };

export const YEAR_DAYS = 6;                 // um ano tem 6 dias de jogo
export const YEAR = DAY * YEAR_DAYS;
export const ADULT_AGE = 12;                // criança não trabalha; a partir daqui, sim
export const MARRY_AGE = 16;
export const FERTILE_MAX = 45;
export const PREGNANCY = DAY * 3;
export const BIRTH_REST = DAY * 3;
export const OLD_AGE = 55;                  // a partir daqui o risco de morrer de velhice cresce
export const CHILD_NAMES = true;

export const NODE = {
  tree:  { label: 'Árvore', res: 'wood',  yield: 3, work: 6,  blocks: false },
  stone: { label: 'Afloramento de pedra', res: 'stone', yield: 5, work: 11, blocks: true },
  iron:  { label: 'Veio de ferro', res: 'iron', yield: 4, work: 14, blocks: true },
};

export const BUILDINGS = {
  depot: { name: 'Depósito', w: 3, h: 3, cost: { wood: 12 }, work: 20, builders: 3, capacity: 150, stores: 'material',
    about: 'Guarda madeira, pedra e ferro. Cada unidade ocupa espaço.' },
  house: { name: 'Casa de madeira', w: 2, h: 2, cost: { wood: 16, stone: 4 }, work: 40, builders: 3, residents: 5,
    about: 'Abriga uma família. Os moradores voltam para casa à noite e comem da despensa.' },
  barn: { name: 'Celeiro', w: 3, h: 3, cost: { wood: 18, stone: 6 }, work: 25, builders: 3, capacity: 200, stores: 'food',
    about: 'Guarda alimentos. As famílias vêm buscar comida aqui.' },
  gatherer: { name: 'Cabana de coleta', w: 2, h: 2, cost: { wood: 10 }, work: 18, builders: 2, workers: 2,
    about: 'Coletores buscam frutas e cogumelos nas matas em volta. Rende mais com floresta perto.' },
};

export const DIFFICULTY = {
  facil:   { label: 'Fácil',   start: { wood: 80, stone: 30, iron: 0, potato: 130, beans: 60 } },
  normal:  { label: 'Normal',  start: { wood: 50, stone: 15, iron: 0, potato: 100, beans: 40 } },
  dificil: { label: 'Difícil', start: { wood: 28, stone: 8,  iron: 0, potato: 50, beans: 20 } },
};
export const MAP_SIZES = { pequeno: 64, medio: 96, grande: 128 };

export const FAMILIES = ['Alvarenga', 'Bastos', 'Coutinho', 'Drummond', 'Esteves', 'Figueira', 'Galvão', 'Horta'];
export const MALE = ['Afonso', 'Bento', 'Caetano', 'Diogo', 'Estêvão', 'Fernão', 'Gaspar', 'Henrique', 'Inácio', 'Jorge', 'Lourenço', 'Martim', 'Nuno', 'Paio', 'Rodrigo', 'Simão', 'Tomé', 'Vasco'];
export const FEMALE = ['Aldonça', 'Beatriz', 'Catarina', 'Dulce', 'Elvira', 'Filipa', 'Guiomar', 'Helena', 'Inês', 'Joana', 'Leonor', 'Mécia', 'Oriana', 'Petronilha', 'Sancha', 'Teresa', 'Urraca', 'Violante'];
