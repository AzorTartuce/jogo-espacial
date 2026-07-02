import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

export default function PassScreen({ name, action, onConfirm }) {
  const t = useT();
  const actionText = action === 'placement' ? t('pass.actionHide') : t('pass.actionAttack');
  return (
    <div className="screen pass fade-in">
      <div className="pass-icon">🧑‍🚀</div>
      <h2>
        {t('pass.handTo')} <span className="highlight">{name}</span>
      </h2>
      <p>{t('pass.timeTo', { action: actionText })}</p>
      <button
        className="big-btn"
        onClick={() => {
          sfx.click();
          onConfirm();
        }}
      >
        {t('pass.ready')}
      </button>
    </div>
  );
}
