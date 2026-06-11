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
  app.use((req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// code -> { players: [{ ws, name }] }
const rooms = new Map();

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

wss.on('connection', (ws) => {
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
      if (!room) {
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

    if (msg.type === 'relay') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const other = room.players[1 - ws.playerIndex];
      if (other) send(other.ws, { type: 'relay', data: msg.data });
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const other = room.players[1 - ws.playerIndex];
    if (other) send(other.ws, { type: 'opponent-left' });
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
