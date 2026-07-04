import { useT } from '../i18n/index.jsx';

// Sala aguardando os 4 jogadores entrarem (stage 'waiting').
export default function TeamWaitingRoom({ code, players, teamNames }) {
  const t = useT();
  return (
    <div className="screen pass fade-in">
      <div className="pass-icon">👥</div>
      <h2>{t('team.roomCreatedCode')} <span className="highlight">{code}</span></h2>
      <p>{t('team.shareSeq')}</p>
      <div className="team-waiting-grid">
        {[0, 1].map((team) => (
          <div key={team} className="team-waiting-panel">
            <div className={`team-label-${team === 0 ? 'a' : 'b'}`}>{teamNames[team]}</div>
            {[0, 1].map((slot) => {
              const pi = team * 2 + slot;
              const filled = !!players[pi];
              return (
                <div key={pi} className={`team-slot ${filled ? 'team-slot-filled' : ''}`}>
                  {filled ? `✓ ${players[pi]}` : t('team.waitingSlot', { n: slot + 1 })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="waiting-dots">{t('team.waiting4')}</p>
    </div>
  );
}
