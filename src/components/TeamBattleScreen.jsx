import { useState, useEffect, useRef } from 'react';
import { SIZE, RADAR_COST, PLASMA_COST, TURN_SECONDS } from '../game/constants.js';
import { plasmaCells, rowCol, idx } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { useT } from '../i18n/index.jsx';
import MiniBoard from './MiniBoard.jsx';

// Sentinelas: o atacante nunca conhece as peças reais do inimigo (problema 3).
const HIT_PIECE = '__hit__';
const SIGNAL_PIECE = '__signal__';

function radarArea(center, radius) {
  const [row, col] = rowCol(center);
  const cells = [];
  for (let r = row - radius; r <= row + radius; r++) {
    for (let c = col - radius; c <= col + radius; c++) {
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) cells.push(idx(r, c));
    }
  }
  return cells;
}

export default function TeamBattleScreen({
  myName,
  allyName,
  enemy0Name,
  enemy1Name,
  enemy0Board,
  enemy1Board,
  enemyIndices,
  ownBoard,
  allyBoard,
  energy,
  onSendShot,
  onSendProbe,
  onAttackResolved,
  onSpendEnergy,
  onTimeout,
  shotResult,
  probeResult,
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
  const pendingRef = useRef(null);
  const lastShotId = useRef(0);
  const lastProbeId = useRef(0);
  const boardsRef = useRef(boards);
  useEffect(() => { boardsRef.current = boards; }, [boards]);

  // Mapeia o índice do jogador defensor para o painel local (0 ou 1).
  const boardIdxOf = (targetPlayer) => enemyIndices.indexOf(targetPlayer);

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

  // Envia os tiros ao defensor; o resultado volta em `shotResult`.
  function sendShot(boardIdx, targetPlayer, indices, prefix) {
    if (!indices.length) return;
    setLocked(true);
    setMode('fire');
    pendingRef.current = { kind: 'shot', boardIdx, targetPlayer, indices, prefix: prefix || null };
    onSendShot(targetPlayer, indices);
  }

  function handleCellClick(boardIdx, index) {
    if (locked || timedOut.current) return;

    const board = boards[boardIdx];
    const targetPlayer = enemyIndices[boardIdx];

    if (mode === 'radar') {
      if (localEnergy < RADAR_COST) return;
      sfx.radar();
      setLocalEnergy((e) => e - RADAR_COST);
      onSpendEnergy(RADAR_COST);
      setLocked(true);
      pendingRef.current = { kind: 'radar', boardIdx, targetPlayer };
      onSendProbe(targetPlayer, radarArea(index, 1));
      return;
    }

    if (mode === 'plasma') {
      if (localEnergy < PLASMA_COST) return;
      const targets = plasmaCells(index).filter((i) => !board[i].shot);
      if (!targets.length) return;
      sfx.plasma();
      setLocalEnergy((e) => e - PLASMA_COST);
      onSpendEnergy(PLASMA_COST);
      sendShot(boardIdx, targetPlayer, targets, t('battle.plasmaBurst'));
      return;
    }

    if (board[index].shot) return;
    sfx.laser();
    sendShot(boardIdx, targetPlayer, [index]);
  }

  // Aplica o resultado do tiro devolvido pelo defensor.
  useEffect(() => {
    if (!shotResult || shotResult.id === lastShotId.current) return;
    lastShotId.current = shotResult.id;
    const pend = pendingRef.current || {};
    const boardIdx = boardIdxOf(shotResult.targetPlayer);
    if (boardIdx === -1) return;
    const { indices, hitIndices, destroyed, targetSunk } = shotResult;
    const hitSet = new Set(hitIndices);
    const cur = boardsRef.current;
    const nextBoard = cur[boardIdx].slice();
    for (const i of indices) {
      nextBoard[i] = { ...nextBoard[i], shot: true, pieceId: hitSet.has(i) ? HIT_PIECE : nextBoard[i].pieceId };
    }
    setBoards((b) => { const n = [...b]; n[boardIdx] = nextBoard; return n; });
    animateHit(boardIdx, indices);
    setMode('fire');

    const anyHit = hitIndices.length > 0;
    setTimeout(() => {
      if (anyHit) sfx.hit();
      else sfx.miss();
      if (destroyed) sfx.destroyed();

      let msg;
      if (destroyed) msg = t('battle.found', { emoji: destroyed.emoji, name: t(`fleet.${destroyed.id}`) });
      else if (anyHit) msg = t('battle.hitMsg');
      else msg = t('battle.missMsg');
      if (pend.prefix) msg = `${pend.prefix} ${msg}`;
      setMessage(msg);

      onAttackResolved({ targetPlayer: shotResult.targetPlayer, indices, hitIndices, destroyed, targetSunk });
      if (anyHit) {
        setLocked(false);
        setSeconds(TURN_SECONDS);
      }
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotResult]);

  // Aplica o resultado da sondagem de radar devolvido pelo defensor.
  useEffect(() => {
    if (!probeResult || probeResult.id === lastProbeId.current) return;
    lastProbeId.current = probeResult.id;
    const boardIdx = boardIdxOf(probeResult.targetPlayer);
    if (boardIdx === -1) return;
    setBoards((b) => {
      const next = [...b];
      const nb = next[boardIdx].slice();
      for (const c of probeResult.cells) {
        if (!nb[c.index].shot) nb[c.index] = { ...nb[c.index], revealed: true, pieceId: c.hasPiece ? SIGNAL_PIECE : null };
      }
      next[boardIdx] = nb;
      return next;
    });
    setMode('fire');
    setMessage(t('battle.radarOn'));
    setLocked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeResult]);

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
          aria-label={t('battle.enemyBoardOf', { name: enemyNames[boardIdx] })}
        >
          {board.map((cell, i) => {
            const justHit = bf.has(i);
            let content = '';
            let cls = 'cell cell-fog';
            let stateKey = 'battle.cellNotAttacked';
            if (cell.shot && cell.pieceId) {
              content = '👨‍🚀'; cls = `cell cell-hit ${justHit ? 'pop' : ''}`;
              stateKey = 'battle.cellHit';
            } else if (cell.shot) {
              content = '✦'; cls = `cell cell-miss ${justHit ? 'pop' : ''}`;
              stateKey = 'battle.cellMiss';
            } else if (cell.revealed) {
              cls = `cell ${cell.pieceId ? 'cell-signal' : 'cell-clear'}`;
              content = cell.pieceId ? '·' : '';
              stateKey = cell.pieceId ? 'battle.cellSignal' : 'battle.cellClear';
            }
            const [cr, cc] = rowCol(i);
            return (
              <button
                key={i}
                className={cls}
                onClick={(e) => { e.stopPropagation(); if (isActive) handleCellClick(boardIdx, i); }}
                disabled={!isActive || (cell.shot && mode === 'fire')}
                aria-label={t('battle.cell', { row: cr + 1, col: cc + 1, state: t(stateKey) })}
              >
                {content}
              </button>
            );
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

      <div className="message" role="status" aria-live="polite">{message}</div>
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
        <MiniBoard board={ownBoard} label={`${myName} (${t('team.you')})`} />
        <MiniBoard board={allyBoard} label={`${allyName} (${t('team.partner')})`} />
      </div>
    </div>
  );
}
