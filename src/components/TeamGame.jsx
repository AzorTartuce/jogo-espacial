import { useReducer, useRef, useEffect, useState } from 'react';
import { FLEET, ENERGY_PER_TURN } from '../game/constants.js';
import { fire, allFound } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { createConnection } from '../online/connection.js';
import PlacementScreen from './PlacementScreen.jsx';
import TeamBattleScreen from './TeamBattleScreen.jsx';

const FLEET_MAP = Object.fromEntries(FLEET.map((p) => [p.id, p]));

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
      const boards = { ...s.boards, [a.fromPlayer]: cellsToBoard(a.cells) };
      const boardCount = s.boardCount + 1;
      const ns = { ...s, boards, boardCount };
      if (boardCount >= 4) return stageFor({ ...ns, currentAttacker: 0, energy: 0 });
      return ns;
    }

    case 'i-attacked': {
      const ta = s.teamAssignment;
      const boards = a.board ? { ...s.boards, [a.targetPlayer]: a.board } : s.boards;
      const myStats = {
        shots: s.myStats.shots + a.shotsFired,
        hits:  s.myStats.hits  + a.hitsMade,
      };
      const ca = nextAttacker(s.myIndex, a.anyHit);
      const ns = { ...s, boards, myStats, currentAttacker: ca };
      const enemies = enemiesOf(s.myIndex, ta);
      if (enemies.every((pi) => ns.boards[pi] && allFound(ns.boards[pi]))) {
        sfx.win();
        return { ...ns, winner: teamOf(s.myIndex, ta), stage: 'gameover' };
      }
      return stageFor(ns, !a.anyHit);
    }

    case 'attack-received': {
      const { fromPlayer, targetPlayer, indices } = a;
      const ta = s.teamAssignment;
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
      const isAllyBoard = targetPlayer === allyOf(s.myIndex, ta);
      const isEnemyAtk  = teamOf(fromPlayer, ta) !== teamOf(s.myIndex, ta);

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
        defendMsg:   isEnemyAtk  ? msg : s.defendMsg,
        allyMsg:     isAllyBoard ? msg : s.allyMsg,
      };

      const myTeam = teamOf(s.myIndex, ta);
      const myMembers = [0, 1, 2, 3].filter((pi) => teamOf(pi, ta) === myTeam);
      if (myMembers.every((pi) => ns.boards[pi] && allFound(ns.boards[pi]))) {
        return { ...ns, winner: teamOf(fromPlayer, ta), stage: 'gameover' };
      }
      return stageFor(ns);
    }

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
        };
      }
      return { ...s, rematchVotes: votes };
    }

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
      if (d.t === 'board')      dispatch({ type: 'board-received',  fromPlayer: from, cells: d.cells });
      if (d.t === 'attack')     dispatch({ type: 'attack-received', fromPlayer: from, targetPlayer: d.targetPlayer, indices: d.indices });
      if (d.t === 'rematch')    dispatch({ type: 'rematch-vote',    playerIndex: from });
      if (d.t === 'team-pick')  dispatch({ type: 'pick-team',       playerIndex: d.playerIndex, team: d.team });
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

  function pickTeam(team) {
    sfx.click();
    connRef.current?.relay({ t: 'team-pick', playerIndex: state.myIndex, team });
    dispatch({ type: 'pick-team', playerIndex: state.myIndex, team });
  }

  function finishPlacement(board) {
    connRef.current?.relay({ t: 'board', cells: board.map((c) => c.pieceId) });
    dispatch({ type: 'placed', board });
  }

  function handleAttack({ boardIdx, board, indices, hitsMade, anyHit, destroyed }) {
    const ta = state.teamAssignment;
    const targetPlayer = enemiesOf(state.myIndex, ta)[boardIdx];
    connRef.current?.relay({ t: 'attack', targetPlayer, indices });
    if (destroyed) sfx.destroyed();
    dispatch({ type: 'i-attacked', targetPlayer, board, shotsFired: indices.length, hitsMade, anyHit });
  }

  function handleTimeout() {
    connRef.current?.relay({ t: 'attack', targetPlayer: -1, indices: [] });
    dispatch({ type: 'i-attacked', targetPlayer: -1, board: null, shotsFired: 0, hitsMade: 0, anyHit: false });
  }

  function requestRematch() {
    sfx.click();
    connRef.current?.relay({ t: 'rematch' });
    dispatch({ type: 'rematch-vote', playerIndex: state.myIndex });
  }

  // ─── helpers de UI ────────────────────────────────────────────────────────
  const { stage, myIndex, players, boards, code } = state;
  const ta     = state.teamAssignment;
  const pname  = (pi) => players[pi] ?? `Jogador ${pi + 1}`;
  const pboard = (pi) => boards[pi] ?? null;

  const teamNames = { 0: 'Time A', 1: 'Time B' };

  // ─── renders ──────────────────────────────────────────────────────────────
  if (stage === 'lobby') return (
    <div className="screen menu fade-in">
      <p className="tagline">
        <strong>Online 2v2</strong> — 4 jogadores, cada um no seu dispositivo.
        <br />
        Após todos entrarem, vocês escolhem os times.
      </p>
      {state.error && <div className="error-box">{state.error}</div>}
      <input className="lobby-input" placeholder="Seu nome" maxLength={14}
        value={state.myName} onChange={(e) => dispatch({ type: 'set-name', name: e.target.value })} />
      <div className="lobby-panels">
        <div className="lobby-panel">
          <h3>Criar sala 2v2</h3>
          <p>Compartilhe o código com os outros 3 jogadores.</p>
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

  if (stage === 'teamSelect') {
    const choices  = state.teamChoices;
    const myChoice = choices[myIndex];
    const countA   = Object.values(choices).filter((t) => t === 0).length;
    const countB   = Object.values(choices).filter((t) => t === 1).length;
    const allReady = countA === 2 && countB === 2;

    return (
      <div className="screen menu fade-in">
        <h2>Escolha seu time</h2>
        <p className="tagline">Cada time precisa de exatamente 2 jogadores.</p>

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
                      {pi === myIndex ? `✓ ${name} (você)` : `✓ ${name}`}
                    </div>
                  ) : null
                )}

                {Array.from({ length: 2 - count }).map((_, i) => (
                  <div key={i} className="team-slot">Aguardando...</div>
                ))}

                <button
                  className="big-btn"
                  disabled={isMine || isFull}
                  onClick={() => pickTeam(team)}
                  style={isMine ? { opacity: 0.55, cursor: 'default' } : {}}
                >
                  {isMine ? `✓ Você está aqui` : `Entrar no ${label}`}
                </button>
              </div>
            );
          })}
        </div>

        {allReady ? (
          <p className="waiting-dots">Times prontos! Iniciando...</p>
        ) : (
          <p className="team-select-hint">
            {Object.keys(choices).length}/4 jogadores escolheram
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
        <h2>Equipe escondida!</h2>
        <p className="waiting-dots">Aguardando os outros ({readyCount}/4 prontos)</p>
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
        ownBoard={pboard(myIndex)}
        allyBoard={pboard(ally)}
        energy={state.energy}
        onAttack={handleAttack}
        onSpendEnergy={(amount) => dispatch({ type: 'spend', amount })}
        onTimeout={handleTimeout}
      />
    );
  }

  if (stage === 'allyAttacking') {
    const ally = allyOf(myIndex, ta);
    return (
      <div className="screen battle fade-in">
        <h2><span className="highlight">{pname(ally)}</span> está atacando...</h2>
        <div className="message">{state.allyMsg || 'Seu parceiro está no ataque!'}</div>
        <div className="team-mini-boards">
          <MiniBoard board={pboard(myIndex)} label={`${pname(myIndex)} (você)`}   flash={state.allyFlash} />
          <MiniBoard board={pboard(ally)}    label={`${pname(ally)} (parceiro)`}  flash={[]} />
        </div>
        <p className="waiting-dots">Aguardando parceiro atacar</p>
      </div>
    );
  }

  if (stage === 'defend') {
    const ca   = state.currentAttacker;
    const ally = allyOf(myIndex, ta);
    const attackerTeamName = teamNames[teamOf(ca, ta)];
    return (
      <div className="screen battle fade-in">
        <h2>{attackerTeamName} — <span className="highlight">{pname(ca)}</span> ataca!</h2>
        <div className="message">{state.defendMsg || 'Segure firme!'}</div>
        <div className="team-mini-boards">
          <MiniBoard board={pboard(myIndex)} label={`${pname(myIndex)} (você)`}  flash={state.defendFlash} />
          <MiniBoard board={pboard(ally)}    label={`${pname(ally)} (parceiro)`} flash={state.allyFlash} />
        </div>
        <p className="waiting-dots">Aguardando ataque inimigo</p>
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
        {!myVoted ? (
          <button className="big-btn" onClick={requestRematch}>🔄 Jogar de novo</button>
        ) : (
          <p className="waiting-dots rematch-note">
            Aguardando todos aceitarem ({voteCount}/4)
          </p>
        )}
        <button className="small-btn" onClick={onExit}>← Voltar ao Menu</button>
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
