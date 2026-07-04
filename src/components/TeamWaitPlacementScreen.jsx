import { useT } from '../i18n/index.jsx';

// Aguardando os demais jogadores terminarem de posicionar (stage 'waitPlacement').
export default function TeamWaitPlacementScreen({ readyCount }) {
  const t = useT();
  return (
    <div className="screen pass fade-in">
      <div className="pass-icon">🧑‍🚀</div>
      <h2>{t('team.teamHidden')}</h2>
      <p className="waiting-dots">{t('team.waitOthers', { n: readyCount })}</p>
    </div>
  );
}
