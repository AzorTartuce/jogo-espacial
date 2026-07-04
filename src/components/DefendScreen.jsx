import { useState, useEffect, useRef } from 'react';
import { SIZE, FLEET } from '../game/constants.js';
import { playEventSound } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';
import EventBanner from './EventBanner.jsx';

// Tela de quem está esperando: vê o próprio setor sendo atacado em tempo real.
// `incomingEvent` (opcional, forma { id, event }): evento de Instabilidade
// sorteado pelo ATACANTE e retransmitido via rede (ver BattleScreen
// `onSendEvent`) — este lado nunca sorteia o seu próprio evento, só reage ao
// mesmo evento que o atacante já viu, pra experiência ser realmente compartilhada.
export default function DefendScreen({ oppName, ownBoard, message, flash, incomingEvent }) {
  const t = useT();
  const [shake, setShake] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  // Mesmo padrão de lastShotId/lastProbeId em BattleScreen: evita reprocessar
  // (reexibir/re-tocar som) o mesmo evento duas vezes.
  const lastEventId = useRef(0);
  const flashSet = new Set(flash);

  useEffect(() => {
    if (flash.length === 0) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 400);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!incomingEvent || incomingEvent.id === lastEventId.current) return;
    lastEventId.current = incomingEvent.id;
    setActiveEvent(incomingEvent.event);
    playEventSound(incomingEvent.event.id);
  }, [incomingEvent]);

  return (
    <div className={`screen battle fade-in ${shake ? 'shake' : ''}`}>
      {activeEvent && (
        <EventBanner event={activeEvent} onDone={() => setActiveEvent(null)} />
      )}
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
