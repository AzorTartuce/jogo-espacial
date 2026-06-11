// Efeitos sonoros sintetizados com Web Audio (sem arquivos externos)
let ctx = null;
let muted = false;
let unlocked = false;

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// iOS Safari só libera o áudio depois de um gesto do usuário, e mesmo assim
// precisa de um "empurrão" extra (tocar um buffer silencioso) para destravar
// de vez. Sem isso, sons tocados dentro de setTimeout (acerto, erro, etc.)
// podem ficar mudos mesmo com a chave de silencioso desligada.
function unlock() {
  if (unlocked) return;
  unlocked = true;
  try {
    const ac = audio();
    const buffer = ac.createBuffer(1, 1, 22050);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    src.start(0);
    if (ac.state === 'suspended') ac.resume();
  } catch {
    unlocked = false;
  }
}

if (typeof document !== 'undefined') {
  ['touchend', 'mousedown', 'keydown'].forEach((evt) =>
    document.addEventListener(evt, unlock, { once: true, passive: true })
  );

  // O iOS suspende o contexto de áudio ao bloquear a tela ou trocar de app
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  });
}

function tone({ freq, end, dur, type = 'square', vol = 0.12, delay = 0 }) {
  if (muted) return;
  try {
    const ac = audio();
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (end) osc.frequency.exponentialRampToValueAtTime(end, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  } catch {
    // áudio indisponível: segue o jogo em silêncio
  }
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

export const sfx = {
  laser: () => tone({ freq: 900, end: 120, dur: 0.18, type: 'sawtooth' }),
  hit: () => {
    tone({ freq: 220, end: 40, dur: 0.35, type: 'square', vol: 0.18 });
    tone({ freq: 1400, end: 200, dur: 0.25, type: 'sawtooth', vol: 0.08 });
  },
  miss: () => tone({ freq: 300, end: 150, dur: 0.25, type: 'sine', vol: 0.1 }),
  radar: () => {
    tone({ freq: 500, end: 1200, dur: 0.3, type: 'sine' });
    tone({ freq: 500, end: 1200, dur: 0.3, type: 'sine', delay: 0.18 });
  },
  plasma: () => {
    tone({ freq: 80, end: 600, dur: 0.4, type: 'sawtooth', vol: 0.16 });
    tone({ freq: 1000, end: 100, dur: 0.5, type: 'square', vol: 0.1, delay: 0.1 });
  },
  destroyed: () => {
    tone({ freq: 600, dur: 0.12, type: 'square' });
    tone({ freq: 800, dur: 0.12, type: 'square', delay: 0.12 });
    tone({ freq: 1100, dur: 0.25, type: 'square', delay: 0.24 });
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.15, delay: i * 0.15 })
    );
  },
  click: () => tone({ freq: 700, dur: 0.06, type: 'sine', vol: 0.08 }),
};
