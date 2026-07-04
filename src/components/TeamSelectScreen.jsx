import { useT } from '../i18n/index.jsx';

// Escolha de time antes do posicionamento (stage 'teamSelect').
export default function TeamSelectScreen({ myIndex, players, teamChoices, teamNames, onPickTeam }) {
  const t = useT();
  const choices  = teamChoices;
  const myChoice = choices[myIndex];
  const countA   = Object.values(choices).filter((v) => v === 0).length;
  const countB   = Object.values(choices).filter((v) => v === 1).length;
  const allReady = countA === 2 && countB === 2;
  // Corrida de escolha de time (problema 1): sem árbitro no servidor, dois
  // jogadores podem ter escolhido o mesmo time ao mesmo tempo vendo estado
  // desatualizado um do outro. Se os 4 já escolheram mas não deu 2x2, o jogo
  // ficaria travado em silêncio — avisa e deixa quem puder trocar de time.
  const allPicked  = Object.keys(choices).length === 4;
  const unbalanced = allPicked && !allReady;

  return (
    <div className="screen menu fade-in">
      <h2>{t('team.chooseTeam')}</h2>
      <p className="tagline">{t('team.eachNeeds2')}</p>

      <div className="team-select-layout">
        {[0, 1].map((team) => {
          const label   = teamNames[team];
          const count   = team === 0 ? countA : countB;
          const isMine  = myChoice === team;
          const isFull  = count >= 2 && !isMine;
          const colorKey = team === 0 ? 'a' : 'b';

          return (
            <div key={team} className={`team-select-panel team-select-panel-${colorKey}${isMine ? ' team-select-mine' : ''}`}>
              <div className={`team-label-${colorKey}`}>{label} ({count}/2)</div>

              {players.map((name, pi) =>
                choices[pi] === team ? (
                  <div key={pi} className="team-slot team-slot-filled">
                    {pi === myIndex ? `✓ ${name} (${t('team.you')})` : `✓ ${name}`}
                  </div>
                ) : null
              )}

              {Array.from({ length: 2 - count }).map((_, i) => (
                <div key={i} className="team-slot">{t('team.waitingEllipsis')}</div>
              ))}

              <button
                className="big-btn"
                disabled={isMine || isFull}
                onClick={() => onPickTeam(team)}
                style={isMine ? { opacity: 0.55, cursor: 'default' } : {}}
              >
                {isMine ? t('team.youAreHere') : t('team.joinTeam', { team: label })}
              </button>
            </div>
          );
        })}
      </div>

      {allReady ? (
        <p className="waiting-dots">{t('team.teamsReady')}</p>
      ) : unbalanced ? (
        <p className="error-box">{t('team.unbalanced')}</p>
      ) : (
        <p className="team-select-hint">
          {t('team.chosenCount', { n: Object.keys(choices).length })}
        </p>
      )}
    </div>
  );
}
