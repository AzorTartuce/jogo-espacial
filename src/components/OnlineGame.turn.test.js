import { describe, it, expect } from 'vitest';
import { reducer, initialState } from './OnlineGame.jsx';

// Simula um jogador já em batalha (placement concluído dos dois lados).
// Uma peça viva em índice 63 (nunca atacado nos testes abaixo) garante que
// allFound() não dê "vitória" só por engano no board sintético.
function makeBoard() {
  const b = new Array(64).fill(null).map(() => ({ pieceId: null, shot: false, revealed: false }));
  b[63] = { pieceId: 'perdido', shot: false, revealed: false };
  return b;
}
function battlingState(overrides) {
  return {
    ...initialState,
    myIndex: 0,
    oppName: 'Rival',
    ownBoard: makeBoard(),
    enemyBoard: makeBoard(),
    stage: 'battle',
    ...overrides,
  };
}

// Desde que o servidor passou a ser a única autoridade de turno/tiro, não há
// mais duas linhas do tempo client-side correndo uma contra a outra (bug #14
// antigo, do hand-over/take-turn com token) — só existe uma transição
// pendente por vez (`pendingResolve`), aplicada por um único `resolve-turn`.
describe('resolução de turno via servidor (attack-result / attack-received / resolve-turn)', () => {
  it('erro do meu ataque só troca de tela quando o resolve-turn dispara', () => {
    let s = battlingState({});
    s = reducer(s, {
      type: 'attack-result',
      indices: [0], hitIndices: [], destroyed: null, sunkAll: false,
      yourTurn: false, energy: 0,
    });
    expect(s.stage).toBe('battle'); // ainda não trocou — espera o delay estético
    expect(s.pendingResolve).toEqual({ stage: 'defend' });

    const applied = reducer(s, { type: 'resolve-turn' });
    expect(applied.stage).toBe('defend');
    expect(applied.pendingResolve).toBeNull();
  });

  it('resolve-turn é no-op quando não há transição pendente', () => {
    const s = battlingState({ pendingResolve: null });
    const applied = reducer(s, { type: 'resolve-turn' });
    expect(applied).toBe(s);
  });

  it('acerto mantém o turno (stage continua "battle") e atualiza a energia', () => {
    let s = battlingState({});
    s = reducer(s, {
      type: 'attack-result',
      indices: [63], hitIndices: [63], destroyed: null, sunkAll: false,
      yourTurn: true, energy: 2,
    });
    s = reducer(s, { type: 'resolve-turn' });
    expect(s.stage).toBe('battle');
    expect(s.energy).toBe(2);
  });

  it('attack-result acumula shots/hits em myStats (placar do fim de jogo)', () => {
    let s = battlingState({});
    s = reducer(s, {
      type: 'attack-result',
      indices: [63], hitIndices: [63], destroyed: null, sunkAll: false,
      yourTurn: true, energy: 0,
    });
    expect(s.myStats).toEqual({ shots: 1, hits: 1 });

    s = reducer(s, {
      type: 'attack-result',
      indices: [0], hitIndices: [], destroyed: null, sunkAll: false,
      yourTurn: false, energy: 0,
    });
    expect(s.myStats).toEqual({ shots: 2, hits: 1 });
  });

  it('attack-received acumula shots/hits em oppStats', () => {
    let s = battlingState({ stage: 'defend' });
    s = reducer(s, {
      type: 'attack-received',
      indices: [63], hitIndices: [63], destroyed: null, sunkAll: false,
      yourTurn: true, energy: 0, needsUpgrade: false,
    });
    expect(s.oppStats).toEqual({ shots: 1, hits: 1 });
  });

  it('afundar a frota inimiga vai pra gameover só depois do resolve-turn', () => {
    let s = battlingState({});
    s = reducer(s, {
      type: 'attack-result',
      indices: [63], hitIndices: [63], destroyed: { id: 'perdido', emoji: '👨‍🚀' }, sunkAll: true,
      yourTurn: true, energy: 0,
    });
    expect(s.stage).toBe('battle');
    expect(s.pendingResolve).toEqual({ winner: 'me' });

    const applied = reducer(s, { type: 'resolve-turn' });
    expect(applied.stage).toBe('gameover');
    expect(applied.winner).toBe('me');
  });

  it('ser afundado vai pra gameover com winner "opp"', () => {
    let s = battlingState({ stage: 'defend' });
    s = reducer(s, {
      type: 'attack-received',
      indices: [63], hitIndices: [63], destroyed: { id: 'perdido', emoji: '👨‍🚀' }, sunkAll: true,
    });
    const applied = reducer(s, { type: 'resolve-turn' });
    expect(applied.stage).toBe('gameover');
    expect(applied.winner).toBe('opp');
  });

  it('defensor virando atacante entra em "upgrade" quando o servidor manda needsUpgrade', () => {
    let s = battlingState({ stage: 'defend' });
    s = reducer(s, {
      type: 'attack-received',
      indices: [0], hitIndices: [], destroyed: null, sunkAll: false,
      yourTurn: true, energy: 1, needsUpgrade: true,
    });
    const applied = reducer(s, { type: 'resolve-turn' });
    expect(applied.stage).toBe('upgrade');
  });

  it('timeout do meu turno também passa pelo mesmo delay de resolve-turn', () => {
    let s = battlingState({});
    s = reducer(s, { type: 'timeout-you' });
    expect(s.stage).toBe('battle');
    const applied = reducer(s, { type: 'resolve-turn' });
    expect(applied.stage).toBe('defend');
  });
});

describe('bug #15 (equivalente) — replay de shotResult/probeResult obsoleto ao remontar BattleScreen', () => {
  it('resolve-turn zera shotResult/probeResult do turno anterior', () => {
    let s = battlingState({ stage: 'defend' });
    s = {
      ...s,
      shotResult: { id: 3, indices: [5], hitIndices: [], destroyed: null, sunkAll: false },
      probeResult: { id: 2, cells: [{ index: 7, hasPiece: false }] },
    };
    s = reducer(s, {
      type: 'attack-received',
      indices: [0], hitIndices: [], destroyed: null, sunkAll: false,
      yourTurn: true, energy: 0, needsUpgrade: false,
    });
    const next = reducer(s, { type: 'resolve-turn' });

    expect(next.stage).toBe('battle');
    // Sem o fix, esses dois campos continuariam com id>0 e o BattleScreen novo
    // (lastShotId/lastProbeId = 0) reaplicaria o resultado do turno passado
    // sozinho, terminando o turno novo antes do jogador clicar em qualquer coisa.
    expect(next.shotResult).toBeNull();
    expect(next.probeResult).toBeNull();
  });

  it('revanche (rematch-start) também zera shotResult/probeResult da partida anterior', () => {
    const s = battlingState({
      rematchMe: true,
      shotResult: { id: 5, indices: [1], hitIndices: [1], destroyed: null, sunkAll: false },
      probeResult: { id: 1, cells: [] },
    });
    const next = reducer(s, { type: 'rematch-start' });
    expect(next.stage).toBe('placement');
    expect(next.shotResult).toBeNull();
    expect(next.probeResult).toBeNull();
  });
});

describe('enemyBoard acompanha acertos/erros/revelações (pro próximo mount do BattleScreen)', () => {
  it('attack-result marca a célula atingida como shot no enemyBoard', () => {
    let s = battlingState({});
    s = reducer(s, {
      type: 'attack-result',
      indices: [63], hitIndices: [63], destroyed: null, sunkAll: false,
      yourTurn: true, energy: 0,
    });
    expect(s.enemyBoard[63].shot).toBe(true);
    expect(s.enemyBoard[63].pieceId).toBeTruthy();
  });

  it('probe-result marca células reveladas sem sobrescrever células já atingidas', () => {
    let s = battlingState({});
    s = reducer(s, {
      type: 'attack-result',
      indices: [63], hitIndices: [63], destroyed: null, sunkAll: false,
      yourTurn: true, energy: 0,
    });
    s = reducer(s, { type: 'probe-result', cells: [{ index: 63, hasPiece: false }, { index: 10, hasPiece: true }] });
    expect(s.enemyBoard[63].pieceId).toBeTruthy(); // não foi sobrescrito pelo probe
    expect(s.enemyBoard[10].revealed).toBe(true);
    expect(s.enemyBoard[10].pieceId).toBeTruthy();
  });
});
