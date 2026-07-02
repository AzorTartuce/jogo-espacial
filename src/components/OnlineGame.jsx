import { useReducer, useRef, useEffect, useState } from 'react';
import { ENERGY_PER_TURN } from '../game/constants.js';
import { fire, allFound } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { UPGRADE_POOL } from '../game/upgrades.js';
import { createConnection } from '../online/connection.js';
import { useT, tr } from '../i18n/index.jsx';
import PlacementScreen from './PlacementScreen.jsx';
import BattleScreen from './BattleScreen.jsx';
import DefendScreen from './DefendScreen.jsx';
import UpgradeScreen from './UpgradeScreen.jsx';
import GameOver from './GameOver.jsx';

const ONLINE_MODES = [
  { id: 'classico',      icon: '🎯' },
  { id: 'ascensao',      icon: '⚡' },
  { id: 'instabilidade', icon: '🌀' },
  { id: 'duelo',         icon: '🏅' },
];

const initialState = {
  // lobby | hosting | searching | placement | waitBoards | battle | defend | upgrade | gameover
  stage: 'lobby',
  code: '',
  myIndex: 0,
  myName: '',
  oppName: '',
  ownBoard: null,
  enemyBoard: null,
  energy: 0,
  myStats: { shots: 0, hits: 0 },
  oppStats: { shots: 0, hits: 0 },
  winner: null, // 'me' | 'opp'
  error: '',
  defendMsg: '',
  defendFlash: [],
  pendingMyTurn: false,
  pendingOppTurn: false,
  rematchMe: false,
  rematchOpp: false,
  gameMode: 'ascensao',
  myUpgrades: [],
  myTurnsPlayed: 0,
};

function maybeStart(s) {
  if (!s.ownBoard || !s.enemyBoard) {
    return { ...s, stage: s.ownBoard ? 'waitBoards' : s.stage };
  }
  const myTurn = s.myIndex === 0;
  return {
    ...s,
    stage: myTurn ? 'battle' : 'defend',
    energy: myTurn && s.gameMode !== 'classico' ? s.energy + ENERGY_PER_TURN : s.energy,
    defendMsg: myTurn ? '' : tr('online.oppStartsAttack', { name: s.oppName }),
  };
}

function needsUpgrade(s) {
  return (
    s.gameMode === 'duelo' &&
    s.myTurnsPlayed > 0 &&
    s.myTurnsPlayed % 3 === 0 &&
    s.myUpgrades.length < UPGRADE_POOL.length
  );
}

function reducer(s, a) {
  switch (a.type) {
    case 'set-name':
      return { ...s, myName: a.name };
    case 'created':
      return { ...s, stage: 'hosting', code: a.code, myIndex: 0, error: '' };
    case 'joined':
      return {
        ...s,
        stage: 'placement',
        code: a.code,
        myIndex: 1,
        oppName: a.oppName,
        error: '',
      };
    case 'opponent-joined':
      return { ...s, stage: 'placement', oppName: a.oppName };

    case 'searching':
      return { ...s, stage: 'searching', error: '' };
    case 'match-found':
      return {
        ...s,
        stage: 'placement',
        code: a.code,
        myIndex: a.playerIndex,
        oppName: a.oppName,
        error: '',
      };
    case 'cancel-search':
      return { ...s, stage: 'lobby' };

    case 'placed':
      return maybeStart({ ...s, ownBoard: a.board });
    case 'opp-board': {
      const cells = a.cells.map((pieceId) => ({
        pieceId,
        shot: false,
        revealed: false,
      }));
      return maybeStart({ ...s, enemyBoard: cells });
    }

    case 'i-attacked': {
      const ns = {
        ...s,
        enemyBoard: a.board,
        myStats: {
          shots: s.myStats.shots + a.shotsFired,
          hits: s.myStats.hits + a.hitsMade,
        },
      };
      if (allFound(a.board)) {
        return { ...ns, winner: 'me', stage: 'gameover' };
      }
      if (!a.anyHit) {
        return { ...ns, myTurnsPlayed: s.myTurnsPlayed + 1, pendingOppTurn: true };
      }
      return ns;
    }
    case 'hand-over':
      return {
        ...s,
        pendingOppTurn: false,
        stage: 'defend',
        defendMsg: tr('online.oppTurnHold', { name: s.oppName }),
        defendFlash: [],
      };
    case 'i-timeout':
      return {
        ...s,
        myTurnsPlayed: s.myTurnsPlayed + 1,
        stage: 'defend',
        defendMsg: tr('online.yourTimeUp', { name: s.oppName }),
        defendFlash: [],
      };

    case 'attack-received': {
      let board = s.ownBoard;
      let hits = 0;
      let destroyed = null;
      for (const i of a.indices) {
        const result = fire(board, i);
        if (result) {
          board = result.board;
          if (result.hit) hits++;
          if (result.destroyed) destroyed = result.destroyed;
        }
      }
      let msg;
      if (destroyed) {
        msg = tr('online.foundYour', { emoji: destroyed.emoji, name: tr(`fleet.${destroyed.id}`) });
      } else if (hits > 0) {
        msg = tr('online.hitYour');
      } else {
        msg = tr('online.missYour');
      }
      const ns = {
        ...s,
        ownBoard: board,
        defendFlash: a.indices,
        defendMsg: msg,
        oppStats: {
          shots: s.oppStats.shots + a.indices.length,
          hits: s.oppStats.hits + hits,
        },
      };
      if (allFound(board)) {
        return { ...ns, winner: 'opp', stage: 'gameover' };
      }
      if (hits === 0) return { ...ns, pendingMyTurn: true };
      return ns;
    }
    case 'pass-received':
      return {
        ...s,
        defendMsg: tr('online.oppTimeUp'),
        pendingMyTurn: true,
      };
    case 'take-turn': {
      const stage = needsUpgrade(s) ? 'upgrade' : 'battle';
      return {
        ...s,
        pendingMyTurn: false,
        stage,
        energy: s.gameMode !== 'classico' ? s.energy + ENERGY_PER_TURN : s.energy,
        defendFlash: [],
      };
    }

    case 'spend':
      return { ...s, energy: s.energy - a.amount };

    case 'upgrade-picked': {
      if (!a.upgradeId) return { ...s, stage: 'battle' };
      return {
        ...s,
        myUpgrades: [...s.myUpgrades, a.upgradeId],
        energy: s.energy + (a.upgradeId === 'energy_bonus' ? 3 : 0),
        stage: 'battle',
      };
    }

    case 'use-upgrade':
      return { ...s, myUpgrades: s.myUpgrades.filter((id) => id !== a.upgradeId) };

    case 'set-mode':
      return { ...s, gameMode: a.mode };

    case 'rematch-me':
    case 'rematch-opp': {
      const ns = {
        ...s,
        rematchMe: a.type === 'rematch-me' ? true : s.rematchMe,
        rematchOpp: a.type === 'rematch-opp' ? true : s.rematchOpp,
      };
      if (ns.rematchMe && ns.rematchOpp) {
        return {
          ...ns,
          stage: 'placement',
          ownBoard: null,
          enemyBoard: null,
          energy: 0,
          myStats: { shots: 0, hits: 0 },
          oppStats: { shots: 0, hits: 0 },
          winner: null,
          defendMsg: '',
          defendFlash: [],
          pendingMyTurn: false,
          pendingOppTurn: false,
          rematchMe: false,
          rematchOpp: false,
          myUpgrades: [],
          myTurnsPlayed: 0,
        };
      }
      return ns;
    }

    case 'opp-left':
      return {
        ...initialState,
        myName: s.myName,
        gameMode: s.gameMode,
        error: tr('online.errorOppLeft'),
      };
    case 'disconnected':
      return {
        ...initialState,
        myName: s.myName,
        gameMode: s.gameMode,
        error: s.stage === 'lobby' ? s.error : tr('online.connLost'),
      };
    case 'error':
      return { ...s, error: a.message };
    default:
      return s;
  }
}

export default function OnlineGame({ onExit, quickMatch = false }) {
  const t = useT();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [codeInput, setCodeInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const connRef = useRef(null);
  const gameModeRef = useRef(state.gameMode);
  useEffect(() => { gameModeRef.current = state.gameMode; }, [state.gameMode]);

  useEffect(() => {
    return () => {
      connRef.current?.close();
      connRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!state.pendingOppTurn) return;
    const t = setTimeout(() => dispatch({ type: 'hand-over' }), 1100);
    return () => clearTimeout(t);
  }, [state.pendingOppTurn]);

  useEffect(() => {
    if (!state.pendingMyTurn) return;
    const t = setTimeout(() => dispatch({ type: 'take-turn' }), 1100);
    return () => clearTimeout(t);
  }, [state.pendingMyTurn]);

  useEffect(() => {
    if (state.defendFlash.length === 0 || !state.ownBoard) return;
    const anyHit = state.defendFlash.some(
      (i) => state.ownBoard[i].shot && state.ownBoard[i].pieceId
    );
    if (anyHit) sfx.hit();
    else sfx.miss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.defendFlash]);

  useEffect(() => {
    if (state.stage !== 'gameover') return;
    if (state.winner === 'me') sfx.win();
    else sfx.miss();
  }, [state.stage, state.winner]);

  async function getConnection() {
    if (connRef.current) return connRef.current;
    const conn = createConnection();
    conn.on('created', (m) => dispatch({ type: 'created', code: m.code }));
    conn.on('joined', (m) =>
      dispatch({ type: 'joined', code: m.code, oppName: m.oppName })
    );
    conn.on('opponent-joined', (m) => {
      dispatch({ type: 'opponent-joined', oppName: m.oppName });
      conn.relay({ t: 'mode', mode: gameModeRef.current });
    });
    conn.on('searching', () => dispatch({ type: 'searching' }));
    conn.on('match-found', (m) => {
      dispatch({ type: 'match-found', code: m.code, playerIndex: m.playerIndex, oppName: m.oppName });
      // Quem entrou primeiro na fila (índice 0) define o modo para os dois.
      if (m.playerIndex === 0) conn.relay({ t: 'mode', mode: gameModeRef.current });
    });
    conn.on('error', (m) => dispatch({ type: 'error', message: m.message }));
    conn.on('opponent-left', () => dispatch({ type: 'opp-left' }));
    conn.on('closed', () => {
      connRef.current = null;
      dispatch({ type: 'disconnected' });
    });
    conn.on('relay', (m) => {
      const d = m.data || {};
      if (d.t === 'board') dispatch({ type: 'opp-board', cells: d.cells });
      if (d.t === 'attack') dispatch({ type: 'attack-received', indices: d.indices });
      if (d.t === 'pass') dispatch({ type: 'pass-received' });
      if (d.t === 'rematch') dispatch({ type: 'rematch-opp' });
      if (d.t === 'mode') dispatch({ type: 'set-mode', mode: d.mode });
    });
    await conn.ready;
    connRef.current = conn;
    return conn;
  }

  async function withConnection(fn) {
    setConnecting(true);
    dispatch({ type: 'error', message: '' });
    try {
      const conn = await getConnection();
      fn(conn);
    } catch {
      dispatch({ type: 'error', message: t('online.connectFail') });
    } finally {
      setConnecting(false);
    }
  }

  const modeTitle = (id) =>
    id === 'duelo' ? t('gameMode.duelo.short') : t(`gameMode.${id}.title`);

  function createRoom() {
    sfx.click();
    withConnection((conn) =>
      conn.send({ type: 'create', name: state.myName || t('menu.defaultP1') })
    );
  }

  function joinRoom() {
    sfx.click();
    withConnection((conn) =>
      conn.send({ type: 'join', code: codeInput, name: state.myName || t('menu.defaultP2') })
    );
  }

  function findMatch() {
    sfx.click();
    withConnection((conn) =>
      conn.send({ type: 'quick-match', name: state.myName || t('online.defaultAstronaut'), mode: state.gameMode })
    );
  }

  function cancelSearch() {
    sfx.click();
    connRef.current?.send({ type: 'cancel-match' });
    dispatch({ type: 'cancel-search' });
  }

  function finishPlacement(board) {
    connRef.current?.relay({ t: 'board', cells: board.map((c) => c.pieceId) });
    dispatch({ type: 'placed', board });
  }

  function handleAttack({ board, indices, shotsFired, hitsMade, anyHit, destroyed }) {
    connRef.current?.relay({ t: 'attack', indices });
    if (destroyed) sfx.destroyed();
    dispatch({ type: 'i-attacked', board, shotsFired, hitsMade, anyHit });
  }

  function handleTimeout() {
    connRef.current?.relay({ t: 'pass' });
    dispatch({ type: 'i-timeout' });
  }

  function requestRematch() {
    connRef.current?.relay({ t: 'rematch' });
    dispatch({ type: 'rematch-me' });
  }

  const { stage } = state;

  if (stage === 'lobby' && quickMatch) {
    return (
      <div className="screen menu fade-in">
        <p className="tagline">
          {t('online.quickTagline1')}
          <br />
          {t('online.quickTagline2')}
        </p>

        {state.error && <div className="error-box">{state.error}</div>}

        <input
          className="lobby-input"
          placeholder={t('online.yourName')}
          maxLength={14}
          value={state.myName}
          onChange={(e) => dispatch({ type: 'set-name', name: e.target.value })}
        />

        <div className="lobby-panels">
          <div className="lobby-panel">
            <h3>{t('online.chooseMode')}</h3>
            <div className="online-mode-selector">
              {ONLINE_MODES.map((m) => (
                <button
                  key={m.id}
                  className={`online-mode-chip ${state.gameMode === m.id ? 'active' : ''}`}
                  onClick={() => { sfx.click(); dispatch({ type: 'set-mode', mode: m.id }); }}
                >
                  {m.icon} {modeTitle(m.id)}
                </button>
              ))}
            </div>
            <p className="online-join-hint">
              {t('online.quickHint')}
            </p>
            <button className="big-btn" onClick={findMatch} disabled={connecting}>
              {t('online.searchBtn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'lobby') {
    return (
      <div className="screen menu fade-in">
        <p className="tagline">
          {t('online.createTagline1')}
          <br />
          {t('online.createTagline2')}
        </p>

        {state.error && <div className="error-box">{state.error}</div>}

        <input
          className="lobby-input"
          placeholder={t('online.yourName')}
          maxLength={14}
          value={state.myName}
          onChange={(e) => dispatch({ type: 'set-name', name: e.target.value })}
        />

        <div className="lobby-panels">
          <div className="lobby-panel">
            <h3>{t('online.createRoomH')}</h3>
            <p>{t('online.createRoomP')}</p>
            <div className="online-mode-selector">
              {ONLINE_MODES.map((m) => (
                <button
                  key={m.id}
                  className={`online-mode-chip ${state.gameMode === m.id ? 'active' : ''}`}
                  onClick={() => { sfx.click(); dispatch({ type: 'set-mode', mode: m.id }); }}
                >
                  {m.icon} {modeTitle(m.id)}
                </button>
              ))}
            </div>
            <button className="big-btn" onClick={createRoom} disabled={connecting}>
              {t('online.createBtn')}
            </button>
          </div>

          <div className="lobby-panel">
            <h3>{t('online.joinH')}</h3>
            <p className="online-join-hint">{t('online.joinHint')}</p>
            <input
              className="lobby-input code-input"
              placeholder={t('online.codePh')}
              maxLength={4}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            />
            <button
              className="big-btn"
              onClick={joinRoom}
              disabled={connecting || codeInput.trim().length !== 4}
            >
              {t('online.joinBtn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'hosting') {
    return (
      <div className="screen pass fade-in">
        <div className="pass-icon">📡</div>
        <h2>{t('online.roomCreated')}</h2>
        <div className="room-code">{state.code}</div>
        <p>
          {t('online.shareInstr1')}{' '}
          <span className="highlight">{location.host}</span>{' '}
          {t('online.shareInstr2')}
        </p>
        <p className="waiting-dots">{t('online.waitingOpp')}</p>
      </div>
    );
  }

  if (stage === 'searching') {
    return (
      <div className="screen pass fade-in">
        <div className="pass-icon">🛰️</div>
        <h2>{t('online.searchingH')}</h2>
        <p className="waiting-dots">{t('online.searchingP')}</p>
        <button className="small-btn" onClick={cancelSearch}>
          {t('online.cancelSearch')}
        </button>
      </div>
    );
  }

  if (stage === 'placement') {
    return (
      <PlacementScreen
        playerName={state.myName || t('online.you')}
        onDone={finishPlacement}
      />
    );
  }

  if (stage === 'waitBoards') {
    return (
      <div className="screen pass fade-in">
        <div className="pass-icon">🧑‍🚀</div>
        <h2>{t('online.teamHidden')}</h2>
        <p className="waiting-dots">
          {t('online.waitOppHide', { name: state.oppName || t('online.theOpponent') })}
        </p>
      </div>
    );
  }

  if (stage === 'upgrade') {
    return (
      <UpgradeScreen
        playerName={state.myName || t('online.you')}
        pickedUpgrades={state.myUpgrades}
        onPick={(upgradeId) => dispatch({ type: 'upgrade-picked', upgradeId })}
      />
    );
  }

  if (stage === 'battle') {
    return (
      <BattleScreen
        playerName={state.myName || t('online.you')}
        enemyName={state.oppName}
        enemyBoard={state.enemyBoard}
        ownBoard={state.ownBoard}
        energy={state.energy}
        gameMode={state.gameMode}
        upgrades={state.gameMode === 'duelo' ? state.myUpgrades : []}
        onAttack={handleAttack}
        onSpendEnergy={(amount) => dispatch({ type: 'spend', amount })}
        onTimeout={handleTimeout}
        onUpgradeUsed={(upgradeId) => dispatch({ type: 'use-upgrade', upgradeId })}
      />
    );
  }

  if (stage === 'defend') {
    return (
      <DefendScreen
        oppName={state.oppName}
        ownBoard={state.ownBoard}
        message={state.defendMsg}
        flash={state.defendFlash}
      />
    );
  }

  if (stage === 'gameover') {
    return (
      <>
        <GameOver
          winnerName={state.winner === 'me' ? state.myName || t('online.you') : state.oppName}
          stats={[state.myStats, state.oppStats]}
          names={[state.myName || t('online.you'), state.oppName]}
          onRestart={requestRematch}
        />
        {state.rematchMe && (
          <p className="waiting-dots rematch-note">
            {t('online.rematchWaiting', { name: state.oppName })}
          </p>
        )}
        {state.rematchOpp && !state.rematchMe && (
          <p className="rematch-note highlight">
            {t('online.rematchWants', { name: state.oppName })}
          </p>
        )}
      </>
    );
  }

  return null;
}
