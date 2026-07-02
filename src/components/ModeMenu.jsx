import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

export default function ModeMenu({ onSelect }) {
  const t = useT();
  function pick(mode) {
    sfx.click();
    onSelect(mode);
  }

  return (
    <div className="screen menu fade-in">
      <p className="tagline">
        {t('tagline.rescue1')}
        <br />
        {t('tagline.rescue2')}
      </p>

      <div className="mode-buttons mode-grid">
        <button className="mode-card" onClick={() => pick('local')}>
          <span className="mode-icon">🖥️</span>
          <span className="mode-title">{t('modeMenu.local.title')}</span>
          <span className="mode-desc">{t('modeMenu.local.desc')}</span>
        </button>

        <button className="mode-card" onClick={() => pick('quickmatch')}>
          <span className="mode-icon">🎲</span>
          <span className="mode-title">{t('modeMenu.quick.title')}</span>
          <span className="mode-desc">{t('modeMenu.quick.desc')}</span>
        </button>

        <button className="mode-card" onClick={() => pick('online')}>
          <span className="mode-icon">🌐</span>
          <span className="mode-title">{t('modeMenu.online.title')}</span>
          <span className="mode-desc">{t('modeMenu.online.desc')}</span>
        </button>

        <button className="mode-card" onClick={() => pick('team')}>
          <span className="mode-icon">👥</span>
          <span className="mode-title">{t('modeMenu.team.title')}</span>
          <span className="mode-desc">{t('modeMenu.team.desc')}</span>
        </button>
      </div>
    </div>
  );
}
