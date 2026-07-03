// Servidor de salas: conecta dois jogadores por código e repassa as jogadas.
// Também serve o jogo compilado (pasta dist) quando ela existe.
import express from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;

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

function cleanName(name) {
  return String(name || 'Astronauta').trim().slice(0, 14) || 'Astronauta';
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
      send(ws, { type: 'reconnected', code, playerIndex: idx });
      for (let i = 0; i < room.players.length; i++) {
        const p = room.players[i];
        if (p !== slot && p.ws) send(p.ws, { type: 'opponent-reconnected', playerIndex: idx });
      }
      console.log(`Jogador ${idx} reconectou na sala ${code}`);
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
  console.log('🚀 Servidor de salas do Resgate Espacial rodando!');
  console.log(`   Local:  http://localhost:${PORT}`);
  for (const addr of lanAddresses()) {
    console.log(`   Rede:   http://${addr}:${PORT}  ← use este no outro dispositivo`);
  }
  if (!fs.existsSync(distPath)) {
    console.log('   (dica: rode "npm run build" para servir o jogo direto daqui)');
  }
});
