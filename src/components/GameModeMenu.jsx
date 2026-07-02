import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

const MODES = [
  { id: 'classico', icon: '🎯' },
  { id: 'ascensao', icon: '⚡' },
  { id: 'instabilidade', icon: '🌀' },
  { id: 'duelo', icon: '🏅' },
];

export default function GameModeMenu({ onSelect }) {
  const t = useT();
  function pick(id) {
    sfx.click();
    onSelect(id);
  }

  return (
    <div className="screen menu fade-in">
      <h2>{t('gameMode.heading')}</h2>
      <div className="mode-buttons mode-grid">
        {MODES.map((m) => (
          <button key={m.id} className="mode-card" onClick={() => pick(m.id)}>
            <span className="mode-icon">{m.icon}</span>
            <span className="mode-title">{t(`gameMode.${m.id}.title`)}</span>
            <span className="mode-desc">{t(`gameMode.${m.id}.desc`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
