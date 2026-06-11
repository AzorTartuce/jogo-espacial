import { sfx } from '../game/sound.js';

export default function GameOver({ winnerName, stats, names, onRestart }) {
  return (
    <div className="screen gameover fade-in">
      <div className="trophy">🏆</div>
      <h2>
        <span className="highlight">{winnerName}</span> resgatou toda a equipe!
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
              <div>🎯 {stats[i].shots} disparos</div>
              <div>💥 {stats[i].hits} acertos</div>
              <div>📊 {acc}% de precisão</div>
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
        🔄 Jogar de novo
      </button>
    </div>
  );
}
