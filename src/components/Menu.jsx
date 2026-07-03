import { useState } from 'react';
import { FLEET, RADAR_COST, PLASMA_COST, MODE_ICONS } from '../game/constants.js';
import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

export default function Menu({ gameMode, onStart, onChangeMode }) {
  const t = useT();
  const [name1, setName1] = useState('');
  const [name2, setName2] = useState('');

  function start() {
    sfx.click();
    onStart([name1.trim() || t('menu.defaultP1'), name2.trim() || t('menu.defaultP2')]);
  }

  return (
    <div className="screen menu fade-in">
      <p className="tagline">
        {t('tagline.rescue1')}
        <br />
        {t('tagline.rescue2')}
      </p>

      <div className="menu-fleet">
        {FLEET.map((p) => (
          <div key={p.id} className="menu-fleet-item">
            <span className="fleet-emoji">{p.emoji}</span>
            <span>{t(`fleet.${p.id}`)}</span>
            <span className="fleet-size">
              {Array.from({ length: p.size }, () => '■').join('')}
            </span>
          </div>
        ))}
      </div>

      <div className="menu-rules">
        <div>{t('menu.ruleHit')}</div>
        <div>{t('menu.ruleEnergy')}</div>
        <div>{t('menu.ruleRadar', { cost: RADAR_COST })}</div>
        <div>{t('menu.rulePlasma', { cost: PLASMA_COST })}</div>
        <div>{t('menu.ruleTimer')}</div>
      </div>

      <div className="menu-names">
        <input
          placeholder={t('menu.player1ph')}
          value={name1}
          maxLength={14}
          onChange={(e) => setName1(e.target.value)}
        />
        <span className="vs">{t('menu.vs')}</span>
        <input
          placeholder={t('menu.player2ph')}
          value={name2}
          maxLength={14}
          onChange={(e) => setName2(e.target.value)}
        />
      </div>

      <button className="big-btn" onClick={start}>
        {t('menu.start')}
      </button>

      <div className="menu-mode-row">
        <span className="menu-mode-label">
          {t('menu.modeLabel')}{' '}
          <strong>{MODE_ICONS[gameMode]} {t(`gameMode.${gameMode}.title`)}</strong>
        </span>
        <button className="small-btn" onClick={() => { sfx.click(); onChangeMode(); }}>
          {t('menu.changeVariant')}
        </button>
      </div>
    </div>
  );
}
