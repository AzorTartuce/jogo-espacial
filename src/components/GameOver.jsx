import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

export default function GameOver({ winnerName, stats, names, onRestart }) {
  const t = useT();
  return (
    <div className="screen gameover fade-in">
      <div className="trophy">🏆</div>
      <h2>
        <span className="highlight">{winnerName}</span> {t('gameover.rescued')}
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
