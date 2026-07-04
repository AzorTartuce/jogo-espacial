import { useReducer, useRef, useEffect, useState, useCallback } from 'react';
import { ENERGY_PER_TURN } from '../game/constants.js';
import { resolveShots, emptyBoard } from '../game/logic.js';
import { sfx, playEventSound } from '../game/sound.js';
import { createConnection } from '../online/connection.js';
import { useT, tr } from '../i18n/index.jsx';
import PlacementScreen from './PlacementScreen.jsx';
import TeamBattleScreen from './TeamBattleScreen.jsx';
import NetBanner from './NetBanner.jsx';
import TeamLobby from './TeamLobby.jsx';
import TeamWaitingRoom from './TeamWaitingRoom.jsx';
import TeamSelectScreen from './TeamSelectScreen.jsx';
import TeamWaitPlacementScreen from './TeamWaitPlacementScreen.jsx';
import AllyAttackingScreen from './AllyAttackingScreen.jsx';
import TeamDefendScreen from './TeamDefendScreen.jsx';
import TeamGameOver from './TeamGameOver.jsx';

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
export const init = {
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
  // Instabilidade sincronizada: evento sorteado por quem está atacando e
  // retransmitido a todos os outros da sala. Ninguém além do atacante sorteia
  // o seu próprio evento — os demais só recebem e exibem este campo (id
  // incremental, mesmo padrão de shotResult/probeResult). Hoje o 2v2 ainda não
  // tem um modo Instabilidade que dispare isto (ver TeamBattleScreen), mas o
  // canal de sincronização já fica pronto para quando existir.
  incomingEvent: null,
};

function cellsToBoard(cells) {
  return cells.map((pieceId) => ({ pieceId, shot: false, revealed: false }));
}

function stageFor(s, newTurn = true) {
  const ca = s.currentAttacker;
  const ta = s.teamAssignment;
  if (ca === s.myIndex) {
    // Bug #16 (mesmo padrão do #15 no 1v1): um TeamBattleScreen novo vai montar
    // aqui com lastShotId/lastProbeId zerados. Sem isto, um shotResult/probeResult
    // que sobrou do meu último turno como atacante (id>0) seria reaplicado
    // sozinho no mount, encerrando o turno novo antes de eu jogar. Só zera numa
    // entrada NOVA em 'battle' — no meio de uma sequência de acertos (já em
    // battle) o TeamBattleScreen continua montado e precisa do valor atual.
    const enteringFresh = s.stage !== 'battle';
    return {
      ...s,
      stage: 'battle',
      energy: newTurn ? s.energy + ENERGY_PER_TURN : s.energy,
      shotResult: enteringFresh ? null : s.shotResult,
      probeResult: enteringFresh ? null : s.probeResult,
    };
  }
  if (teamOf(ca, ta) === teamOf(s.myIndex, ta)) return { ...s, stage: 'allyAttacking' };
  return { ...s, stage: 'defend' };
}

// Exportado só para testar a máquina de estados isoladamente (ver comentário
// equivalente em OnlineGame.jsx).
export function reducer(s, a) {
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
    case 'event-received':
      // Recebido por todos exceto quem sorteou (que já aplicou localmente).
      return {
        ...s,
        incomingEvent: {
          id: (s.incomingEvent?.id || 0) + 1,
          event: a.event,
          fromPlayer: a.fromPlayer,
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
          incomingEvent: null,
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
  // Guarda síncrona (problema 3): impede duplo-clique rápido em criar/entrar
  // (antes do próximo render aplicar `disabled`) de disparar getConn() duas
  // vezes e abrir duas conexões WebSocket físicas.
  const connectingRef = useRef(false);
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
    const board = ownBoardRef.current || emptyBoard();
    const { hitIndices, destroyed, sunkAll } = resolveShots(board, indices);
    return { hitIndices, destroyed, sunkAll };
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

  // Instabilidade sincronizada: exibe/soa o mesmo evento que o atacante sorteou
  // e retransmitiu, tanto para o defensor quanto para o aliado do atacante.
  // Este ref vive no componente TeamGame (que nunca remonta entre turnos), ao
  // contrário de lastShotId/lastProbeId que ficam em TeamBattleScreen — por
  // isso aqui não é preciso zerar incomingEvent em pontos específicos do
  // reducer para evitar replay: o ref já garante que cada id só é processado
  // uma vez durante toda a partida.
  const [activeEvent, setActiveEvent] = useState(null);
  const lastEventId = useRef(0);
  useEffect(() => {
    if (!state.incomingEvent || state.incomingEvent.id === lastEventId.current) return;
    lastEventId.current = state.incomingEvent.id;
    setActiveEvent(state.incomingEvent.event);
    playEventSound(state.incomingEvent.event.id);
  }, [state.incomingEvent]);

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
      // Instabilidade: recebido por todos exceto quem sorteou o evento.
      if (d.t === 'event')       dispatch({ type: 'event-received', event: d.event, fromPlayer: from });

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
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    dispatch({ type: 'error', message: '' });
    try { fn(await getConn()); }
    catch { dispatch({ type: 'error', message: t('team.connectFail') }); }
    finally { connectingRef.current = false; setConnecting(false); }
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
  const netBanner = (
    <NetBanner
      reconnecting={state.reconnecting}
      oppDisconnected={state.oppDisconnected}
      reconnectingText={t('team.reconnecting')}
      disconnectedText={t('team.oppDisconnected')}
    />
  );

  // ─── renders ──────────────────────────────────────────────────────────────
  function renderStage() {
  if (stage === 'lobby') return (
    <TeamLobby
      error={state.error}
      myName={state.myName}
      onNameChange={(name) => dispatch({ type: 'set-name', name })}
      onCreateRoom={createRoom}
      onJoinRoom={joinRoom}
      connecting={connecting}
      codeInput={codeInput}
      onCodeInputChange={setCodeInput}
    />
  );

  if (stage === 'waiting') return (
    <TeamWaitingRoom code={code} players={players} teamNames={teamNames} />
  );

  if (stage === 'teamSelect') {
    return (
      <TeamSelectScreen
        myIndex={myIndex}
        players={players}
        teamChoices={state.teamChoices}
        teamNames={teamNames}
        onPickTeam={pickTeam}
      />
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
    return <TeamWaitPlacementScreen readyCount={readyCount} />;
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
      <AllyAttackingScreen
        activeEvent={activeEvent}
        onEventDone={() => setActiveEvent(null)}
        allyName={pname(ally)}
        allyMsg={state.allyMsg}
        myName={pname(myIndex)}
        myBoard={pboard(myIndex)}
        allyBoard={pboard(ally)}
        allyFlash={state.allyFlash}
      />
    );
  }

  if (stage === 'defend') {
    const ca   = state.currentAttacker;
    const ally = allyOf(myIndex, ta);
    const attackerTeamName = teamNames[teamOf(ca, ta)];
    return (
      <TeamDefendScreen
        activeEvent={activeEvent}
        onEventDone={() => setActiveEvent(null)}
        attackerTeamName={attackerTeamName}
        attackerName={pname(ca)}
        defendMsg={state.defendMsg}
        myName={pname(myIndex)}
        myBoard={pboard(myIndex)}
        defendFlash={state.defendFlash}
        allyName={pname(ally)}
        allyBoard={pboard(ally)}
        allyFlash={state.allyFlash}
      />
    );
  }

  if (stage === 'gameover') {
    const myTeam   = teamOf(myIndex, ta);
    const won      = state.winner === myTeam;
    const winName  = teamNames[state.winner];
    const myVoted  = state.rematchVotes[myIndex];
    const voteCount = state.rematchVotes.filter(Boolean).length;
    return (
      <TeamGameOver
        won={won}
        winName={winName}
        myStats={state.myStats}
        oppStats={state.oppStats}
        myVoted={myVoted}
        voteCount={voteCount}
        onRestart={requestRematch}
        onExit={onExit}
      />
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
