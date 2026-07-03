# Bug Report: Travamento na "Partida Rápida" (Batalha Naval) a partir da 2ª rodada

## Descrição do bug
- A **primeira rodada funciona normalmente**: cada jogador consegue jogar seu turno sem problemas.
- **A partir da segunda rodada, o jogo trava completamente**: ambos os jogadores ficam presos na tela esperando o turno do adversário, mas nenhum dos dois consegue jogar.
- Ou seja, o estado do jogo entra em um "deadlock" onde:
  - Jogador A acredita que é a vez do Jogador B.
  - Jogador B acredita que é a vez do Jogador A.
  - Ninguém consegue avançar o turno.

## Comportamento esperado
Após cada jogada válida, o turno deveria alternar corretamente entre os jogadores, permitindo que a partida continue rodada após rodada sem travar.

## O que já sei
- O bug **não ocorre na primeira rodada**, apenas a partir da segunda.
- Isso sugere que o problema está relacionado a como o **estado do turno é atualizado/sincronizado** entre os jogadores após a primeira jogada.

## O que preciso que você (Claude) faça
1. Analise o fluxo de controle de turnos do jogo (quem joga, quando passa a vez, como isso é comunicado entre os dois jogadores).
2. Identifique possíveis causas do travamento, considerando cenários como:
   - Erro na lógica de alternância de turno (ex: variável de turno não sendo atualizada corretamente).
   - Problema de sincronização entre cliente e servidor (se for esse o caso).
   - Condição de corrida (race condition) entre eventos de jogada.
   - Estado sendo resetado ou não persistido corretamente entre rodadas.
3. Aponte exatamente **onde no código** (arquivos/funções) está a origem provável do bug.
4. Proponha uma correção específica, explicando por que ela resolve o problema.
5. Se precisar de mais informações (como arquivos específicos, estrutura de dados do turno, etc.), pergunte antes de assumir.