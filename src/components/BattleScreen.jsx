import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SIZE,
  FLEET,
  RADAR_COST,
  PLASMA_COST,
  TURN_SECONDS,
} from '../game/constants.js';
import { fire, radarScan, plasmaCells, rowCol, idx } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { randomEvent, EVENT_INTERVAL } from '../game/events.js';
import { useT } from '../i18n/index.jsx';
import EventBanner from './EventBanner.jsx';

export default function BattleScreen({
  playerName,
  enemyName,
  enemyBoard,
  ownBoard,
  energy,
  gameMode,
  upgrades = [],
  onAttack,
  onSpendEnergy,
  onTimeout,
  onUpgradeUsed,
}) {
  const t = useT();
  const timerBase = TURN_SECONDS + (upgrades.includes('timer_boost') ? 10 : 0);
  const radarRadius = upgrades.includes('radar_xl') ? 2 : 1;
  const basePlasmaCost = upgrades.includes('plasma_cheap') ? 3 : PLASMA_COST;

  const [mode, setMode] = useState('fire'); // fire | radar | plasma
  const [message, setMessage] = useState(() => t('battle.yourTurn', { name: playerName }));
  const [board, setBoard] = useState(enemyBoard);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState(new Set());
  const [locked, setLocked] = useState(false);
  const [seconds, setSeconds] = useState(timerBase);
  const [localEnergy, setLocalEnergy] = useState(energy);
  const [activeEvent, setActiveEvent] = useState(null);
  const [solarStorm, setSolarStorm] = useState(false);
  const timedOut = useRef(false);
  const radarFreeUsedRef = useRef(false);

  const effectiveRadarCost = solarStorm ? RADAR_COST + 2 : RADAR_COST;
  const effectivePlasmaCost = solarStorm ? basePlasmaCost + 2 : basePlasmaCost;
  const radarIsFree = upgrades.includes('radar_free');

  // Timer do turno
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

  // Timer de eventos (Instabilidade)
  const applyEvent = useCallback((event) => {
    switch (event.id) {
      case 'nebula':
        sfx.radar();
        setBoard((b) => b.map((c) => ({ ...c, revealed: false })));
        break;
      case 'interference':
        sfx.miss();
        setSeconds((s) => Math.max(5, Math.floor(s / 2)));
        break;
      case 'vision':
        sfx.radar();
        setBoard((b) => {
          const candidates = b
            .map((c, i) => i)
            .filter((i) => !b[i].shot && !b[i].revealed);
          if (!candidates.length) return b;
          const target = candidates[Math.floor(Math.random() * candidates.length)];
          const next = b.slice();
          next[target] = { ...next[target], revealed: true };
          return next;
        });
        break;
      case 'solar_storm':
        sfx.plasma();
        setSolarStorm(true);
        setTimeout(() => setSolarStorm(false), 15000);
        break;
    }
  }, []);

  useEffect(() => {
    if (gameMode !== 'instabilidade') return;
    const interval = setInterval(() => {
      if (timedOut.current) return;
      const event = randomEvent();
      setActiveEvent(event);
      applyEvent(event);
    }, EVENT_INTERVAL * 1000);
    return () => clearInterval(interval);
  }, [gameMode, applyEvent]);

  function animateHits(indices) {
    setFlash(new Set(indices));
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  function handleCellClick(index) {
    if (locked || timedOut.current) return;

    if (gameMode === 'classico') {
      const result = fire(board, index);
      if (!result) return;
      sfx.laser();
      finishAttack(result.board, [index], 1, result.hit ? 1 : 0, result.destroyed, null);
      return;
    }

    if (mode === 'radar') {
      const cost = radarIsFree ? 0 : effectiveRadarCost;
      if (!radarIsFree && localEnergy < effectiveRadarCost) return;
      sfx.radar();
      if (radarIsFree) {
        if (radarFreeUsedRef.current) return;
        radarFreeUsedRef.current = true;
        onUpgradeUsed?.('radar_free');
      } else {
        setLocalEnergy((e) => e - cost);
        onSpendEnergy(cost);
      }
      setBoard((b) => radarScan(b, index, radarRadius));
      setMessage(t('battle.radarOn'));
      setMode('fire');
      return;
    }

    if (mode === 'plasma') {
      if (localEnergy < effectivePlasmaCost) return;
      const targets = plasmaCells(index).filter((i) => !board[i].shot);
      if (targets.length === 0) return;
      sfx.plasma();
      setLocalEnergy((e) => e - effectivePlasmaCost);
      onSpendEnergy(effectivePlasmaCost);

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
      finishAttack(next, targets, targets.length, hits, destroyed, t('battle.plasmaBurst'));
      return;
    }

    // Tiro normal
    const result = fire(board, index);
    if (!result) return;
    sfx.laser();
    finishAttack(result.board, [index], 1, result.hit ? 1 : 0, result.destroyed, null);
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

      // Sensor de Anomalia: revela célula adjacente ao errar
      if (!anyHit && upgrades.includes('anomaly_sensor') && indices.length > 0) {
        setBoard((b) => {
          const candidates = new Set();
          for (const cellIdx of indices) {
            const [row, col] = rowCol(cellIdx);
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
              const r = row + dr;
              const c = col + dc;
              if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
                const i = idx(r, c);
                if (!b[i].shot && !b[i].revealed) candidates.add(i);
              }
            }
          }
          if (!candidates.size) return b;
          const arr = [...candidates];
          const target = arr[Math.floor(Math.random() * arr.length)];
          const next = b.slice();
          next[target] = { ...next[target], revealed: true };
          return next;
        });
      }

      let msg;
      if (destroyed) {
        msg = t('battle.found', { emoji: destroyed.emoji, name: t(`fleet.${destroyed.id}`) });
      } else if (anyHit) {
        msg = t('battle.hitMsg');
      } else {
        msg = t('battle.missMsg');
      }
      if (prefix) msg = `${prefix} ${msg}`;
      setMessage(msg);

      onAttack({ board: nextBoard, indices, shotsFired, hitsMade, anyHit, destroyed });
      if (anyHit) {
        setLocked(false);
        setSeconds(timerBase);
      }
    }, 350);
  }

  function selectMode(m, cost) {
    if (m !== 'fire' && localEnergy < cost) return;
    sfx.click();
    setMode((cur) => (cur === m ? 'fire' : m));
  }

  const timerClass =
    seconds <= 5 ? 'timer danger' : seconds <= 10 ? 'timer warn' : 'timer';

  const showPowers = gameMode !== 'classico';
  const modeIcons = { classico: '🎯', ascensao: '⚡', instabilidade: '🌀', duelo: '🏅' };
  const modeTitle = gameMode === 'duelo' ? t('gameMode.duelo.short') : t(`gameMode.${gameMode}.title`);
  const modeLabelText = `${modeIcons[gameMode] ?? ''} ${modeTitle}`.trim();

  return (
    <div className={`screen battle fade-in ${shake ? 'shake' : ''}`}>
      {activeEvent && (
        <EventBanner event={activeEvent} onDone={() => setActiveEvent(null)} />
      )}

      <div className="battle-header">
        <h2>
          <span className="highlight">{playerName}</span> {t('battle.attacksSectorOf')}{' '}
          {enemyName}
        </h2>
        <div className={`mode-badge${solarStorm ? ' mode-badge-storm' : ''}`}>
          {solarStorm ? t('battle.storm') : modeLabelText}
        </div>
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

          {showPowers && (
            <>
              <div className="powers">
                <div className="energy">⚡ {localEnergy}</div>
                <button
                  className={`power-btn ${mode === 'radar' ? 'active' : ''} ${radarIsFree ? 'power-free' : ''}`}
                  disabled={!radarIsFree && localEnergy < effectiveRadarCost}
                  onClick={() => selectMode('radar', radarIsFree ? 0 : effectiveRadarCost)}
                >
                  {t('battle.radarBtn')} {radarIsFree ? t('battle.free') : `(${effectiveRadarCost}⚡)`}
                </button>
                <button
                  className={`power-btn ${mode === 'plasma' ? 'active' : ''}`}
                  disabled={localEnergy < effectivePlasmaCost}
                  onClick={() => selectMode('plasma', effectivePlasmaCost)}
                >
                  {t('battle.plasmaBtn')} ({effectivePlasmaCost}⚡)
                </button>
              </div>
              {mode !== 'fire' && (
                <div className="mode-hint">
                  {mode === 'radar'
                    ? t(radarRadius === 2 ? 'battle.radarHint4' : 'battle.radarHint3')
                    : t('battle.plasmaHint')}
                </div>
              )}
            </>
          )}

          {upgrades.length > 0 && (
            <div className="active-upgrades">
              {upgrades.map((id) => {
                const labels = {
                  timer_boost: '⏱️+10s',
                  radar_xl: '📡4×4',
                  plasma_cheap: '☄️3⚡',
                  radar_free: `🎁${t('battle.pipFree')}`,
                  anomaly_sensor: `🔭${t('battle.pipSensor')}`,
                  energy_bonus: null,
                };
                return labels[id] ? (
                  <span key={id} className="upgrade-pip">{labels[id]}</span>
                ) : null;
              })}
            </div>
          )}
        </div>

        <div className="own-side">
          <div className="own-title">{t('battle.yourTeam')}</div>
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
