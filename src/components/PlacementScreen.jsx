import { useState, useEffect, useMemo, useRef } from 'react';
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
import { useT } from '../i18n/index.jsx';

export default function PlacementScreen({ playerName, themeId, mapId, planetId, boardSize = SIZE, onDone }) {
  const t = useT();
  const [board, setBoard] = useState(() => emptyBoard(boardSize));
  const [selected, setSelected] = useState(FLEET[0].id);
  const [horizontal, setHorizontal] = useState(true);
  const [hoverIndex, setHoverIndex] = useState(null);
  // Guarda o tipo do último ponteiro para diferenciar toque de mouse.
  const lastPointerType = useRef('mouse');

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
    const cells = canPlace(board, hoverIndex, selectedPiece.size, horizontal, boardSize);
    return { cells: new Set(cells || []), valid: !!cells };
  }, [hoverIndex, board, selectedPiece, horizontal, placed, selected, boardSize]);

  function handleCellClick(index) {
    const cell = board[index];
    // Clicar numa peça já colocada remove ela (para reposicionar)
    if (cell.pieceId) {
      sfx.click();
      setBoard(removePiece(board, cell.pieceId));
      setSelected(cell.pieceId);
      setHoverIndex(null);
      return;
    }
    if (!selectedPiece || placed.has(selected)) return;

    // Em telas de toque não há "hover": o primeiro toque numa célula mostra o
    // preview (válido/inválido) e o segundo toque na mesma célula confirma.
    // No mouse o hover já mostra o preview, então o clique posiciona direto.
    if (lastPointerType.current === 'touch' && hoverIndex !== index) {
      sfx.click();
      setHoverIndex(index);
      return;
    }

    const cells = canPlace(board, index, selectedPiece.size, horizontal, boardSize);
    if (!cells) return;
    sfx.click();
    const next = placePiece(board, selected, cells);
    setBoard(next);
    setHoverIndex(null);
    // Seleciona automaticamente a próxima peça pendente
    const nextPending = FLEET.find((p) => !placedPieceIds(next).has(p.id));
    if (nextPending) setSelected(nextPending.id);
  }

  function randomize() {
    sfx.radar();
    setBoard(randomBoard(boardSize));
  }

  return (
    <div
      className={`screen placement fade-in${mapId ? ` map-${mapId}` : ''}`}
      data-planet={mapId === 'planetas' ? planetId : undefined}
    >
      <h2>
        <span className="highlight">{playerName}</span>, {t('placement.hide')}
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
                <span className="fleet-name">{t(`fleet.${p.id}`)}</span>
                <span className="fleet-size">
                  {Array.from({ length: p.size }, () => '■').join('')}
                </span>
                {isPlaced && <span className="check">✓</span>}
              </button>
            );
          })}

          <div className="placement-actions">
            <button className="small-btn" onClick={() => setHorizontal((h) => !h)}>
              {t('placement.rotate', {
                orient: horizontal ? t('placement.horizontal') : t('placement.vertical'),
              })}
            </button>
            <button className="small-btn" onClick={randomize}>
              {t('placement.random')}
            </button>
          </div>
        </div>

        <div
          className={`grid placement-grid${themeId ? ` theme-${themeId}` : ''}`}
          style={{ '--size': boardSize }}
          onPointerDown={(e) => {
            lastPointerType.current = e.pointerType || 'mouse';
          }}
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
                onPointerEnter={(e) => {
                  // Só o mouse tem hover contínuo; no toque o preview é
                  // controlado pelo próprio clique (modelo de dois toques).
                  if ((e.pointerType || 'mouse') === 'mouse') setHoverIndex(i);
                }}
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
        {allPlaced ? t('placement.done') : t('placement.placeAll')}
      </button>
    </div>
  );
}
