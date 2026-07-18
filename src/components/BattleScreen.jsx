import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SIZE,
  FLEET,
  RADAR_COST,
  PLASMA_COST,
  TURN_SECONDS,
  MODE_ICONS,
} from '../game/constants.js';
import { plasmaCells, radarArea, rowCol, idx } from '../game/logic.js';
import { sfx, playEventSound } from '../game/sound.js';
import { randomEvent, EVENT_INTERVAL } from '../game/events.js';
import { useT } from '../i18n/index.jsx';
import EventBanner from './EventBanner.jsx';

// Sentinelas: o atacante nunca conhece as peças reais do inimigo. Um acerto
// vira este pieceId "opaco" só para pintar a célula; um sinal de radar idem.
const HIT_PIECE = '__hit__';
const SIGNAL_PIECE = '__signal__';

export default function BattleScreen({
  playerName,
  enemyName,
  enemyBoard,
  ownBoard,
  energy,
  gameMode,
  themeId,
  mapId,
  planetId,
  boardSize = SIZE,
  upgrades = [],
  onAttack,
  onSpendEnergy,
  onTimeout,
  onUpgradeUsed,
  onSendShot,
  onSendProbe,
  shotResult,
  probeResult,
  // Instabilidade: notifica o pai quando este atacante sorteia um evento, para
  // que ele seja retransmitido via rede ao(s) outro(s) jogador(es) da sala.
  // Opcional — LocalGame não passa isto (não há rede) e nada quebra sem ele.
  onSendEvent,
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
  const [radarFx, setRadarFx] = useState(null);
  const radarFxTimeoutRef = useRef(null);
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

  // Canvas de efeitos (explosão de partículas no acerto + trilha do plasma).
  const targetGridRef = useRef(null);
  const particleCanvasRef = useRef(null);
  const particlesRef = useRef([]);
  const trailsRef = useRef([]);
  const particleRafRef = useRef(null);
  const reducedMotionRef = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const canvas = particleCanvasRef.current;
    const container = targetGridRef.current;
    if (!canvas || !container) return;
    function resize() {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [boardSize]);

  useEffect(() => () => cancelAnimationFrame(particleRafRef.current), []);

  function cellCenter(index) {
    const canvas = particleCanvasRef.current;
    const [row, col] = rowCol(index, boardSize);
    return {
      x: ((col + 0.5) / boardSize) * (canvas?.width || 0),
      y: ((row + 0.5) / boardSize) * (canvas?.height || 0),
    };
  }

  function ensureParticleLoop() {
    if (particleRafRef.current) return;
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const step = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Trilhas do tiro de plasma: traço luminoso que percorre origem → alvo.
      trailsRef.current = trailsRef.current.filter((tr) => {
        const progress = Math.min((now - tr.start) / tr.duration, 1);
        const hx = tr.x0 + (tr.x1 - tr.x0) * progress;
        const hy = tr.y0 + (tr.y1 - tr.y0) * progress;
        const grad = ctx.createLinearGradient(tr.x0, tr.y0, hx, hy);
        grad.addColorStop(0, 'rgba(255, 94, 156, 0)');
        grad.addColorStop(1, 'rgba(255, 160, 90, 0.9)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tr.x0, tr.y0);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 200, 120, 0.9)';
        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        return progress < 1;
      });

      // Partículas de impacto.
      const next = [];
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.life -= 0.03;
        if (p.life > 0) {
          ctx.globalAlpha = Math.max(p.life, 0);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          next.push(p);
        }
      }
      ctx.globalAlpha = 1;
      particlesRef.current = next;

      if (particlesRef.current.length || trailsRef.current.length) {
        particleRafRef.current = requestAnimationFrame(step);
      } else {
        particleRafRef.current = null;
      }
    };
    particleRafRef.current = requestAnimationFrame(step);
  }

  function spawnHitBurst(indices) {
    if (reducedMotionRef.current || !indices.length) return;
    for (const i of indices) {
      const { x, y } = cellCenter(i);
      for (let k = 0; k < 22; k++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3.2;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: 1.5 + Math.random() * 2.5,
          color: Math.random() > 0.5 ? 'rgba(255, 110, 160, 0.95)' : 'rgba(255, 200, 120, 0.95)',
        });
      }
    }
    ensureParticleLoop();
  }

  function spawnPlasmaTrail(originIndex, targetIndices) {
    if (reducedMotionRef.current || !targetIndices.length) return;
    const origin = cellCenter(originIndex);
    const now = performance.now();
    for (const i of targetIndices) {
      const target = cellCenter(i);
      trailsRef.current.push({
        x0: origin.x,
        y0: origin.y,
        x1: target.x,
        y1: target.y,
        start: now,
        duration: 260,
      });
    }
    ensureParticleLoop();
  }

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
          sendProbeRef.current?.([target], null, 'vision');
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
      // Só o ATACANTE sorteia; o defensor (e, no 2v2, os demais jogadores da
      // sala) nunca sorteiam o seu próprio — só recebem e exibem este mesmo
      // evento via WebSocket (ver DefendScreen/TeamGame `incomingEvent`).
      onSendEvent?.(event);
    }, EVENT_INTERVAL * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, applyEvent]);

  function animateHits(indices) {
    setFlash(new Set(indices));
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  // Dispara a varredura visual do radar centrada na célula escolhida.
  function triggerRadarFx(index, radius) {
    const [row, col] = rowCol(index, boardSize);
    setRadarFx({ row, col, radius });
    clearTimeout(radarFxTimeoutRef.current);
    radarFxTimeoutRef.current = setTimeout(() => setRadarFx(null), 1050);
  }

  useEffect(() => () => clearTimeout(radarFxTimeoutRef.current), []);

  // Envia os tiros ao defensor; a resolução (acerto/erro) volta em `shotResult`.
  // `kind`/`originIndex` deixam o lado servidor (online) recalcular as
  // células-alvo ele mesmo em vez de confiar na lista `indices` do cliente —
  // o LocalGame ignora esses dois parâmetros extra (resolve tudo no ato).
  function sendShot(indices, kind, originIndex, prefix) {
    if (!indices.length) return;
    setLocked(true);
    setMode('fire');
    pendingRef.current = { kind: 'shot', prefix: prefix || null };
    onSendShot(indices, kind, originIndex);
  }

  function handleCellClick(index) {
    if (locked || timedOut.current) return;

    if (gameMode === 'classico') {
      if (board[index].shot) return;
      sfx.laser();
      sendShot([index], 'normal', index);
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
      triggerRadarFx(index, radarRadius);
      pendingRef.current = { kind: 'radar' };
      onSendProbe(radarArea(index, radarRadius, boardSize), index, 'radar');
      return;
    }

    if (mode === 'plasma') {
      if (localEnergy < effectivePlasmaCost) return;
      const targets = plasmaCells(index, boardSize).filter((i) => !board[i].shot);
      if (targets.length === 0) return;
      sfx.plasma();
      setLocalEnergy((e) => e - effectivePlasmaCost);
      onSpendEnergy(effectivePlasmaCost);
      spawnPlasmaTrail(index, targets);
      sendShot(targets, 'plasma', index, t('battle.plasmaBurst'));
      return;
    }

    // Tiro normal
    if (board[index].shot) return;
    sfx.laser();
    sendShot([index], 'normal', index);
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
    spawnHitBurst(res.hitIndices);
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
          const [row, col] = rowCol(cellIdx, boardSize);
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < boardSize && c >= 0 && c < boardSize) {
              const j = idx(r, c, boardSize);
              if (!next[j].shot && !next[j].revealed) candidates.add(j);
            }
          }
        }
        if (candidates.size) {
          pendingRef.current = { kind: 'anomaly' };
          onSendProbe([...candidates], null, 'anomaly');
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
    <div
      className={`screen battle fade-in ${shake ? 'shake' : ''}${mapId ? ` map-${mapId}` : ''}`}
      data-planet={mapId === 'planetas' ? planetId : undefined}
    >
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
            ref={targetGridRef}
            className={`grid target-grid mode-${mode}${themeId ? ` theme-${themeId}` : ''}`}
            style={{ '--size': boardSize }}
            aria-label={t('battle.enemyBoardOf', { name: enemyName })}
          >
            <canvas ref={particleCanvasRef} className="hit-fx-canvas" aria-hidden="true" />
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
              const [cr, cc] = rowCol(i, boardSize);
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
            {radarFx && (
              <div
                className="radar-sweep-fx"
                style={{
                  left: `${((radarFx.col + 0.5) / boardSize) * 100}%`,
                  top: `${((radarFx.row + 0.5) / boardSize) * 100}%`,
                  width: `${((radarFx.radius * 2 + 1) / boardSize) * 100}%`,
                  height: `${((radarFx.radius * 2 + 1) / boardSize) * 100}%`,
                }}
              />
            )}
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
          <div className={`grid own-grid${themeId ? ` theme-${themeId}` : ''}`} style={{ '--size': boardSize }}>
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
