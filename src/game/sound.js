// Efeitos sonoros sintetizados com Web Audio (sem arquivos externos)
let ctx = null;
let muted = (() => {
  try {
    return localStorage.getItem('muted') === '1';
  } catch {
    return false;
  }
})();
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
  setMuted(!muted);
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  try {
    localStorage.setItem('muted', muted ? '1' : '0');
  } catch {
    // localStorage indisponível: mantém só em memória
  }
}

export function isMuted() {
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
  // Derrota: arpejo descendente melancólico (menor) + "power down" caindo.
  lose: () => {
    [440, 349, 262, 196].forEach((f, i) =>
      tone({ freq: f, dur: 0.4, type: 'triangle', vol: 0.13, delay: i * 0.18 })
    );
    tone({ freq: 160, end: 55, dur: 0.9, type: 'sawtooth', vol: 0.1, delay: 0.6 });
  },
  click: () => tone({ freq: 700, dur: 0.06, type: 'sine', vol: 0.08 }),

  // ===== Sons dos eventos de Instabilidade (cada um distinto) =====
  // Nebulosa (ruim): varredura grave e abafada, "engolindo" o sinal.
  eventNebula: () => {
    tone({ freq: 420, end: 90, dur: 0.7, type: 'sine', vol: 0.14 });
    tone({ freq: 210, end: 60, dur: 0.8, type: 'sine', vol: 0.08, delay: 0.05 });
  },
  // Interferência (ruim): estática dissonante e nervosa, sinal picotado.
  eventInterference: () => {
    [0, 0.09, 0.18, 0.27].forEach((d, i) =>
      tone({ freq: i % 2 ? 180 : 320, dur: 0.06, type: 'sawtooth', vol: 0.12, delay: d })
    );
    tone({ freq: 900, end: 300, dur: 0.25, type: 'square', vol: 0.06, delay: 0.06 });
  },
  // Visão Privilegiada (bom): ping cristalino ascendente, "descoberta".
  eventVision: () => {
    tone({ freq: 660, end: 990, dur: 0.22, type: 'triangle', vol: 0.13 });
    tone({ freq: 1320, dur: 0.18, type: 'sine', vol: 0.08, delay: 0.16 });
    tone({ freq: 1760, dur: 0.16, type: 'sine', vol: 0.06, delay: 0.3 });
  },
  // Tempestade Solar (ruim): surto elétrico grave com crepitação aguda.
  eventStorm: () => {
    tone({ freq: 70, end: 220, dur: 0.5, type: 'sawtooth', vol: 0.16 });
    tone({ freq: 1500, end: 400, dur: 0.4, type: 'square', vol: 0.07, delay: 0.05 });
    tone({ freq: 2200, dur: 0.05, type: 'square', vol: 0.05, delay: 0.28 });
  },
};

// Toca o som próprio de cada evento de Instabilidade a partir do id.
export function playEventSound(id) {
  switch (id) {
    case 'nebula':
      return sfx.eventNebula();
    case 'interference':
      return sfx.eventInterference();
    case 'vision':
      return sfx.eventVision();
    case 'solar_storm':
      return sfx.eventStorm();
    default:
      return undefined;
  }
}
