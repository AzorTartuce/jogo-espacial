import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SIZE,
  FLEET,
  RADAR_COST,
  PLASMA_COST,
  TURN_SECONDS,
  MODE_ICONS,
} from '../game/constants.js';
import { plasmaCells, rowCol, idx } from '../game/logic.js';
import { sfx, playEventSound } from '../game/sound.js';
import { randomEvent, EVENT_INTERVAL } from '../game/events.js';
import { useT } from '../i18n/index.jsx';
import EventBanner from './EventBanner.jsx';

// Sentinelas: o atacante nunca conhece as peças reais do inimigo. Um acerto
// vira este pieceId "opaco" só para pintar a célula; um sinal de radar idem.
const HIT_PIECE = '__hit__';
const SIGNAL_PIECE = '__signal__';

// Índices na área quadrada do radar (mesma forma de radarScan, mas só os índices).
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
  onSendShot,
  onSendProbe,
  shotResult,
  probeResult,
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
  // Descreve a última requisição em voo (tiro/radar/anomalia) para saber como
  // aplicar a resposta do defensor quando ela chegar.
  const pendingRef = useRef(null);
  const lastShotId = useRef(0);
  const lastProbeId = useRef(0);
  const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);
  const sendProbeRef = useRef(onSendProbe);
  useEffect(() => { sendProbeRef.current = onSendProbe; });

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
    // Cada evento tem seu próprio som distinto (ver playEventSound em sound.js).
    playEventSound(event.id);
    switch (event.id) {
      case 'nebula':
        setBoard((b) => b.map((c) => ({ ...c, revealed: false })));
        break;
      case 'interference':
        setSeconds((s) => Math.max(5, Math.floor(s / 2)));
        break;
      case 'vision': {
        // O atacante não tem o mapa: pede ao defensor se uma célula tem peça.
        const b = boardRef.current;
        const candidates = b.map((c, i) => i).filter((i) => !b[i].shot && !b[i].revealed);
        if (candidates.length) {
          const target = candidates[Math.floor(Math.random() * candidates.length)];
          pendingRef.current = { kind: 'reveal' };
          sendProbeRef.current?.([target]);
        }
        break;
      }
      case 'solar_storm':
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

  // Envia os tiros ao defensor; a resolução (acerto/erro) volta em `shotResult`.
  function sendShot(indices, prefix) {
    if (!indices.length) return;
    setLocked(true);
    setMode('fire');
    pendingRef.current = { kind: 'shot', prefix: prefix || null };
    onSendShot(indices);
  }

  function handleCellClick(index) {
    if (locked || timedOut.current) return;

    if (gameMode === 'classico') {
      if (board[index].shot) return;
      sfx.laser();
      sendShot([index]);
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
      setLocked(true);
      pendingRef.current = { kind: 'radar' };
      onSendProbe(radarArea(index, radarRadius));
      return;
    }

    if (mode === 'plasma') {
      if (localEnergy < effectivePlasmaCost) return;
      const targets = plasmaCells(index).filter((i) => !board[i].shot);
      if (targets.length === 0) return;
      sfx.plasma();
      setLocalEnergy((e) => e - effectivePlasmaCost);
      onSpendEnergy(effectivePlasmaCost);
      sendShot(targets, t('battle.plasmaBurst'));
      return;
    }

    // Tiro normal
    if (board[index].shot) return;
    sfx.laser();
    sendShot([index]);
  }

  // Aplica o resultado do tiro devolvido pelo defensor.
  function applyShotResult(res) {
    const pend = pendingRef.current || {};
    const indices = res.indices;
    const hitSet = new Set(res.hitIndices);
    const next = boardRef.current.slice();
    for (const i of indices) {
      next[i] = {
        ...next[i],
        shot: true,
        pieceId: hitSet.has(i) ? HIT_PIECE : next[i].pieceId,
      };
    }
    setBoard(next);
    animateHits(indices);
    setMode('fire');

    const hitsMade = res.hitIndices.length;
    const anyHit = hitsMade > 0;
    const destroyed = res.destroyed;
    setTimeout(() => {
      if (anyHit) sfx.hit();
      else sfx.miss();

      // Sensor de Anomalia: ao errar, pede ao defensor uma sondagem adjacente.
      if (!anyHit && upgrades.includes('anomaly_sensor') && indices.length > 0) {
        const candidates = new Set();
        for (const cellIdx of indices) {
          const [row, col] = rowCol(cellIdx);
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
              const j = idx(r, c);
              if (!next[j].shot && !next[j].revealed) candidates.add(j);
            }
          }
        }
        if (candidates.size) {
          pendingRef.current = { kind: 'anomaly' };
          onSendProbe([...candidates]);
        }
      }

      let msg;
      if (destroyed) {
        msg = t('battle.found', { emoji: destroyed.emoji, name: t(`fleet.${destroyed.id}`) });
      } else if (anyHit) {
        msg = t('battle.hitMsg');
      } else {
        msg = t('battle.missMsg');
      }
      if (pend.prefix) msg = `${pend.prefix} ${msg}`;
      setMessage(msg);

      onAttack({
        board: next,
        indices,
        shotsFired: indices.length,
        hitsMade,
        anyHit,
        destroyed,
        sunkAll: res.sunkAll,
      });
      if (anyHit) {
        setLocked(false);
        setSeconds(timerBase);
      }
    }, 350);
  }

  // Resposta de tiro do defensor.
  useEffect(() => {
    if (!shotResult || shotResult.id === lastShotId.current) return;
    lastShotId.current = shotResult.id;
    applyShotResult(shotResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotResult]);

  // Resposta de sondagem (radar / anomalia / visão) do defensor.
  useEffect(() => {
    if (!probeResult || probeResult.id === lastProbeId.current) return;
    lastProbeId.current = probeResult.id;
    const kind = (pendingRef.current || {}).kind;
    setBoard((b) => {
      const next = b.slice();
      if (kind === 'anomaly') {
        const cells = probeResult.cells;
        const pick = cells[Math.floor(Math.random() * cells.length)];
        if (pick && !next[pick.index].shot) {
          next[pick.index] = { ...next[pick.index], revealed: true, pieceId: pick.hasPiece ? SIGNAL_PIECE : null };
        }
      } else {
        for (const c of probeResult.cells) {
          if (!next[c.index].shot) {
            next[c.index] = { ...next[c.index], revealed: true, pieceId: c.hasPiece ? SIGNAL_PIECE : null };
          }
        }
      }
      return next;
    });
    if (kind === 'radar') {
      setMode('fire');
      setMessage(t('battle.radarOn'));
      setLocked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeResult]);

  function selectMode(m, cost) {
    if (m !== 'fire' && localEnergy < cost) return;
    sfx.click();
    setMode((cur) => (cur === m ? 'fire' : m));
  }

  const timerClass =
    seconds <= 5 ? 'timer danger' : seconds <= 10 ? 'timer warn' : 'timer';

  const showPowers = gameMode !== 'classico';
  const modeTitle = gameMode === 'duelo' ? t('gameMode.duelo.short') : t(`gameMode.${gameMode}.title`);
  const modeLabelText = `${MODE_ICONS[gameMode] ?? ''} ${modeTitle}`.trim();

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

      <div className="message" role="status" aria-live="polite">{message}</div>

      <div className="battle-layout">
        <div className="target-side">
          <div
            className={`grid target-grid mode-${mode}`}
            style={{ '--size': SIZE }}
            aria-label={t('battle.enemyBoardOf', { name: enemyName })}
          >
            {board.map((cell, i) => {
              const justHit = flash.has(i);
              let content = '';
              let cls = 'cell cell-fog';
              let stateKey = 'battle.cellNotAttacked';
              if (cell.shot && cell.pieceId) {
                content = '👨‍🚀';
                cls = `cell cell-hit ${justHit ? 'pop' : ''}`;
                stateKey = 'battle.cellHit';
              } else if (cell.shot) {
                content = '✦';
                cls = `cell cell-miss ${justHit ? 'pop' : ''}`;
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
                  onClick={() => handleCellClick(i)}
                  disabled={cell.shot && mode === 'fire'}
                  aria-label={t('battle.cell', { row: cr + 1, col: cc + 1, state: t(stateKey) })}
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
