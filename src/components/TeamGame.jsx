import { useReducer, useRef, useEffect, useState, useCallback } from 'react';
import { ENERGY_PER_TURN } from '../game/constants.js';
import { fire, allFound, emptyBoard } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { createConnection } from '../online/connection.js';
import { useT, tr } from '../i18n/index.jsx';
import PlacementScreen from './PlacementScreen.jsx';
import TeamBattleScreen from './TeamBattleScreen.jsx';
import MiniBoard from './MiniBoard.jsx';

// Sentinela: o atacante marca um acerto sem jamais conhecer a peça real do inimigo.
const HIT_PIECE = '__hit__';

// ─── helpers de índice ───────────────────────────────────────────────────────
// ta = teamAssignment: { [playerIndex]: 0|1 }
const teamOf = (pi, ta) => (ta ? ta[pi] : pi < 2 ? 0 : 1);
const allyOf = (pi, ta) => {
  if (ta) {
    const myTeam = ta[pi];
    const found = [0, 1, 2, 3].find((i) => i !== pi && ta[i] === myTeam);
    return found ?? (pi % 2 === 0 ? pi + 1 : pi - 1);
  }
  return pi % 2 === 0 ? pi + 1 : pi - 1;
};
const enemiesOf = (pi, ta) => {
  if (ta) {
    const myTeam = ta[pi];
    return [0, 1, 2, 3].filter((i) => ta[i] !== myTeam);
  }
  return pi < 2 ? [2, 3] : [0, 1];
};
const nextAttacker = (cur, hit) => (hit ? cur : (cur + 1) % 4);

// ─── estado inicial ──────────────────────────────────────────────────────────
const init = {
  stage: 'lobby', // lobby | waiting | teamSelect | placement | waitPlacement | battle | allyAttacking | defend | gameover
  code: '',
  myIndex: -1,
  myName: '',
  players: [],         // nomes indexados 0–3
  boards: {},          // { [0..3]: Cell[] }
  boardCount: 0,
  currentAttacker: 0,
  energy: 0,
  winner: -1,          // 0 ou 1 (equipe vencedora)
  error: '',
  defendMsg: '',
  defendFlash: [],
  allyMsg: '',
  allyFlash: [],
  myStats:  { shots: 0, hits: 0 },
  oppStats: { shots: 0, hits: 0 },
  rematchVotes: [false, false, false, false],
  teamChoices: {},     // { [playerIndex]: 0|1 } — escolhas em andamento
  teamAssignment: null,// { [playerIndex]: 0|1 } — fixado ao iniciar
  sunk: {},            // { [playerIndex]: true } — tabuleiros totalmente encontrados
  shotResult: null,    // resolução de tiro devolvida pelo defensor (problema 3)
  probeResult: null,   // resolução de sondagem devolvida pelo defensor
  oppDisconnected: false, // problema 1: alguém caiu, aguardando reconexão
  reconnecting: false,    // problema 1: eu tentando reconectar
};

function cellsToBoard(cells) {
  return cells.map((pieceId) => ({ pieceId, shot: false, revealed: false }));
}

function stageFor(s, newTurn = true) {
  const ca = s.currentAttacker;
  const ta = s.teamAssignment;
  if (ca === s.myIndex) return { ...s, stage: 'battle', energy: newTurn ? s.energy + ENERGY_PER_TURN : s.energy };
  if (teamOf(ca, ta) === teamOf(s.myIndex, ta)) return { ...s, stage: 'allyAttacking' };
  return { ...s, stage: 'defend' };
}

function reducer(s, a) {
  switch (a.type) {
    case 'set-name': return { ...s, myName: a.name };

    case 'team-created': {
      const players = a.players.slice();
      return { ...s, stage: 'waiting', code: a.code, myIndex: 0, players, error: '' };
    }
    case 'team-joined': {
      const players = a.players.slice();
      return { ...s, stage: 'waiting', code: a.code, myIndex: a.playerIndex, players, error: '' };
    }
    case 'team-player-joined':
      return { ...s, players: a.players.slice() };
    case 'team-start':
      return { ...s, stage: 'teamSelect', players: a.players.slice(), teamChoices: {}, teamAssignment: null };

    case 'pick-team': {
      const choices = { ...s.teamChoices, [a.playerIndex]: a.team };
      const vals = Object.values(choices);
      const allPicked = Object.keys(choices).length === 4;
      const balanced  = allPicked && vals.filter((t) => t === 0).length === 2 && vals.filter((t) => t === 1).length === 2;
      if (balanced) {
        return { ...s, teamChoices: choices, teamAssignment: choices, stage: 'placement' };
      }
      return { ...s, teamChoices: choices };
    }

    case 'placed': {
      const boards = { ...s.boards, [s.myIndex]: a.board };
      const boardCount = s.boardCount + 1;
      const ns = { ...s, boards, boardCount };
      if (boardCount >= 4) return stageFor({ ...ns, currentAttacker: 0, energy: 0 });
      return { ...ns, stage: 'waitPlacement' };
    }
    case 'board-received': {
      // Do aliado chega o tabuleiro completo; do inimigo, só a névoa (problema 3).
      const board = a.fog ? emptyBoard() : cellsToBoard(a.cells);
      const boards = { ...s.boards, [a.fromPlayer]: board };
      const boardCount = s.boardCount + 1;
      const ns = { ...s, boards, boardCount };
      if (boardCount >= 4) return stageFor({ ...ns, currentAttacker: 0, energy: 0 });
      return ns;
    }

    case 'shot-result':
      return {
        ...s,
        shotResult: {
          id: (s.shotResult?.id || 0) + 1,
          targetPlayer: a.targetPlayer,
          indices: a.indices,
          hitIndices: a.hitIndices,
          destroyed: a.destroyed,
          targetSunk: a.targetSunk,
        },
      };
    case 'probe-result':
      return {
        ...s,
        probeResult: {
          id: (s.probeResult?.id || 0) + 1,
          targetPlayer: a.targetPlayer,
          cells: a.cells,
        },
      };

    // Aplica uma jogada resolvida pelo defensor. Usado pelo atacante (após animar),
    // pelo defensor (localmente) e pelos aliados (via broadcast). Timeout: targetPlayer -1.
    case 'apply-attack': {
      const ta = s.teamAssignment;
      const { fromPlayer, targetPlayer, indices } = a;
      const hitIndices = a.hitIndices || [];
      const destroyed = a.destroyed || null;
      const isTimeout = targetPlayer === -1;
      const hitSet = new Set(hitIndices);
      const hits = hitIndices.length;

      let boards = s.boards;
      if (!isTimeout && s.boards[targetPlayer]) {
        const tb = s.boards[targetPlayer].slice();
        for (const i of indices) {
          tb[i] = {
            ...tb[i],
            shot: true,
            pieceId: tb[i].pieceId || (hitSet.has(i) ? HIT_PIECE : null),
          };
        }
        boards = { ...boards, [targetPlayer]: tb };
      }

      const sunk = !isTimeout && a.targetSunk ? { ...s.sunk, [targetPlayer]: true } : s.sunk;

      const isMyBoard   = !isTimeout && targetPlayer === s.myIndex;
      const isAllyBoard = !isTimeout && targetPlayer === allyOf(s.myIndex, ta);
      const isEnemyAtk  = teamOf(fromPlayer, ta) !== teamOf(s.myIndex, ta);
      const isMyAttack  = fromPlayer === s.myIndex;

      let myStats = s.myStats;
      let oppStats = s.oppStats;
      if (!isTimeout) {
        if (isMyAttack) myStats = { shots: s.myStats.shots + indices.length, hits: s.myStats.hits + hits };
        else if (isEnemyAtk) oppStats = { shots: s.oppStats.shots + indices.length, hits: s.oppStats.hits + hits };
      }

      const ca = nextAttacker(fromPlayer, hits > 0);
      let msg = '';
      if (isTimeout) {
        const name = s.players[fromPlayer] ?? tr('team.defaultPlayer', { n: fromPlayer + 1 });
        msg = isEnemyAtk ? tr('team.outOfTime', { name }) : tr('team.outOfTimeAlly', { name });
      } else if (destroyed) {
        msg = tr('team.foundShip', { emoji: destroyed.emoji, name: tr(`fleet.${destroyed.id}`) });
      } else if (hits > 0) {
        msg = tr('team.foundSomeone');
      } else if (isEnemyAtk) {
        msg = tr('team.missedPrepare');
      }

      const ns = {
        ...s,
        boards,
        sunk,
        myStats,
        oppStats,
        currentAttacker: ca,
        defendFlash: isMyBoard   ? indices : [],
        allyFlash:   isAllyBoard ? indices : [],
        defendMsg:   isEnemyAtk ? msg : s.defendMsg,
        allyMsg:     (isAllyBoard || (isTimeout && !isEnemyAtk)) ? msg : s.allyMsg,
      };

      // Um time perde quando os dois integrantes foram totalmente encontrados.
      if (!isTimeout) {
        for (const team of [0, 1]) {
          const members = [0, 1, 2, 3].filter((pi) => teamOf(pi, ta) === team);
          if (members.every((pi) => ns.sunk[pi])) {
            const winner = 1 - team;
            if (winner === teamOf(s.myIndex, ta)) sfx.win();
            else sfx.lose();
            return { ...ns, winner, stage: 'gameover' };
          }
        }
      }
      return stageFor(ns, !(hits > 0 && !isTimeout));
    }

    case 'net-opp-down':
      return { ...s, oppDisconnected: true };
    case 'net-opp-up':
      return { ...s, oppDisconnected: false };
    case 'net-reconnecting':
      return { ...s, reconnecting: true };
    case 'net-reconnected':
      return { ...s, reconnecting: false, oppDisconnected: false };

    case 'spend':
      return { ...s, energy: s.energy - a.amount };

    case 'rematch-vote': {
      const votes = s.rematchVotes.slice();
      votes[a.playerIndex] = true;
      if (votes.every(Boolean)) {
        return {
          ...s,
          stage: 'teamSelect',
          boards: {},
          boardCount: 0,
          currentAttacker: 0,
          energy: 0,
          winner: -1,
          defendMsg: '',
          defendFlash: [],
          allyMsg: '',
          allyFlash: [],
          myStats:  { shots: 0, hits: 0 },
          oppStats: { shots: 0, hits: 0 },
          rematchVotes: [false, false, false, false],
          teamChoices: {},
          teamAssignment: null,
          sunk: {},
          shotResult: null,
          probeResult: null,
        };
      }
      return { ...s, rematchVotes: votes };
    }

    case 'opp-left':
      return { ...init, myName: s.myName, error: tr('team.errorPlayerLeft') };
    case 'disconnected':
      return { ...init, myName: s.myName, error: s.stage === 'lobby' ? s.error : tr('team.connLost') };
    case 'error':
      return { ...s, error: a.message };

    default: return s;
  }
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function TeamGame({ onExit }) {
  const t = useT();
  const [state, dispatch] = useReducer(reducer, init);
  const [codeInput, setCodeInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const connRef = useRef(null);
  // Refs para os handlers de rede (que rodam fora do fluxo de render).
  const myIndexRef = useRef(state.myIndex);
  const taRef = useRef(state.teamAssignment);
  const ownBoardRef = useRef(null);
  useEffect(() => { myIndexRef.current = state.myIndex; }, [state.myIndex]);
  useEffect(() => { taRef.current = state.teamAssignment; }, [state.teamAssignment]);
  useEffect(() => { ownBoardRef.current = state.boards[state.myIndex] || null; }, [state.boards, state.myIndex]);

  // Callbacks estáveis para o TeamBattleScreen enviar tiros/sondagens ao defensor.
  const sendShot = useCallback((targetPlayer, indices) => connRef.current?.relay({ t: 'attack', targetPlayer, indices }, targetPlayer), []);
  const sendProbe = useCallback((targetPlayer, cells) => connRef.current?.relay({ t: 'probe', targetPlayer, cells }, targetPlayer), []);

  // Defensor: resolve tiros no próprio tabuleiro e devolve só o resultado.
  function resolveAttack(indices) {
    let board = ownBoardRef.current || emptyBoard();
    const hitIndices = [];
    let destroyed = null;
    for (const i of indices) {
      const r = fire(board, i);
      if (r) {
        board = r.board;
        if (r.hit) hitIndices.push(i);
        if (r.destroyed) destroyed = { id: r.destroyed.id, emoji: r.destroyed.emoji };
      }
    }
    return { hitIndices, destroyed, sunkAll: allFound(board) };
  }

  useEffect(() => () => { connRef.current?.close(); connRef.current = null; }, []);

  useEffect(() => {
    if (!state.defendFlash.length) return;
    const b = state.boards[state.myIndex];
    if (!b) return;
    const hit = state.defendFlash.some((i) => b[i]?.shot && b[i]?.pieceId);
    if (hit) sfx.hit(); else sfx.miss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.defendFlash]);

  async function getConn() {
    if (connRef.current) return connRef.current;
    const conn = createConnection();
    conn.on('team-created',       (m) => { conn.setReconnect({ code: m.code, playerIndex: m.playerIndex, token: m.token }); dispatch({ type: 'team-created', code: m.code, players: m.players }); });
    conn.on('team-joined',        (m) => { conn.setReconnect({ code: m.code, playerIndex: m.playerIndex, token: m.token }); dispatch({ type: 'team-joined', code: m.code, playerIndex: m.playerIndex, players: m.players }); });
    conn.on('team-player-joined', (m) => dispatch({ type: 'team-player-joined', playerIndex: m.playerIndex, name: m.name, players: m.players }));
    conn.on('team-start',         (m) => dispatch({ type: 'team-start',         players: m.players }));
    conn.on('error',              (m) => dispatch({ type: 'error',              message: m.message }));
    conn.on('opponent-left',      ()  => dispatch({ type: 'opp-left' }));
    // Problema 1: queda/reconexão não encerram a partida.
    conn.on('opponent-disconnected', () => dispatch({ type: 'net-opp-down' }));
    conn.on('opponent-reconnected',  () => dispatch({ type: 'net-opp-up' }));
    conn.on('reconnecting',          () => dispatch({ type: 'net-reconnecting' }));
    conn.on('reconnected',           () => dispatch({ type: 'net-reconnected' }));
    conn.on('reconnect-failed',      () => { connRef.current = null; dispatch({ type: 'disconnected' }); });
    conn.on('closed',             ()  => { connRef.current = null; dispatch({ type: 'disconnected' }); });
    conn.on('relay', (m) => {
      const d = m.data || {};
      const from = m.fromIndex ?? -1;
      if (d.t === 'board')       dispatch({ type: 'board-received', fromPlayer: from, cells: d.cells });
      if (d.t === 'board-ready') dispatch({ type: 'board-received', fromPlayer: from, fog: true });
      if (d.t === 'rematch')     dispatch({ type: 'rematch-vote',   playerIndex: from });
      if (d.t === 'team-pick')   dispatch({ type: 'pick-team',      playerIndex: d.playerIndex, team: d.team });

      // Timeout do atacante: repassado a todos, sem resolução de tabuleiro.
      if (d.t === 'timeout') {
        dispatch({ type: 'apply-attack', fromPlayer: from, targetPlayer: -1, indices: [], hitIndices: [] });
      }
      // Sou o defensor: resolvo o tiro e transmito o resultado ao restante da sala.
      if (d.t === 'attack' && d.targetPlayer === myIndexRef.current) {
        const res = resolveAttack(d.indices);
        const payload = {
          t: 'attack-result', fromPlayer: from, targetPlayer: d.targetPlayer,
          indices: d.indices, hitIndices: res.hitIndices, destroyed: res.destroyed, targetSunk: res.sunkAll,
        };
        conn.relay(payload); // aos outros 3
        dispatch({ type: 'apply-attack', ...payload });
      }
      // Sou o defensor de uma sondagem: devolvo só presença/ausência ao atacante.
      if (d.t === 'probe' && d.targetPlayer === myIndexRef.current) {
        const board = ownBoardRef.current || emptyBoard();
        const cells = d.cells.map((i) => ({ index: i, hasPiece: !!board[i].pieceId }));
        conn.relay({ t: 'probe-result', targetPlayer: d.targetPlayer, cells }, from);
      }
      // Resultado de tiro: se fui eu quem atacou, animo no TeamBattleScreen; senão aplico direto.
      if (d.t === 'attack-result') {
        if (d.fromPlayer === myIndexRef.current) {
          dispatch({ type: 'shot-result', targetPlayer: d.targetPlayer, indices: d.indices, hitIndices: d.hitIndices, destroyed: d.destroyed, targetSunk: d.targetSunk });
        } else {
          dispatch({ type: 'apply-attack', fromPlayer: d.fromPlayer, targetPlayer: d.targetPlayer, indices: d.indices, hitIndices: d.hitIndices, destroyed: d.destroyed, targetSunk: d.targetSunk });
        }
      }
      // Resultado de sondagem chega só para o atacante.
      if (d.t === 'probe-result') dispatch({ type: 'probe-result', targetPlayer: d.targetPlayer, cells: d.cells });
    });
    await conn.ready;
    connRef.current = conn;
    return conn;
  }

  async function withConn(fn) {
    setConnecting(true);
    dispatch({ type: 'error', message: '' });
    try { fn(await getConn()); }
    catch { dispatch({ type: 'error', message: t('team.connectFail') }); }
    finally { setConnecting(false); }
  }

  function createRoom() { sfx.click(); withConn((c) => c.send({ type: 'create-team', name: state.myName || t('menu.defaultP1') })); }
  function joinRoom()   { sfx.click(); withConn((c) => c.send({ type: 'join-team',   code: codeInput, name: state.myName || tr('team.defaultPlayer', { n: 1 }) })); }

  function pickTeam(team) {
    sfx.click();
    connRef.current?.relay({ t: 'team-pick', playerIndex: state.myIndex, team });
    dispatch({ type: 'pick-team', playerIndex: state.myIndex, team });
  }

  function finishPlacement(board) {
    // Problema 3: tabuleiro completo só para o aliado; inimigos recebem apenas "pronto".
    const ally = allyOf(state.myIndex, ta);
    const enemies = enemiesOf(state.myIndex, ta);
    connRef.current?.relay({ t: 'board', cells: board.map((c) => c.pieceId) }, ally);
    connRef.current?.relay({ t: 'board-ready' }, enemies);
    dispatch({ type: 'placed', board });
  }

  // O atacante confirma a jogada já resolvida ao parent (aplica turno/estatísticas).
  function handleAttackResolved({ targetPlayer, indices, hitIndices, destroyed, targetSunk }) {
    dispatch({ type: 'apply-attack', fromPlayer: state.myIndex, targetPlayer, indices, hitIndices, destroyed, targetSunk });
  }

  function handleTimeout() {
    connRef.current?.relay({ t: 'timeout' });
    dispatch({ type: 'apply-attack', fromPlayer: state.myIndex, targetPlayer: -1, indices: [], hitIndices: [] });
  }

  function requestRematch() {
    sfx.click();
    connRef.current?.relay({ t: 'rematch' });
    dispatch({ type: 'rematch-vote', playerIndex: state.myIndex });
  }

  // ─── helpers de UI ────────────────────────────────────────────────────────
  const { stage, myIndex, players, boards, code } = state;
  const ta     = state.teamAssignment;
  const pname  = (pi) => players[pi] ?? t('team.defaultPlayer', { n: pi + 1 });
  const pboard = (pi) => boards[pi] ?? null;

  const teamNames = { 0: t('team.teamA'), 1: t('team.teamB') };

  // Banner de rede (problema 1): jogador caído ou eu tentando reconectar.
  const netBanner =
    state.reconnecting || state.oppDisconnected ? (
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          padding: '8px 12px', textAlign: 'center', fontWeight: 600,
          background: state.reconnecting ? '#8a5a00' : '#664200', color: '#fff',
        }}
      >
        {state.reconnecting ? t('team.reconnecting') : t('team.oppDisconnected')}
      </div>
    ) : null;

  // ─── renders ──────────────────────────────────────────────────────────────
  function renderStage() {
  if (stage === 'lobby') return (
    <div className="screen menu fade-in">
      <p className="tagline">
        <strong>{t('team.lobbyTaglineStrong')}</strong> {t('team.lobbyTagline1')}
        <br />
        {t('team.lobbyTagline2')}
      </p>
      {state.error && <div className="error-box">{state.error}</div>}
      <input className="lobby-input" placeholder={t('team.yourName')} maxLength={14}
        value={state.myName} onChange={(e) => dispatch({ type: 'set-name', name: e.target.value })} />
      <div className="lobby-panels">
        <div className="lobby-panel">
          <h3>{t('team.createH')}</h3>
          <p>{t('team.createP')}</p>
          <button className="big-btn" onClick={createRoom} disabled={connecting}>{t('team.createBtn')}</button>
        </div>
        <div className="lobby-panel">
          <h3>{t('team.joinH')}</h3>
          <input className="lobby-input code-input" placeholder={t('team.codePh')} maxLength={4}
            value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} />
          <button className="big-btn" onClick={joinRoom}
            disabled={connecting || codeInput.trim().length !== 4}>{t('team.joinBtn')}</button>
        </div>
      </div>
    </div>
  );

  if (stage === 'waiting') return (
    <div className="screen pass fade-in">
      <div className="pass-icon">👥</div>
      <h2>{t('team.roomCreatedCode')} <span className="highlight">{code}</span></h2>
      <p>{t('team.shareSeq')}</p>
      <div className="team-waiting-grid">
        {[0, 1].map((team) => (
          <div key={team} className="team-waiting-panel">
            <div className={`team-label-${team === 0 ? 'a' : 'b'}`}>{teamNames[team]}</div>
            {[0, 1].map((slot) => {
              const pi = team * 2 + slot;
              const filled = !!players[pi];
              return (
                <div key={pi} className={`team-slot ${filled ? 'team-slot-filled' : ''}`}>
                  {filled ? `✓ ${players[pi]}` : t('team.waitingSlot', { n: slot + 1 })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="waiting-dots">{t('team.waiting4')}</p>
    </div>
  );

  if (stage === 'teamSelect') {
    const choices  = state.teamChoices;
    const myChoice = choices[myIndex];
    const countA   = Object.values(choices).filter((t) => t === 0).length;
    const countB   = Object.values(choices).filter((t) => t === 1).length;
    const allReady = countA === 2 && countB === 2;

    return (
      <div className="screen menu fade-in">
        <h2>{t('team.chooseTeam')}</h2>
        <p className="tagline">{t('team.eachNeeds2')}</p>

        <div className="team-select-layout">
          {[0, 1].map((team) => {
            const label   = teamNames[team];
            const count   = team === 0 ? countA : countB;
            const isMine  = myChoice === team;
            const isFull  = count >= 2 && !isMine;
            const colorKey = team === 0 ? 'a' : 'b';

            return (
              <div key={team} className={`team-select-panel team-select-panel-${colorKey}${isMine ? ' team-select-mine' : ''}`}>
                <div className={`team-label-${colorKey}`}>{label} ({count}/2)</div>

                {players.map((name, pi) =>
                  choices[pi] === team ? (
                    <div key={pi} className="team-slot team-slot-filled">
                      {pi === myIndex ? `✓ ${name} (${t('team.you')})` : `✓ ${name}`}
                    </div>
                  ) : null
                )}

                {Array.from({ length: 2 - count }).map((_, i) => (
                  <div key={i} className="team-slot">{t('team.waitingEllipsis')}</div>
                ))}

                <button
                  className="big-btn"
                  disabled={isMine || isFull}
                  onClick={() => pickTeam(team)}
                  style={isMine ? { opacity: 0.55, cursor: 'default' } : {}}
                >
                  {isMine ? t('team.youAreHere') : t('team.joinTeam', { team: label })}
                </button>
              </div>
            );
          })}
        </div>

        {allReady ? (
          <p className="waiting-dots">{t('team.teamsReady')}</p>
        ) : (
          <p className="team-select-hint">
            {t('team.chosenCount', { n: Object.keys(choices).length })}
          </p>
        )}
      </div>
    );
  }

  if (stage === 'placement') {
    const myTeam = teamOf(myIndex, ta);
    return (
      <div>
        <div className="team-placement-info">
          <span className={`team-badge team-badge-${myTeam === 0 ? 'a' : 'b'}`}>
            {teamNames[myTeam]}
          </span>
        </div>
        <PlacementScreen playerName={pname(myIndex)} onDone={finishPlacement} />
      </div>
    );
  }

  if (stage === 'waitPlacement') {
    const readyCount = Object.keys(boards).length;
    return (
      <div className="screen pass fade-in">
        <div className="pass-icon">🧑‍🚀</div>
        <h2>{t('team.teamHidden')}</h2>
        <p className="waiting-dots">{t('team.waitOthers', { n: readyCount })}</p>
      </div>
    );
  }

  if (stage === 'battle') {
    const [e0, e1] = enemiesOf(myIndex, ta);
    const ally = allyOf(myIndex, ta);
    return (
      <TeamBattleScreen
        myName={pname(myIndex)}
        allyName={pname(ally)}
        enemy0Name={pname(e0)}
        enemy1Name={pname(e1)}
        enemy0Board={pboard(e0)}
        enemy1Board={pboard(e1)}
        enemyIndices={[e0, e1]}
        ownBoard={pboard(myIndex)}
        allyBoard={pboard(ally)}
        energy={state.energy}
        onSendShot={sendShot}
        onSendProbe={sendProbe}
        onAttackResolved={handleAttackResolved}
        onSpendEnergy={(amount) => dispatch({ type: 'spend', amount })}
        onTimeout={handleTimeout}
        shotResult={state.shotResult}
        probeResult={state.probeResult}
      />
    );
  }

  if (stage === 'allyAttacking') {
    const ally = allyOf(myIndex, ta);
    return (
      <div className="screen battle fade-in">
        <h2><span className="highlight">{pname(ally)}</span> {t('team.allyAttacking')}</h2>
        <div className="message">{state.allyMsg || t('team.partnerAttacking')}</div>
        <div className="team-mini-boards">
          <MiniBoard board={pboard(myIndex)} label={`${pname(myIndex)} (${t('team.you')})`}   flash={state.allyFlash} />
          <MiniBoard board={pboard(ally)}    label={`${pname(ally)} (${t('team.partner')})`}  flash={[]} />
        </div>
        <p className="waiting-dots">{t('team.waitPartnerAttack')}</p>
      </div>
    );
  }

  if (stage === 'defend') {
    const ca   = state.currentAttacker;
    const ally = allyOf(myIndex, ta);
    const attackerTeamName = teamNames[teamOf(ca, ta)];
    return (
      <div className="screen battle fade-in">
        <h2>{attackerTeamName} — <span className="highlight">{pname(ca)}</span> {t('team.attackerAttacks')}</h2>
        <div className="message">{state.defendMsg || t('team.holdFirm')}</div>
        <div className="team-mini-boards">
          <MiniBoard board={pboard(myIndex)} label={`${pname(myIndex)} (${t('team.you')})`}  flash={state.defendFlash} />
          <MiniBoard board={pboard(ally)}    label={`${pname(ally)} (${t('team.partner')})`} flash={state.allyFlash} />
        </div>
        <p className="waiting-dots">{t('team.waitEnemyAttack')}</p>
      </div>
    );
  }

  if (stage === 'gameover') {
    const myTeam   = teamOf(myIndex, ta);
    const won      = state.winner === myTeam;
    const winName  = teamNames[state.winner];
    const myVoted  = state.rematchVotes[myIndex];
    const voteCount = state.rematchVotes.filter(Boolean).length;
    return (
      <div className="screen gameover fade-in">
        <div className="trophy">{won ? '🏆' : '💫'}</div>
        <h2><span className="highlight">{winName}</span> {t('team.wonBattle')}</h2>
        <div className="stats">
          <div className="stat-card">
            <div className="stat-name">{t('team.yourTeam')}</div>
            <div>{t('team.shots', { n: state.myStats.shots })}</div>
            <div>{t('team.hits', { n: state.myStats.hits })}</div>
            <div>📊 {state.myStats.shots > 0 ? Math.round((state.myStats.hits / state.myStats.shots) * 100) : 0}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-name">{t('team.enemyTeam')}</div>
            <div>{t('team.shots', { n: state.oppStats.shots })}</div>
            <div>{t('team.hits', { n: state.oppStats.hits })}</div>
            <div>📊 {state.oppStats.shots > 0 ? Math.round((state.oppStats.hits / state.oppStats.shots) * 100) : 0}%</div>
          </div>
        </div>
        {!myVoted ? (
          <button className="big-btn" onClick={requestRematch}>{t('team.playAgain')}</button>
        ) : (
          <p className="waiting-dots rematch-note">
            {t('team.waitAllAccept', { n: voteCount })}
          </p>
        )}
        <button className="small-btn" onClick={onExit}>{t('nav.backToMenu')}</button>
      </div>
    );
  }

  return null;
  }

  return (
    <>
      {netBanner}
      {renderStage()}
    </>
  );
}
