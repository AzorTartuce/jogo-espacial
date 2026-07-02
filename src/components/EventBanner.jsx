import { useEffect } from 'react';
import { useT } from '../i18n/index.jsx';

export default function EventBanner({ event, onDone }) {
  const t = useT();
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="event-banner">
      <span className="event-icon">{event.icon}</span>
      <div className="event-info">
        <div className="event-name">{t(`event.${event.id}.name`)}</div>
        <div className="event-desc">{t(`event.${event.id}.desc`)}</div>
      </div>
    </div>
  );
}
