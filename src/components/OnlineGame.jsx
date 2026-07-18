import { useReducer, useRef, useEffect, useState, useCallback } from 'react';
import { emptyBoard } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { createConnection, getSavedSession, clearSavedSession } from '../online/connection.js';
import { useT, tr } from '../i18n/index.jsx';
import PlacementScreen from './PlacementScreen.jsx';
import BattleScreen from './BattleScreen.jsx';
import DefendScreen from './DefendScreen.jsx';
import UpgradeScreen from './UpgradeScreen.jsx';
import GameOver from './GameOver.jsx';
import QuickMatchLobby from './QuickMatchLobby.jsx';
import RoomLobby from './RoomLobby.jsx';
import HostingScreen from './HostingScreen.jsx';
import SearchingScreen from './SearchingScreen.jsx';
import WaitModeScreen from './WaitModeScreen.jsx';
import WaitBoardsScreen from './WaitBoardsScreen.jsx';
import NetBanner from './NetBanner.jsx';
import MatchFoundBanner from './MatchFoundBanner.jsx';

const ONLINE_MODES = [
  { id: 'classico',      icon: '🎯' },
  { id: 'ascensao',      icon: '⚡' },
  { id: 'instabilidade', icon: '🌀' },
  { id: 'duelo',         icon: '🏅' },
];

// Quanto tempo dar pra animação de acerto/erro terminar antes de trocar de
// tela (ataque/defesa/vitória). Só existe UMA fonte de verdade agora (o
// servidor), então não há mais duas linhas do tempo client-side correndo
// uma contra a outra — este delay é só estética, não precisa de guard.
const RESOLVE_DELAY_MS = 1200;

export const initialState = {
  // lobby | hosting | searching | placement | waitMode | waitBoards |
  // battle | defend | upgrade | gameover
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
  rematchMe: false,
  rematchOpp: false,
  gameMode: 'ascensao',
  myUpgrades: [],
  // Resultados de tiro/sondagem já resolvidos pelo servidor, entregues ao
  // BattleScreen via prop (mesmo contrato de antes).
  shotResult: null,
  probeResult: null,
  incomingEvent: null,
  oppDisconnected: false,
  reconnecting: false,
  // Transição de turno pendente: guarda o que fazer daqui a RESOLVE_DELAY_MS
  // (pra dar tempo da animação de acerto/erro rodar) — sempre escrito pelo
  // servidor, nunca por duas fontes concorrentes.
  pendingResolve: null,
  resolveGen: 0,
  // Tentando retomar uma partida após um refresh de página (ver `sync`).
  resuming: false,
};

function needsUpgradeStage(needsUpgrade, stage) {
  return needsUpgrade ? 'upgrade' : stage;
}

export function reducer(s, a) {
  switch (a.type) {
    case 'set-name':
      return { ...s, myName: a.name };
    case 'resume-start':
      return { ...s, resuming: true };
    case 'created':
      return { ...s, stage: 'hosting', code: a.code, myIndex: 0, error: '' };
    case 'joined':
      return {
        ...s,
        stage: 'waitMode',
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
        stage: a.playerIndex === 0 ? 'placement' : 'waitMode',
        code: a.code,
        myIndex: a.playerIndex,
        oppName: a.oppName,
        error: '',
      };
    case 'cancel-search':
      return { ...s, stage: 'lobby' };

    // Usado tanto pela seleção local no lobby (antes de existir sala) quanto
    // pela confirmação vinda do servidor (`mode-set`) para quem entrou numa
    // sala já criada e ainda não sabia o modo.
    case 'set-mode':
      return {
        ...s,
        gameMode: a.mode,
        stage: s.stage === 'waitMode' ? 'placement' : s.stage,
      };

    case 'placed':
      // Não decide mais estágio sozinho: o servidor manda `battle-start`
      // assim que os dois tabuleiros chegarem.
      return { ...s, ownBoard: a.board, stage: 'waitBoards' };

    case 'battle-start': {
      const myTurn = s.myIndex === a.turnIndex;
      return {
        ...s,
        enemyBoard: emptyBoard(),
        energy: a.energy,
        stage: myTurn ? 'battle' : 'defend',
        defendMsg: myTurn ? '' : tr('online.oppStartsAttack', { name: s.oppName }),
        defendFlash: [],
      };
    }

    // Eu ataquei — o servidor já resolveu o tiro contra o tabuleiro real do
    // defensor; só aplico o resultado e agendo a troca de tela.
    //
    // `enemyBoard` também precisa ser mantido aqui (e não só dentro do
    // BattleScreen): sempre que o turno volta pra mim, um NOVO BattleScreen
    // monta e lê `enemyBoard` de novo como estado inicial — se este reducer
    // não acompanhasse os acertos/erros, cada retorno de turno apagaria as
    // marcas do tabuleiro inimigo já reveladas.
    case 'attack-result': {
      const board = (s.enemyBoard || emptyBoard()).slice();
      const hitSet = new Set(a.hitIndices);
      for (const i of a.indices) {
        board[i] = { ...board[i], shot: true, pieceId: hitSet.has(i) ? true : board[i].pieceId };
      }
      const ns = {
        ...s,
        enemyBoard: board,
        shotResult: {
          id: (s.shotResult?.id || 0) + 1,
          indices: a.indices,
          hitIndices: a.hitIndices,
          destroyed: a.destroyed,
          sunkAll: a.sunkAll,
        },
        energy: a.energy,
        myStats: {
          shots: s.myStats.shots + a.indices.length,
          hits: s.myStats.hits + a.hitIndices.length,
        },
      };
      return {
        ...ns,
        pendingResolve: a.sunkAll ? { winner: 'me' } : { stage: a.yourTurn ? 'battle' : 'defend' },
        resolveGen: s.resolveGen + 1,
      };
    }

    // Fui atacado — o servidor manda o resultado já pronto (hitIndices,
    // destroyed, sunkAll); só marco as células no meu tabuleiro real.
    case 'attack-received': {
      const board = s.ownBoard.slice();
      for (const i of a.indices) board[i] = { ...board[i], shot: true };
      let msg;
      if (a.destroyed) {
        msg = tr('online.foundYour', { emoji: a.destroyed.emoji, name: tr(`fleet.${a.destroyed.id}`) });
      } else if (a.hitIndices.length > 0) {
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
          hits: s.oppStats.hits + a.hitIndices.length,
        },
      };
      return {
        ...ns,
        pendingResolve: a.sunkAll
          ? { winner: 'opp' }
          : {
              stage: a.yourTurn ? 'battle' : 'defend',
              energy: a.yourTurn ? a.energy : undefined,
              needsUpgrade: a.yourTurn ? !!a.needsUpgrade : false,
            },
        resolveGen: s.resolveGen + 1,
      };
    }

    case 'timeout-you':
      return {
        ...s,
        pendingResolve: { stage: 'defend' },
        resolveGen: s.resolveGen + 1,
      };
    case 'timeout-opponent':
      return {
        ...s,
        defendMsg: tr('online.oppTimeUp'),
        pendingResolve: { stage: 'battle', energy: a.energy, needsUpgrade: !!a.needsUpgrade },
        resolveGen: s.resolveGen + 1,
      };

    // Aplica a transição de turno guardada em `pendingResolve` — chamado um
    // pouco depois do resultado chegar, só pra dar tempo da animação rodar.
    case 'resolve-turn': {
      const p = s.pendingResolve;
      if (!p) return s;
      if (p.winner) return { ...s, pendingResolve: null, winner: p.winner, stage: 'gameover' };
      const stage = needsUpgradeStage(p.needsUpgrade, p.stage);
      return {
        ...s,
        pendingResolve: null,
        stage,
        energy: p.energy !== undefined ? p.energy : s.energy,
        shotResult: null,
        probeResult: null,
        defendFlash: stage === 'defend' ? s.defendFlash : [],
        defendMsg: stage === 'defend' ? s.defendMsg : '',
        incomingEvent: null,
      };
    }

    // Mesmo raciocínio de `attack-result`: mantém `enemyBoard` acompanhando
    // as células reveladas por radar/anomalia/visão pro próximo mount.
    case 'probe-result': {
      const board = (s.enemyBoard || emptyBoard()).slice();
      for (const c of a.cells) {
        if (!board[c.index].shot) {
          board[c.index] = { ...board[c.index], revealed: true, pieceId: c.hasPiece ? true : null };
        }
      }
      return {
        ...s,
        enemyBoard: board,
        probeResult: { id: (s.probeResult?.id || 0) + 1, cells: a.cells },
        energy: a.energy !== undefined ? a.energy : s.energy,
        myUpgrades: a.upgrades !== undefined ? a.upgrades : s.myUpgrades,
      };
    }

    case 'event-received':
      return {
        ...s,
        incomingEvent: { id: (s.incomingEvent?.id || 0) + 1, event: a.event },
      };

    case 'upgrade-applied':
      return { ...s, myUpgrades: a.upgrades, energy: a.energy, stage: 'battle' };

    case 'net-opp-down':
      return { ...s, oppDisconnected: true };
    case 'net-opp-up':
      return { ...s, oppDisconnected: false };
    case 'net-reconnecting':
      return { ...s, reconnecting: true };
    case 'net-reconnected':
      return { ...s, reconnecting: false, oppDisconnected: false, oppName: a.oppName || s.oppName };

    case 'rematch-me':
      return { ...s, rematchMe: true };
    case 'rematch-opp-ready':
      return { ...s, rematchOpp: true };
    case 'rematch-start':
      return {
        ...initialState,
        stage: 'placement',
        myName: s.myName,
        gameMode: s.gameMode,
        code: s.code,
        myIndex: s.myIndex,
        oppName: s.oppName,
      };

    // Retomada após refresh de página: o servidor manda tudo que preciso
    // pra redesenhar a partida do ponto exato em que ela estava.
    case 'sync': {
      if (!a.started) {
        return {
          ...s,
          gameMode: a.mode,
          ownBoard: a.board || null,
          stage: a.board ? 'waitBoards' : 'placement',
          resuming: false,
        };
      }
      const myTurn = s.myIndex === a.turnIndex;
      const winner = a.winner == null ? null : a.winner === s.myIndex ? 'me' : 'opp';
      // Reconstrói o tabuleiro inimigo a partir dos tiros que o servidor
      // lembra (`enemyShots`) — sem isso, um refresh de página fazia o
      // jogador "esquecer" tudo que já tinha atirado no adversário.
      const enemyBoard = (s.enemyBoard || emptyBoard()).slice();
      for (const c of a.enemyShots || []) {
        enemyBoard[c.index] = { ...enemyBoard[c.index], shot: true, pieceId: c.hasPiece ? true : enemyBoard[c.index].pieceId };
      }
      return {
        ...s,
        gameMode: a.mode,
        ownBoard: a.board,
        enemyBoard,
        energy: a.energy,
        myUpgrades: a.upgrades,
        winner,
        stage: winner ? 'gameover' : myTurn ? 'battle' : 'defend',
        defendMsg: !winner && !myTurn ? tr('online.oppTurnHold', { name: s.oppName }) : s.defendMsg,
        resuming: false,
      };
    }
    case 'resume-failed':
      return { ...s, resuming: false };

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

export default function OnlineGame({ onExit, quickMatch = false, presetMode = null, hideModeSelector = false }) {
  const t = useT();
  const [state, dispatch] = useReducer(
    reducer,
    initialState,
    (s) => (presetMode ? { ...s, gameMode: presetMode } : s)
  );
  const [codeInput, setCodeInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [matchFoundAfterCancel, setMatchFoundAfterCancel] = useState(false);
  const connRef = useRef(null);
  const connectingRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const gameModeRef = useRef(state.gameMode);
  useEffect(() => { gameModeRef.current = state.gameMode; }, [state.gameMode]);

  const sendShot = useCallback((indices, kind, index) =>
    connRef.current?.send({ type: 'attack', kind: kind || 'normal', index: index ?? indices[0] }), []);
  const sendProbe = useCallback((cells, index, kind) =>
    connRef.current?.send({ type: 'probe', kind, index: index ?? cells[0] }), []);
  const sendEvent = useCallback((event) => connRef.current?.relay({ t: 'event', event }), []);

  useEffect(() => {
    return () => {
      connRef.current?.close();
      connRef.current = null;
      // Saindo de fato da tela online (não um simples re-render): a partida
      // acabou pra este jogador, não faz sentido tentar retomar depois.
      clearSavedSession();
    };
  }, []);

  useEffect(() => {
    if (state.defendFlash.length === 0 || !state.ownBoard) return;
    const anyHit = state.defendFlash.some(
      (i) => state.ownBoard[i].shot && state.ownBoard[i].pieceId
    );
    if (anyHit) sfx.hit();
    else sfx.miss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.defendFlash]);

  // Aplica a transição de turno pendente depois de um curto delay estético.
  useEffect(() => {
    if (!state.pendingResolve) return;
    const t = setTimeout(() => dispatch({ type: 'resolve-turn' }), RESOLVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [state.resolveGen, state.pendingResolve]);

  useEffect(() => {
    if (state.stage !== 'gameover') return;
    if (state.winner === 'me') sfx.win();
    else sfx.lose();
  }, [state.stage, state.winner]);

  useEffect(() => {
    if (!matchFoundAfterCancel) return;
    const t = setTimeout(() => setMatchFoundAfterCancel(false), 5000);
    return () => clearTimeout(t);
  }, [matchFoundAfterCancel]);

  async function getConnection() {
    if (connRef.current) return connRef.current;
    const conn = createConnection();
    conn.on('created', (m) => {
      conn.setReconnect({ code: m.code, playerIndex: m.playerIndex, token: m.token });
      dispatch({ type: 'created', code: m.code });
    });
    conn.on('joined', (m) => {
      conn.setReconnect({ code: m.code, playerIndex: m.playerIndex, token: m.token });
      dispatch({ type: 'joined', code: m.code, oppName: m.oppName });
    });
    conn.on('opponent-joined', (m) => {
      dispatch({ type: 'opponent-joined', oppName: m.oppName });
      conn.send({ type: 'set-mode', mode: gameModeRef.current });
    });
    conn.on('mode-set', (m) => dispatch({ type: 'set-mode', mode: m.mode }));
    conn.on('searching', () => dispatch({ type: 'searching' }));
    conn.on('match-found', (m) => {
      conn.setReconnect({ code: m.code, playerIndex: m.playerIndex, token: m.token });
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false;
        setMatchFoundAfterCancel(true);
      }
      dispatch({ type: 'match-found', code: m.code, playerIndex: m.playerIndex, oppName: m.oppName });
      if (m.playerIndex === 0) conn.send({ type: 'set-mode', mode: gameModeRef.current });
    });
    conn.on('error', (m) => dispatch({ type: 'error', message: m.message }));
    conn.on('opponent-left', () => {
      clearSavedSession();
      dispatch({ type: 'opp-left' });
    });
    conn.on('opponent-disconnected', () => dispatch({ type: 'net-opp-down' }));
    conn.on('opponent-reconnected', () => dispatch({ type: 'net-opp-up' }));
    conn.on('reconnecting', () => dispatch({ type: 'net-reconnecting' }));
    conn.on('reconnected', (m) => dispatch({ type: 'net-reconnected', oppName: m.oppName }));
    conn.on('reconnect-failed', () => {
      connRef.current = null;
      clearSavedSession();
      dispatch({ type: 'resume-failed' });
      dispatch({ type: 'disconnected' });
    });
    conn.on('closed', () => {
      connRef.current = null;
      clearSavedSession();
      dispatch({ type: 'disconnected' });
    });
    conn.on('sync', (m) => dispatch({ type: 'sync', ...m }));
    conn.on('battle-start', (m) => dispatch({ type: 'battle-start', turnIndex: m.turnIndex, energy: m.energy }));
    conn.on('attack-result', (m) => dispatch({ type: 'attack-result', ...m }));
    conn.on('attack-received', (m) => dispatch({ type: 'attack-received', ...m }));
    conn.on('probe-result', (m) => dispatch({ type: 'probe-result', ...m }));
    conn.on('timeout-you', () => dispatch({ type: 'timeout-you' }));
    conn.on('timeout-opponent', (m) => dispatch({ type: 'timeout-opponent', ...m }));
    conn.on('upgrade-applied', (m) => dispatch({ type: 'upgrade-applied', ...m }));
    conn.on('rematch-opp-ready', () => dispatch({ type: 'rematch-opp-ready' }));
    conn.on('rematch-start', () => dispatch({ type: 'rematch-start' }));
    conn.on('relay', (m) => {
      const d = m.data || {};
      // Só sobrou o evento cosmético de Instabilidade — todo o resto do
      // protocolo de jogo agora usa mensagens tipadas resolvidas no servidor.
      if (d.t === 'event') dispatch({ type: 'event-received', event: d.event });
    });
    await conn.ready;
    connRef.current = conn;
    return conn;
  }

  // Ao montar: se sobrou uma sessão salva (refresh de página em pleno jogo),
  // tenta retomar automaticamente antes de mostrar o lobby.
  useEffect(() => {
    const saved = getSavedSession();
    if (!saved) return;
    let cancelled = false;
    dispatch({ type: 'resume-start' });
    (async () => {
      try {
        const conn = await getConnection();
        if (cancelled) return;
        conn.setReconnect(saved);
        conn.send({ type: 'reconnect', ...saved });
      } catch {
        if (!cancelled) {
          clearSavedSession();
          dispatch({ type: 'resume-failed' });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function withConnection(fn) {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setConnecting(true);
    dispatch({ type: 'error', message: '' });
    try {
      const conn = await getConnection();
      fn(conn);
    } catch {
      dispatch({ type: 'error', message: t('online.connectFail') });
    } finally {
      connectingRef.current = false;
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
    cancelRequestedRef.current = false;
    withConnection((conn) =>
      conn.send({ type: 'quick-match', name: state.myName || t('online.defaultAstronaut'), mode: state.gameMode })
    );
  }

  function cancelSearch() {
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    sfx.click();
    connRef.current?.send({ type: 'cancel-match' });
    dispatch({ type: 'cancel-search' });
  }

  function finishPlacement(board) {
    connRef.current?.send({ type: 'submit-board', board });
    dispatch({ type: 'placed', board });
  }

  function handleAttack() {
    // A resolução real (acerto/erro/afundou/próximo turno) já foi aplicada
    // pelo reducer assim que `attack-result` chegou do servidor — este
    // callback só existe porque BattleScreen sempre o chama ao fim da sua
    // própria animação local; não há mais nada a fazer aqui.
  }

  function handleTimeout() {
    // Cosmético: o servidor tem seu próprio timer (levemente mais longo) e
    // manda `timeout-you`/`timeout-opponent` quando o turno realmente
    // expira — o cliente não reporta mais o próprio timeout pela rede.
  }

  function requestRematch() {
    connRef.current?.send({ type: 'rematch-ready' });
    dispatch({ type: 'rematch-me' });
  }

  function pickUpgrade(upgradeId) {
    connRef.current?.send({ type: 'upgrade-pick', upgradeId });
  }

  const { stage } = state;

  const netBanner = (
    <NetBanner
      reconnecting={state.reconnecting}
      oppDisconnected={state.oppDisconnected}
      reconnectingText={t('online.reconnecting')}
      disconnectedText={t('online.oppDisconnected')}
    />
  );

  const matchFoundBanner = (
    <MatchFoundBanner show={matchFoundAfterCancel} text={t('online.matchFoundAfterCancel')} />
  );

  function renderStage() {
  if (state.resuming) {
    return <SearchingScreen onCancelSearch={() => {}} />;
  }

  if (stage === 'lobby' && quickMatch) {
    return (
      <QuickMatchLobby
        error={state.error}
        myName={state.myName}
        onNameChange={(name) => dispatch({ type: 'set-name', name })}
        gameMode={state.gameMode}
        modes={ONLINE_MODES}
        modeTitle={modeTitle}
        onSelectMode={(id) => { sfx.click(); dispatch({ type: 'set-mode', mode: id }); }}
        onFindMatch={findMatch}
        connecting={connecting}
      />
    );
  }

  if (stage === 'lobby') {
    return (
      <RoomLobby
        error={state.error}
        myName={state.myName}
        onNameChange={(name) => dispatch({ type: 'set-name', name })}
        gameMode={state.gameMode}
        modes={ONLINE_MODES}
        modeTitle={modeTitle}
        onSelectMode={(id) => { sfx.click(); dispatch({ type: 'set-mode', mode: id }); }}
        hideModeSelector={hideModeSelector}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        connecting={connecting}
        codeInput={codeInput}
        onCodeInputChange={setCodeInput}
      />
    );
  }

  if (stage === 'hosting') {
    return <HostingScreen code={state.code} />;
  }

  if (stage === 'searching') {
    return <SearchingScreen onCancelSearch={cancelSearch} />;
  }

  if (stage === 'placement') {
    return (
      <PlacementScreen
        playerName={state.myName || t('online.you')}
        onDone={finishPlacement}
      />
    );
  }

  if (stage === 'waitMode') {
    return <WaitModeScreen />;
  }

  if (stage === 'waitBoards') {
    return <WaitBoardsScreen oppName={state.oppName} />;
  }

  if (stage === 'upgrade') {
    return (
      <UpgradeScreen
        playerName={state.myName || t('online.you')}
        pickedUpgrades={state.myUpgrades}
        onPick={pickUpgrade}
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
        onSpendEnergy={() => {}}
        onTimeout={handleTimeout}
        onUpgradeUsed={() => {}}
        onSendShot={sendShot}
        onSendProbe={sendProbe}
        shotResult={state.shotResult}
        probeResult={state.probeResult}
        onSendEvent={sendEvent}
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
        incomingEvent={state.incomingEvent}
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
          didWin={state.winner === 'me'}
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

  return (
    <>
      {netBanner}
      {matchFoundBanner}
      {renderStage()}
    </>
  );
}
