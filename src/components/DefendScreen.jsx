import { useState, useEffect } from 'react';
import { SIZE, FLEET } from '../game/constants.js';
import { useT } from '../i18n/index.jsx';

// Tela de quem está esperando: vê o próprio setor sendo atacado em tempo real
export default function DefendScreen({ oppName, ownBoard, message, flash }) {
  const t = useT();
  const [shake, setShake] = useState(false);
  const flashSet = new Set(flash);

  useEffect(() => {
    if (flash.length === 0) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 400);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className={`screen battle fade-in ${shake ? 'shake' : ''}`}>
      <h2>
        <span className="highlight">{oppName}</span> {t('defend.searching')}
      </h2>
      <div className="message">{message}</div>

      <div className="grid target-grid" style={{ '--size': SIZE }}>
        {ownBoard.map((cell, i) => {
          const piece = cell.pieceId
            ? FLEET.find((p) => p.id === cell.pieceId)
            : null;
          const justHit = flashSet.has(i);
          let cls = 'cell cell-fog defend-cell';
          let content = '';
          if (piece && cell.shot) {
            cls = `cell cell-hit defend-cell ${justHit ? 'pop' : ''}`;
            content = '💥';
          } else if (piece) {
            cls = 'cell cell-piece defend-cell';
            content = piece.emoji;
          } else if (cell.shot) {
            cls = `cell cell-miss defend-cell ${justHit ? 'pop' : ''}`;
            content = '✦';
          }
          return (
            <div key={i} className={cls}>
              {content}
            </div>
          );
        })}
      </div>

      <p className="waiting-dots">{t('defend.waiting')}</p>
    </div>
  );
}
