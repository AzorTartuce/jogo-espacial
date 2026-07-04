import { useT } from '../i18n/index.jsx';

// Convidado aguardando o host definir o modo (stage 'waitMode').
export default function WaitModeScreen() {
  const t = useT();
  return (
    <div className="screen pass fade-in">
      <div className="pass-icon">🛰️</div>
      <h2>{t('online.joinedRoom')}</h2>
      <p className="waiting-dots">{t('online.waitingMode')}</p>
    </div>
  );
}
