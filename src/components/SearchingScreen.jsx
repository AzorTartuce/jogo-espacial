import { useT } from '../i18n/index.jsx';

// Tela de busca rápida em andamento do OnlineGame (stage 'searching').
export default function SearchingScreen({ onCancelSearch }) {
  const t = useT();
  return (
    <div className="screen pass fade-in">
      <div className="pass-icon">🛰️</div>
      <h2>{t('online.searchingH')}</h2>
      <p className="waiting-dots">{t('online.searchingP')}</p>
      <button className="small-btn" onClick={onCancelSearch}>
        {t('online.cancelSearch')}
      </button>
    </div>
  );
}
