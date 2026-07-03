// valence: valência do evento na perspectiva do jogador que o vive no turno.
//   'bad'  = atrapalha (obscurece área, corta tempo, encarece poderes)
//   'good' = ajuda (revela célula inimiga)
export const EVENTS = [
  {
    id: 'nebula',
    icon: '🌫️',
    name: 'Nebulosa Cósmica',
    desc: 'Sinais de radar perdidos! Área revelada obscurecida.',
    valence: 'bad', // apaga o que o radar já tinha revelado no seu tabuleiro
  },
  {
    id: 'interference',
    icon: '📡',
    name: 'Interferência',
    desc: 'Sinal interferido! Tempo do turno reduzido à metade.',
    valence: 'bad', // menos tempo para agir
  },
  {
    id: 'vision',
    icon: '🔭',
    name: 'Visão Privilegiada',
    desc: 'Anomalia detectada! Uma célula inimiga revelada.',
    valence: 'good', // entrega de graça uma célula do inimigo
  },
  {
    id: 'solar_storm',
    icon: '☀️',
    name: 'Tempestade Solar',
    desc: 'Sobrecarga elétrica! Poderes custam +2⚡ neste turno.',
    valence: 'bad', // poderes ficam mais caros
  },
];

export const EVENT_INTERVAL = 20; // segundos entre eventos

export function randomEvent() {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}
