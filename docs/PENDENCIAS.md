# Pendências — Void Strike

**Data da última revisão:** 2026-09-26
**Base:** auditoria de bugs críticos feita nesta data (leitura de `server.js`,
`src/game/{logic,events,upgrades}.js`, `src/online/connection.js`,
`src/components/{OnlineGame,TeamGame,LocalGame,BattleScreen,TeamBattleScreen}.jsx`),
cruzada com o levantamento anterior de 2026-07-04.

Este arquivo existe para não perder de vista o que **ainda falta** depois de
boa parte do roadmap original já ter sido resolvida.

---

## Já resolvido (não precisa refazer)

Confirmado por leitura de código e/ou teste manual em navegador:

- Onboarding global (`src/components/HowToPlay.jsx`, acessível pelo botão "?" em
  qualquer tela via `App.jsx`).
- Preview de posicionamento em touch (`PlacementScreen.jsx`, modelo de dois toques).
- Reconexão com grace period no servidor (`server.js`: `GRACE_MS`, `graceTimer`,
  eventos `opponent-disconnected`/`opponent-reconnected`, `NetBanner.jsx`).
- Exposição do tabuleiro do oponente reduzida: `OnlineGame.finishPlacement` não
  envia células do board (só sinaliza pronto); `TeamGame.finishPlacement` só manda
  o board real para o aliado, e "board-ready" (fog) para os inimigos.
- Corrida de sincronização de `gameMode` no `OnlineGame` (tratada explicitamente,
  comentários "Problema X" no código).
- `MiniBoard` compartilhado (`TeamBattleScreen.jsx` importa de `./MiniBoard.jsx`).
- Ícones de modo centralizados em `MODE_ICONS` (`constants.js`).
- Shuffle de upgrades com Fisher-Yates (`upgrades.js`).
- Acessibilidade básica na tela de batalha (`aria-label` nas células,
  `aria-live="polite"` na mensagem de resultado, `aria-label` traduzido no
  botão fechar do `SettingsPanel`).
- "Juice" no GameOver (confete, `trophy-win`, `winner-glow`, distinção vitória/derrota).
- 4 sons distintos para os eventos de Instabilidade + som de derrota dedicado
  (`sound.js`: `eventNebula`, `eventInterference`, `eventVision`, `eventStorm`, `lose`).
- Eventos de Instabilidade sincronizados via rede (1v1 e 2v2) — testado manualmente.
- Testes automatizados: `logic.test.js`, `upgrades.test.js`, `events.test.js`,
  `OnlineGame.turn.test.js`, `TeamGame.turn.test.js` (49 testes passando).
- Fluxos testados manualmente em navegador sem erros de console: Duelo de
  Escolhas (Local), Instabilidade (Local), Online 2v2 completo (criação de
  sala, escolha de time, posicionamento, várias rodadas de batalha).
- **Servidor autoritativo para 1v1/partida-rápida** (`server.js`, bloco
  "Autoridade de jogo — salas 1v1"). Ao contrário do que este documento dizia
  numa versão anterior, isso **já estava implementado**: o servidor valida de
  quem é a vez (`pIdx !== game.turnIndex`), recalcula os alvos do tiro/plasma/
  radar a partir de um único índice (nunca confia em índices vindos do
  cliente) e resolve hit/miss contra o board real guardado nele mesmo
  (`validateBoard` recusa qualquer posicionamento de frota inválido). Essa
  linha do relatório de julho estava desatualizada — corrigida aqui.
- **Servidor autoritativo para 2v2 (bug crítico corrigido em 2026-09-26)** —
  ver detalhes na seção abaixo.

---

## Bug crítico corrigido em 2026-09-26 — 2v2 sem autoridade de servidor

**O que havia:** em salas 2v2 (`room.maxPlayers === 4`), o `relay` do servidor
só repassava mensagens cegamente, sem validar turno nem índices. Quem
resolvia um tiro era o **próprio cliente do jogador atacado**
(`TeamGame.jsx`, função `resolveAttack` — já removida), que calculava
hit/miss no seu tabuleiro local e devolvia o resultado por relay. Nada
validava se essa resposta era verdadeira.

**Cenário de exploração:** um jogador com um cliente adulterado, atuando como
defensor num 2v2, podia responder sempre "errou" para qualquer tiro recebido
— mesmo quando o tiro realmente acertava uma peça. Resultado: sua frota nunca
era encontrada, ele nunca perdia a partida, e nem o aliado nem os dois
adversários tinham como perceber isso pela interface. Também não havia
verificação de turno no relay 2v2: nada impedia um cliente adulterado de
atacar fora da sua vez.

**Correção aplicada:** o 2v2 ganhou o mesmo modelo de autoridade que o 1v1já
tinha.
- `server.js`: novo bloco "Autoridade de jogo — salas 2v2 (team)". A sala
  passa a guardar `room.game` com os 4 tabuleiros reais, times, energia,
  turno atual (`currentAttacker`) e quem já foi totalmente encontrado
  (`sunk`). Novas mensagens dedicadas substituem o relay cego:
  `team-pick` (escolha de time, agora espelhada no servidor),
  `team-submit-board` (cópia autoritativa do tabuleiro, validada com
  `validateBoard`), `team-attack` (resolve o tiro contra o board real do
  alvo, valida turno/energia/índices, decide o próximo atacante e checa
  vitória do time), `team-probe` (radar, lê o board real) e `team-timeout`
  (valida e transmite o estouro de tempo a todos, inclusive a quem estourou).
- `server.js`: corrigido também um bug latente no fluxo de `reconnect` — o
  bloco que monta o payload `sync` ao reconectar assumia formato 1v1
  (`otherIdx`, `game.upgrades[idx]`) e teria acessado `undefined[idx]`
  (exceção não tratada, derrubando a mensagem) se disparado para uma sala
  2v2 agora que `room.game` também existe ali. Corrigido com um guard extra
  (`!room.maxPlayers`) antes de montar esse payload.
- `src/components/TeamGame.jsx` / `TeamBattleScreen.jsx`: `sendShot`/
  `sendProbe`/`handleTimeout` agora falam diretamente com o servidor
  (`conn.send`) em vez de usar `conn.relay` para essas três operações; a
  resolução de ataque chega para todos os 4 jogadores via `team-attack-result`
  (broadcast do servidor), não mais do cliente defensor. O formato de dados
  entregue ao reducer (`apply-attack`, `shot-result`, `probe-result`) não
  mudou — só a fonte da verdade mudou, então a máquina de estados e os
  testes (`TeamGame.turn.test.js`) continuam válidos sem alteração.
- Validado manualmente em navegador com 4 abas simultâneas (sala 2v2
  completa: criação, entrada dos 4, escolha de times, posicionamento
  aleatório, timeout de turno e um tiro que errou) — turno, energia e
  transições de tela corretos ponta a ponta, sem erros de console.

**O que ainda não ficou 100% equivalente ao 1v1** (aceitável, não é uma
vulnerabilidade nova, é escopo menor que o resto do 2v2 já aceitava antes):
o radar (`team-probe`) não recomputa a área a partir de um único índice como
o 1v1 faz — aceita a lista de células que o cliente atacante já calculou
localmente, só validando limites do tabuleiro. Isso deixa o atacante escolher
livremente *quais* células sondar (não é novo: já era assim antes), mas o
*resultado* de cada célula (tem peça ou não) já vem só do servidor. Se um dia
o 2v2 ganhar upgrades como o 1v1 (radar 4×4 etc.), vale portar
`radarArea()`/origem única também para cá.

---

## O que ainda falta

### P2 — vale considerar antes de escalar tráfego

1. **2v2 (Team) não tem seletor de modo de jogo**
   `TeamGame.jsx` não referencia `gameMode` em lugar nenhum. A sala 2v2 sempre
   roda com energia + radar/plasma (equivalente a "Ascensão"), sem opção de
   Clássico, Instabilidade ou Duelo de Escolhas, e sem indicar isso ao
   jogador. Decidir: implementar os 4 modos também no 2v2, ou documentar isso
   como limitação intencional do modo (e comunicar na UI). Não é um bug de
   segurança — é uma lacuna de paridade de produto.

### P3 — saúde de código de longo prazo

2. **Componentes "deus" ainda grandes**
   `OnlineGame.jsx` (~760 linhas) e `TeamGame.jsx` (~630 linhas) continuam
   grandes por causa das correções de bugs acumuladas (a mais recente,
   autoridade do 2v2, adicionou lógica sem crescer muito o arquivo porque
   substituiu código existente). Vale extrair o reducer e os handlers de
   WebSocket para hooks/arquivos próprios, reduzindo o tamanho do componente
   de tela.

3. **Sem rate limiting / anti-spam de mensagens por conexão**
   O servidor confia na integridade das mensagens (agora validadas), mas não
   limita quantas mensagens por segundo uma conexão pode mandar. Um cliente
   abusivo não consegue mais *trapacear* no resultado da partida (isso foi
   corrigido), mas ainda poderia tentar sobrecarregar uma sala com mensagens
   repetidas. Baixo risco para o tamanho atual do produto; revisitar se o
   tráfego crescer.

---

## Resumo

O bug crítico de segurança de jogo (2v2 sem autoridade de servidor,
permitindo a um cliente adulterado nunca perder) foi corrigido em
2026-09-26. Com isso, tanto o 1v1/partida-rápida quanto o 2v2 têm o servidor
como única fonte da verdade sobre posicionamento, turno e resultado de
tiro/sondagem. Restam só itens de paridade de produto (seletor de modo no
2v2) e de saúde de código de longo prazo (tamanho de componentes, rate
limiting), nenhum deles bloqueando lançamento.
