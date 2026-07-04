import { useT } from '../i18n/index.jsx';

// Tela de criar/entrar em sala do TeamGame (stage 'lobby').
export default function TeamLobby({
  error,
  myName,
  onNameChange,
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
        <strong>{t('team.lobbyTaglineStrong')}</strong> {t('team.lobbyTagline1')}
        <br />
        {t('team.lobbyTagline2')}
      </p>
      {error && <div className="error-box">{error}</div>}
      <input className="lobby-input" placeholder={t('team.yourName')} maxLength={14}
        value={myName} onChange={(e) => onNameChange(e.target.value)} />
      <div className="lobby-panels">
        <div className="lobby-panel">
          <h3>{t('team.createH')}</h3>
          <p>{t('team.createP')}</p>
          <button className="big-btn" onClick={onCreateRoom} disabled={connecting}>{t('team.createBtn')}</button>
        </div>
        <div className="lobby-panel">
          <h3>{t('team.joinH')}</h3>
          <input className="lobby-input code-input" placeholder={t('team.codePh')} maxLength={4}
            value={codeInput} onChange={(e) => onCodeInputChange(e.target.value.toUpperCase())} />
          <button className="big-btn" onClick={onJoinRoom}
            disabled={connecting || codeInput.trim().length !== 4}>{t('team.joinBtn')}</button>
        </div>
      </div>
    </div>
  );
}
