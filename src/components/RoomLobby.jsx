import { useT } from '../i18n/index.jsx';

// Tela de criar/entrar em sala do OnlineGame (stage 'lobby' sem quickMatch).
export default function RoomLobby({
  error,
  myName,
  onNameChange,
  gameMode,
  modes,
  modeTitle,
  onSelectMode,
  hideModeSelector,
  onCreateRoom,
  onJoinRoom,
  connecting,
  codeInput,
  onCodeInputChange,
}) {
  const t = useT();
  return (
    <div className="screen menu fade-in">
      <p className="tagline">
        {t('online.createTagline1')}
        <br />
        {t('online.createTagline2')}
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
          <h3>{t('online.createRoomH')}</h3>
          <p>{t('online.createRoomP')}</p>
          {hideModeSelector ? (
            <div className="online-mode-preset">
              {modes.find((m) => m.id === gameMode)?.icon} {modeTitle(gameMode)}
            </div>
          ) : (
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
          )}
          <button className="big-btn" onClick={onCreateRoom} disabled={connecting}>
            {t('online.createBtn')}
          </button>
        </div>

        <div className="lobby-panel">
          <h3>{t('online.joinH')}</h3>
          <p className="online-join-hint">{t('online.joinHint')}</p>
          <input
            className="lobby-input code-input"
            placeholder={t('online.codePh')}
            maxLength={4}
            value={codeInput}
            onChange={(e) => onCodeInputChange(e.target.value.toUpperCase())}
          />
          <button
            className="big-btn"
            onClick={onJoinRoom}
            disabled={connecting || codeInput.trim().length !== 4}
          >
            {t('online.joinBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
