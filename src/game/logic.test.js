import { describe, it, expect } from 'vitest';
import {
  emptyBoard,
  idx,
  rowCol,
  footprint,
  canPlace,
  placePiece,
  fire,
  allFound,
  radarScan,
} from './logic.js';
import { SIZE, FLEET } from './constants.js';

describe('idx/rowCol', () => {
  it('round-trips row/col through idx', () => {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        expect(rowCol(idx(r, c))).toEqual([r, c]);
      }
    }
  });
});

describe('footprint/canPlace/placePiece', () => {
  it('returns null when a horizontal piece would run off the board', () => {
    const lastCol = SIZE - 1;
    expect(footprint(idx(0, lastCol), 2, true)).toBeNull();
  });

  it('returns the correct cells for a piece that fits', () => {
    const cells = footprint(idx(0, 0), 3, true);
    expect(cells).toEqual([idx(0, 0), idx(0, 1), idx(0, 2)]);
  });

  it('canPlace rejects overlapping pieces', () => {
    let board = emptyBoard();
    const cells = canPlace(board, idx(0, 0), 2, true);
    board = placePiece(board, 'a', cells);
    expect(canPlace(board, idx(0, 1), 2, true)).toBeNull();
  });

  it('canPlace allows non-overlapping placement', () => {
    const board = emptyBoard();
    const cells = canPlace(board, idx(0, 0), 2, true);
    expect(cells).toEqual([idx(0, 0), idx(0, 1)]);
  });
});

describe('fire', () => {
  it('returns null when firing at an already-shot cell', () => {
    let board = emptyBoard();
    const r1 = fire(board, 5);
    expect(r1).not.toBeNull();
    const r2 = fire(r1.board, 5);
    expect(r2).toBeNull();
  });

  it('registers a miss on an empty cell', () => {
    const board = emptyBoard();
    const result = fire(board, 10);
    expect(result.hit).toBe(false);
    expect(result.destroyed).toBeNull();
    expect(result.board[10].shot).toBe(true);
  });

  it('registers a hit without destroying while other cells of the piece remain', () => {
    let board = emptyBoard();
    const piece = FLEET.find((p) => p.size >= 2);
    const cells = canPlace(board, idx(0, 0), piece.size, true);
    board = placePiece(board, piece.id, cells);
    const result = fire(board, cells[0]);
    expect(result.hit).toBe(true);
    expect(result.destroyed).toBeNull();
  });

  it('reports destroyed once every cell of a piece has been hit', () => {
    let board = emptyBoard();
    const piece = FLEET.find((p) => p.size === 1) ?? FLEET[FLEET.length - 1];
    const cells = canPlace(board, idx(0, 0), piece.size, true);
    board = placePiece(board, piece.id, cells);
    let last;
    for (const c of cells) {
      last = fire(board, c);
      board = last.board;
    }
    expect(last.destroyed).not.toBeNull();
    expect(last.destroyed.id).toBe(piece.id);
  });
});

describe('allFound', () => {
  it('is true for an empty board (nothing to find)', () => {
    expect(allFound(emptyBoard())).toBe(true);
  });

  it('is false while a placed piece has unshot cells', () => {
    let board = emptyBoard();
    const cells = canPlace(board, idx(0, 0), 2, true);
    board = placePiece(board, 'x', cells);
    expect(allFound(board)).toBe(false);
  });

  it('is true once every piece cell has been shot', () => {
    let board = emptyBoard();
    const cells = canPlace(board, idx(0, 0), 2, true);
    board = placePiece(board, 'x', cells);
    for (const c of cells) {
      board = fire(board, c).board;
    }
    expect(allFound(board)).toBe(true);
  });
});

describe('radarScan', () => {
  it('reveals the full 3x3 area around a center cell away from edges', () => {
    const board = emptyBoard();
    const center = idx(4, 4);
    const next = radarScan(board, center, 1);
    const revealedIdx = next.reduce((acc, c, i) => (c.revealed ? [...acc, i] : acc), []);
    expect(revealedIdx.length).toBe(9);
    expect(revealedIdx).toContain(center);
  });

  it('clips the revealed area at a corner of the board', () => {
    const board = emptyBoard();
    const center = idx(0, 0);
    const next = radarScan(board, center, 1);
    const revealedIdx = next.reduce((acc, c, i) => (c.revealed ? [...acc, i] : acc), []);
    // only rows/cols 0,1 are in range -> 2x2 = 4 cells
    expect(revealedIdx.length).toBe(4);
  });

  it('clips the revealed area at an edge of the board', () => {
    const board = emptyBoard();
    const center = idx(0, 4);
    const next = radarScan(board, center, 1);
    const revealedIdx = next.reduce((acc, c, i) => (c.revealed ? [...acc, i] : acc), []);
    // rows 0,1 (2) x cols 3,4,5 (3) = 6 cells
    expect(revealedIdx.length).toBe(6);
  });
});
