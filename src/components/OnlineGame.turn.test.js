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

describe('bug #14 — deadlock de turno (handoff atrasado obsoleto)', () => {
  it('ignora um hand-over cujo token não bate mais com o turno atual (no-op)', () => {
    // Jogador errou -> pendingOppTurn true, token vira 1. Um segundo evento de
    // rede (ex.: já foi atacado de volta) avança o turno de novo antes do
    // hand-over de 1100ms dele mesmo disparar -> token vira 2.
    let s = battlingState({});
    s = reducer(s, { type: 'i-attacked', board: s.enemyBoard, shotsFired: 1, hitsMade: 0, anyHit: false, sunkAll: false });
    expect(s.pendingOppTurn).toBe(true);
    expect(s.turnToken).toBe(1);

    // Algo mais avançou o turno antes do timer de 1100ms disparar.
    s = { ...s, turnToken: 2 };

    // O timer atrasado finalmente dispara, mas com o token velho (1).
    const stale = reducer(s, { type: 'hand-over', token: 1 });
    expect(stale).toBe(s); // no-op: estado não mudou (mesma referência)
    expect(stale.stage).toBe('battle'); // não foi forçado de volta para 'defend'
  });

  it('aplica o hand-over normalmente quando o token ainda bate', () => {
    let s = battlingState({});
    s = reducer(s, { type: 'i-attacked', board: s.enemyBoard, shotsFired: 1, hitsMade: 0, anyHit: false, sunkAll: false });
    const applied = reducer(s, { type: 'hand-over', token: s.turnToken });
    expect(applied.stage).toBe('defend');
    expect(applied.pendingOppTurn).toBe(false);
  });

  it('mesmo guard vale para take-turn (defensor virando atacante)', () => {
    let s = battlingState({ stage: 'defend' });
    s = reducer(s, { type: 'attack-received', indices: [0] }); // erro do oponente
    expect(s.pendingMyTurn).toBe(true);
    const token = s.turnToken;

    const stale = reducer({ ...s, turnToken: token + 1 }, { type: 'take-turn', token });
    expect(stale.stage).toBe('defend'); // no-op, não virou 'battle' à força

    const applied = reducer(s, { type: 'take-turn', token });
    expect(applied.stage).toBe('battle');
  });
});

describe('bug #15 — replay de shotResult/probeResult obsoleto ao remontar BattleScreen', () => {
  it('take-turn zera shotResult/probeResult do turno anterior', () => {
    let s = battlingState({ stage: 'defend' });
    // Simula que este jogador tinha um shotResult/probeResult antigos (id>0)
    // de quando foi atacante pela última vez, várias rodadas atrás.
    s = {
      ...s,
      shotResult: { id: 3, indices: [5], hitIndices: [], destroyed: null, sunkAll: false },
      probeResult: { id: 2, cells: [{ index: 7, hasPiece: false }] },
    };

    s = reducer(s, { type: 'attack-received', indices: [0] }); // oponente errou -> minha vez
    const token = s.turnToken;
    const next = reducer(s, { type: 'take-turn', token });

    expect(next.stage).toBe('battle');
    // Sem o fix, esses dois campos continuariam com id>0 e o BattleScreen novo
    // (lastShotId/lastProbeId = 0) reaplicaria o resultado do turno passado
    // sozinho, terminando o turno novo antes do jogador clicar em qualquer coisa.
    expect(next.shotResult).toBeNull();
    expect(next.probeResult).toBeNull();
  });

  it('revanche completa também zera shotResult/probeResult da partida anterior', () => {
    let s = battlingState({
      rematchMe: true,
      shotResult: { id: 5, indices: [1], hitIndices: [1], destroyed: null, sunkAll: false },
      probeResult: { id: 1, cells: [] },
    });
    const next = reducer(s, { type: 'rematch-opp' });
    expect(next.stage).toBe('placement');
    expect(next.shotResult).toBeNull();
    expect(next.probeResult).toBeNull();
  });
});
