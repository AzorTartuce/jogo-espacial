export const UPGRADE_POOL = [
  {
    id: 'timer_boost',
    icon: '⏱️',
    name: 'Acelerador de Resposta',
    desc: '+10 segundos em cada turno seu',
  },
  {
    id: 'radar_xl',
    icon: '📡',
    name: 'Radar Aprimorado',
    desc: 'Radar revela área 4×4 em vez de 3×3',
  },
  {
    id: 'plasma_cheap',
    icon: '☄️',
    name: 'Plasma Econômico',
    desc: 'Plasma custa 3⚡ em vez de 5⚡',
  },
  {
    id: 'radar_free',
    icon: '🎁',
    name: 'Varredura Bônus',
    desc: 'Próximo uso do Radar é gratuito (uso único)',
  },
  {
    id: 'anomaly_sensor',
    icon: '🔭',
    name: 'Sensor de Anomalia',
    desc: 'Ao errar um tiro, uma célula adjacente é revelada',
  },
  {
    id: 'energy_bonus',
    icon: '⚡',
    name: 'Pulso de Energia',
    desc: 'Receba +3 energia agora mesmo',
  },
];

export function getUpgradeChoices(pickedIds, count = 3) {
  const available = UPGRADE_POOL.filter((u) => !pickedIds.includes(u.id));
  // Fisher-Yates: embaralhamento uniforme (o `available` já é uma cópia nova).
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, Math.min(count, available.length));
}

// Regra única: quando oferecer um upgrade (modo Duelo, a cada 3 turnos jogados,
// enquanto ainda houver upgrades por adquirir). Compartilhada por LocalGame e
// OnlineGame para as duas implementações não divergirem.
export function shouldOfferUpgrade({ gameMode, turnsPlayed, pickedCount }) {
  return (
    gameMode === 'duelo' &&
    turnsPlayed > 0 &&
    turnsPlayed % 3 === 0 &&
    pickedCount < UPGRADE_POOL.length
  );
}
