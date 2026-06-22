import { sfx } from '../game/sound.js';

const MODES = [
  {
    id: 'classico',
    icon: '🎯',
    title: 'Clássico',
    desc: 'Sem poderes especiais. Pura habilidade. Cada tiro conta.',
  },
  {
    id: 'ascensao',
    icon: '⚡',
    title: 'Ascensão',
    desc: 'Acumule energia e desbloqueie Radar e Plasma ao longo da partida.',
  },
  {
    id: 'instabilidade',
    icon: '🌀',
    title: 'Instabilidade',
    desc: 'Eventos aleatórios mudam o campo a cada 20 segundos. Adapte-se!',
  },
  {
    id: 'duelo',
    icon: '🏅',
    title: 'Duelo de Escolhas',
    desc: 'A cada 3 turnos escolha um upgrade permanente e monte sua estratégia.',
  },
];

export default function GameModeMenu({ onSelect }) {
  function pick(id) {
    sfx.click();
    onSelect(id);
  }

  return (
    <div className="screen menu fade-in">
      <h2>Escolha o modo de jogo</h2>
      <div className="mode-buttons mode-grid">
        {MODES.map((m) => (
          <button key={m.id} className="mode-card" onClick={() => pick(m.id)}>
            <span className="mode-icon">{m.icon}</span>
            <span className="mode-title">{m.title}</span>
            <span className="mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
