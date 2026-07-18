export const SIZE = 8;

export const FLEET = [
  { id: 'estacao', name: 'Estação Espacial', emoji: '🛰️', size: 4 },
  { id: 'nave', name: 'Nave de Resgate', emoji: '🚀', size: 3 },
  { id: 'modulo', name: 'Módulo Lunar', emoji: '🛸', size: 2 },
  { id: 'dupla', name: 'Dupla em Caminhada', emoji: '🧑‍🚀', size: 2 },
  { id: 'perdido', name: 'Astronauta Perdido', emoji: '👨‍🚀', size: 1 },
];

// Modos de jogo (id + ícone). Fonte única para menus e telas de batalha.
export const GAME_MODES = [
  { id: 'classico', icon: '🎯' },
  { id: 'ascensao', icon: '⚡' },
  { id: 'instabilidade', icon: '🌀' },
  { id: 'duelo', icon: '🏅' },
];

// Mapa id → ícone derivado de GAME_MODES.
export const MODE_ICONS = Object.fromEntries(GAME_MODES.map((m) => [m.id, m.icon]));

// Mapas selecionáveis (formato/tamanho do tabuleiro). `implemented: false` fica
// visível no menu como "em breve" — só entra na lista de fato jogável quando a
// mecânica correspondente for implementada. Ver docs/mapas-add.md.
export const MAPS = [
  { id: 'classico', icon: '🗺️', size: SIZE, implemented: true },
  { id: 'planetas', icon: '🪐', size: 6, implemented: true },
  { id: 'girando', icon: '🌌', size: SIZE, implemented: true },
  { id: 'triangular', icon: '🔺', size: SIZE, implemented: false },
  { id: 'pegadinha', icon: '🎭', size: SIZE, implemented: false },
  { id: 'gravidadeZero', icon: '🌠', size: SIZE, implemented: false },
  { id: 'buracoNegro', icon: '🕳️', size: 10, implemented: false },
];

// Planetas selecionáveis quando MAPS 'planetas' é escolhido — cada um define
// só o visual de fundo do tabuleiro (cor + emoji), sem mudar a mecânica.
export const PLANETS = [
  { id: 'mercurio', name: 'Mercúrio', emoji: '🪨', color: '#9c8b7a' },
  { id: 'venus', name: 'Vênus', emoji: '🌕', color: '#d9a441' },
  { id: 'marte', name: 'Marte', emoji: '🔴', color: '#c1440e' },
  { id: 'jupiter', name: 'Júpiter', emoji: '🟠', color: '#c9975b' },
  { id: 'saturno', name: 'Saturno', emoji: '🪐', color: '#d9c18a' },
  { id: 'netuno', name: 'Netuno', emoji: '🔵', color: '#3d5adf' },
];

export const DEFAULT_PLANET_ID = 'marte';

// Temas visuais/mecânicos selecionáveis. Mesmo esquema `implemented` dos mapas.
export const THEMES = [
  { id: 'padrao', icon: '⭐', implemented: true },
  { id: 'fogo', icon: '🔥', implemented: false },
  { id: 'gelo', icon: '❄️', implemented: false },
];

export const DEFAULT_MAP_ID = 'classico';
export const DEFAULT_THEME_ID = 'padrao';

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Sorteia uma configuração completa de partida para o Modo Void: escolhe um
// modo de jogo, um mapa e um tema totalmente ao acaso (só entre os que já
// `implemented: true` — os "em breve" nunca são sorteados) e, se o mapa
// sorteado for 'planetas', também sorteia o planeta. Ver docs/void.md.
export function drawVoidConfig() {
  const gameMode = pickRandom(GAME_MODES).id;
  const map = pickRandom(MAPS.filter((m) => m.implemented));
  const theme = pickRandom(THEMES.filter((th) => th.implemented));
  const planetId = map.id === 'planetas' ? pickRandom(PLANETS).id : null;
  return { gameMode, mapId: map.id, themeId: theme.id, planetId };
}

// Sorteia só o modo de jogo — usado pelo Void no fluxo Online, que ainda não
// sincroniza mapa/tema entre os jogadores (ver docs/mudancas.md).
export function drawVoidGameMode() {
  return pickRandom(GAME_MODES).id;
}

export const RADAR_COST = 3;
export const PLASMA_COST = 5;
export const ENERGY_PER_TURN = 1;
export const TURN_SECONDS = 30;
