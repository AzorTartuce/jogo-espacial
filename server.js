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
const wss = new WebSocketServer({ server, path: '/ws' });

// code -> { players: [{ ws, name }] }
const rooms = new Map();

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
      rooms.set(code, { players: [{ ws, name: cleanName(msg.name) }] });
      ws.roomCode = code;
      ws.playerIndex = 0;
      send(ws, { type: 'created', code });
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
      room.players.push({ ws, name });
      ws.roomCode = code;
      ws.playerIndex = 1;
      send(ws, { type: 'joined', code, oppName: room.players[0].name });
      send(room.players[0].ws, { type: 'opponent-joined', oppName: name });
      console.log(`${name} entrou na sala ${code}`);
      return;
    }

    if (msg.type === 'create-team') {
      const code = genCode();
      rooms.set(code, { players: [{ ws, name: cleanName(msg.name) }], maxPlayers: 4 });
      ws.roomCode = code;
      ws.playerIndex = 0;
      send(ws, { type: 'team-created', code, playerIndex: 0, players: [cleanName(msg.name)] });
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
      const playerIndex = room.players.length;
      room.players.push({ ws, name });
      ws.roomCode = code;
      ws.playerIndex = playerIndex;
      const playerList = room.players.map((p) => p.name);
      send(ws, { type: 'team-joined', code, playerIndex, players: playerList });
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
        const p0 = { ws: partner, name: partner.qmName || 'Astronauta' };
        const p1 = { ws, name: cleanName(msg.name) };
        rooms.set(code, { players: [p0, p1] });
        partner.roomCode = code;
        partner.playerIndex = 0;
        ws.roomCode = code;
        ws.playerIndex = 1;
        send(partner, { type: 'match-found', code, playerIndex: 0, oppName: p1.name });
        send(ws, { type: 'match-found', code, playerIndex: 1, oppName: p0.name });
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

    if (msg.type === 'relay') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      // Envia para todos os outros jogadores da sala
      for (const p of room.players) {
        if (p.ws !== ws) {
          send(p.ws, { type: 'relay', fromIndex: ws.playerIndex, data: msg.data });
        }
      }
    }
  });

  ws.on('close', () => {
    leaveQuickQueue(ws);
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    for (const p of room.players) {
      if (p.ws !== ws) send(p.ws, { type: 'opponent-left' });
    }
    rooms.delete(ws.roomCode);
    console.log(`Sala ${ws.roomCode} encerrada`);
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
