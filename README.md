# 🚀 Void Strike

Um jogo de batalha naval espacial para 2 jogadores, feito com React + Vite. Cada jogador esconde sua equipe de astronautas numa grade 8x8 e tenta encontrar a equipe escondida do adversário primeiro.

## Modos de jogo

- **🖥️ Mesmo computador** — os dois jogadores se revezam no mesmo dispositivo, com uma tela de "passe o computador" entre os turnos.
- **🌐 Online com sala** — um jogador cria uma sala e recebe um código de 4 letras; o outro entra com esse código em outro dispositivo. As jogadas são sincronizadas em tempo real via WebSocket.

## Como jogar

- **Frota**: 🛰️ Estação Espacial (4), 🚀 Nave de Resgate (3), 🛸 Módulo Lunar (2), 🧑‍🚀 Dupla em Caminhada (2), 👨‍🚀 Astronauta Perdido (1)
- **Acertou um tiro?** Joga de novo!
- **⏱️ 30 segundos por turno** — estourou o tempo, perde a vez
- **⚡ Energia**: ganha +1 por turno, gasta em poderes especiais:
  - **📡 Radar (3⚡)**: revela uma área 3x3 sem gastar o tiro
  - **☄️ Rajada de Plasma (5⚡)**: atinge 5 células em formato de cruz

## Rodando localmente

Pré-requisitos: [Node.js](https://nodejs.org/) 20+

```bash
npm install
```

### Modo de desenvolvimento (com hot-reload)

Em dois terminais:

```bash
npm run server   # servidor de salas (WebSocket) na porta 8787
npm run dev      # frontend com hot-reload na porta 5173
```

Abra `http://localhost:5173`. O modo "mesmo computador" funciona mesmo sem o servidor de salas; o modo online precisa dele rodando.

### Modo produção (um único servidor)

```bash
npm start
```

Compila o frontend e serve tudo (jogo + servidor de salas) em `http://localhost:8787`. Para jogar em 2 dispositivos na mesma rede Wi-Fi, abra no celular o endereço de rede mostrado no terminal (ex: `http://192.168.0.x:8787`).

## Estrutura do projeto

```
src/
├── game/
│   ├── constants.js   # tamanho do tabuleiro, frota, custos de energia
│   ├── logic.js       # regras puras: posicionamento, tiros, radar, plasma
│   └── sound.js       # efeitos sonoros sintetizados (Web Audio)
├── online/
│   └── connection.js  # cliente WebSocket para o modo online
├── components/
│   ├── ModeMenu.jsx       # escolha entre local e online
│   ├── Menu.jsx           # tela inicial do modo local
│   ├── PlacementScreen.jsx # posicionamento da frota
│   ├── PassScreen.jsx     # tela de "passe o computador"
│   ├── BattleScreen.jsx   # tela de ataque
│   ├── DefendScreen.jsx   # tela de defesa (modo online)
│   ├── LocalGame.jsx      # fluxo completo do modo local
│   ├── OnlineGame.jsx     # fluxo completo do modo online (lobby, salas, revanche)
│   └── GameOver.jsx       # tela de fim de jogo com estatísticas
├── App.jsx
└── main.jsx

server.js   # servidor Express + WebSocket: serve o build e gerencia as salas
```

## Deploy

O projeto está pronto para deploy no [Render](https://render.com) via Blueprint (`render.yaml`):

1. Faça push do repositório para o GitHub
2. No Render, clique em **New → Blueprint** e selecione o repositório
3. O Render detecta o `render.yaml` e configura build (`npm install && npm run build`) e start (`node server.js`) automaticamente

> **Nota**: o modo online precisa de um servidor com WebSocket persistente (Render, Railway, Fly.io). Plataformas serverless como a Vercel não suportam isso — o jogo abriria, mas o modo online não conectaria.
