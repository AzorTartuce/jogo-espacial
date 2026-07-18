import { SIZE, FLEET } from './constants.js';

// Todas as funções abaixo aceitam um `boardSize` opcional (default SIZE) para
// suportar mapas com tabuleiro de tamanho diferente do padrão 8x8 (ver MAPS em
// constants.js). Chamadas existentes (online/team, que ainda não selecionam
// mapa) continuam usando o tamanho padrão sem precisar passar nada.

// Cada célula: { pieceId: string|null, shot: bool, revealed: bool }
export function emptyBoard(boardSize = SIZE) {
  return Array.from({ length: boardSize * boardSize }, () => ({
    pieceId: null,
    shot: false,
    revealed: false,
  }));
}

export function idx(row, col, boardSize = SIZE) {
  return row * boardSize + col;
}

export function rowCol(index, boardSize = SIZE) {
  return [Math.floor(index / boardSize), index % boardSize];
}

// Retorna os índices que a peça ocuparia, ou null se não couber
export function footprint(index, size, horizontal, boardSize = SIZE) {
  const [row, col] = rowCol(index, boardSize);
  const cells = [];
  for (let i = 0; i < size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r >= boardSize || c >= boardSize) return null;
    cells.push(idx(r, c, boardSize));
  }
  return cells;
}

export function canPlace(board, index, size, horizontal, boardSize = SIZE) {
  const cells = footprint(index, size, horizontal, boardSize);
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

export function randomBoard(boardSize = SIZE) {
  let board = emptyBoard(boardSize);
  for (const piece of FLEET) {
    let placed = false;
    while (!placed) {
      const index = Math.floor(Math.random() * boardSize * boardSize);
      const horizontal = Math.random() < 0.5;
      const cells = canPlace(board, index, piece.size, horizontal, boardSize);
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

// Confere se um tabuleiro que um cliente diz ter posicionado é uma frota
// válida: todas as peças de FLEET presentes exatamente uma vez, ocupando uma
// linha reta contígua do tamanho certo, sem peças desconhecidas nem células
// fora do tabuleiro. Usado pelo servidor para nunca confiar cegamente no
// posicionamento que um cliente envia (ver server.js `submit-board`).
export function validateBoard(board, boardSize = SIZE) {
  if (!Array.isArray(board) || board.length !== boardSize * boardSize) return false;

  const byPiece = new Map();
  for (let i = 0; i < board.length; i++) {
    const cell = board[i];
    if (!cell || typeof cell !== 'object') return false;
    const pid = cell.pieceId;
    if (pid == null) continue;
    if (!byPiece.has(pid)) byPiece.set(pid, []);
    byPiece.get(pid).push(i);
  }

  if (byPiece.size !== FLEET.length) return false;

  for (const piece of FLEET) {
    const cells = byPiece.get(piece.id);
    if (!cells || cells.length !== piece.size) return false;
    cells.sort((a, b) => a - b);

    const [row0] = rowCol(cells[0], boardSize);
    const horizontal = cells.length === 1 || rowCol(cells[1], boardSize)[0] === row0;
    const expected = footprint(cells[0], piece.size, horizontal, boardSize);
    if (!expected) return false;
    const expectedSorted = expected.slice().sort((a, b) => a - b);
    if (expectedSorted.length !== cells.length) return false;
    for (let i = 0; i < cells.length; i++) {
      if (expectedSorted[i] !== cells[i]) return false;
    }
  }

  return true;
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

// Resolve uma lista de tiros num tabuleiro, retornando o tabuleiro atualizado
// e um resumo do resultado (usado por todos os fluxos de jogo — local e online).
export function resolveShots(board, indices) {
  let b = board;
  const hitIndices = [];
  let destroyed = null;
  for (const i of indices) {
    const r = fire(b, i);
    if (r) {
      b = r.board;
      if (r.hit) hitIndices.push(i);
      if (r.destroyed) destroyed = { id: r.destroyed.id, emoji: r.destroyed.emoji };
    }
  }
  return { board: b, hitIndices, destroyed, sunkAll: allFound(b) };
}

// Revela área (2*radius+1)² ao redor do centro (radar)
export function radarScan(board, center, radius = 1, boardSize = SIZE) {
  const [row, col] = rowCol(center, boardSize);
  const next = board.slice();
  for (let r = row - radius; r <= row + radius; r++) {
    for (let c = col - radius; c <= col + radius; c++) {
      if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
        const i = idx(r, c, boardSize);
        next[i] = { ...next[i], revealed: true };
      }
    }
  }
  return next;
}

// Índices na área quadrada do radar (mesma forma de radarScan, mas só os
// índices) — usada pelo cliente (preview) e pelo servidor (autoridade).
export function radarArea(center, radius = 1, boardSize = SIZE) {
  const [row, col] = rowCol(center, boardSize);
  const cells = [];
  for (let r = row - radius; r <= row + radius; r++) {
    for (let c = col - radius; c <= col + radius; c++) {
      if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) cells.push(idx(r, c, boardSize));
    }
  }
  return cells;
}

// Células em cruz para a rajada de plasma
export function plasmaCells(center, boardSize = SIZE) {
  const [row, col] = rowCol(center, boardSize);
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
      return r >= 0 && r < boardSize && c >= 0 && c < boardSize;
    })
    .map(([dr, dc]) => idx(row + dr, col + dc, boardSize));
}
