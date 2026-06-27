import { useState, useEffect } from 'react';
import { toggleMute } from './game/sound.js';
import LocalGame from './components/LocalGame.jsx';
import OnlineGame from './components/OnlineGame.jsx';
import TeamGame from './components/TeamGame.jsx';
import ModeMenu from './components/ModeMenu.jsx';
import GameModeMenu from './components/GameModeMenu.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

export default function App() {
  const [mode, setMode] = useState(null);     // null | 'local' | 'online'
  const [gameMode, setGameMode] = useState(null); // null | 'classico' | 'ascensao'
  const [isMuted, setIsMuted] = useState(false);

  function goToMenu() {
    setMode(null);
    setGameMode(null);
  }

  useEffect(() => {
    if (location.protocol !== 'capacitor:') return;
    let cleanup;
    import('@capacitor/app').then(({ App: CapApp }) => {
      const handle = CapApp.addListener('backButton', ({ canGoBack }) => {
        if (mode === null) {
          CapApp.exitApp();
        } else {
          goToMenu();
        }
      });
      cleanup = () => handle.then((h) => h.remove());
    });
    return () => cleanup?.();
  }, [mode]);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo">🚀 Resgate Espacial</h1>
        <div className="topbar-actions">
          {mode && (
            <button className="mute-btn" onClick={goToMenu}>
              ← Menu
            </button>
          )}
          <button
            className="mute-btn"
            onClick={() => setIsMuted(toggleMute())}
            title="Som"
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

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
