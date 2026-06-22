import { useReducer, useRef, useEffect, useState } from 'react';
import { FLEET, ENERGY_PER_TURN } from '../game/constants.js';
import { fire, allFound } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { createConnection } from '../online/connection.js';
import PlacementScreen from './PlacementScreen.jsx';
import TeamBattleScreen from './TeamBattleScreen.jsx';

const FLEET_MAP = Object.fromEntries(FLEET.map((p) => [p.id, p]));

// ─── helpers de índice ───────────────────────────────────────────────────────
const teamOf    = (pi) => (pi < 2 ? 0 : 1);
const allyOf    = (pi) => (pi % 2 === 0 ? pi + 1 : pi - 1);
const enemiesOf = (pi) => (pi < 2 ? [2, 3] : [0, 1]);
const nextAttacker = (cur, hit) => (hit ? cur : (cur + 1) % 4);

// ─── estado inicial ──────────────────────────────────────────────────────────
const init = {
  stage: 'lobby', // lobby | waiting | placement | waitPlacement | battle | allyAttacking | defend | gameover
  code: '',
  myIndex: -1,
  myName: '',
  players: [],   // nomes indexados 0–3
  boards: {},    // { [0..3]: Cell[] }
  boardCount: 0,
  currentAttacker: 0,
  energy: 0,
  winner: -1,    // 0 ou 1 (equipe vencedora)
  error: '',
  defendMsg: '',
  defendFlash: [],
  allyMsg: '',
  allyFlash: [],
  myStats:  { shots: 0, hits: 0 },
  oppStats: { shots: 0, hits: 0 },
};

function cellsToBoard(cells) {
  return cells.map((pieceId) => ({ pieceId, shot: false, revealed: false }));
}

function stageFor(s, newTurn = true) {
  const ca = s.currentAttacker;
  if (ca === s.myIndex)             return { ...s, stage: 'battle', energy: newTurn ? s.energy + ENERGY_PER_TURN : s.energy };
  if (teamOf(ca) === teamOf(s.myIndex)) return { ...s, stage: 'allyAttacking' };
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
      return { ...s, stage: 'placement', players: a.players.slice() };

    case 'placed': {
      const boards = { ...s.boards, [s.myIndex]: a.board };
      const boardCount = s.boardCount + 1;
      const ns = { ...s, boards, boardCount };
      if (boardCount >= 4) return stageFor({ ...ns, currentAttacker: 0, energy: 0 });
      return { ...ns, stage: 'waitPlacement' };
    }
    case 'board-received': {
      const boards = { ...s.boards, [a.fromPlayer]: cellsToBoard(a.cells) };
      const boardCount = s.boardCount + 1;
      const ns = { ...s, boards, boardCount };
      if (boardCount >= 4) return stageFor({ ...ns, currentAttacker: 0, energy: 0 });
      return ns;
    }

    case 'i-attacked': {
      // atualiza minha cópia do tabuleiro inimigo
      const boards = a.board ? { ...s.boards, [a.targetPlayer]: a.board } : s.boards;
      const myStats = {
        shots: s.myStats.shots + a.shotsFired,
        hits:  s.myStats.hits  + a.hitsMade,
      };
      const ca = nextAttacker(s.myIndex, a.anyHit);
      const ns = { ...s, boards, myStats, currentAttacker: ca };
      const [e0, e1] = enemiesOf(s.myIndex);
      if (ns.boards[e0] && ns.boards[e1] && allFound(ns.boards[e0]) && allFound(ns.boards[e1])) {
        sfx.win();
        return { ...ns, winner: teamOf(s.myIndex), stage: 'gameover' };
      }
      return stageFor(ns, !a.anyHit);
    }

    case 'attack-received': {
      const { fromPlayer, targetPlayer, indices } = a;
      let boards = { ...s.boards };
      let hits = 0;
      let destroyed = null;
      const target = boards[targetPlayer];
      if (target) {
        let b = target;
        for (const i of indices) {
          const r = fire(b, i);
          if (r) { b = r.board; if (r.hit) hits++; if (r.destroyed) destroyed = r.destroyed; }
        }
        boards = { ...boards, [targetPlayer]: b };
      }

      const isMyBoard   = targetPlayer === s.myIndex;
      const isAllyBoard = targetPlayer === allyOf(s.myIndex);
      const isEnemyAtk  = teamOf(fromPlayer) !== teamOf(s.myIndex);

      let oppStats = s.oppStats;
      if (isEnemyAtk) {
        oppStats = { shots: s.oppStats.shots + indices.length, hits: s.oppStats.hits + hits };
      }

      const ca = nextAttacker(fromPlayer, hits > 0);
      let msg = '';
      if (destroyed) msg = `💥 Encontraram: ${destroyed.emoji} ${destroyed.name}!`;
      else if (hits > 0) msg = '💥 Acharam alguém!';
      else if (isEnemyAtk) msg = '🌫️ Erraram! Prepare-se...';

      const ns = {
        ...s,
        boards,
        oppStats,
        currentAttacker: ca,
        defendFlash: isMyBoard   ? indices : [],
        allyFlash:   isAllyBoard ? indices : [],
        defendMsg:   isEnemyAtk   ? msg : s.defendMsg,
        allyMsg:     isAllyBoard  ? msg : s.allyMsg,
      };

      const myMembers = teamOf(s.myIndex) === 0 ? [0, 1] : [2, 3];
      if (myMembers.every((pi) => ns.boards[pi] && allFound(ns.boards[pi]))) {
        return { ...ns, winner: teamOf(fromPlayer), stage: 'gameover' };
      }
      return stageFor(ns);
    }

    case 'spend':
      return { ...s, energy: s.energy - a.amount };

    case 'opp-left':
      return { ...init, myName: s.myName, error: 'Um jogador saiu da sala. 😢' };
    case 'disconnected':
      return { ...init, myName: s.myName, error: s.stage === 'lobby' ? s.error : 'Conexão perdida com o servidor.' };
    case 'error':
      return { ...s, error: a.message };

    default: return s;
  }
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function TeamGame({ onExit }) {
  const [state, dispatch] = useReducer(reducer, init);
  const [codeInput, setCodeInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const connRef = useRef(null);

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
    conn.on('team-created',       (m) => dispatch({ type: 'team-created',       code: m.code, players: m.players }));
    conn.on('team-joined',        (m) => dispatch({ type: 'team-joined',        code: m.code, playerIndex: m.playerIndex, players: m.players }));
    conn.on('team-player-joined', (m) => dispatch({ type: 'team-player-joined', playerIndex: m.playerIndex, name: m.name, players: m.players }));
    conn.on('team-start',         (m) => dispatch({ type: 'team-start',         players: m.players }));
    conn.on('error',              (m) => dispatch({ type: 'error',              message: m.message }));
    conn.on('opponent-left',      ()  => dispatch({ type: 'opp-left' }));
    conn.on('closed',             ()  => { connRef.current = null; dispatch({ type: 'disconnected' }); });
    conn.on('relay', (m) => {
      const d = m.data || {};
      const from = m.fromIndex ?? -1;
      if (d.t === 'board')   dispatch({ type: 'board-received',   fromPlayer: from, cells: d.cells });
      if (d.t === 'attack')  dispatch({ type: 'attack-received',  fromPlayer: from, targetPlayer: d.targetPlayer, indices: d.indices });
    });
    await conn.ready;
    connRef.current = conn;
    return conn;
  }

  async function withConn(fn) {
    setConnecting(true);
    dispatch({ type: 'error', message: '' });
    try { fn(await getConn()); }
    catch { dispatch({ type: 'error', message: 'Não consegui conectar ao servidor.' }); }
    finally { setConnecting(false); }
  }

  function createRoom() { sfx.click(); withConn((c) => c.send({ type: 'create-team', name: state.myName || 'Jogador 1' })); }
  function joinRoom()   { sfx.click(); withConn((c) => c.send({ type: 'join-team',   code: codeInput, name: state.myName || 'Jogador' })); }

  function finishPlacement(board) {
    connRef.current?.relay({ t: 'board', cells: board.map((c) => c.pieceId) });
    dispatch({ type: 'placed', board });
  }

  function handleAttack({ boardIdx, board, indices, hitsMade, anyHit, destroyed }) {
    const targetPlayer = enemiesOf(state.myIndex)[boardIdx];
    connRef.current?.relay({ t: 'attack', targetPlayer, indices });
    if (destroyed) sfx.destroyed();
    dispatch({ type: 'i-attacked', targetPlayer, board, shotsFired: indices.length, hitsMade, anyHit });
  }

  function handleTimeout() {
    connRef.current?.relay({ t: 'attack', targetPlayer: -1, indices: [] });
    dispatch({ type: 'i-attacked', targetPlayer: -1, board: null, shotsFired: 0, hitsMade: 0, anyHit: false });
  }

  // ─── helpers de UI ────────────────────────────────────────────────────────
  const { stage, myIndex, players, boards, code } = state;
  const pname  = (pi) => players[pi] ?? `Jogador ${pi + 1}`;
  const pboard = (pi) => boards[pi] ?? null;

  const teamNames = { 0: 'Time A', 1: 'Time B' };

  // ─── renders ──────────────────────────────────────────────────────────────
  if (stage === 'lobby') return (
    <div className="screen menu fade-in">
      <p className="tagline">
        <strong>Online 2v2</strong> — 4 jogadores, cada um no seu dispositivo.
        <br />
        Entrem em ordem: slots 1–2 viram Time A, slots 3–4 viram Time B.
      </p>
      {state.error && <div className="error-box">{state.error}</div>}
      <input className="lobby-input" placeholder="Seu nome" maxLength={14}
        value={state.myName} onChange={(e) => dispatch({ type: 'set-name', name: e.target.value })} />
      <div className="lobby-panels">
        <div className="lobby-panel">
          <h3>Criar sala 2v2</h3>
          <p>Você é o 1º do Time A. Compartilhe o código com os outros 3.</p>
          <button className="big-btn" onClick={createRoom} disabled={connecting}>👥 Criar sala</button>
        </div>
        <div className="lobby-panel">
          <h3>Entrar na sala</h3>
          <input className="lobby-input code-input" placeholder="CÓDIGO" maxLength={4}
            value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} />
          <button className="big-btn" onClick={joinRoom}
            disabled={connecting || codeInput.trim().length !== 4}>🛸 Entrar</button>
        </div>
      </div>
    </div>
  );

  if (stage === 'waiting') return (
    <div className="screen pass fade-in">
      <div className="pass-icon">👥</div>
      <h2>Sala criada! Código: <span className="highlight">{code}</span></h2>
      <p>Compartilhe este código — os 4 jogadores entram em sequência.</p>
      <div className="team-waiting-grid">
        {[0, 1].map((team) => (
          <div key={team} className="team-waiting-panel">
            <div className={`team-label-${team === 0 ? 'a' : 'b'}`}>{teamNames[team]}</div>
            {[0, 1].map((slot) => {
              const pi = team * 2 + slot;
              const filled = !!players[pi];
              return (
                <div key={pi} className={`team-slot ${filled ? 'team-slot-filled' : ''}`}>
                  {filled ? `✓ ${players[pi]}` : `Aguardando ${slot + 1}º jogador...`}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="waiting-dots">Aguardando os 4 jogadores</p>
    </div>
  );

  if (stage === 'placement') {
    const myTeam = teamOf(myIndex);
    return (
      <div>
        <div className="team-placement-info">
          <span className={`team-badge team-badge-${myTeam === 0 ? 'a' : 'b'}`}>
            {teamNames[myTeam]}
          </span>
          <span className="team-placement-role">
            — você é o {myIndex % 2 === 0 ? '1º' : '2º'} jogador
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
        <h2>Equipe escondida!</h2>
        <p className="waiting-dots">Aguardando os outros ({readyCount}/4 prontos)</p>
      </div>
    );
  }

  if (stage === 'battle') {
    const [e0, e1] = enemiesOf(myIndex);
    return (
      <TeamBattleScreen
        myName={pname(myIndex)}
        allyName={pname(allyOf(myIndex))}
        enemy0Name={pname(e0)}
        enemy1Name={pname(e1)}
        enemy0Board={pboard(e0)}
        enemy1Board={pboard(e1)}
        ownBoard={pboard(myIndex)}
        allyBoard={pboard(allyOf(myIndex))}
        energy={state.energy}
        onAttack={handleAttack}
        onSpendEnergy={(amount) => dispatch({ type: 'spend', amount })}
        onTimeout={handleTimeout}
      />
    );
  }

  if (stage === 'allyAttacking') {
    const ally = allyOf(myIndex);
    return (
      <div className="screen battle fade-in">
        <h2><span className="highlight">{pname(ally)}</span> está atacando...</h2>
        <div className="message">{state.allyMsg || 'Seu parceiro está no ataque!'}</div>
        <div className="team-mini-boards">
          <MiniBoard board={pboard(myIndex)}   label={`${pname(myIndex)} (você)`}     flash={state.allyFlash} />
          <MiniBoard board={pboard(ally)}       label={`${pname(ally)} (parceiro)`}   flash={[]} />
        </div>
        <p className="waiting-dots">Aguardando parceiro atacar</p>
      </div>
    );
  }

  if (stage === 'defend') {
    const ca = state.currentAttacker;
    const ally = allyOf(myIndex);
    const attackerTeamName = teamNames[teamOf(ca)];
    return (
      <div className="screen battle fade-in">
        <h2>{attackerTeamName} — <span className="highlight">{pname(ca)}</span> ataca!</h2>
        <div className="message">{state.defendMsg || 'Segure firme!'}</div>
        <div className="team-mini-boards">
          <MiniBoard board={pboard(myIndex)} label={`${pname(myIndex)} (você)`} flash={state.defendFlash} />
          <MiniBoard board={pboard(ally)}    label={`${pname(ally)} (parceiro)`} flash={state.allyFlash} />
        </div>
        <p className="waiting-dots">Aguardando ataque inimigo</p>
      </div>
    );
  }

  if (stage === 'gameover') {
    const myTeam  = teamOf(myIndex);
    const won     = state.winner === myTeam;
    const winName = teamNames[state.winner];
    return (
      <div className="screen gameover fade-in">
        <div className="trophy">{won ? '🏆' : '💫'}</div>
        <h2><span className="highlight">{winName}</span> venceu a batalha!</h2>
        <div className="stats">
          <div className="stat-card">
            <div className="stat-name">Sua equipe</div>
            <div>🎯 {state.myStats.shots} disparos</div>
            <div>💥 {state.myStats.hits} acertos</div>
            <div>📊 {state.myStats.shots > 0 ? Math.round((state.myStats.hits / state.myStats.shots) * 100) : 0}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-name">Time inimigo</div>
            <div>🎯 {state.oppStats.shots} disparos</div>
            <div>💥 {state.oppStats.hits} acertos</div>
            <div>📊 {state.oppStats.shots > 0 ? Math.round((state.oppStats.hits / state.oppStats.shots) * 100) : 0}%</div>
          </div>
        </div>
        <button className="big-btn" onClick={onExit}>← Voltar ao Menu</button>
      </div>
    );
  }

  return null;
}

// ─── Mini-tabuleiro ───────────────────────────────────────────────────────────
function MiniBoard({ board, label, flash = [] }) {
  const flashSet = new Set(flash);
  return (
    <div className="own-side">
      <div className="own-title">{label}</div>
      <div className="grid own-grid" style={{ '--size': 8 }}>
        {(board ?? []).map((cell, i) => {
          const piece = cell.pieceId ? FLEET_MAP[cell.pieceId] : null;
          const justHit = flashSet.has(i);
          let cls = 'mini-cell';
          let content = '';
          if (piece && cell.shot) { cls += ` mini-hit${justHit ? ' pop' : ''}`; content = '💥'; }
          else if (piece)          { cls += ' mini-piece'; content = piece.emoji; }
          else if (cell.shot)      cls += ' mini-miss';
          return <div key={i} className={cls}>{content}</div>;
        })}
      </div>
    </div>
  );
}
