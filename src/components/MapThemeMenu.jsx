import { useState } from 'react';
import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';
import {
  MAPS,
  THEMES,
  PLANETS,
  DEFAULT_MAP_ID,
  DEFAULT_THEME_ID,
  DEFAULT_PLANET_ID,
} from '../game/constants.js';

export default function MapThemeMenu({ initialMapId, initialThemeId, initialPlanetId, onConfirm, onBack }) {
  const t = useT();
  const [mapId, setMapId] = useState(initialMapId || DEFAULT_MAP_ID);
  const [themeId, setThemeId] = useState(initialThemeId || DEFAULT_THEME_ID);
  const [planetId, setPlanetId] = useState(initialPlanetId || DEFAULT_PLANET_ID);

  function pickMap(map) {
    if (!map.implemented) return;
    sfx.click();
    setMapId(map.id);
  }

  function pickTheme(theme) {
    if (!theme.implemented) return;
    sfx.click();
    setThemeId(theme.id);
  }

  function pickPlanet(planet) {
    sfx.click();
    setPlanetId(planet.id);
  }

  function confirm() {
    sfx.click();
    onConfirm({ mapId, themeId, planetId: mapId === 'planetas' ? planetId : null });
  }

  return (
    <div className="screen menu fade-in">
      <h2>{t('mapMenu.mapHeading')}</h2>
      <div className="mode-buttons mode-grid">
        {MAPS.map((map) => (
          <button
            key={map.id}
            className={`mode-card${mapId === map.id ? ' selected' : ''}${!map.implemented ? ' locked' : ''}`}
            onClick={() => pickMap(map)}
            disabled={!map.implemented}
          >
            <span className="mode-icon">{map.icon}</span>
            <span className="mode-title">{t(`map.${map.id}.title`)}</span>
            <span className="mode-desc">{t(`map.${map.id}.desc`)}</span>
            {!map.implemented && <span className="mode-badge">{t('mapMenu.comingSoon')}</span>}
          </button>
        ))}
      </div>

      {mapId === 'planetas' && (
        <div className="planet-picker">
          {PLANETS.map((planet) => (
            <button
              key={planet.id}
              className={`planet-chip${planetId === planet.id ? ' selected' : ''}`}
              style={{ '--planet-color': planet.color }}
              onClick={() => pickPlanet(planet)}
            >
              <span>{planet.emoji}</span>
              <span>{planet.name}</span>
            </button>
          ))}
        </div>
      )}

      <h2>{t('mapMenu.themeHeading')}</h2>
      <div className="mode-buttons mode-grid">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            className={`mode-card${themeId === theme.id ? ' selected' : ''}${!theme.implemented ? ' locked' : ''}`}
            onClick={() => pickTheme(theme)}
            disabled={!theme.implemented}
          >
            <span className="mode-icon">{theme.icon}</span>
            <span className="mode-title">{t(`theme.${theme.id}.title`)}</span>
            <span className="mode-desc">{t(`theme.${theme.id}.desc`)}</span>
            {!theme.implemented && <span className="mode-badge">{t('mapMenu.comingSoon')}</span>}
          </button>
        ))}
      </div>

      <div className="mapmenu-actions">
        <button className="small-btn" onClick={onBack}>
          {t('nav.backToMenu')}
        </button>
        <button className="big-btn" onClick={confirm}>
          {t('mapMenu.continue')}
        </button>
      </div>
    </div>
  );
}
