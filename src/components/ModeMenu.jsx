import { sfx } from '../game/sound.js';

export default function ModeMenu({ onSelect }) {
  function pick(mode) {
    sfx.click();
    onSelect(mode);
  }

  return (
    <div className="screen menu fade-in">
      <p className="tagline">
        A equipe de astronautas do seu rival está perdida no espaço.
        <br />
        Encontre todos antes que ele encontre os seus!
      </p>

      <div className="mode-buttons">
        <button className="mode-card" onClick={() => pick('local')}>
          <span className="mode-icon">🖥️</span>
          <span className="mode-title">Mesmo computador</span>
          <span className="mode-desc">
            Dois jogadores se revezam no mesmo dispositivo
          </span>
        </button>

        <button className="mode-card" onClick={() => pick('online')}>
          <span className="mode-icon">🌐</span>
          <span className="mode-title">Online com sala</span>
          <span className="mode-desc">
            Crie uma sala e compartilhe o código — cada um no seu dispositivo
          </span>
        </button>
      </div>
    </div>
  );
}
