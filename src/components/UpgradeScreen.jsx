import { useMemo, useEffect } from 'react';
import { getUpgradeChoices } from '../game/upgrades.js';
import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

export default function UpgradeScreen({ playerName, pickedUpgrades, onPick }) {
  const t = useT();
  // compute once on mount so choices don't reshuffle on re-render
  const choices = useMemo(() => getUpgradeChoices(pickedUpgrades), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (choices.length === 0) onPick(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (choices.length === 0) return null;

  function pick(id) {
    sfx.click();
    onPick(id);
  }

  return (
    <div className="screen menu fade-in">
      <div className="upgrade-header">
        <div className="upgrade-icon">🏅</div>
        <h2>
          <span className="highlight">{playerName}</span>{t('upgrade.pickHeader')}
        </h2>
        <p className="upgrade-subtitle">{t('upgrade.subtitle')}</p>
      </div>
      <div className="upgrade-cards">
        {choices.map((u) => (
          <button key={u.id} className="upgrade-card" onClick={() => pick(u.id)}>
            <span className="upgrade-card-icon">{u.icon}</span>
            <span className="upgrade-card-name">{t(`upgrade.${u.id}.name`)}</span>
            <span className="upgrade-card-desc">{t(`upgrade.${u.id}.desc`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
