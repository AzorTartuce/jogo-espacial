import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { sfx } from '../game/sound.js';

// Frases interceptadas exibidas em loop, com efeito de máquina de escrever —
// reforçam a narrativa de resgate/sinal sem exigir leitura de um texto longo.
const SIGNAL_KEYS = [
  'landing.signal1',
  'landing.signal2',
  'landing.signal3',
  'landing.signal4',
  'landing.signal5',
];

const TYPE_MS = 32;
const HOLD_MS = 2200;

export default function LandingScreen({ onEnter }) {
  const t = useT();
  const [signalIndex, setSignalIndex] = useState(0);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const full = t(SIGNAL_KEYS[signalIndex]);
    let i = 0;
    setTyped('');
    const typeTimer = setInterval(() => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(typeTimer);
    }, TYPE_MS);

    const nextTimer = setTimeout(() => {
      setSignalIndex((idx) => (idx + 1) % SIGNAL_KEYS.length);
    }, TYPE_MS * full.length + HOLD_MS);

    return () => {
      clearInterval(typeTimer);
      clearTimeout(nextTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalIndex]);

  function enter() {
    sfx.click();
    onEnter();
  }

  return (
    <div className="screen landing fade-in">
      <div className="landing-radar" aria-hidden="true">
        <div className="landing-ring landing-ring-1" />
        <div className="landing-ring landing-ring-2" />
        <div className="landing-ring landing-ring-3" />
        <div className="landing-sweep" />
        <div className="landing-blip landing-blip-1" />
        <div className="landing-blip landing-blip-2" />
        <div className="landing-blip landing-blip-3" />
        <span className="landing-core">🛰️</span>
      </div>

      <h2 className="landing-title">{t('app.title')}</h2>

      <p className="tagline">
        {t('tagline.rescue1')}
        <br />
        {t('tagline.rescue2')}
      </p>

      <p className="landing-signal" role="status">
        <span className="landing-signal-dot" />
        <span>{typed}</span>
        <span className="landing-cursor" />
      </p>

      <button className="big-btn landing-cta" onClick={enter}>
        {t('landing.cta')}
      </button>
      <p className="landing-hint">{t('landing.hint')}</p>
    </div>
  );
}
