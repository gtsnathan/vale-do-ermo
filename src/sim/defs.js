// Dados do jogo. Nenhum módulo em src/sim toca em DOM ou Phaser.
export const T = { GRASS: 0, FERTILE: 1, FORD: 2, WATER: 3, MOUNTAIN: 4 };
export const MATERIALS = ['wood', 'stone', 'iron', 'firewood', 'tools', 'coat', 'hide', 'herbs'];
export const TOP_RES = ['wood', 'stone', 'iron', 'firewood'];
export const FOODS = ['potato', 'wheat', 'corn', 'pumpkin', 'beans', 'cabbage', 'berries', 'mushroom', 'fish', 'meat', 'apple', 'pear'];
export const RES = [...MATERIALS, ...FOODS];
export const isFood = r => FOODS.includes(r);
export const RES_LABEL = {
  wood: 'Madeira', stone: 'Pedra', iron: 'Ferro', potato: 'Batata', wheat: 'Trigo', corn: 'Milho',
  pumpkin: 'Abóbora', beans: 'Feijão', cabbage: 'Repolho', berries: 'Frutas silvestres', mushroom: 'Cogumelos', fish: 'Peixe', meat: 'Carne', apple: 'Maçã', pear: 'Pera',
  firewood: 'Lenha', tools: 'Ferramentas', coat: 'Roupas de inverno', hide: 'Couro e lã', herbs: 'Ervas',
};

export const STEP = 0.05;          // segundos de simulação por passo
export const DAY = 240;            // segundos de simulação por dia
export const NIGHT_START = 0.917;  // 22h
export const NIGHT_END = 0.208;    // 5h
export const WALK = 1.7;           // tiles por segundo
export const CARRY = { wood: 4, stone: 3, iron: 3, potato: 6, wheat: 6, corn: 6, pumpkin: 6, beans: 6, cabbage: 6, berries: 6, mushroom: 6, fish: 6, meat: 6, apple: 6, pear: 6, firewood: 6, tools: 2, coat: 2, hide: 4, herbs: 4 };
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
  apple:   { grow: DAY * 3.5, yield: 4, tree: true },
  pear:    { grow: DAY * 3.5, yield: 4, tree: true },
};
export const FIELD_CROPS = ['potato', 'wheat', 'corn', 'pumpkin', 'beans', 'cabbage'];
export const ORCHARD_CROPS = ['apple', 'pear'];
export const FARM_MIN = 3, FARM_MAX = 8;
export const FORAGE_RADIUS = 14;
export const PROFESSIONS = { laborer: 'Trabalhador geral', builder: 'Construtor', farmer: 'Agricultor', gatherer: 'Coletor',
  woodcutter: 'Lenhador', forester: 'Silvicultor', fisher: 'Pescador', hunter: 'Caçador', herder: 'Pastor', herbalist: 'Herbalista',
  miner: 'Mineiro', smith: 'Ferreiro', tailor: 'Alfaiate', teacher: 'Professor', doctor: 'Médico', vendor: 'Vendedor', trader: 'Comerciante' };
export const PROF_NOTE = { laborer: 'Corta, minera e faz todo o transporte', builder: 'Só eles erguem obras', farmer: 'Fazendas e pomares', gatherer: 'Cabana de coleta',
  woodcutter: 'Só corta lenha, não carrega', forester: 'Planta e corta árvores', fisher: 'Cabana de pesca', hunter: 'Carne e couro', herder: 'Lã e carne da pastagem', herbalist: 'Colhe ervas',
  miner: 'Pedreira e mina', smith: 'Faz ferramentas', tailor: 'Faz roupas', teacher: 'Dá aula na escola', doctor: 'Trata doentes', vendor: 'Abastece o mercado', trader: 'Leva mercadoria ao posto' };
export const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'];
export const SEASON_LEN = DAY * 1.5;
export const SEASON_TEMP = [12, 24, 9, -8];
export const TOOL_LIFE = DAY * 18, COAT_LIFE = DAY * 12;
export const WELL_RANGE = 16;
export const VALUE = { wood: 2, stone: 2, iron: 6, firewood: 1, tools: 12, coat: 12, hide: 3, herbs: 3, potato: 1, wheat: 1, corn: 1, pumpkin: 2, beans: 1, cabbage: 1, berries: 1, mushroom: 1, fish: 2, meat: 3, apple: 2, pear: 2 };

export const YEAR_DAYS = 6;                 // um ano tem 6 dias de jogo
export const YEAR = DAY * YEAR_DAYS;
export const ADULT_AGE = 12;                // criança não trabalha; a partir daqui, sim
export const MARRY_AGE = 16;
export const GROW_SPEED = 6;                // até os 16 anos, a idade passa 6 vezes mais rápido
export const FERTILE_MAX = 45;
export const PREGNANCY = DAY * 3;
export const BIRTH_REST = DAY * 3;
export const OLD_AGE = 55;                  // a partir daqui o risco de morrer de velhice cresce
export const CHILD_NAMES = true;

export const LEVEL_MAX = 3;
export const TECH = {
  depot: ['Pátio cercado', 'Galpão coberto', 'Armazém de pedra'], barn: ['Celeiro simples', 'Silos ventilados', 'Celeiro de pedra'], market: ['Barracas', 'Feira coberta', 'Mercado de pedra'],
  house: ['Cabana', 'Casa ampliada', 'Casa com lareira de pedra'], stonehouse: ['Casa de pedra', 'Sobrado', 'Casarão'],
  farm: ['Enxada', 'Arado de ferro', 'Rotação de culturas'], orchard: ['Árvores novas', 'Poda', 'Enxertia'], pasture: ['Cerca simples', 'Tosquia', 'Seleção do rebanho'],
  woodcutter: ['Machado', 'Serra de dois homens', 'Serra hidráulica'], forester: ['Mudas', 'Viveiro', 'Manejo da mata'], fisher: ['Linha', 'Redes', 'Barco de pesca'], hunter: ['Lanças', 'Arcos', 'Armadilhas'],
  gatherer: ['Cestos', 'Trilhas de coleta', 'Conhecimento da mata'], herbalist: ['Colheita', 'Secagem', 'Herbário'], smith: ['Forja', 'Fole', 'Martelo hidráulico'], tailor: ['Agulha', 'Tear', 'Tear de pedal'],
  quarry: ['Picaretas', 'Guindaste', 'Pólvora de pedreira'], mine: ['Picaretas', 'Escoras', 'Bomba de água'], school: ['Lousa', 'Livros', 'Biblioteca'], hospital: ['Ervas', 'Enfermaria', 'Medicina'],
  townhall: ['Registros', 'Censo', 'Administração'], chapel: ['Capela', 'Igreja', 'Sino novo'], cemetery: ['Cerca', 'Ampliado', 'Jazigos'], well: ['Balde', 'Roldana', 'Bomba manual'], trading: ['Trapiche', 'Cais', 'Porto'],
};
export const TRAIL_WEAR = 30, ROAD_WEAR = 130;  // passos para virar trilha e depois estrada
export const FARM_COST = { wood: 8, stone: 4 };

export const NODE = {
  tree:  { label: 'Árvore', res: 'wood',  yield: 3, work: 6,  blocks: false },
  stone: { label: 'Afloramento de pedra', res: 'stone', yield: 5, work: 11, blocks: true },
  iron:  { label: 'Veio de ferro', res: 'iron', yield: 4, work: 14, blocks: true },
};

export const BUILDINGS = {
  depot: { name: 'Depósito', w: 3, h: 3, cost: { wood: 12 }, work: 20, builders: 3, capacity: 150, stores: 'material', cat: 'Armazém',
    about: 'Guarda madeira, pedra e ferro. Cada unidade ocupa espaço.' },
  house: { name: 'Casa de madeira', w: 2, h: 2, cost: { wood: 16, stone: 4 }, work: 40, builders: 3, residents: 5, cat: 'Moradia',
    about: 'Abriga uma família. Os moradores voltam para casa à noite e comem da despensa.' },
  barn: { name: 'Celeiro', w: 3, h: 3, cost: { wood: 18, stone: 6 }, work: 25, builders: 3, capacity: 200, stores: 'food', cat: 'Armazém',
    about: 'Guarda alimentos. As famílias vêm buscar comida aqui.' },
  gatherer: { name: 'Cabana de coleta', w: 2, h: 2, cost: { wood: 10 }, work: 18, builders: 2, workers: 2,
    about: 'Coletores buscam frutas e cogumelos nas matas em volta. Rende mais com floresta perto.', prof: 'gatherer', cat: 'Alimento' },
  fisher: { name: 'Cabana de pesca', w: 2, h: 2, cost: { wood: 12 }, work: 18, builders: 2, workers: 2, prof: 'fisher', needs: 'water', cat: 'Alimento',
    recipe: { in: {}, out: 'fish', n: 3, t: 16 }, about: 'Pesca o ano todo. Precisa ficar à beira da água.' },
  hunter: { name: 'Cabana de caça', w: 2, h: 2, cost: { wood: 12 }, work: 18, builders: 2, workers: 2, prof: 'hunter', cat: 'Alimento',
    about: 'Caça veados selvagens. Dá carne e couro. Caça demais esgota os animais.' },
  woodcutter: { name: 'Cortador de lenha', w: 2, h: 2, cost: { wood: 12 }, work: 18, builders: 2, workers: 1, prof: 'woodcutter', cat: 'Indústria',
    recipe: { in: { wood: 1 }, out: 'firewood', n: 4, t: 10 }, about: 'Transforma 1 madeira em 4 de lenha. Sem lenha, as casas ficam frias.' },
  forester: { name: 'Posto de silvicultura', w: 2, h: 2, cost: { wood: 14 }, work: 20, builders: 2, workers: 2, prof: 'forester', cat: 'Indústria',
    about: 'Planta mudas e corta árvores adultas em volta. A madeira nunca acaba.' },
  herbalist: { name: 'Herbalista', w: 2, h: 2, cost: { wood: 10 }, work: 16, builders: 2, workers: 1, prof: 'herbalist', cat: 'Serviços',
    about: 'Colhe ervas nas matas. O hospital usa ervas para curar doentes.' },
  smith: { name: 'Ferreiro', w: 2, h: 2, cost: { wood: 20, stone: 10 }, work: 30, builders: 3, workers: 1, prof: 'smith', cat: 'Indústria',
    recipe: { in: { iron: 1, wood: 1 }, out: 'tools', n: 1, t: 28 }, about: 'Faz ferramentas com ferro e madeira. Sem ferramenta o trabalho rende menos.' },
  tailor: { name: 'Alfaiate', w: 2, h: 2, cost: { wood: 16, stone: 4 }, work: 26, builders: 3, workers: 1, prof: 'tailor', cat: 'Indústria',
    recipe: { in: { hide: 2 }, out: 'coat', n: 1, t: 26 }, about: 'Faz roupas de inverno com couro e lã. Quem veste sente menos frio.' },
  quarry: { name: 'Pedreira', w: 3, h: 3, cost: { wood: 16 }, work: 24, builders: 3, workers: 4, prof: 'miner', needs: 'mountain', risky: true, cat: 'Indústria',
    recipe: { in: {}, out: 'stone', n: 3, t: 20 }, about: 'Tira pedra sem parar. Precisa encostar na montanha. O trabalho tem risco.' },
  mine: { name: 'Mina', w: 3, h: 3, cost: { wood: 24, stone: 8 }, work: 30, builders: 3, workers: 4, prof: 'miner', needs: 'mountain', risky: true, cat: 'Indústria',
    recipe: { in: {}, out: 'iron', n: 2, t: 26 }, about: 'Tira ferro sem parar. Precisa encostar na montanha. O trabalho tem risco.' },
  market: { name: 'Mercado', w: 3, h: 3, cost: { wood: 30, stone: 10 }, work: 32, builders: 3, workers: 2, prof: 'vendor', capacity: 300, stores: 'market', cat: 'Armazém',
    about: 'Vendedores trazem de tudo. As famílias buscam aqui e perdem menos tempo.' },
  trading: { name: 'Posto comercial', w: 3, h: 3, cost: { wood: 40, stone: 20 }, work: 40, builders: 3, workers: 2, prof: 'trader', capacity: 120, stores: 'trade', needs: 'water', cat: 'Serviços',
    about: 'Mercadores chegam de barco. Escolha o que levar ao posto e troque por outras mercadorias.' },
  school: { name: 'Escola', w: 3, h: 3, cost: { wood: 30, stone: 12 }, work: 34, builders: 3, workers: 1, prof: 'teacher', seats: 20, cat: 'Serviços',
    about: 'Jovens de 12 a 16 anos estudam em vez de trabalhar. Quem estudou trabalha melhor.' },
  hospital: { name: 'Hospital', w: 3, h: 3, cost: { wood: 30, stone: 16 }, work: 36, builders: 3, workers: 1, prof: 'doctor', keep: { herbs: 8 }, cat: 'Serviços',
    about: 'O médico cura doentes usando ervas. Reduz as mortes em epidemias.' },
  townhall: { name: 'Prefeitura', w: 3, h: 3, cost: { wood: 40, stone: 24 }, work: 40, builders: 3, cat: 'Serviços',
    about: 'Libera os relatórios de produção e consumo em Gestão.' },
  chapel: { name: 'Capela', w: 3, h: 3, cost: { wood: 30, stone: 24 }, work: 36, builders: 3, faith: 60, cat: 'Serviços',
    about: 'Atende até 60 pessoas e deixa a vila mais feliz.' },
  cemetery: { name: 'Cemitério', w: 3, h: 3, cost: { wood: 6 }, work: 10, builders: 2, graves: 12, cat: 'Serviços',
    about: 'Cabem 12 sepulturas. Mortos sem sepultura entristecem a vila.' },
  well: { name: 'Poço', w: 2, h: 2, cost: { stone: 8 }, work: 12, builders: 2, cat: 'Serviços',
    about: 'Apaga incêndios próximos antes que destruam as construções.' },
  stonehouse: { name: 'Casa de pedra', w: 2, h: 2, cost: { wood: 12, stone: 24 }, work: 60, builders: 3, residents: 5, warm: true, cat: 'Moradia',
    about: 'Gasta metade da lenha e aquece mais rápido. Moradores comem da despensa.' },
};

export const DIFFICULTY = {
  facil:   { label: 'Fácil',   start: { wood: 80, stone: 30, iron: 0, firewood: 18, tools: 6, coat: 6, potato: 130, beans: 60 } },
  normal:  { label: 'Normal',  start: { wood: 50, stone: 15, iron: 0, firewood: 14, tools: 4, coat: 4, potato: 100, beans: 40 } },
  dificil: { label: 'Difícil', start: { wood: 28, stone: 8,  iron: 0, firewood: 8, tools: 2, coat: 2, potato: 50, beans: 20 } },
};
export const MAP_SIZES = { pequeno: 64, medio: 96, grande: 128 };

export const FAMILIES = ['Alvarenga', 'Bastos', 'Coutinho', 'Drummond', 'Esteves', 'Figueira', 'Galvão', 'Horta'];
export const MALE = ['Afonso', 'Bento', 'Caetano', 'Diogo', 'Estêvão', 'Fernão', 'Gaspar', 'Henrique', 'Inácio', 'Jorge', 'Lourenço', 'Martim', 'Nuno', 'Paio', 'Rodrigo', 'Simão', 'Tomé', 'Vasco'];
export const FEMALE = ['Aldonça', 'Beatriz', 'Catarina', 'Dulce', 'Elvira', 'Filipa', 'Guiomar', 'Helena', 'Inês', 'Joana', 'Leonor', 'Mécia', 'Oriana', 'Petronilha', 'Sancha', 'Teresa', 'Urraca', 'Violante'];
