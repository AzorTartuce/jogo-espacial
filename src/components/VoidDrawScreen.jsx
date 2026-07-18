import { useEffect, useRef, useState } from 'react';
import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';
import {
  GAME_MODES,
  MAPS,
  THEMES,
  PLANETS,
  drawVoidConfig,
  drawVoidGameMode,
  MODE_ICONS,
} from '../game/constants.js';

const DRAW_MS = 4000;
const FLICKER_MS = 120;
const TICK_MS = 450;

const IMPLEMENTED_MAPS = MAPS.filter((m) => m.implemented);
const IMPLEMENTED_THEMES = THEMES.filter((th) => th.implemented);

function randomOf(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFlicker(onlyMode) {
  return {
    mode: randomOf(GAME_MODES),
    map: onlyMode ? null : randomOf(IMPLEMENTED_MAPS),
    theme: onlyMode ? null : randomOf(IMPLEMENTED_THEMES),
  };
}

// Tela de sorteio do Modo Void: por ~4s embaralha visualmente modo/(mapa/tema)
// (puro efeito, sem afetar o resultado final) e então revela a configuração
// realmente sorteada, que só o jogador confirma para seguir ao fluxo normal.
// Local sorteia modo+mapa+tema (docs/void.md); Online sorteia só o modo, já
// que o fluxo online ainda não sincroniza mapa/tema entre os jogadores
// (`onlyMode`, ver docs/mudancas.md).
export default function VoidDrawScreen({ onConfirm, onBack, onlyMode = false }) {
  const t = useT();
  const [phase, setPhase] = useState('drawing'); // drawing | reveal
  const [flicker, setFlicker] = useState(() => randomFlicker(onlyMode));
  const [result, setResult] = useState(null);
  const timers = useRef([]);

  useEffect(() => {
    const flickerId = setInterval(() => setFlicker(randomFlicker(onlyMode)), FLICKER_MS);
    const tickId = setInterval(() => sfx.click(), TICK_MS);
    const doneId = setTimeout(() => {
      clearInterval(flickerId);
      clearInterval(tickId);
      const drawn = onlyMode
        ? { gameMode: drawVoidGameMode(), mapId: null, themeId: null, planetId: null }
        : drawVoidConfig();
      setResult(drawn);
      setFlicker({
        mode: GAME_MODES.find((m) => m.id === drawn.gameMode),
        map: drawn.mapId ? MAPS.find((m) => m.id === drawn.mapId) : null,
        theme: drawn.themeId ? THEMES.find((th) => th.id === drawn.themeId) : null,
      });
      sfx.radar();
      setPhase('reveal');
    }, DRAW_MS);
    timers.current = [flickerId, tickId, doneId];
    return () => {
      clearInterval(flickerId);
      clearInterval(tickId);
      clearTimeout(doneId);
    };
  }, [onlyMode]);

  function cancel() {
    timers.current.forEach((id) => {
      clearInterval(id);
      clearTimeout(id);
    });
    sfx.click();
    onBack();
  }

  function confirm() {
    sfx.click();
    onConfirm(result);
  }

  const planet = result?.planetId ? PLANETS.find((p) => p.id === result.planetId) : null;

  return (
    <div className={`screen menu fade-in void-draw${phase === 'reveal' ? ' void-reveal' : ''}`}>
      <h2>{phase === 'drawing' ? t('void.drawing.title') : t('void.reveal.title')}</h2>
      <p className="void-hint">
        {phase === 'drawing' ? t('void.drawing.hint') : t('void.reveal.hint')}
      </p>

      <div className="void-slots">
        <div className="void-slot">
          <span className="void-slot-label">{t('void.slot.mode')}</span>
          <span className="void-slot-icon">{flicker.mode?.icon ?? MODE_ICONS[flicker.mode?.id]}</span>
          <span className="void-slot-value">{t(`gameMode.${flicker.mode?.id}.title`)}</span>
        </div>
        {!onlyMode && (
          <div className="void-slot">
            <span className="void-slot-label">{t('void.slot.map')}</span>
            <span className="void-slot-icon">{flicker.map?.icon}</span>
            <span className="void-slot-value">{t(`map.${flicker.map?.id}.title`)}</span>
          </div>
        )}
        {!onlyMode && (
          <div className="void-slot">
            <span className="void-slot-label">{t('void.slot.theme')}</span>
            <span className="void-slot-icon">{flicker.theme?.icon}</span>
            <span className="void-slot-value">{t(`theme.${flicker.theme?.id}.title`)}</span>
          </div>
        )}
        {phase === 'reveal' && planet && (
          <div className="void-slot">
            <span className="void-slot-label">{t('void.slot.planet')}</span>
            <span className="void-slot-icon">{planet.emoji}</span>
            <span className="void-slot-value">{planet.name}</span>
          </div>
        )}
      </div>

      {phase === 'drawing' ? (
        <button className="small-btn" onClick={cancel}>
          {t('nav.backToMenu')}
        </button>
      ) : (
        <button className="big-btn" onClick={confirm}>
          {t('void.reveal.continue')}
        </button>
      )}
    </div>
  );
}
