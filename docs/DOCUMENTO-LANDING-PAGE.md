# Void Strike — Documento de Referência para Landing Page

> Consolidado a partir do `README.md` e de todos os documentos em `docs/`, cruzado com o código-fonte (`src/game/constants.js`, `src/game/upgrades.js`, `src/styles.css`) para garantir que o que está descrito aqui reflete o estado **real** do jogo, e não apenas planos.
>
> Nota de nome: o projeto já se chamou "Resgate Espacial" e hoje se chama **Void Strike** no código (`package.json`, `applicationId` Android `br.com.voidstrike`). Existe uma análise interna (`docs/analise-nome-do-jogo.md`) recomendando trocar o nome antes do lançamento nas lojas, por colisão de marca com outros jogos "Void Strike/VoidStrike" já publicados e por descompasso de tom ("Strike" soa a jogo de ação, mas o jogo é dedução estratégica de resgate). **Decida o nome final antes de fechar a copy da landing page** — o resto deste documento descreve o jogo, independente do nome escolhido.

---

## 1. O que é o jogo (pitch)

Void Strike é uma **batalha naval espacial** para 2 (ou 4, em duplas) jogadores. Cada jogador esconde sua frota de astronautas/naves numa grade e tenta encontrar a frota escondida do adversário antes de ser encontrado.

Diferente de uma batalha naval "militar", a moldura narrativa é de **resgate**, não de guerra:

> "A equipe de astronautas do seu rival está perdida no espaço. Encontre todos antes que ele encontre os seus!"

O feedback do jogo usa linguagem de busca e sinal, não de combate: *"Sinal de vida detectado! Continue!"*, *"Nada por aqui... passando a vez."* — reforçado por radar e sensores, não por armas pesadas.

**Gênero:** dedução estratégica por turnos (like Batalha Naval), com camadas de progressão/roguelite nos modos avançados.

---

## 2. Como jogar (mecânica central)

- **Tabuleiro:** grade 8×8 (varia por mapa — ver seção 5).
- **Frota a esconder:**
  | Peça | Emoji | Tamanho |
  |---|---|---|
  | Estação Espacial | 🛰️ | 4 |
  | Nave de Resgate | 🚀 | 3 |
  | Módulo Lunar | 🛸 | 2 |
  | Dupla em Caminhada | 🧑‍🚀 | 2 |
  | Astronauta Perdido | 👨‍🚀 | 1 |
- **Acertou um tiro? Joga de novo** — recompensa achar a frota, cria momentum.
- **⏱️ 30 segundos por turno** — estourou o tempo, perde a vez (mantém o ritmo da partida, evita jogos "eternos").
- **⚡ Energia:** ganha +1 por turno, gasta em poderes especiais:
  - **📡 Radar (3⚡):** revela uma área 3×3 sem gastar o tiro.
  - **☄️ Rajada de Plasma (5⚡):** atinge 5 células em formato de cruz.

---

## 3. Modos de conexão (como as pessoas jogam entre si)

- **🖥️ Mesmo computador (local):** os dois jogadores se revezam no mesmo dispositivo, com uma tela de "passe o computador" entre os turnos.
- **🌐 Online com sala:** um jogador cria uma sala e recebe um **código de 4 letras**; o outro entra com esse código em outro dispositivo. Jogadas sincronizadas em tempo real via WebSocket.
- **👥 Online 2v2 (duplas):** variação em equipe do modo online (implementada em `TeamGame.jsx`), com board compartilhado por time e "fog" (neblina) para os oponentes.
- **🎛️ Personalizado:** fluxo que permite escolher explicitamente formato (1v1/2v2), modo de jogo e mapa antes de começar, em vez de usar os atalhos rápidos.

Fluxo de UX documentado (`docs/game-mode.md`, `docs/mudancas.md`): o app usa **divulgação progressiva** — cada tela apresenta uma única decisão (conexão → modo de jogo → confirmação), evitando sobrecarregar o jogador com opções de uma vez.

---

## 4. Modos de jogo (a maior diferenciação do produto)

Essas são as 4 variantes de regras, presentes no código (`GAME_MODES` em `constants.js`):

### 🎯 Clássico
Experiência pura e competitiva. **Sem energia, sem poderes especiais** — só posicionamento, mira e sorte/dedução. Foco 100% em habilidade. Ideal para quem quer Batalha Naval "raiz" e partidas equilibradas/torneios.

### ⚡ Ascensão
O modo padrão do jogo. Energia acumula por turno e desbloqueia Radar e Plasma (ver seção 2). É a evolução natural do Clássico, adicionando decisão tática de "quando gastar energia".

### 🌀 Instabilidade
Partidas caóticas e imprevisíveis: o campo sofre **mutações através de Eventos Globais por tempo**, afetando os dois jogadores ao mesmo tempo. Eventos com efeitos e sons próprios já implementados no jogo (`events.js`, `sound.js`): nebulosa, interferência, visão e tempestade, entre outros do pool temático (gravidade reduzida, campo de visão escurecido, obstáculos temporários). Recompensa adaptação sobre estratégia fixa.

### 🏅 Duelo de Escolhas
Mistura combate competitivo com progressão estilo **roguelike/RPG**: a cada 3 turnos jogados, o jogador recebe um menu com **3 upgrades sorteados** (Fisher-Yates, sem repetição) e escolhe **um**. Pool real de upgrades no código:
- ⏱️ Acelerador de Resposta — +10s por turno
- 📡 Radar Aprimorado — radar 4×4 em vez de 3×3
- ☄️ Plasma Econômico — plasma custa 3⚡ em vez de 5⚡
- 🎁 Varredura Bônus — próximo radar grátis
- 🔭 Sensor de Anomalia — erro de tiro revela célula adjacente
- ⚡ Pulso de Energia — +3 energia instantânea

Isso permite ao jogador testar builds diferentes (mobilidade/utilidade/economia) em partidas diferentes — elimina parte da sorte pura do modo Ascensão.

### 🎲 Modo Void (o "modo surpresa")
Descrito em `docs/void.md` — é o modo mais divertido e imprevisível: ao entrar na partida Void, o jogo **sorteia automaticamente** modo de jogo, mapa e tema (com uma animação de sorteio de ~4 segundos), revela a combinação na tela, e a partida segue o fluxo normal (posicionamento → batalha). O sorteio é totalmente aleatório e só escolhe entre opções já implementadas — o objetivo é curiosidade e rejogabilidade, não balanceamento.

> Nota de escopo: no fluxo Online, o Void hoje sorteia só o modo de jogo (mapa/tema ainda não sincronizados entre os dois jogadores nesse fluxo — ver `drawVoidGameMode()` em `constants.js`).

---

## 5. Mapas (variações de tabuleiro)

Sistema de mapas selecionáveis, com um flag `implemented` que já distingue o que é jogável hoje do que é "em breve" (aparece no menu mas não entra no sorteio do Void):

| Mapa | Ícone | Tamanho | Status |
|---|---|---|---|
| Clássico | 🗺️ | 8×8 | ✅ Implementado |
| Planetas do Sistema Solar | 🪐 | 6×6 | ✅ Implementado |
| Girando (mapa rotativo lento) | 🌌 | 8×8 | ✅ Implementado |
| Triangular | 🔺 | 8×8 | 🔜 Em breve |
| Pegadinha (posição clicada ≠ posição real) | 🎭 | 8×8 | 🔜 Em breve |
| Gravidade Zero (peças "flutuam" a cada rodada) | 🌠 | 8×8 | 🔜 Em breve |
| Buraco Negro (10×10, o mapa vai sendo "puxado" a cada rodada) | 🕳️ | 10×10 | 🔜 Em breve |

**Mapa de Planetas** já implementado: o jogador escolhe um planeta do sistema solar como fundo/cor do tabuleiro (6×6):

| Planeta | Emoji | Cor |
|---|---|---|
| Mercúrio | 🪨 | `#9c8b7a` |
| Vênus | 🌕 | `#d9a441` |
| Marte (padrão) | 🔴 | `#c1440e` |
| Júpiter | 🟠 | `#c9975b` |
| Saturno | 🪐 | `#d9c18a` |
| Netuno | 🔵 | `#3d5adf` |

---

## 6. Temas visuais (planejado)

Sistema de temas já modelado no código (`THEMES`), mas hoje só o tema **Padrão (⭐)** está implementado. Temas em plano (`docs/TEMA-E-MAPAS.md`):

- **🔥 Fogo:** o mapa "pega fogo" durante a partida; o fogo pode abrir buracos/obstáculos.
- **❄️ Gelo:** o mapa congela progressivamente; posições congeladas exigem 2 rodadas (ou um poder especial) para liberar.

A ideia de longo prazo é temas funcionarem quase como "universos" diferentes para a mesma mecânica (ex: um tema pirata-no-espaço, dinossauros-no-espaço), incluindo a possibilidade de o tema mudar no meio da partida — isso é visão de produto, ainda não implementado.

---

## 7. Identidade visual / paleta de cores

Paleta atual em uso no jogo (`src/styles.css`, com variantes dark e light):

**Tema escuro (padrão):**
| Uso | Cor |
|---|---|
| Fundo | `#07071a` (azul quase preto, "espaço profundo") |
| Ciano (destaque primário) | `#4de8ff` |
| Roxo | `#b16dff` |
| Rosa | `#ff5e9c` |
| Verde (sucesso/acerto) | `#5dffa8` |
| Amarelo (energia/aviso) | `#ffd75e` |
| Vermelho (erro/dano) | `#ff5e5e` |
| Texto | `#e8ecff` |

**Tema claro:** mesmas variáveis, tons mais escuros/saturados sobre fundo `#eaeefc` (ex.: ciano `#0a86ad`, roxo `#7a3fd0`, texto `#161a30`) — o jogo já suporta alternância clara/escura.

**Direção de arte para capa/logo** (`docs/estilo_logo_capa.md`), útil diretamente para o hero da landing page:
- Composição: frota em formação de combate, ângulo dramático (3/4 ou de baixo pra cima), uma "hero ship" em destaque com outras menores ao fundo; planeta/lua parcial + campo de estrelas no fundo; rastros de tiro/laser cruzando a cena para comunicar ação.
- Paleta: fundo azul profundo/roxo escuro (espaço) contrastando com **um** acento quente vibrante (laranja, ciano elétrico ou magenta) em explosões/tiros/luzes — evitar mais de 2-3 cores de destaque para não poluir.
- Tipografia: fonte futurista mas legível, leve glow/contorno sobre fundo escuro; texto na metade superior ou inferior, deixando a ação no centro.
- Referências de estilo: entre "Star Realms"/"FTL" (ilustrativo/vetorial) e pôsteres retrô de ficção científica (alto contraste, poucas cores, silhuetas fortes) — funciona bem também como ícone pequeno (importante para thumbnail de app/jogo web).
- Variações de cor por modo (ideia para futuras artes): Ascensão em dourado/branco, Instabilidade em roxo/verde tóxico, mantendo Clássico como a versão "neutra" azul-laranja de referência.

---

## 8. Plataformas e distribuição

- **Web:** React + Vite, funciona no navegador (desktop e mobile).
- **Mobile:** empacotado via Capacitor para Android (`applicationId: br.com.voidstrike`), com dependências `@capacitor/android`, `@capacitor/core`, `@capacitor/app`.
- **Servidor:** Node/Express + WebSocket (`server.js`) — necessário para os modos online (sala, 2v2). Modo local funciona 100% sem servidor.
- **Deploy:** pronto para Render via Blueprint (`render.yaml`); observação importante — plataformas serverless (ex. Vercel) não suportam WebSocket persistente, então o modo online não funcionaria nelas, só o modo local.
- **Idiomas:** interface preparada para múltiplos idiomas (`src/i18n/translations.js` citado na análise de nome) — pelo menos PT/EN/ES foram considerados no planejamento de naming.

---

## 9. Maturidade do projeto (para calibrar tom de "lançamento" na landing page)

Segundo o levantamento mais recente de pendências (`docs/PENDENCIAS.md`, 2026-07-04): **11 das 13 recomendações de uma auditoria de qualidade já foram implementadas**, incluindo onboarding, reconexão com grace period no modo online, testes automatizados (41 testes cobrindo lógica, upgrades, eventos e fluxo de turnos online) e testes manuais end-to-end dos principais fluxos (Duelo de Escolhas, Instabilidade, Online 2v2).

Pontos ainda em aberto (não bloqueiam uma landing page de apresentação, mas relevantes para não prometer demais):
- Servidor ainda não é 100% autoritativo sobre as regras (validação de turno/tiro concentrada nos clientes) — relevante só para hardening anti-trapaça, não afeta a experiência normal.
- 2v2 ainda roda sempre no equivalente ao modo Ascensão (sem seletor de Clássico/Instabilidade/Duelo nesse formato).

**Recomendação de copy:** já é seguro anunciar como "jogo completo e testado" com os 4 modos de jogo, mapas de Planetas/Girando, e os dois formatos de conexão (local e online, incluindo 2v2) — só evitar prometer os mapas/temas marcados como "em breve" (Triangular, Pegadinha, Gravidade Zero, Buraco Negro, Fogo, Gelo) como se já estivessem disponíveis; podem entrar como "em breve" / roadmap na página.

---

## 10. Estrutura de menus (útil para desenhar o fluxo/CTA da landing page)

```
Tela inicial
 └─ Escolha de conexão: Mesmo computador | Online (sala) | Personalizado
     └─ Escolha de modo: Clássico | Ascensão | Instabilidade | Duelo de Escolhas | Void (sorteio surpresa)
         └─ Posicionamento da frota → Partida → Tela de fim de jogo (estatísticas, revanche)
```

Esse funil (poucas decisões, uma por tela) é um bom espelho para a estrutura da landing page: Hero (pitch + CTA jogar) → Como jogar (mecânica central) → Modos de jogo (cards) → Mapas/Temas (roadmap visual) → Jogue local ou online → Rodapé.

---

## 11. Fontes usadas neste documento

- `README.md`
- `docs/game-mode.md`, `docs/mudancas.md` (especificação de modos e fluxo de UX)
- `docs/void.md` (Modo Void)
- `docs/mapas-add.md`, `docs/TEMA-E-MAPAS.md` (mapas e temas planejados)
- `docs/estilo_logo_capa.md` (direção de arte)
- `docs/analise-nome-do-jogo.md` (decisão de naming em aberto)
- `docs/PENDENCIAS.md` (estado real de maturidade do projeto)
- Código: `src/game/constants.js`, `src/game/upgrades.js`, `src/styles.css`, `package.json`
