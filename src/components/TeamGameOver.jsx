import { useT } from '../i18n/index.jsx';

// Fim de partida do TeamGame (stage 'gameover' — 2v2), com estatísticas por time.
export default function TeamGameOver({
  won,
  winName,
  myStats,
  oppStats,
  myVoted,
  voteCount,
  onRestart,
  onExit,
}) {
  const t = useT();
  return (
    <div className="screen gameover fade-in">
      <div className="trophy">{won ? '🏆' : '💫'}</div>
      <h2><span className="highlight">{winName}</span> {t('team.wonBattle')}</h2>
      <div className="stats">
        <div className="stat-card">
          <div className="stat-name">{t('team.yourTeam')}</div>
          <div>{t('team.shots', { n: myStats.shots })}</div>
          <div>{t('team.hits', { n: myStats.hits })}</div>
          <div>📊 {myStats.shots > 0 ? Math.round((myStats.hits / myStats.shots) * 100) : 0}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-name">{t('team.enemyTeam')}</div>
          <div>{t('team.shots', { n: oppStats.shots })}</div>
          <div>{t('team.hits', { n: oppStats.hits })}</div>
          <div>📊 {oppStats.shots > 0 ? Math.round((oppStats.hits / oppStats.shots) * 100) : 0}%</div>
        </div>
      </div>
      {!myVoted ? (
        <button className="big-btn" onClick={onRestart}>{t('team.playAgain')}</button>
      ) : (
        <p className="waiting-dots rematch-note">
          {t('team.waitAllAccept', { n: voteCount })}
        </p>
      )}
      <button className="small-btn" onClick={onExit}>{t('nav.backToMenu')}</button>
    </div>
  );
}
