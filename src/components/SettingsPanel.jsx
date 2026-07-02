import { useEffect } from 'react';
import { useSettings } from '../i18n/index.jsx';
import { LANGS } from '../i18n/translations.js';
import { sfx } from '../game/sound.js';

export default function SettingsPanel({ onClose }) {
  const { t, lang, setLang, theme, setTheme, muted, setMuted } = useSettings();

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
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="settings-head">
          <h2>⚙️ {t('settings.title')}</h2>
          <button className="settings-close" onClick={onClose} aria-label="X">
            ✕
          </button>
        </div>

        {/* Idioma */}
        <div className="settings-group">
          <div className="settings-label">{t('settings.language')}</div>
          <div className="settings-options">
            {LANGS.map((l) => (
              <button
                key={l.code}
                className={`settings-chip ${lang === l.code ? 'active' : ''}`}
                onClick={() => {
                  sfx.click();
                  setLang(l.code);
                }}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Som */}
        <div className="settings-group">
          <div className="settings-label">{t('settings.sound')}</div>
          <div className="settings-options">
            <button
              className={`settings-chip ${!muted ? 'active' : ''}`}
              onClick={() => {
                setMuted(false);
                sfx.click();
              }}
            >
              🔊 {t('settings.soundOn')}
            </button>
            <button
              className={`settings-chip ${muted ? 'active' : ''}`}
              onClick={() => {
                sfx.click();
                setMuted(true);
              }}
            >
              🔇 {t('settings.soundOff')}
            </button>
          </div>
        </div>

        {/* Tema */}
        <div className="settings-group">
          <div className="settings-label">{t('settings.theme')}</div>
          <div className="settings-options">
            <button
              className={`settings-chip ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => {
                sfx.click();
                setTheme('dark');
              }}
            >
              🌙 {t('settings.themeDark')}
            </button>
            <button
              className={`settings-chip ${theme === 'light' ? 'active' : ''}`}
              onClick={() => {
                sfx.click();
                setTheme('light');
              }}
            >
              ☀️ {t('settings.themeLight')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
