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

export const RADAR_COST = 3;
export const PLASMA_COST = 5;
export const ENERGY_PER_TURN = 1;
export const TURN_SECONDS = 30;
