import { describe, it, expect } from 'vitest';
import { reducer, init } from './TeamGame.jsx';

// 4 jogadores, times balanceados (0,1 no time A; 2,3 no time B), todos com
// tabuleiro colocado (uma peça viva em índice 63, nunca atacada nestes testes,
// pra allFound()/sunk nunca disparar vitória por engano).
function makeBoard() {
  return new Array(64).fill(null).map((_, i) => ({
    pieceId: i === 63 ? 'perdido' : null,
    shot: false,
    revealed: false,
  }));
}

function battlingState(myIndex, overrides) {
  return {
    ...init,
    myIndex,
    players: ['A', 'B', 'C', 'D'],
    teamAssignment: { 0: 0, 1: 0, 2: 1, 3: 1 },
    boards: { 0: makeBoard(), 1: makeBoard(), 2: makeBoard(), 3: makeBoard() },
    boardCount: 4,
    currentAttacker: myIndex,
    stage: 'battle',
    ...overrides,
  };
}

describe('bug #16 — replay de shotResult/probeResult obsoleto no 2v2 (TeamBattleScreen remonta)', () => {
  it('ao entrar de novo em battle (vindo de outro estágio), zera shotResult/probeResult antigos', () => {
    let s = battlingState(0, {
      stage: 'defend', // eu não estava em battle no turno anterior visto pelo reducer
      shotResult: { id: 3, targetPlayer: 2, indices: [5], hitIndices: [], destroyed: null, targetSunk: false },
      probeResult: { id: 1, targetPlayer: 2, cells: [{ index: 7, hasPiece: false }] },
    });
    // nextAttacker(3, miss) = (3+1)%4 = 0 = eu: apply-attack me devolve a vez.
    s = reducer(s, {
      type: 'apply-attack',
      fromPlayer: 3, targetPlayer: 0, indices: [0], hitIndices: [], destroyed: null, targetSunk: false,
    });
    expect(s.stage).toBe('battle');
    // Sem o fix, esses dois continuariam com id>0 e o TeamBattleScreen novo
    // (lastShotId/lastProbeId=0) reaplicaria o tiro do turno passado sozinho.
    expect(s.shotResult).toBeNull();
    expect(s.probeResult).toBeNull();
  });

  it('durante uma sequência de acertos (já em battle), NÃO apaga o shotResult em voo', () => {
    let s = battlingState(0, { stage: 'battle' });
    // Simula que acabei de receber um shot-result (efeito do TeamBattleScreen
    // ainda processando) antes do apply-attack do MEU PRÓPRIO acerto disparar.
    s = { ...s, shotResult: { id: 1, targetPlayer: 2, indices: [0], hitIndices: [0], destroyed: null, targetSunk: false } };
    const next = reducer(s, {
      type: 'apply-attack',
      fromPlayer: 0, targetPlayer: 2, indices: [0], hitIndices: [0], destroyed: null, targetSunk: false,
    });
    expect(next.stage).toBe('battle'); // acertei, continuo atacando
    expect(next.shotResult).not.toBeNull(); // não foi apagado indevidamente
  });

  it('revanche completa já zerava shotResult/probeResult (comportamento preexistente preservado)', () => {
    let s = battlingState(0, {
      shotResult: { id: 5, targetPlayer: 2, indices: [1], hitIndices: [1], destroyed: null, targetSunk: false },
      probeResult: { id: 2, targetPlayer: 2, cells: [] },
      rematchVotes: [true, true, true, false],
    });
    const next = reducer(s, { type: 'rematch-vote', playerIndex: 3 });
    expect(next.stage).toBe('teamSelect');
    expect(next.shotResult).toBeNull();
    expect(next.probeResult).toBeNull();
  });
});
