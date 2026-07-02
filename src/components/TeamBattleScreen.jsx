import { useState, useEffect, useRef } from 'react';
import { SIZE, FLEET, RADAR_COST, PLASMA_COST, TURN_SECONDS } from '../game/constants.js';
import { fire, radarScan, plasmaCells } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';

export default function TeamBattleScreen({
  myName,
  allyName,
  enemy0Name,
  enemy1Name,
  enemy0Board,
  enemy1Board,
  ownBoard,
  allyBoard,
  energy,
  onAttack,
  onSpendEnergy,
  onTimeout,
}) {
  const t = useT();
  const [activeTarget, setActiveTarget] = useState(0); // 0 = enemy0, 1 = enemy1
  const [mode, setMode] = useState('fire');
  const [boards, setBoards] = useState([enemy0Board, enemy1Board]);
  const [message, setMessage] = useState(() => t('battle.yourTurn', { name: myName }));
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState({ board: -1, cells: new Set() });
  const [locked, setLocked] = useState(false);
  const [seconds, setSeconds] = useState(TURN_SECONDS);
  const [localEnergy, setLocalEnergy] = useState(energy);
  const timedOut = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (!timedOut.current) {
            timedOut.current = true;
            setMessage(t('battle.timeUp'));
            sfx.miss();
            onTimeout();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function animateHit(boardIdx, indices) {
    setFlash({ board: boardIdx, cells: new Set(indices) });
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  function handleCellClick(boardIdx, index) {
    if (locked || timedOut.current) return;

    const board = boards[boardIdx];

    if (mode === 'radar') {
      if (localEnergy < RADAR_COST) return;
      sfx.radar();
      setLocalEnergy((e) => e - RADAR_COST);
      onSpendEnergy(RADAR_COST);
      setBoards((b) => {
        const next = [...b];
        next[boardIdx] = radarScan(b[boardIdx], index);
        return next;
      });
      setMessage(t('battle.radarOn'));
      setMode('fire');
      return;
    }

    if (mode === 'plasma') {
      if (localEnergy < PLASMA_COST) return;
      const targets = plasmaCells(index).filter((i) => !board[i].shot);
      if (!targets.length) return;
      sfx.plasma();
      setLocalEnergy((e) => e - PLASMA_COST);
      onSpendEnergy(PLASMA_COST);
      let next = board;
      let hits = 0;
      let destroyed = null;
      for (const t of targets) {
        const r = fire(next, t);
        if (r) { next = r.board; if (r.hit) hits++; if (r.destroyed) destroyed = r.destroyed; }
      }
      finishAttack(boardIdx, next, targets, hits, destroyed, t('battle.plasmaBurst'));
      return;
    }

    const result = fire(board, index);
    if (!result) return;
    sfx.laser();
    finishAttack(boardIdx, result.board, [index], result.hit ? 1 : 0, result.destroyed, null);
  }

  function finishAttack(boardIdx, nextBoard, indices, hitsMade, destroyed, prefix) {
    setLocked(true);
    setBoards((b) => { const n = [...b]; n[boardIdx] = nextBoard; return n; });
    animateHit(boardIdx, indices);
    setMode('fire');

    const anyHit = hitsMade > 0;
    setTimeout(() => {
      if (anyHit) sfx.hit();
      else sfx.miss();

      let msg;
      if (destroyed) msg = t('battle.found', { emoji: destroyed.emoji, name: t(`fleet.${destroyed.id}`) });
      else if (anyHit) msg = t('battle.hitMsg');
      else msg = t('battle.missMsg');
      if (prefix) msg = `${prefix} ${msg}`;
      setMessage(msg);

      onAttack({ boardIdx, board: nextBoard, indices, hitsMade, anyHit, destroyed });
      if (anyHit) {
        setLocked(false);
        setSeconds(TURN_SECONDS);
      }
    }, 350);
  }

  function selectMode(m, cost) {
    if (m !== 'fire' && localEnergy < cost) return;
    sfx.click();
    setMode((cur) => (cur === m ? 'fire' : m));
  }

  const timerClass = seconds <= 5 ? 'timer danger' : seconds <= 10 ? 'timer warn' : 'timer';
  const enemyNames = [enemy0Name, enemy1Name];

  function renderEnemyBoard(boardIdx) {
    const board = boards[boardIdx];
    const isActive = activeTarget === boardIdx;
    const bf = flash.board === boardIdx ? flash.cells : new Set();
    return (
      <div
        key={boardIdx}
        className={`team-enemy-panel ${isActive ? 'team-enemy-active' : ''}`}
        onClick={() => setActiveTarget(boardIdx)}
      >
        <div className="team-enemy-label">
          {isActive ? '🎯 ' : ''}{enemyNames[boardIdx]}
        </div>
        <div
          className={`grid target-grid mode-${isActive ? mode : 'fire'}`}
          style={{ '--size': SIZE }}
        >
          {board.map((cell, i) => {
            const justHit = bf.has(i);
            let content = '';
            let cls = 'cell cell-fog';
            if (cell.shot && cell.pieceId) {
              content = '👨‍🚀'; cls = `cell cell-hit ${justHit ? 'pop' : ''}`;
            } else if (cell.shot) {
              content = '✦'; cls = `cell cell-miss ${justHit ? 'pop' : ''}`;
            } else if (cell.revealed) {
              cls = `cell ${cell.pieceId ? 'cell-signal' : 'cell-clear'}`;
              content = cell.pieceId ? '·' : '';
            }
            return (
              <button
                key={i}
                className={cls}
                onClick={(e) => { e.stopPropagation(); if (isActive) handleCellClick(boardIdx, i); }}
                disabled={!isActive || (cell.shot && mode === 'fire')}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderMiniBoard(board, label, flashCells = new Set()) {
    if (!board) return null;
    return (
      <div className="own-side">
        <div className="own-title">{label}</div>
        <div className="grid own-grid" style={{ '--size': SIZE }}>
          {board.map((cell, i) => {
            const piece = cell.pieceId ? FLEET.find((p) => p.id === cell.pieceId) : null;
            const justHit = flashCells.has(i);
            let cls = 'mini-cell';
            let content = '';
            if (piece && cell.shot) { cls += ` mini-hit ${justHit ? 'pop' : ''}`; content = '💥'; }
            else if (piece) { cls += ' mini-piece'; content = piece.emoji; }
            else if (cell.shot) cls += ' mini-miss';
            return <div key={i} className={cls}>{content}</div>;
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`screen battle fade-in ${shake ? 'shake' : ''}`}>
      <div className="battle-header">
        <h2>
          <span className="highlight">{myName}</span> {t('team.battleAttacksEnemyTeam')}
        </h2>
        <div className="mode-badge">{t('team.badge2v2')}</div>
        <div className={timerClass}>⏱️ {seconds}s</div>
      </div>

      <div className="message">{message}</div>
      <p className="team-hint">{t('team.attackSelectTarget')}</p>

      <div className="team-enemy-boards">
        {renderEnemyBoard(0)}
        {renderEnemyBoard(1)}
      </div>

      <div className="powers">
        <div className="energy">⚡ {localEnergy}</div>
        <button
          className={`power-btn ${mode === 'radar' ? 'active' : ''}`}
          disabled={localEnergy < RADAR_COST}
          onClick={() => selectMode('radar', RADAR_COST)}
        >
          {t('battle.radarBtn')} ({RADAR_COST}⚡)
        </button>
        <button
          className={`power-btn ${mode === 'plasma' ? 'active' : ''}`}
          disabled={localEnergy < PLASMA_COST}
          onClick={() => selectMode('plasma', PLASMA_COST)}
        >
          {t('battle.plasmaBtn')} ({PLASMA_COST}⚡)
        </button>
      </div>
      {mode !== 'fire' && (
        <div className="mode-hint">
          {t('team.selectTargetCell')}
        </div>
      )}

      <div className="team-mini-boards">
        {renderMiniBoard(ownBoard, `${myName} (${t('team.you')})`)}
        {renderMiniBoard(allyBoard, `${allyName} (${t('team.partner')})`)}
      </div>
    </div>
  );
}
