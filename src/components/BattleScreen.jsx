import { useState, useEffect, useRef } from 'react';
import {
  SIZE,
  FLEET,
  RADAR_COST,
  PLASMA_COST,
  TURN_SECONDS,
} from '../game/constants.js';
import { fire, radarScan, plasmaCells } from '../game/logic.js';
import { sfx } from '../game/sound.js';

export default function BattleScreen({
  playerName,
  enemyName,
  enemyBoard,
  ownBoard,
  energy,
  onAttack,
  onSpendEnergy,
  onTimeout,
}) {
  const [mode, setMode] = useState('fire'); // fire | radar | plasma
  const [message, setMessage] = useState(`Sua vez, ${playerName}!`);
  const [board, setBoard] = useState(enemyBoard); // cópia local p/ radar e animação
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState(new Set()); // células recém atingidas
  const [locked, setLocked] = useState(false);
  const [seconds, setSeconds] = useState(TURN_SECONDS);
  const [localEnergy, setLocalEnergy] = useState(energy);
  const timedOut = useRef(false);

  // Timer do turno
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (!timedOut.current) {
            timedOut.current = true;
            setMessage('⏱️ Tempo esgotado!');
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

  function animateHits(indices) {
    setFlash(new Set(indices));
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  function handleCellClick(index) {
    if (locked || timedOut.current) return;

    if (mode === 'radar') {
      if (localEnergy < RADAR_COST) return;
      sfx.radar();
      setLocalEnergy((e) => e - RADAR_COST);
      onSpendEnergy(RADAR_COST);
      setBoard((b) => radarScan(b, index));
      setMessage('📡 Radar ativado! Sinais revelados na área.');
      setMode('fire');
      return;
    }

    if (mode === 'plasma') {
      if (localEnergy < PLASMA_COST) return;
      const targets = plasmaCells(index).filter((i) => !board[i].shot);
      if (targets.length === 0) return;
      sfx.plasma();
      setLocalEnergy((e) => e - PLASMA_COST);
      onSpendEnergy(PLASMA_COST);

      let next = board;
      let hits = 0;
      let destroyed = null;
      for (const t of targets) {
        const result = fire(next, t);
        if (result) {
          next = result.board;
          if (result.hit) hits++;
          if (result.destroyed) destroyed = result.destroyed;
        }
      }
      finishAttack(next, targets, targets.length, hits, destroyed, '☄️ Rajada de plasma!');
      return;
    }

    // Tiro normal
    const result = fire(board, index);
    if (!result) return; // célula já atingida
    sfx.laser();
    finishAttack(
      result.board,
      [index],
      1,
      result.hit ? 1 : 0,
      result.destroyed,
      null
    );
  }

  function finishAttack(nextBoard, indices, shotsFired, hitsMade, destroyed, prefix) {
    setLocked(true);
    setBoard(nextBoard);
    animateHits(indices);
    setMode('fire');

    const anyHit = hitsMade > 0;
    setTimeout(() => {
      if (anyHit) sfx.hit();
      else sfx.miss();

      let msg;
      if (destroyed) {
        msg = `🎉 Você encontrou: ${destroyed.emoji} ${destroyed.name}!`;
      } else if (anyHit) {
        msg = '💥 Sinal de vida detectado! Continue!';
      } else {
        msg = '🌫️ Nada por aqui... passando a vez.';
      }
      if (prefix) msg = `${prefix} ${msg}`;
      setMessage(msg);

      onAttack({
        board: nextBoard,
        indices,
        shotsFired,
        hitsMade,
        anyHit,
        destroyed,
      });
      if (anyHit) {
        setLocked(false);
        setSeconds(TURN_SECONDS); // acertou: timer reinicia
      }
      // Se errou, o App troca de jogador — a tela some sozinha
    }, 350);
  }

  function selectMode(m, cost) {
    if (m !== 'fire' && localEnergy < cost) return;
    sfx.click();
    setMode((cur) => (cur === m ? 'fire' : m));
  }

  const timerClass = seconds <= 5 ? 'timer danger' : seconds <= 10 ? 'timer warn' : 'timer';

  return (
    <div className={`screen battle fade-in ${shake ? 'shake' : ''}`}>
      <div className="battle-header">
        <h2>
          <span className="highlight">{playerName}</span> ataca o setor de{' '}
          {enemyName}
        </h2>
        <div className={timerClass}>⏱️ {seconds}s</div>
      </div>

      <div className="message">{message}</div>

      <div className="battle-layout">
        <div className="target-side">
          <div
            className={`grid target-grid mode-${mode}`}
            style={{ '--size': SIZE }}
          >
            {board.map((cell, i) => {
              const justHit = flash.has(i);
              let content = '';
              let cls = 'cell cell-fog';
              if (cell.shot && cell.pieceId) {
                content = '👨‍🚀';
                cls = `cell cell-hit ${justHit ? 'pop' : ''}`;
              } else if (cell.shot) {
                content = '✦';
                cls = `cell cell-miss ${justHit ? 'pop' : ''}`;
              } else if (cell.revealed) {
                cls = `cell ${cell.pieceId ? 'cell-signal' : 'cell-clear'}`;
                content = cell.pieceId ? '·' : '';
              }
              return (
                <button
                  key={i}
                  className={cls}
                  onClick={() => handleCellClick(i)}
                  disabled={cell.shot && mode === 'fire'}
                >
                  {content}
                </button>
              );
            })}
          </div>

          <div className="powers">
            <div className="energy">⚡ {localEnergy}</div>
            <button
              className={`power-btn ${mode === 'radar' ? 'active' : ''}`}
              disabled={localEnergy < RADAR_COST}
              onClick={() => selectMode('radar', RADAR_COST)}
            >
              📡 Radar ({RADAR_COST}⚡)
            </button>
            <button
              className={`power-btn ${mode === 'plasma' ? 'active' : ''}`}
              disabled={localEnergy < PLASMA_COST}
              onClick={() => selectMode('plasma', PLASMA_COST)}
            >
              ☄️ Plasma ({PLASMA_COST}⚡)
            </button>
          </div>
          {mode !== 'fire' && (
            <div className="mode-hint">
              {mode === 'radar'
                ? 'Clique numa célula para escanear a área 3x3'
                : 'Clique numa célula para disparar em cruz'}
            </div>
          )}
        </div>

        <div className="own-side">
          <div className="own-title">Sua equipe</div>
          <div className="grid own-grid" style={{ '--size': SIZE }}>
            {ownBoard.map((cell, i) => {
              const piece = cell.pieceId
                ? FLEET.find((p) => p.id === cell.pieceId)
                : null;
              let cls = 'mini-cell';
              let content = '';
              if (piece && cell.shot) {
                cls += ' mini-hit';
                content = '💥';
              } else if (piece) {
                cls += ' mini-piece';
                content = piece.emoji;
              } else if (cell.shot) {
                cls += ' mini-miss';
              }
              return (
                <div key={i} className={cls}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
