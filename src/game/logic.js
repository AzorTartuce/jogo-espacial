import { SIZE, FLEET } from './constants.js';

// Cada célula: { pieceId: string|null, shot: bool, revealed: bool }
export function emptyBoard() {
  return Array.from({ length: SIZE * SIZE }, () => ({
    pieceId: null,
    shot: false,
    revealed: false,
  }));
}

export function idx(row, col) {
  return row * SIZE + col;
}

export function rowCol(index) {
  return [Math.floor(index / SIZE), index % SIZE];
}

// Retorna os índices que a peça ocuparia, ou null se não couber
export function footprint(index, size, horizontal) {
  const [row, col] = rowCol(index);
  const cells = [];
  for (let i = 0; i < size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r >= SIZE || c >= SIZE) return null;
    cells.push(idx(r, c));
  }
  return cells;
}

export function canPlace(board, index, size, horizontal) {
  const cells = footprint(index, size, horizontal);
  if (!cells) return null;
  if (cells.some((i) => board[i].pieceId)) return null;
  return cells;
}

export function placePiece(board, pieceId, cells) {
  const next = board.slice();
  for (const i of cells) {
    next[i] = { ...next[i], pieceId };
  }
  return next;
}

export function removePiece(board, pieceId) {
  return board.map((cell) =>
    cell.pieceId === pieceId ? { ...cell, pieceId: null } : cell
  );
}

export function randomBoard() {
  let board = emptyBoard();
  for (const piece of FLEET) {
    let placed = false;
    while (!placed) {
      const index = Math.floor(Math.random() * SIZE * SIZE);
      const horizontal = Math.random() < 0.5;
      const cells = canPlace(board, index, piece.size, horizontal);
      if (cells) {
        board = placePiece(board, piece.id, cells);
        placed = true;
      }
    }
  }
  return board;
}

export function placedPieceIds(board) {
  return new Set(board.filter((c) => c.pieceId).map((c) => c.pieceId));
}

// Dispara em uma célula. Retorna null se já foi atingida.
export function fire(board, index) {
  if (board[index].shot) return null;
  const next = board.slice();
  next[index] = { ...next[index], shot: true };
  const pieceId = next[index].pieceId;
  const hit = !!pieceId;
  let destroyed = null;
  if (hit) {
    const remaining = next.some((c) => c.pieceId === pieceId && !c.shot);
    if (!remaining) destroyed = FLEET.find((p) => p.id === pieceId);
  }
  return { board: next, hit, destroyed, index };
}

export function allFound(board) {
  return board.every((c) => !c.pieceId || c.shot);
}

// Revela área 3x3 ao redor do centro (radar)
export function radarScan(board, center) {
  const [row, col] = rowCol(center);
  const next = board.slice();
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
        const i = idx(r, c);
        next[i] = { ...next[i], revealed: true };
      }
    }
  }
  return next;
}

// Células em cruz para a rajada de plasma
export function plasmaCells(center) {
  const [row, col] = rowCol(center);
  const offsets = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  return offsets
    .filter(([dr, dc]) => {
      const r = row + dr;
      const c = col + dc;
      return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
    })
    .map(([dr, dc]) => idx(row + dr, col + dc));
}
