import { useT } from '../i18n/index.jsx';
import MiniBoard from './MiniBoard.jsx';
import EventBanner from './EventBanner.jsx';

// Aliado está atacando (stage 'allyAttacking').
export default function AllyAttackingScreen({
  activeEvent,
  onEventDone,
  allyName,
  allyMsg,
  myName,
  myBoard,
  allyBoard,
  allyFlash,
}) {
  const t = useT();
  return (
    <div className="screen battle fade-in">
      {activeEvent && (
        <EventBanner event={activeEvent} onDone={onEventDone} />
      )}
      <h2><span className="highlight">{allyName}</span> {t('team.allyAttacking')}</h2>
      <div className="message">{allyMsg || t('team.partnerAttacking')}</div>
      <div className="team-mini-boards">
        <MiniBoard board={myBoard} label={`${myName} (${t('team.you')})`}   flash={allyFlash} />
        <MiniBoard board={allyBoard} label={`${allyName} (${t('team.partner')})`}  flash={[]} />
      </div>
      <p className="waiting-dots">{t('team.waitPartnerAttack')}</p>
    </div>
  );
}
