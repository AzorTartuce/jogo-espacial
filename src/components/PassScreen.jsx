import { sfx } from '../game/sound.js';

export default function PassScreen({ name, action, onConfirm }) {
  return (
    <div className="screen pass fade-in">
      <div className="pass-icon">🧑‍🚀</div>
      <h2>
        Passe o computador para <span className="highlight">{name}</span>
      </h2>
      <p>Hora de {action}. Sem espiar! 👀</p>
      <button
        className="big-btn"
        onClick={() => {
          sfx.click();
          onConfirm();
        }}
      >
        Estou pronto!
      </button>
    </div>
  );
}
