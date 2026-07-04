import { useReducer, useRef, useEffect, useState, useCallback } from 'react';
import { ENERGY_PER_TURN } from '../game/constants.js';
import { resolveShots, emptyBoard } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import { shouldOfferUpgrade } from '../game/upgrades.js';
import { createConnection } from '../online/connection.js';
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

export const initialState = {
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
  // Geração do turno atual (bug #14): invalida handoffs atrasados (setTimeout de
  // 1100ms) que ainda não dispararam quando um evento mais recente já mudou o turno.
  turnToken: 0,
  // Resolução do defensor (problema 3): resultados de tiro/sondagem chegam aqui.
  shotResult: null,
  probeResult: null,
  // Instabilidade sincronizada: evento sorteado pelo ATACANTE e retransmitido
  // via rede. Este jogador nunca sorteia o seu próprio quando é o defensor —
  // só recebe e exibe este campo (ver BattleScreen `onSendEvent` / DefendScreen
  // `incomingEvent`). Mesmo padrão de `id` incremental de shotResult/probeResult.
  incomingEvent: null,
  // Estado de rede (problema 1): oponente caído / eu reconectando.
  oppDisconnected: false,
  reconnecting: false,
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
  return shouldOfferUpgrade({
    gameMode: s.gameMode,
    turnsPlayed: s.myTurnsPlayed,
    pickedCount: s.myUpgrades.length,
  });
}

// Exportado (além do default do componente) só para testar a máquina de
// estados de turno isoladamente, sem precisar montar React/WebSocket.
export function reducer(s, a) {
  switch (a.type) {
    case 'set-name':
      return { ...s, myName: a.name };
    case 'created':
      return { ...s, stage: 'hosting', code: a.code, myIndex: 0, error: '' };
    case 'joined':
      // Convidado: espera o modo definitivo do host antes de posicionar (problema 2).
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
      // Índice 0 define o modo e já posiciona; os demais esperam o modo chegar.
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

    case 'placed':
      return maybeStart({ ...s, ownBoard: a.board });
    case 'opp-board':
      // O atacante nunca recebe as posições: só um tabuleiro de névoa vazio.
      return maybeStart({ ...s, enemyBoard: emptyBoard() });

    case 'shot-result':
      return {
        ...s,
        shotResult: {
          id: (s.shotResult?.id || 0) + 1,
          indices: a.indices,
          hitIndices: a.hitIndices,
          destroyed: a.destroyed,
          sunkAll: a.sunkAll,
        },
      };
    case 'probe-result':
      return {
        ...s,
        probeResult: { id: (s.probeResult?.id || 0) + 1, cells: a.cells },
      };
    case 'event-received':
      // Só o defensor recebe isto (o atacante já aplicou o evento localmente
      // ao sorteá-lo) — guarda com `id` incremental pro mesmo padrão de dedupe.
      return {
        ...s,
        incomingEvent: { id: (s.incomingEvent?.id || 0) + 1, event: a.event },
      };

    case 'i-attacked': {
      const ns = {
        ...s,
        enemyBoard: a.board,
        myStats: {
          shots: s.myStats.shots + a.shotsFired,
          hits: s.myStats.hits + a.hitsMade,
        },
      };
      if (a.sunkAll) {
        return { ...ns, winner: 'me', stage: 'gameover' };
      }
      if (!a.anyHit) {
        return {
          ...ns,
          myTurnsPlayed: s.myTurnsPlayed + 1,
          pendingOppTurn: true,
          turnToken: s.turnToken + 1,
        };
      }
      return ns;
    }
    case 'hand-over':
      // Bug #14: se o turno já avançou por outro caminho desde que este handoff
      // foi agendado (1100ms atrás), o token não bate mais — ignora (no-op).
      if (a.token !== s.turnToken) return s;
      return {
        ...s,
        pendingOppTurn: false,
        stage: 'defend',
        defendMsg: tr('online.oppTurnHold', { name: s.oppName }),
        defendFlash: [],
        // Um novo DefendScreen vai montar aqui com seu próprio lastEventId
        // zerado; sem isto, um incomingEvent de várias rodadas atrás (id>0)
        // seria reexibido sozinho no mount (mesmo raciocínio do bug #15).
        incomingEvent: null,
      };
    case 'i-timeout':
      return {
        ...s,
        myTurnsPlayed: s.myTurnsPlayed + 1,
        stage: 'defend',
        defendMsg: tr('online.yourTimeUp', { name: s.oppName }),
        defendFlash: [],
        pendingOppTurn: false,
        turnToken: s.turnToken + 1,
      };

    case 'attack-received': {
      const { board, hitIndices, destroyed, sunkAll } = resolveShots(s.ownBoard, a.indices);
      const hits = hitIndices.length;
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
      if (sunkAll) {
        return { ...ns, winner: 'opp', stage: 'gameover' };
      }
      if (hits === 0) {
        return { ...ns, pendingMyTurn: true, turnToken: s.turnToken + 1 };
      }
      return ns;
    }
    case 'pass-received':
      return {
        ...s,
        defendMsg: tr('online.oppTimeUp'),
        pendingMyTurn: true,
        turnToken: s.turnToken + 1,
      };
    case 'take-turn': {
      // Bug #14: mesmo guard do lado do defensor virando atacante.
      if (a.token !== s.turnToken) return s;
      const stage = needsUpgrade(s) ? 'upgrade' : 'battle';
      return {
        ...s,
        pendingMyTurn: false,
        stage,
        energy: s.gameMode !== 'classico' ? s.energy + ENERGY_PER_TURN : s.energy,
        defendFlash: [],
        // Bug #15: um novo BattleScreen vai montar aqui com lastShotId/lastProbeId
        // zerados; sem isto, um shotResult/probeResult do turno anterior (id>0)
        // é reaplicado automaticamente no mount, encerrando o turno novo sozinho.
        shotResult: null,
        probeResult: null,
        // Mesmo raciocínio para o incomingEvent de quando este jogador foi
        // defensor pela última vez — não faz sentido carregar para o turno em
        // que ele agora é o atacante.
        incomingEvent: null,
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
      // Convidado recebeu o modo do host: agora sim pode posicionar (problema 2).
      return {
        ...s,
        gameMode: a.mode,
        stage: s.stage === 'waitMode' ? 'placement' : s.stage,
      };

    case 'net-opp-down':
      return { ...s, oppDisconnected: true };
    case 'net-opp-up':
      return { ...s, oppDisconnected: false };
    case 'net-reconnecting':
      return { ...s, reconnecting: true };
    case 'net-reconnected':
      return { ...s, reconnecting: false, oppDisconnected: false };

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
          // Bug #15: sem isto, o resultado do último tiro da partida anterior
          // (id>0) sobrevive e é reaplicado assim que o BattleScreen remontar.
          shotResult: null,
          probeResult: null,
          incomingEvent: null,
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
  // Problema 2: aviso transitório de que um pareamento chegou logo depois de o
  // usuário ter pedido para cancelar a busca (corrida com o servidor).
  const [matchFoundAfterCancel, setMatchFoundAfterCancel] = useState(false);
  const connRef = useRef(null);
  // Guarda síncrona (problema 3): impede que um duplo-clique muito rápido (antes
  // do próximo render aplicar `disabled`) dispare getConnection() duas vezes e
  // crie duas conexões WebSocket físicas.
  const connectingRef = useRef(false);
  // Cancelamento de busca (problema 2): marca que o usuário já pediu para
  // cancelar, para o caso de um 'match-found' chegar logo depois.
  const cancelRequestedRef = useRef(false);
  const gameModeRef = useRef(state.gameMode);
  useEffect(() => { gameModeRef.current = state.gameMode; }, [state.gameMode]);
  // Meu tabuleiro atual, acessível dentro dos handlers de rede (defensor resolve aqui).
  const ownBoardRef = useRef(state.ownBoard);
  useEffect(() => { ownBoardRef.current = state.ownBoard; }, [state.ownBoard]);

  // Callbacks estáveis para o BattleScreen enviar tiros/sondagens ao defensor.
  const sendShot = useCallback((indices) => connRef.current?.relay({ t: 'attack', indices }), []);
  const sendProbe = useCallback((cells) => connRef.current?.relay({ t: 'probe', cells }), []);
  // Instabilidade: retransmite ao defensor o evento que este atacante sorteou.
  const sendEvent = useCallback((event) => connRef.current?.relay({ t: 'event', event }), []);

  // Defensor: resolve tiros no próprio tabuleiro e devolve só o resultado.
  function resolveAttack(indices) {
    const board = ownBoardRef.current || emptyBoard();
    const { hitIndices, destroyed, sunkAll } = resolveShots(board, indices);
    return { hitIndices, destroyed, sunkAll };
  }

  useEffect(() => {
    return () => {
      connRef.current?.close();
      connRef.current = null;
    };
  }, []);

  // Bug #14 (deadlock a partir da 2ª rodada): este handoff é atrasado de propósito
  // (dá tempo da animação terminar), mas se o oponente já tiver iniciado a próxima
  // rodada antes deste timer disparar, ele precisa virar no-op — daí o `turnToken`
  // capturado agora e conferido no reducer no momento em que o timeout dispara.
  useEffect(() => {
    if (!state.pendingOppTurn) return;
    const token = state.turnToken;
    const t = setTimeout(() => dispatch({ type: 'hand-over', token }), 1100);
    return () => clearTimeout(t);
  }, [state.pendingOppTurn, state.turnToken]);

  useEffect(() => {
    if (!state.pendingMyTurn) return;
    const token = state.turnToken;
    const t = setTimeout(() => dispatch({ type: 'take-turn', token }), 1100);
    return () => clearTimeout(t);
  }, [state.pendingMyTurn, state.turnToken]);

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
    else sfx.lose();
  }, [state.stage, state.winner]);

  // Problema 2: some com o aviso de "pareamento após cancelamento" sozinho
  // depois de um tempo, sem exigir nenhuma ação do jogador.
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
      conn.relay({ t: 'mode', mode: gameModeRef.current });
    });
    conn.on('searching', () => dispatch({ type: 'searching' }));
    conn.on('match-found', (m) => {
      conn.setReconnect({ code: m.code, playerIndex: m.playerIndex, token: m.token });
      // Problema 2: se o usuário já tinha clicado em "cancelar busca" (a UI já
      // voltou pro lobby de forma otimista) e o servidor pareou mesmo assim
      // antes de processar o cancelamento, é mais simples e seguro deixar o
      // jogador entrar na partida (já que foi pareado de verdade) do que tentar
      // "descancelar" escondido — só avisamos com uma mensagem transitória em
      // vez de deixar a tela "puxar" o jogador de volta sem explicação.
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false;
        setMatchFoundAfterCancel(true);
      }
      dispatch({ type: 'match-found', code: m.code, playerIndex: m.playerIndex, oppName: m.oppName });
      // Quem entrou primeiro na fila (índice 0) define o modo para os dois.
      if (m.playerIndex === 0) conn.relay({ t: 'mode', mode: gameModeRef.current });
    });
    conn.on('error', (m) => dispatch({ type: 'error', message: m.message }));
    conn.on('opponent-left', () => dispatch({ type: 'opp-left' }));
    // Problema 1: eventos de queda/reconexão não encerram a partida.
    conn.on('opponent-disconnected', () => dispatch({ type: 'net-opp-down' }));
    conn.on('opponent-reconnected', () => dispatch({ type: 'net-opp-up' }));
    conn.on('reconnecting', () => dispatch({ type: 'net-reconnecting' }));
    conn.on('reconnected', () => dispatch({ type: 'net-reconnected' }));
    conn.on('reconnect-failed', () => {
      connRef.current = null;
      dispatch({ type: 'disconnected' });
    });
    conn.on('closed', () => {
      connRef.current = null;
      dispatch({ type: 'disconnected' });
    });
    conn.on('relay', (m) => {
      const d = m.data || {};
      if (d.t === 'board') dispatch({ type: 'opp-board' });
      if (d.t === 'mode') dispatch({ type: 'set-mode', mode: d.mode });
      if (d.t === 'pass') dispatch({ type: 'pass-received' });
      if (d.t === 'rematch') dispatch({ type: 'rematch-opp' });
      // Instabilidade: só o defensor recebe isto — o atacante já aplicou o
      // evento localmente ao sorteá-lo (ver BattleScreen `onSendEvent`).
      if (d.t === 'event') dispatch({ type: 'event-received', event: d.event });
      // Defensor: resolve o tiro e devolve o resultado ao atacante.
      if (d.t === 'attack') {
        const res = resolveAttack(d.indices);
        conn.relay({
          t: 'attack-result',
          indices: d.indices,
          hitIndices: res.hitIndices,
          destroyed: res.destroyed,
          sunkAll: res.sunkAll,
        });
        dispatch({ type: 'attack-received', indices: d.indices });
      }
      // Defensor: responde a sondagem (radar/anomalia/visão) sem revelar o mapa.
      if (d.t === 'probe') {
        const board = ownBoardRef.current || emptyBoard();
        const cells = d.cells.map((i) => ({ index: i, hasPiece: !!board[i].pieceId }));
        conn.relay({ t: 'probe-result', cells });
      }
      // Atacante: recebe a resolução do defensor.
      if (d.t === 'attack-result') {
        dispatch({
          type: 'shot-result',
          indices: d.indices,
          hitIndices: d.hitIndices,
          destroyed: d.destroyed,
          sunkAll: d.sunkAll,
        });
      }
      if (d.t === 'probe-result') dispatch({ type: 'probe-result', cells: d.cells });
    });
    await conn.ready;
    connRef.current = conn;
    return conn;
  }

  async function withConnection(fn) {
    // Guarda síncrona: `setConnecting(true)` só reflete no `disabled` do botão
    // no próximo render, então um duplo-clique rápido passaria pela checagem de
    // `connRef.current` (ainda null) duas vezes. O ref abaixo é síncrono.
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
    // Guarda síncrona (problema 2): ignora cliques duplicados no botão de
    // cancelar antes do próximo render; também marca para o handler de
    // 'match-found' que um cancelamento já estava em andamento.
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    sfx.click();
    connRef.current?.send({ type: 'cancel-match' });
    dispatch({ type: 'cancel-search' });
  }

  function finishPlacement(board) {
    // Problema 3: só avisa que posicionou — nunca envia as posições das peças.
    connRef.current?.relay({ t: 'board' });
    dispatch({ type: 'placed', board });
  }

  function handleAttack({ board, shotsFired, hitsMade, anyHit, destroyed, sunkAll }) {
    if (destroyed) sfx.destroyed();
    dispatch({ type: 'i-attacked', board, shotsFired, hitsMade, anyHit, sunkAll });
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

  // Banner de rede (problema 1): oponente caído ou eu tentando reconectar.
  const netBanner = (
    <NetBanner
      reconnecting={state.reconnecting}
      oppDisconnected={state.oppDisconnected}
      reconnectingText={t('online.reconnecting')}
      disconnectedText={t('online.oppDisconnected')}
    />
  );

  // Problema 2: pareamento chegou logo após o jogador ter cancelado a busca.
  const matchFoundBanner = (
    <MatchFoundBanner show={matchFoundAfterCancel} text={t('online.matchFoundAfterCancel')} />
  );

  function renderStage() {
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
