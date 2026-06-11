import { useState } from 'react';
import { toggleMute } from './game/sound.js';
import LocalGame from './components/LocalGame.jsx';
import OnlineGame from './components/OnlineGame.jsx';
import ModeMenu from './components/ModeMenu.jsx';

export default function App() {
  const [mode, setMode] = useState(null); // null | 'local' | 'online'
  const [isMuted, setIsMuted] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="logo">🚀 Resgate Espacial</h1>
        <div className="topbar-actions">
          {mode && (
            <button className="mute-btn" onClick={() => setMode(null)}>
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

      {mode === null && <ModeMenu onSelect={setMode} />}
      {mode === 'local' && <LocalGame />}
      {mode === 'online' && <OnlineGame onExit={() => setMode(null)} />}
    </div>
  );
}
