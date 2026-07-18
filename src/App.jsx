import { useState, useEffect } from 'react';
import { useT } from './i18n/index.jsx';
import { DEFAULT_MAP_ID, DEFAULT_THEME_ID } from './game/constants.js';
import LocalGame from './components/LocalGame.jsx';
import OnlineGame from './components/OnlineGame.jsx';
import TeamGame from './components/TeamGame.jsx';
import ModeMenu from './components/ModeMenu.jsx';
import PlayOptionsMenu from './components/PlayOptionsMenu.jsx';
import GameModeMenu from './components/GameModeMenu.jsx';
import MapThemeMenu from './components/MapThemeMenu.jsx';
import VoidDrawScreen from './components/VoidDrawScreen.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import HowToPlay from './components/HowToPlay.jsx';

export default function App() {
  const t = useT();
  const [mode, setMode] = useState(null);     // null | 'local' | 'online' | 'team'
  const [gameMode, setGameMode] = useState(null); // null | 'classico' | 'ascensao' | 'instabilidade' | 'duelo' | 'void'
  const [mapTheme, setMapTheme] = useState(null); // null | { mapId, themeId, planetId }
  const [editingMapTheme, setEditingMapTheme] = useState(false);
  // Local: 'Customizar' na folha Clássica/Void/Customizar troca pro fluxo
  // manual de sempre (GameModeMenu → MapThemeMenu) em vez do atalho.
  const [localCustomizing, setLocalCustomizing] = useState(false);
  // Online: qual opção da folha Clássica/Void/Partida Rápida/Customizar foi
  // escolhida, e (pra Clássica/Void) o modo já resolvido a aplicar na sala.
  const [onlinePlay, setOnlinePlay] = useState(null); // null | 'classico' | 'void' | 'quickmatch' | 'customizar'
  const [onlinePresetMode, setOnlinePresetMode] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  function goToMenu() {
    setMode(null);
    setGameMode(null);
    setMapTheme(null);
    setEditingMapTheme(false);
    setLocalCustomizing(false);
    setOnlinePlay(null);
    setOnlinePresetMode(null);
  }

  useEffect(() => {
    if (location.protocol !== 'capacitor:') return;
    let cleanup;
    import('@capacitor/app').then(({ App: CapApp }) => {
      const handle = CapApp.addListener('backButton', () => {
        if (showHelp) {
          setShowHelp(false);
        } else if (showSettings) {
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
  }, [mode, showSettings, showHelp]);

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
            onClick={() => setShowHelp(true)}
            title={t('help.button')}
            aria-label={t('help.button')}
          >
            ❓
          </button>
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
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}

      <ErrorBoundary onReset={goToMenu}>
        {mode === null && <ModeMenu onSelect={setMode} />}

        {mode === 'local' && gameMode === null && !localCustomizing && (
          <PlayOptionsMenu
            heading={t('playMenu.local.heading')}
            onClassic={() => {
              setGameMode('ascensao');
              setMapTheme({ mapId: DEFAULT_MAP_ID, themeId: DEFAULT_THEME_ID, planetId: null });
            }}
            onVoid={() => setGameMode('void')}
            onCustomize={() => setLocalCustomizing(true)}
            onBack={goToMenu}
          />
        )}
        {mode === 'local' && gameMode === null && localCustomizing && (
          <GameModeMenu onSelect={setGameMode} />
        )}
        {mode === 'local' && gameMode === 'void' && (
          <VoidDrawScreen
            onConfirm={({ gameMode: drawnMode, mapId, themeId, planetId }) => {
              setGameMode(drawnMode);
              setMapTheme({ mapId, themeId, planetId });
            }}
            onBack={() => setGameMode(null)}
          />
        )}
        {mode === 'local' && gameMode && gameMode !== 'void' && (mapTheme === null || editingMapTheme) && (
          <MapThemeMenu
            initialMapId={mapTheme?.mapId}
            initialThemeId={mapTheme?.themeId}
            initialPlanetId={mapTheme?.planetId}
            onConfirm={(next) => { setMapTheme(next); setEditingMapTheme(false); }}
            onBack={() => (mapTheme ? setEditingMapTheme(false) : setGameMode(null))}
          />
        )}
        {mode === 'local' && gameMode && mapTheme && !editingMapTheme && (
          <LocalGame
            gameMode={gameMode}
            mapId={mapTheme.mapId}
            themeId={mapTheme.themeId}
            planetId={mapTheme.planetId}
            onChangeMode={() => { setGameMode(null); setMapTheme(null); }}
            onChangeMapTheme={() => setEditingMapTheme(true)}
          />
        )}

        {mode === 'online' && onlinePlay === null && (
          <PlayOptionsMenu
            heading={t('playMenu.online.heading')}
            onClassic={() => { setOnlinePresetMode('ascensao'); setOnlinePlay('classico'); }}
            onVoid={() => setOnlinePlay('void')}
            onQuickMatch={() => setOnlinePlay('quickmatch')}
            onCustomize={() => setOnlinePlay('customizar')}
            onBack={goToMenu}
          />
        )}
        {mode === 'online' && onlinePlay === 'void' && (
          <VoidDrawScreen
            onlyMode
            onConfirm={({ gameMode: drawnMode }) => {
              setOnlinePresetMode(drawnMode);
              setOnlinePlay('classico');
            }}
            onBack={() => setOnlinePlay(null)}
          />
        )}
        {mode === 'online' && onlinePlay === 'classico' && (
          <OnlineGame onExit={goToMenu} presetMode={onlinePresetMode} hideModeSelector />
        )}
        {mode === 'online' && onlinePlay === 'quickmatch' && (
          <OnlineGame onExit={goToMenu} quickMatch />
        )}
        {mode === 'online' && onlinePlay === 'customizar' && <OnlineGame onExit={goToMenu} />}

        {mode === 'team' && <TeamGame onExit={goToMenu} />}
      </ErrorBoundary>
    </div>
  );
}
