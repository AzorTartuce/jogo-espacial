import { useState, useEffect } from 'react';
import { useT } from './i18n/index.jsx';
import LocalGame from './components/LocalGame.jsx';
import OnlineGame from './components/OnlineGame.jsx';
import TeamGame from './components/TeamGame.jsx';
import ModeMenu from './components/ModeMenu.jsx';
import GameModeMenu from './components/GameModeMenu.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';

export default function App() {
  const t = useT();
  const [mode, setMode] = useState(null);     // null | 'local' | 'online'
  const [gameMode, setGameMode] = useState(null); // null | 'classico' | 'ascensao'
  const [showSettings, setShowSettings] = useState(false);

  function goToMenu() {
    setMode(null);
    setGameMode(null);
  }

  useEffect(() => {
    if (location.protocol !== 'capacitor:') return;
    let cleanup;
    import('@capacitor/app').then(({ App: CapApp }) => {
      const handle = CapApp.addListener('backButton', () => {
        if (showSettings) {
          setShowSettings(false);
        } else if (mode === null) {
          CapApp.exitApp();
        } else {
          goToMenu();
        }
      });
      cleanup = () => handle.then((h) => h.remove());
    });
    return () => cleanup?.();
  }, [mode, showSettings]);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo">{t('app.title')}</h1>
        <div className="topbar-actions">
          {mode && (
            <button className="mute-btn" onClick={goToMenu}>
              {t('nav.menu')}
            </button>
          )}
          <button
            className="mute-btn"
            onClick={() => setShowSettings(true)}
            title={t('settings.title')}
            aria-label={t('settings.title')}
          >
            ⚙️
          </button>
        </div>
      </header>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <ErrorBoundary onReset={goToMenu}>
        {mode === null && <ModeMenu onSelect={setMode} />}
        {mode === 'local' && gameMode === null && <GameModeMenu onSelect={setGameMode} />}
        {mode === 'local' && gameMode && <LocalGame gameMode={gameMode} onChangeMode={() => setGameMode(null)} />}
        {mode === 'online' && <OnlineGame onExit={goToMenu} />}
        {mode === 'quickmatch' && <OnlineGame onExit={goToMenu} quickMatch />}
        {mode === 'team' && <TeamGame onExit={goToMenu} />}
      </ErrorBoundary>
    </div>
  );
}
