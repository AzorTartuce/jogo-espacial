import { useT } from '../i18n/index.jsx';

// Tela de "sala criada, aguardando oponente" do OnlineGame (stage 'hosting').
export default function HostingScreen({ code }) {
  const t = useT();
  return (
    <div className="screen pass fade-in">
      <div className="pass-icon">📡</div>
      <h2>{t('online.roomCreated')}</h2>
      <div className="room-code">{code}</div>
      <p>
        {t('online.shareInstr1')}{' '}
        <span className="highlight">{location.host}</span>{' '}
        {t('online.shareInstr2')}
      </p>
      <p className="waiting-dots">{t('online.waitingOpp')}</p>
    </div>
  );
}
