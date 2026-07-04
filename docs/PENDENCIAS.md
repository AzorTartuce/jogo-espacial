# Pendências — Resgate Espacial

**Data da análise:** 2026-07-04
**Base:** cruzamento item a item entre `RELATORIO_AUDITORIA.txt` / `docs/AUDITORIA_RESULTADO.md`
(auditoria de 2026-07-02) e o estado real do código nesta data, após uma sessão de
correções de bugs de multiplayer (deadlock de turno, replay de tiro obsoleto, modo
Local quebrado) e testes manuais end-to-end (Playwright) dos fluxos Duelo de
Escolhas, Instabilidade e Online 2v2.

Este arquivo existe para não perder de vista o que **ainda falta** depois de boa
parte do roadmap original já ter sido resolvida.

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
  `OnlineGame.turn.test.js`, `TeamGame.turn.test.js` (41 testes passando).
- Fluxos testados manualmente em navegador (Playwright) sem erros de console:
  Duelo de Escolhas (Local), Instabilidade (Local), Online 2v2 completo
  (criação de sala, escolha de time, posicionamento, várias rodadas de batalha).

---

## O que ainda falta

### P1 — antes de investir em aquisição de usuários

1. **Servidor sem autoridade de jogo** (`server.js`)
   O `relay` apenas repassa mensagens entre jogadores da sala — não valida de
   quem é a vez, não valida os índices de um tiro, não impede um cliente
   adulterado de atirar fora de turno ou mandar índices fora do tabuleiro.
   `maxPayload` (64KB) já existe, mas é só limite de tamanho, não validação de
   regra de jogo. Ideal: mover a resolução de tiro para o servidor, ou pelo
   menos validar turno/índice ali antes de repassar.

2. **2v2 (Team) não tem seletor de modo de jogo**
   `TeamGame.jsx` não referencia `gameMode` em lugar nenhum. A sala 2v2 sempre
   roda com energia + radar/plasma (equivalente a "Ascensão"), sem opção de
   Clássico, Instabilidade ou Duelo de Escolhas, e sem indicar isso ao
   jogador. Decidir: implementar os 4 modos também no 2v2, ou documentar isso
   como limitação intencional do modo (e comunicar na UI).

### P3 — saúde de código de longo prazo

3. **Componentes "deus" ainda maiores que na auditoria original**
   `OnlineGame.jsx` (758 linhas) e `TeamGame.jsx` (638 linhas) cresceram em
   relação ao relatório anterior (eram 634/572) por causa das correções de bugs
   acumuladas. Vale extrair o reducer e os handlers de WebSocket para
   hooks/arquivos próprios, reduzindo o tamanho do componente de tela.

4. **Resolução de tiro ainda no cliente defensor**
   Mesmo com a exposição de board já reduzida (item já resolvido acima), quem
   decide hit/miss no próprio tabuleiro ainda é o cliente do defensor, não o
   servidor — um cliente adulterado ainda poderia mentir sobre o resultado.
   Solução completa depende do item 1 (servidor autoritativo).

---

## Resumo

Das 13 recomendações do roadmap da auditoria original, **11 já foram
implementadas**. Restam essencialmente os 2 itens de fundo listados em P1
(autoridade mínima do servidor e decisão sobre modos no 2v2) mais 2 itens de
qualidade de código em P3, que não bloqueiam lançamento.
