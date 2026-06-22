import { useEffect } from 'react';

export default function EventBanner({ event, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="event-banner">
      <span className="event-icon">{event.icon}</span>
      <div className="event-info">
        <div className="event-name">{event.name}</div>
        <div className="event-desc">{event.desc}</div>
      </div>
    </div>
  );
}
