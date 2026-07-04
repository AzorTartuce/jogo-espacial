import { useT } from '../i18n/index.jsx';
import MiniBoard from './MiniBoard.jsx';
import EventBanner from './EventBanner.jsx';

// Time inimigo está atacando (stage 'defend' do TeamGame — 2v2).
export default function TeamDefendScreen({
  activeEvent,
  onEventDone,
  attackerTeamName,
  attackerName,
  defendMsg,
  myName,
  myBoard,
  defendFlash,
  allyName,
  allyBoard,
  allyFlash,
}) {
  const t = useT();
  return (
    <div className="screen battle fade-in">
      {activeEvent && (
        <EventBanner event={activeEvent} onDone={onEventDone} />
      )}
      <h2>{attackerTeamName} — <span className="highlight">{attackerName}</span> {t('team.attackerAttacks')}</h2>
      <div className="message">{defendMsg || t('team.holdFirm')}</div>
      <div className="team-mini-boards">
        <MiniBoard board={myBoard} label={`${myName} (${t('team.you')})`}  flash={defendFlash} />
        <MiniBoard board={allyBoard} label={`${allyName} (${t('team.partner')})`} flash={allyFlash} />
      </div>
      <p className="waiting-dots">{t('team.waitEnemyAttack')}</p>
    </div>
  );
}
