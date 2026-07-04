import { useT } from '../i18n/index.jsx';

// Tela de busca rápida do OnlineGame (stage 'lobby' com quickMatch=true).
export default function QuickMatchLobby({
  error,
  myName,
  onNameChange,
  gameMode,
  modes,
  modeTitle,
  onSelectMode,
  onFindMatch,
  connecting,
}) {
  const t = useT();
  return (
    <div className="screen menu fade-in">
      <p className="tagline">
        {t('online.quickTagline1')}
        <br />
        {t('online.quickTagline2')}
      </p>

      {error && <div className="error-box">{error}</div>}

      <input
        className="lobby-input"
        placeholder={t('online.yourName')}
        maxLength={14}
        value={myName}
        onChange={(e) => onNameChange(e.target.value)}
      />

      <div className="lobby-panels">
        <div className="lobby-panel">
          <h3>{t('online.chooseMode')}</h3>
          <div className="online-mode-selector">
            {modes.map((m) => (
              <button
                key={m.id}
                className={`online-mode-chip ${gameMode === m.id ? 'active' : ''}`}
                onClick={() => onSelectMode(m.id)}
              >
                {m.icon} {modeTitle(m.id)}
              </button>
            ))}
          </div>
          <p className="online-join-hint">
            {t('online.quickHint')}
          </p>
          <button className="big-btn" onClick={onFindMatch} disabled={connecting}>
            {t('online.searchBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
