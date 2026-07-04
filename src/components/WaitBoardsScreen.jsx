import { useT } from '../i18n/index.jsx';

// Aguardando o oponente terminar de posicionar a frota (stage 'waitBoards').
export default function WaitBoardsScreen({ oppName }) {
  const t = useT();
  return (
    <div className="screen pass fade-in">
      <div className="pass-icon">🧑‍🚀</div>
      <h2>{t('online.teamHidden')}</h2>
      <p className="waiting-dots">
        {t('online.waitOppHide', { name: oppName || t('online.theOpponent') })}
      </p>
    </div>
  );
}
