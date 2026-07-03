import { useEffect } from 'react';
import { FLEET, RADAR_COST, PLASMA_COST, GAME_MODES, MODE_ICONS } from '../game/constants.js';
import { useT } from '../i18n/index.jsx';

const MODE_ORDER = GAME_MODES.map((m) => m.id);

export default function HowToPlay({ onClose }) {
  const t = useT();

  // Fecha com a tecla Esc e trava o scroll do fundo enquanto aberto
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-panel help-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="settings-head">
          <h2>❓ {t('help.title')}</h2>
          <button className="settings-close" onClick={onClose} aria-label={t('settings.close')}>
            ✕
          </button>
        </div>

        {/* Frota */}
        <div className="settings-group">
          <div className="settings-label">{t('help.fleetLabel')}</div>
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
        </div>

        {/* Regras */}
        <div className="settings-group">
          <div className="settings-label">{t('help.rulesLabel')}</div>
          <div className="menu-rules">
            <div>{t('menu.ruleHit')}</div>
            <div>{t('menu.ruleEnergy')}</div>
            <div>{t('menu.ruleRadar', { cost: RADAR_COST })}</div>
            <div>{t('menu.rulePlasma', { cost: PLASMA_COST })}</div>
            <div>{t('menu.ruleTimer')}</div>
          </div>
        </div>

        {/* Modos de jogo */}
        <div className="settings-group">
          <div className="settings-label">{t('help.modesLabel')}</div>
          <div className="help-modes">
            {MODE_ORDER.map((m) => (
              <div key={m} className="help-mode">
                <div className="help-mode-title">
                  {MODE_ICONS[m]} {t(`gameMode.${m}.title`)}
                </div>
                <div className="help-mode-desc">{t(`gameMode.${m}.desc`)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
