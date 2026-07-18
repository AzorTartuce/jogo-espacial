// Servidor de salas: conecta dois jogadores por código e repassa as jogadas.
// Também serve o jogo compilado (pasta dist) quando ela existe.
import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { FLEET, RADAR_COST, PLASMA_COST, ENERGY_PER_TURN, TURN_SECONDS, SIZE } from './src/game/constants.js';
import { resolveShots, radarArea, plasmaCells, validateBoard, rowCol, idx } from './src/game/logic.js';
import { shouldOfferUpgrade, UPGRADE_POOL } from './src/game/upgrades.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;

// Margem de rede somada ao timer de turno visível no cliente, pra não expirar
// o turno de alguém só por causa de latência normal.
const TURN_GRACE_MS = 2500;
const UPGRADE_IDS = new Set(UPGRADE_POOL.map((u) => u.id));

const app = express();
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('/', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  app.use((req, res) => res.status(404).sendFile(path.join(distPath, '404.html')));
}

const server = http.createServer(app);
// maxPayload evita que um cliente mande mensagens gigantes e derrube o servidor.
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

// code -> { players: [{ ws, name, token, disconnected, graceTimer }], maxPlayers? }
const rooms = new Map();

// Janela de reconexão: quanto tempo esperamos um jogador voltar antes de encerrar.
const GRACE_MS = 25000;

// Token aleatório para provar identidade ao reconectar num slot.
function genToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Fila de espera da partida rápida (matchmaking): sockets aguardando oponente
let quickQueue = [];

function leaveQuickQueue(ws) {
  quickQueue = quickQueue.filter((w) => w !== ws);
}

// Sem letras/números ambíguos (O/0, I/1)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode() {
  let code;
  do {
    code = Array.from(
      { length: 4 },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

// Filtro básico de apelido: não é chat livre (só um nome visível ao
// oponente), mas ainda é texto de um jogador real pra outro, então bloqueia
// os casos óbvios em pt/en/es. Não pretende ser exaustivo nem resistir a
// leetspeak — ver docs/problemas/resolver.md.
const BLOCKED_NAME_WORDS = [
  // pt-BR
  'porra', 'caralho', 'buceta', 'piroca', 'viado', 'arrombado', 'desgraca',
  'puta', 'fdp', 'cuzao', 'cacete', 'merda', 'corno', 'otario', 'imbecil',
  // en
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'faggot',
  // es
  'mierda', 'pendejo', 'cabron', 'maricon', 'gilipollas',
];

function hasBlockedWord(name) {
  const normalized = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos, ex: "desgraça" -> "desgraca"
    .toLowerCase();
  return BLOCKED_NAME_WORDS.some((word) => normalized.includes(word));
}

function cleanName(name) {
  const trimmed = String(name || 'Astronauta').trim().slice(0, 14) || 'Astronauta';
  return hasBlockedWord(trimmed) ? 'Astronauta' : trimmed;
}

// ===== Autoridade de jogo (salas 1v1 / quick match) =====
// O servidor guarda o tabuleiro real dos dois jogadores e resolve turno,
// tiro e energia ele mesmo — os clientes só mostram o que ele manda. Isto
// não se aplica a salas 2v2 (room.maxPlayers === 4), que continuam usando
// só o relay genérico por enquanto.

const GAME_MODES = ['classico', 'ascensao', 'instabilidade', 'duelo'];

function otherIdx(i) {
  return i === 0 ? 1 : 0;
}

function clearTurnTimer(game) {
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
    game.turnTimer = null;
  }
}

// Arma o timer de turno do atacante atual (game.turnIndex), com folga extra
// de rede além do que o upgrade timer_boost concede.
function armTurnTimer(room) {
  const game = room.game;
  clearTurnTimer(game);
  if (game.winner != null) return;
  const pIdx = game.turnIndex;
  const timerBonusMs = game.upgrades[pIdx].includes('timer_boost') ? 10000 : 0;
  const durationMs = TURN_SECONDS * 1000 + timerBonusMs + TURN_GRACE_MS;
  game.turnDeadline = Date.now() + durationMs;
  game.turnTimer = setTimeout(() => handleTurnTimeout(room), durationMs);
}

// Encerra a vez de quem está atacando (erro ou timeout): passa o turno,
// credita energia de início de turno e decide se o próximo atacante precisa
// escolher um upgrade antes de poder jogar (modo Duelo).
function endAttackerTurn(room, pIdx) {
  const game = room.game;
  const other = otherIdx(pIdx);
  game.turnsPlayed[pIdx] += 1;
  if (game.mode !== 'classico') game.energy[other] += ENERGY_PER_TURN;
  game.turnIndex = other;
  const needsUpgrade = shouldOfferUpgrade({
    gameMode: game.mode,
    turnsPlayed: game.turnsPlayed[other],
    pickedCount: game.upgrades[other].length,
  });
  if (needsUpgrade) {
    // Não conta o tempo enquanto a tela de upgrade está aberta; o timer só
    // é armado de novo quando o jogador mandar 'upgrade-pick'.
    clearTurnTimer(game);
  } else {
    armTurnTimer(room);
  }
  return { other, needsUpgrade };
}

function handleTurnTimeout(room) {
  const game = room.game;
  if (!game || game.winner != null) return;
  game.turnTimer = null;
  const pIdx = game.turnIndex;
  const { other, needsUpgrade } = endAttackerTurn(room, pIdx);
  const players = room.players;
  if (players[pIdx].ws) send(players[pIdx].ws, { type: 'timeout-you' });
  if (players[other].ws) {
    send(players[other].ws, {
      type: 'timeout-opponent',
      energy: game.energy[other],
      needsUpgrade,
    });
  }
}

// Heartbeat: detecta conexões zumbi e mantém a conexão viva em proxies/operadoras
const HEARTBEAT_INTERVAL = 25000;
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// Encerra de vez uma sala e avisa quem sobrou.
function closeRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.game) clearTurnTimer(room.game);
  for (const p of room.players) {
    if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null; }
    if (p.ws) send(p.ws, { type: 'opponent-left' });
  }
  rooms.delete(code);
  console.log(`Sala ${code} encerrada${reason ? ` (${reason})` : ''}`);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'create') {
      const code = genCode();
      const token = genToken();
      rooms.set(code, { players: [{ ws, name: cleanName(msg.name), token, disconnected: false, graceTimer: null }] });
      ws.roomCode = code;
      ws.playerIndex = 0;
      send(ws, { type: 'created', code, playerIndex: 0, token });
      console.log(`Sala ${code} criada por ${cleanName(msg.name)}`);
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || room.maxPlayers) {
        send(ws, { type: 'error', message: 'Sala não encontrada. Confira o código.' });
        return;
      }
      if (room.players.length >= 2) {
        send(ws, { type: 'error', message: 'Essa sala já está cheia.' });
        return;
      }
      const name = cleanName(msg.name);
      const token = genToken();
      room.players.push({ ws, name, token, disconnected: false, graceTimer: null });
      ws.roomCode = code;
      ws.playerIndex = 1;
      send(ws, { type: 'joined', code, oppName: room.players[0].name, playerIndex: 1, token });
      send(room.players[0].ws, { type: 'opponent-joined', oppName: name });
      console.log(`${name} entrou na sala ${code}`);
      return;
    }

    if (msg.type === 'create-team') {
      const code = genCode();
      const token = genToken();
      rooms.set(code, { players: [{ ws, name: cleanName(msg.name), token, disconnected: false, graceTimer: null }], maxPlayers: 4 });
      ws.roomCode = code;
      ws.playerIndex = 0;
      send(ws, { type: 'team-created', code, playerIndex: 0, players: [cleanName(msg.name)], token });
      console.log(`Sala 2v2 ${code} criada por ${cleanName(msg.name)}`);
      return;
    }

    if (msg.type === 'join-team') {
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room || !room.maxPlayers) {
        send(ws, { type: 'error', message: 'Sala não encontrada ou não é 2v2. Confira o código.' });
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        send(ws, { type: 'error', message: 'Sala cheia (já tem 4 jogadores).' });
        return;
      }
      const name = cleanName(msg.name);
      const token = genToken();
      const playerIndex = room.players.length;
      room.players.push({ ws, name, token, disconnected: false, graceTimer: null });
      ws.roomCode = code;
      ws.playerIndex = playerIndex;
      const playerList = room.players.map((p) => p.name);
      send(ws, { type: 'team-joined', code, playerIndex, players: playerList, token });
      for (let i = 0; i < room.players.length - 1; i++) {
        send(room.players[i].ws, { type: 'team-player-joined', playerIndex, name, players: playerList });
      }
      if (room.players.length === room.maxPlayers) {
        for (const p of room.players) {
          send(p.ws, { type: 'team-start', players: playerList });
        }
        console.log(`Sala 2v2 ${code} cheia — partida iniciando`);
      }
      console.log(`${name} entrou na sala 2v2 ${code} (slot ${playerIndex})`);
      return;
    }

    if (msg.type === 'quick-match') {
      // Já está na fila? ignora pedidos duplicados.
      if (quickQueue.includes(ws)) return;
      // Limpa sockets que fecharam enquanto esperavam.
      quickQueue = quickQueue.filter((w) => w.readyState === w.OPEN);

      const partner = quickQueue.shift();
      if (partner && partner !== ws) {
        // Encontrou par: cria uma sala 1v1 e emparelha os dois.
        const code = genCode();
        const t0 = genToken();
        const t1 = genToken();
        const p0 = { ws: partner, name: partner.qmName || 'Astronauta', token: t0, disconnected: false, graceTimer: null };
        const p1 = { ws, name: cleanName(msg.name), token: t1, disconnected: false, graceTimer: null };
        rooms.set(code, { players: [p0, p1] });
        partner.roomCode = code;
        partner.playerIndex = 0;
        ws.roomCode = code;
        ws.playerIndex = 1;
        send(partner, { type: 'match-found', code, playerIndex: 0, oppName: p1.name, token: t0 });
        send(ws, { type: 'match-found', code, playerIndex: 1, oppName: p0.name, token: t1 });
        console.log(`Partida rápida ${code}: ${p0.name} vs ${p1.name}`);
      } else {
        // Ninguém esperando: entra na fila.
        ws.qmName = cleanName(msg.name);
        quickQueue.push(ws);
        send(ws, { type: 'searching' });
        console.log(`${ws.qmName} entrou na fila de partida rápida`);
      }
      return;
    }

    if (msg.type === 'cancel-match') {
      leaveQuickQueue(ws);
      return;
    }

    // Reconexão: cliente reenvia code + índice + token para retomar o slot.
    if (msg.type === 'reconnect') {
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      const idx = msg.playerIndex;
      const slot = room && room.players[idx];
      if (!slot || slot.token !== msg.token) {
        send(ws, { type: 'reconnect-failed' });
        return;
      }
      if (slot.graceTimer) { clearTimeout(slot.graceTimer); slot.graceTimer = null; }
      slot.ws = ws;
      slot.disconnected = false;
      ws.roomCode = code;
      ws.playerIndex = idx;
      ws.isAlive = true;
      const oppSlot = !room.maxPlayers ? room.players[otherIdx(idx)] : null;
      send(ws, { type: 'reconnected', code, playerIndex: idx, oppName: oppSlot?.name });
      for (let i = 0; i < room.players.length; i++) {
        const p = room.players[i];
        if (p !== slot && p.ws) send(p.ws, { type: 'opponent-reconnected', playerIndex: idx });
      }
      // Sala com partida em andamento: manda o estado real pra este jogador
      // retomar de onde parou (tabuleiro próprio, turno, energia, upgrades).
      if (room.game) {
        // Tabuleiro do adversário sob o ponto de vista deste jogador: em 1v1
        // só ele mesmo pode ter atirado ali, então todo `shot` marcado no
        // board real do oponente é exatamente o que ele já sabe/revelou.
        const enemyBoard = room.game.boards[otherIdx(idx)] || [];
        const enemyShots = [];
        for (let i = 0; i < enemyBoard.length; i++) {
          if (enemyBoard[i].shot) enemyShots.push({ index: i, hasPiece: !!enemyBoard[i].pieceId });
        }
        send(ws, {
          type: 'sync',
          mode: room.game.mode,
          started: room.game.started,
          board: room.game.boards[idx],
          enemyShots,
          turnIndex: room.game.turnIndex,
          energy: room.game.energy[idx],
          upgrades: room.game.upgrades[idx],
          turnsPlayed: room.game.turnsPlayed[idx],
          winner: room.game.winner,
        });
      }
      console.log(`Jogador ${idx} reconectou na sala ${code}`);
      return;
    }

    // Define o modo de jogo da sala e cria o estado autoritativo da partida.
    // Só se aplica a salas 1v1/quick-match (2v2 segue só no relay genérico).
    if (msg.type === 'set-mode') {
      const room = rooms.get(ws.roomCode);
      if (!room || room.maxPlayers || room.game) return;
      const mode = GAME_MODES.includes(msg.mode) ? msg.mode : 'ascensao';
      room.game = {
        mode,
        boards: [null, null],
        energy: [0, 0],
        upgrades: [[], []],
        turnsPlayed: [0, 0],
        turnIndex: null,
        winner: null,
        started: false,
        turnTimer: null,
        turnDeadline: null,
        lastMiss: [null, null],
      };
      for (const p of room.players) if (p.ws) send(p.ws, { type: 'mode-set', mode });
      return;
    }

    // Cliente terminou de posicionar a frota: o servidor valida e guarda o
    // tabuleiro real (nunca confia num tabuleiro que o cliente diga ter).
    if (msg.type === 'submit-board') {
      const room = rooms.get(ws.roomCode);
      const game = room && room.game;
      if (!game || game.started) return;
      const pIdx = ws.playerIndex;
      if (!validateBoard(msg.board, SIZE)) {
        send(ws, { type: 'error', message: 'Posicionamento de frota inválido.' });
        return;
      }
      game.boards[pIdx] = msg.board.map((c) => ({
        pieceId: c.pieceId || null,
        shot: false,
        revealed: false,
      }));

      if (game.boards[0] && game.boards[1]) {
        game.started = true;
        game.turnIndex = 0;
        if (game.mode !== 'classico') game.energy[0] += ENERGY_PER_TURN;
        const players = room.players;
        if (players[0].ws) send(players[0].ws, { type: 'battle-start', turnIndex: 0, energy: game.energy[0] });
        if (players[1].ws) send(players[1].ws, { type: 'battle-start', turnIndex: 0, energy: game.energy[1] });
        armTurnTimer(room);
      }
      return;
    }

    // Ataque (tiro normal ou rajada de plasma): o servidor recalcula as
    // células-alvo ele mesmo a partir de um único índice de origem — nunca
    // confia numa lista de índices vinda do cliente — e resolve contra o
    // tabuleiro real do defensor.
    if (msg.type === 'attack') {
      const room = rooms.get(ws.roomCode);
      const game = room && room.game;
      if (!game || !game.started || game.winner != null) return;
      const pIdx = ws.playerIndex;
      if (pIdx !== game.turnIndex) return;

      const kind = msg.kind === 'plasma' ? 'plasma' : 'normal';
      if (kind === 'plasma' && game.mode === 'classico') return;

      const index = Number(msg.index);
      if (!Number.isInteger(index) || index < 0 || index >= SIZE * SIZE) return;

      const other = otherIdx(pIdx);
      const defenderBoard = game.boards[other];

      let cost = 0;
      let targets;
      if (kind === 'plasma') {
        cost = game.upgrades[pIdx].includes('plasma_cheap') ? 3 : PLASMA_COST;
        if (game.energy[pIdx] < cost) {
          send(ws, { type: 'error', message: 'Energia insuficiente.' });
          return;
        }
        targets = plasmaCells(index, SIZE).filter((i) => !defenderBoard[i].shot);
      } else {
        if (defenderBoard[index].shot) return;
        targets = [index];
      }
      if (targets.length === 0) {
        send(ws, { type: 'error', message: 'Nenhum alvo válido.' });
        return;
      }
      if (cost > 0) game.energy[pIdx] -= cost;

      const { board, hitIndices, destroyed, sunkAll } = resolveShots(defenderBoard, targets);
      game.boards[other] = board;
      const anyHit = hitIndices.length > 0;

      clearTurnTimer(game);
      const attacker = room.players[pIdx];
      const defender = room.players[other];

      if (sunkAll) {
        game.winner = pIdx;
        if (attacker.ws) send(attacker.ws, { type: 'attack-result', indices: targets, hitIndices, destroyed, sunkAll, kind, energy: game.energy[pIdx] });
        if (defender.ws) send(defender.ws, { type: 'attack-received', indices: targets, hitIndices, destroyed, sunkAll, kind });
        return;
      }

      if (!anyHit) {
        game.lastMiss[pIdx] = targets;
        const { needsUpgrade } = endAttackerTurn(room, pIdx);
        if (attacker.ws) {
          send(attacker.ws, {
            type: 'attack-result',
            indices: targets, hitIndices, destroyed, sunkAll, kind,
            energy: game.energy[pIdx], yourTurn: false,
          });
        }
        if (defender.ws) {
          send(defender.ws, {
            type: 'attack-received',
            indices: targets, hitIndices, destroyed, sunkAll, kind,
            yourTurn: true, energy: game.energy[other], needsUpgrade,
          });
        }
      } else {
        armTurnTimer(room);
        if (attacker.ws) {
          send(attacker.ws, {
            type: 'attack-result',
            indices: targets, hitIndices, destroyed, sunkAll, kind,
            energy: game.energy[pIdx], yourTurn: true,
          });
        }
        if (defender.ws) {
          send(defender.ws, {
            type: 'attack-received',
            indices: targets, hitIndices, destroyed, sunkAll, kind, yourTurn: false,
          });
        }
      }
      return;
    }

    // Sondagem (radar / sensor de anomalia / evento de visão): o servidor
    // decide as células ele mesmo — o cliente só informa a intenção.
    if (msg.type === 'probe') {
      const room = rooms.get(ws.roomCode);
      const game = room && room.game;
      if (!game || !game.started || game.winner != null) return;
      const pIdx = ws.playerIndex;
      const other = otherIdx(pIdx);
      const defenderBoard = game.boards[other];
      const kind = msg.kind;

      if (kind === 'anomaly') {
        const lastMiss = game.lastMiss[pIdx];
        game.lastMiss[pIdx] = null;
        if (!lastMiss || !game.upgrades[pIdx].includes('anomaly_sensor')) return;
        const candidates = new Set();
        for (const cellIdx of lastMiss) {
          const [row, col] = rowCol(cellIdx, SIZE);
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
              const j = idx(r, c, SIZE);
              if (!defenderBoard[j].shot) candidates.add(j);
            }
          }
        }
        if (candidates.size === 0) return;
        const arr = [...candidates];
        const pick = arr[Math.floor(Math.random() * arr.length)];
        send(ws, { type: 'probe-result', kind, cells: [{ index: pick, hasPiece: !!defenderBoard[pick].pieceId }] });
        return;
      }

      if (pIdx !== game.turnIndex) return;

      if (kind === 'radar') {
        const radius = game.upgrades[pIdx].includes('radar_xl') ? 2 : 1;
        const free = game.upgrades[pIdx].includes('radar_free');
        const cost = free ? 0 : RADAR_COST;
        if (!free && game.energy[pIdx] < cost) {
          send(ws, { type: 'error', message: 'Energia insuficiente.' });
          return;
        }
        const index = Number(msg.index);
        if (!Number.isInteger(index) || index < 0 || index >= SIZE * SIZE) return;
        if (free) game.upgrades[pIdx] = game.upgrades[pIdx].filter((u) => u !== 'radar_free');
        else game.energy[pIdx] -= cost;
        const cells = radarArea(index, radius, SIZE).map((i) => ({ index: i, hasPiece: !!defenderBoard[i].pieceId }));
        send(ws, { type: 'probe-result', kind, cells, energy: game.energy[pIdx], upgrades: game.upgrades[pIdx] });
        return;
      }

      if (kind === 'vision') {
        const candidates = [];
        for (let i = 0; i < defenderBoard.length; i++) if (!defenderBoard[i].shot) candidates.push(i);
        if (candidates.length === 0) return;
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        send(ws, { type: 'probe-result', kind, cells: [{ index: pick, hasPiece: !!defenderBoard[pick].pieceId }] });
        return;
      }
      return;
    }

    // Escolha de upgrade (modo Duelo) — só aceita quando o servidor mesmo
    // decidiu que é hora de oferecer (mesma regra de shouldOfferUpgrade).
    if (msg.type === 'upgrade-pick') {
      const room = rooms.get(ws.roomCode);
      const game = room && room.game;
      if (!game || !game.started || game.winner != null) return;
      const pIdx = ws.playerIndex;
      if (pIdx !== game.turnIndex) return;
      const needsUpgrade = shouldOfferUpgrade({
        gameMode: game.mode,
        turnsPlayed: game.turnsPlayed[pIdx],
        pickedCount: game.upgrades[pIdx].length,
      });
      if (!needsUpgrade) return;
      const upgradeId = msg.upgradeId;
      if (upgradeId != null) {
        if (!UPGRADE_IDS.has(upgradeId) || game.upgrades[pIdx].includes(upgradeId)) return;
        game.upgrades[pIdx] = [...game.upgrades[pIdx], upgradeId];
        if (upgradeId === 'energy_bonus') game.energy[pIdx] += 3;
      }
      armTurnTimer(room);
      send(ws, { type: 'upgrade-applied', upgrades: game.upgrades[pIdx], energy: game.energy[pIdx] });
      return;
    }

    // Revanche: só reinicia quando os dois confirmarem; zera o estado
    // autoritativo da partida anterior pra não vazar pra próxima rodada.
    if (msg.type === 'rematch-ready') {
      const room = rooms.get(ws.roomCode);
      if (!room || room.maxPlayers) return;
      room.rematch = room.rematch || [false, false];
      room.rematch[ws.playerIndex] = true;
      if (room.rematch[0] && room.rematch[1]) {
        if (room.game) clearTurnTimer(room.game);
        room.game = null;
        room.rematch = [false, false];
        for (const p of room.players) if (p.ws) send(p.ws, { type: 'rematch-start' });
      } else {
        const other = room.players[otherIdx(ws.playerIndex)];
        if (other && other.ws) send(other.ws, { type: 'rematch-opp-ready' });
      }
      return;
    }

    if (msg.type === 'relay') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      // `to` opcional: índice ou lista de índices que devem receber; sem ele, envia a todos.
      const to = msg.to;
      const targets = to === undefined || to === null ? null : (Array.isArray(to) ? to : [to]);
      for (let i = 0; i < room.players.length; i++) {
        const p = room.players[i];
        if (!p.ws || p.ws === ws) continue;
        if (targets && !targets.includes(i)) continue;
        send(p.ws, { type: 'relay', fromIndex: ws.playerIndex, data: msg.data });
      }
    }
  });

  ws.on('close', () => {
    leaveQuickQueue(ws);
    const code = ws.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    const idx = room.players.findIndex((p) => p.ws === ws);
    if (idx === -1) return;
    const slot = room.players[idx];
    slot.disconnected = true;
    slot.ws = null;

    // Todos caíram: encerra na hora, sem esperar.
    if (room.players.every((p) => p.disconnected)) {
      for (const p of room.players) if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null; }
      rooms.delete(code);
      console.log(`Sala ${code} encerrada (todos desconectaram)`);
      return;
    }

    // Janela de reconexão: avisa os outros e aguarda o jogador voltar.
    for (const p of room.players) {
      if (p.ws) send(p.ws, { type: 'opponent-disconnected', playerIndex: idx });
    }
    if (slot.graceTimer) clearTimeout(slot.graceTimer);
    slot.graceTimer = setTimeout(() => {
      slot.graceTimer = null;
      closeRoom(code, 'tempo de reconexão esgotado');
    }, GRACE_MS);
    console.log(`Jogador ${idx} caiu na sala ${code} — aguardando reconexão`);
  });
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Servidor de salas do Void Strike rodando!');
  console.log(`   Local:  http://localhost:${PORT}`);
  for (const addr of lanAddresses()) {
    console.log(`   Rede:   http://${addr}:${PORT}  ← use este no outro dispositivo`);
  }
  if (!fs.existsSync(distPath)) {
    console.log('   (dica: rode "npm run build" para servir o jogo direto daqui)');
  }
});
