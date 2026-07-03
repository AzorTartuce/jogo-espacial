import { SIZE, FLEET } from '../game/constants.js';

const FLEET_MAP = Object.fromEntries(FLEET.map((p) => [p.id, p]));

// Mini-tabuleiro compartilhado (visão resumida, sem interação) usado em
// TeamGame (telas de espera/defesa) e TeamBattleScreen (rodapé com aliado).
export default function MiniBoard({ board, label, flash = [] }) {
  if (!board) return null;
  const flashSet = flash instanceof Set ? flash : new Set(flash);
  return (
    <div className="own-side">
      <div className="own-title">{label}</div>
      <div className="grid own-grid" style={{ '--size': SIZE }}>
        {board.map((cell, i) => {
          const piece = cell.pieceId ? FLEET_MAP[cell.pieceId] : null;
          const justHit = flashSet.has(i);
          let cls = 'mini-cell';
          let content = '';
          if (piece && cell.shot) { cls += ` mini-hit${justHit ? ' pop' : ''}`; content = '💥'; }
          else if (piece)          { cls += ' mini-piece'; content = piece.emoji; }
          else if (cell.shot)      cls += ' mini-miss';
          return <div key={i} className={cls}>{content}</div>;
        })}
      </div>
    </div>
  );
}
