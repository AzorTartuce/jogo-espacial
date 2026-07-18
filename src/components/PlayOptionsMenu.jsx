import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

// Folha de decisão comum aos fluxos Local e Online: Clássica (atalho com
// config padrão), Void (sorteio surpresa) e Customizar (escolher tudo à
// mão). Online também oferece Partida Rápida como uma quarta opção lateral
// (só passe `onQuickMatch`). Ver docs/mudancas.md.
export default function PlayOptionsMenu({ heading, onClassic, onVoid, onQuickMatch, onCustomize, onBack }) {
  const t = useT();

  function pick(fn) {
    sfx.click();
    fn();
  }

  return (
    <div className="screen menu fade-in">
      <h2>{heading}</h2>
      <div className="mode-buttons mode-grid">
        <button className="mode-card" onClick={() => pick(onClassic)}>
          <span className="mode-icon">🚀</span>
          <span className="mode-title">{t('playMenu.classico.title')}</span>
          <span className="mode-desc">{t('playMenu.classico.desc')}</span>
        </button>

        <button className="mode-card mode-card-void" onClick={() => pick(onVoid)}>
          <span className="mode-icon">🔮</span>
          <span className="mode-title">{t('gameMode.void.title')}</span>
          <span className="mode-desc">{t('gameMode.void.desc')}</span>
        </button>

        {onQuickMatch && (
          <button className="mode-card" onClick={() => pick(onQuickMatch)}>
            <span className="mode-icon">🎲</span>
            <span className="mode-title">{t('modeMenu.quick.title')}</span>
            <span className="mode-desc">{t('modeMenu.quick.desc')}</span>
          </button>
        )}

        <button className="mode-card" onClick={() => pick(onCustomize)}>
          <span className="mode-icon">🎛️</span>
          <span className="mode-title">{t('playMenu.customizar.title')}</span>
          <span className="mode-desc">{t('playMenu.customizar.desc')}</span>
        </button>
      </div>

      <button className="small-btn" onClick={() => pick(onBack)}>
        {t('nav.backToMenu')}
      </button>
    </div>
  );
}
