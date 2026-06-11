import { useState, useEffect, useMemo } from 'react';
import { SIZE, FLEET } from '../game/constants.js';
import {
  emptyBoard,
  canPlace,
  placePiece,
  removePiece,
  randomBoard,
  placedPieceIds,
} from '../game/logic.js';
import { sfx } from '../game/sound.js';

export default function PlacementScreen({ playerName, onDone }) {
  const [board, setBoard] = useState(emptyBoard);
  const [selected, setSelected] = useState(FLEET[0].id);
  const [horizontal, setHorizontal] = useState(true);
  const [hoverIndex, setHoverIndex] = useState(null);

  const placed = placedPieceIds(board);
  const allPlaced = placed.size === FLEET.length;
  const selectedPiece = FLEET.find((p) => p.id === selected);

  // Tecla R gira a peça
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'r' || e.key === 'R') setHorizontal((h) => !h);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const preview = useMemo(() => {
    if (hoverIndex === null || !selectedPiece || placed.has(selected))
      return { cells: new Set(), valid: false };
    const cells = canPlace(board, hoverIndex, selectedPiece.size, horizontal);
    return { cells: new Set(cells || []), valid: !!cells };
  }, [hoverIndex, board, selectedPiece, horizontal, placed, selected]);

  function handleCellClick(index) {
    const cell = board[index];
    // Clicar numa peça já colocada remove ela (para reposicionar)
    if (cell.pieceId) {
      sfx.click();
      setBoard(removePiece(board, cell.pieceId));
      setSelected(cell.pieceId);
      return;
    }
    if (!selectedPiece || placed.has(selected)) return;
    const cells = canPlace(board, index, selectedPiece.size, horizontal);
    if (!cells) return;
    sfx.click();
    const next = placePiece(board, selected, cells);
    setBoard(next);
    // Seleciona automaticamente a próxima peça pendente
    const nextPending = FLEET.find((p) => !placedPieceIds(next).has(p.id));
    if (nextPending) setSelected(nextPending.id);
  }

  function randomize() {
    sfx.radar();
    setBoard(randomBoard());
  }

  return (
    <div className="screen placement fade-in">
      <h2>
        <span className="highlight">{playerName}</span>, esconda sua equipe!
      </h2>

      <div className="placement-layout">
        <div className="fleet-list">
          {FLEET.map((p) => {
            const isPlaced = placed.has(p.id);
            return (
              <button
                key={p.id}
                className={`fleet-btn ${selected === p.id ? 'selected' : ''} ${
                  isPlaced ? 'placed' : ''
                }`}
                onClick={() => {
                  sfx.click();
                  setSelected(p.id);
                }}
                disabled={isPlaced}
              >
                <span className="fleet-emoji">{p.emoji}</span>
                <span className="fleet-name">{p.name}</span>
                <span className="fleet-size">
                  {Array.from({ length: p.size }, () => '■').join('')}
                </span>
                {isPlaced && <span className="check">✓</span>}
              </button>
            );
          })}

          <div className="placement-actions">
            <button className="small-btn" onClick={() => setHorizontal((h) => !h)}>
              🔄 Girar ({horizontal ? 'horizontal' : 'vertical'}) — tecla R
            </button>
            <button className="small-btn" onClick={randomize}>
              🎲 Aleatório
            </button>
          </div>
        </div>

        <div
          className="grid placement-grid"
          style={{ '--size': SIZE }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {board.map((cell, i) => {
            const inPreview = preview.cells.has(i);
            const piece = cell.pieceId
              ? FLEET.find((p) => p.id === cell.pieceId)
              : null;
            return (
              <button
                key={i}
                className={[
                  'cell',
                  piece ? 'cell-piece' : '',
                  inPreview ? (preview.valid ? 'cell-preview' : 'cell-invalid') : '',
                ].join(' ')}
                onClick={() => handleCellClick(i)}
                onMouseEnter={() => setHoverIndex(i)}
              >
                {piece ? piece.emoji : ''}
              </button>
            );
          })}
        </div>
      </div>

      <button
        className="big-btn"
        disabled={!allPlaced}
        onClick={() => {
          sfx.laser();
          onDone(board);
        }}
      >
        {allPlaced ? '✅ Equipe escondida!' : 'Posicione todas as peças'}
      </button>
    </div>
  );
}
