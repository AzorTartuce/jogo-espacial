export const EVENTS = [
  {
    id: 'nebula',
    icon: '🌫️',
    name: 'Nebulosa Cósmica',
    desc: 'Sinais de radar perdidos! Área revelada obscurecida.',
  },
  {
    id: 'interference',
    icon: '📡',
    name: 'Interferência',
    desc: 'Sinal interferido! Tempo do turno reduzido à metade.',
  },
  {
    id: 'vision',
    icon: '🔭',
    name: 'Visão Privilegiada',
    desc: 'Anomalia detectada! Uma célula inimiga revelada.',
  },
  {
    id: 'solar_storm',
    icon: '☀️',
    name: 'Tempestade Solar',
    desc: 'Sobrecarga elétrica! Poderes custam +2⚡ neste turno.',
  },
];

export const EVENT_INTERVAL = 20; // segundos entre eventos

export function randomEvent() {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}
