import { useEffect } from 'react';
import { useT } from '../i18n/index.jsx';

export default function EventBanner({ event, onDone }) {
  const t = useT();
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  // valence indica se o evento ajuda ('good') ou atrapalha ('bad') o jogador.
  const valence = event.valence || 'neutral';

  return (
    <div className={`event-banner event-${valence}`}>
      <span className="event-icon">{event.icon}</span>
      <div className="event-info">
        <div className="event-name">
          {t(`event.${event.id}.name`)}
          <span className="event-badge">
            {valence === 'good' ? t('event.badge.good') : t('event.badge.bad')}
          </span>
        </div>
        <div className="event-desc">{t(`event.${event.id}.desc`)}</div>
      </div>
    </div>
  );
}
