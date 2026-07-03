import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

// Cores do confete de vitória (mesma paleta do tema).
const CONFETTI_COLORS = ['#4de8ff', '#b16dff', '#5dffa8', '#ffd75e', '#ff5e5e'];
const CONFETTI = Array.from({ length: 28 });

export default function GameOver({ winnerName, stats, names, onRestart, didWin = true }) {
  const t = useT();
  return (
    <div className={`screen gameover fade-in ${didWin ? 'gameover-win' : 'gameover-lose'}`}>
      {didWin && (
        <div className="confetti" aria-hidden="true">
          {CONFETTI.map((_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${(i / CONFETTI.length) * 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 7) * 0.22}s`,
                animationDuration: `${2.6 + (i % 5) * 0.4}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className={`trophy ${didWin ? 'trophy-win' : ''}`}>{didWin ? '🏆' : '🎖️'}</div>
      <h2>
        <span className={`highlight ${didWin ? 'winner-glow' : ''}`}>{winnerName}</span>{' '}
        {t('gameover.rescued')}
      </h2>

      <div className="stats">
        {names.map((n, i) => {
          const acc =
            stats[i].shots > 0
              ? Math.round((stats[i].hits / stats[i].shots) * 100)
              : 0;
          return (
            <div key={i} className="stat-card">
              <div className="stat-name">{n}</div>
              <div>{t('gameover.shots', { n: stats[i].shots })}</div>
              <div>{t('gameover.hits', { n: stats[i].hits })}</div>
              <div>{t('gameover.accuracy', { n: acc })}</div>
            </div>
          );
        })}
      </div>

      <button
        className="big-btn"
        onClick={() => {
          sfx.click();
          onRestart();
        }}
      >
        {t('gameover.playAgain')}
      </button>
    </div>
  );
}
