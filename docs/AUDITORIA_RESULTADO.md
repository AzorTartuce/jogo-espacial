# Auditoria Completa — Resgate Espacial

**Data:** 2026-07-02
**Escopo:** leitura integral do código-fonte (`server.js`, `src/game/*`, `src/online/*`, `src/components/*`, `src/i18n/*`, `src/styles.css`), `README.md`, `docs/game-mode.md` e `package.json`. Nenhum arquivo do jogo foi alterado.

---

## Respostas diretas

### 1. O jogo já parece um produto que alguém pagaria para jogar?

Quase. A base mecânica (batalha naval + energia/poderes) é sólida, o polimento visual (tema claro/escuro, animações, i18n em 3 idiomas) está bem acima da média de um projeto hobby, e o áudio sintetizado cumpre seu papel sem custo de assets. Mas hoje ele ainda não é "vendável": falta onboarding (jogador novo não sabe as regras se for direto para Online/Team), o modo multiplayer tem uma falha de arquitetura que permite ver o tabuleiro do adversário sem esforço, e uma queda de conexão de qualquer jogador destrói a partida de todo mundo na sala — isso quebra a confiança de quem paga por uma experiência multiplayer. É um produto **freemium/casual gratuito muito competente hoje**, mas precisa de mais uma rodada de trabalho para ser algo que gere receita recorrente (compra ou assinatura) com confiança.

### 2. O que mais prejudica a experiência?

**A ausência total de onboarding**, combinada com o fato de que as únicas regras explicadas (`Menu.jsx`) só aparecem no fluxo Local — quem entra em Online, Quick Match ou Team nunca vê o que é energia, radar, plasma ou a diferença entre os 4 modos antes de começar a jogar. Em segundo lugar, o **preview de posicionamento de navio funciona só com mouse** (`onMouseEnter`/`onMouseLeave`), então em um app publicado para Android via Capacitor, o jogador no celular posiciona a frota sem nenhum feedback visual de "aqui cabe" / "aqui não cabe" até tocar.

### 3. Quais são os maiores riscos para o lançamento?

- **"Fog of war" não é real no multiplayer**: o tabuleiro completo do oponente (com posição real das naves) é enviado para o cliente logo após o posicionamento; qualquer um com DevTools ou um cliente adaptado vê tudo sem usar radar. Isso é um risco direto de reputação (reviews de "hack fácil") assim que o jogo tiver alguma base de usuários.
- **Sem reconexão**: qualquer desconexão (sinal de celular, app em segundo plano) derruba a sala inteira instantaneamente — no modo 2v2 isso pune 3 jogadores por causa de 1. Em mobile isso vai acontecer com frequência.
- **Onboarding zero** em Online/Team — atrito de primeira impressão para quem baixa e testa o app.
- **Nenhum teste automatizado** no projeto — qualquer regressão em lógica de jogo (`logic.js`, reducers) só é pega manualmente, o que é arriscado logo antes de um lançamento com prazo curto.

### 4. O que está excelente?

- **Sistema de i18n** (pt/en/es) com detecção automática de idioma, interpolação de parâmetros e API dupla (`t()` para React, `tr()` fora de React) — implementação madura, sem strings hardcoded esquecidas (só 1 exceção pontual, ver abaixo).
- **Tema claro/escuro** via CSS variables e `data-theme`, aplicado antes do primeiro paint, sem branching de tema dentro dos componentes — arquitetura limpa.
- **Responsividade mobile de verdade**: `--cell: min(44px, calc((100vw - 90px) / var(--size)))` para o grid nunca estourar a tela, `100dvh`, prevenção de pull-to-refresh e zoom por double-tap, hover só ativado com `@media (hover: hover)` — sinais claros de que alguém pensou em mobile, não só desktop.
- **Lógica pura do jogo** (`src/game/logic.js`) — pequena, bem fatorada, sem bugs aparentes, com guarda correta contra clique em célula já atirada.
- **Áudio sintetizado via Web Audio** com workaround dedicado para desbloqueio de áudio no iOS (gesto do usuário + resume em `visibilitychange`) — detalhe raro de se ver em projeto pequeno.

### 5. O que precisa obrigatoriamente ser melhorado?

1. Onboarding mínimo nos fluxos Online/Quick Match/Team (mesmo que seja reaproveitar o bloco de regras do `Menu.jsx`).
2. Preview de posicionamento funcionando em touch (não só mouse).
3. Reconexão (ou ao menos um grace period) no servidor antes de encerrar a sala por desconexão.
4. Tratar a exposição do tabuleiro completo do oponente no cliente (mover resolução de tiro para o servidor, ou pelo menos não enviar posições não reveladas).
5. Corrigir a corrida de sincronização de `gameMode` no `OnlineGame` (convidado pode começar a posicionar com o modo errado).

### 6. Notas (0–10)

| Critério | Nota | Justificativa curta |
|---|---|---|
| Diversão | 7 | Mecânica de "acertou, joga de novo" + energia/poderes é engajante; upgrades do Duelo têm bom gancho de build-crafting. Perde pontos por eventos de Instabilidade pouco distintos sonoramente e GameOver sem clímax. |
| Polimento | 7,5 | Animações, tema, i18n e responsividade mobile em nível muito acima do esperado para o tamanho do projeto; perde pontos pela ausência de "juice" na tela de vitória e sons de derrota/eventos repetidos. |
| Clareza | 4,5 | Zero onboarding fora do fluxo Local; regras de energia/radar/plasma nunca explicadas em Online/Team; atalho de teclado não documentado na UI. |
| UX | 5,5 | Boa em telas isoladas (SettingsPanel, PlacementScreen no desktop), mas falha em pontos críticos de fluxo: sem preview touch, sem reconexão, erros genéricos, sem indicação de "conectando…". |
| Código | 6 | `logic.js`/`events.js`/`upgrades.js` limpos; mas `OnlineGame.jsx`/`TeamGame.jsx` são componentes "deus", há duplicação real (`MiniBoard`, mapas de ícone, regra de upgrade), zero testes automatizados. |
| Potencial comercial | 5,5 | Base divertida e bonita o suficiente para converter, mas os riscos de lançamento (falha de fog-of-war, sem reconexão, sem onboarding) precisam ser endereçados antes de qualquer investimento em aquisição de usuários. |

---

## Executive Summary

"Resgate Espacial" é um jogo de batalha naval espacial para 2 jogadores (React + Vite + WebSocket), com 4 modos de jogo (Clássico, Ascensão, Instabilidade, Duelo de Escolhas), modo local (mesmo dispositivo) e online (1v1 e 2v2), preparado para publicação na Google Play via Capacitor. A base mecânica é sólida e o polimento visual/i18n/tema está em um nível notavelmente alto para o escopo do projeto. Os maiores problemas não são de "fun factor" — é de **confiabilidade multiplayer** (sem reconexão, tabuleiro do oponente exposto no cliente) e de **onboarding** (jogador novo não é ensinado a jogar fora do fluxo Local). Nenhum teste automatizado existe no projeto, o que aumenta o risco de qualquer correção rápida pré-lançamento introduzir regressões silenciosas. Com um ciclo focado nesses pontos, o jogo tem potencial real de ser um produto competitivo para lançamento mobile casual.

## Pontos fortes

- Mecânica central (tiro, radar em área, plasma em cruz, "acerta e joga de novo") simples de entender e com boa curva de decisão tática.
- Sistema de i18n (pt/en/es) maduro, com fallback seguro e API para uso dentro e fora de componentes React.
- Tema claro/escuro via CSS variables, aplicado antes do primeiro paint, sem lógica de tema espalhada pelos componentes.
- Responsividade mobile cuidadosa (grid fluido, viewport dinâmico, prevenção de gestos indesejados, hover só em dispositivos com mouse real).
- `src/game/logic.js` é pequeno, puro e correto — nenhum bug encontrado nas funções centrais de tiro/vitória.
- Áudio sintetizado (Web Audio, sem assets externos) com tratamento dedicado do bloqueio de autoplay no iOS.
- Arquitetura de callbacks/props enxuta nos componentes de tela do fluxo Local (sem prop-drilling profundo).
- `StrictMode` tratado corretamente — nenhum efeito colateral de double-mount encontrado nos timers.

## Pontos fracos

- Onboarding inexistente fora do fluxo Local; regras de energia/poderes nunca aparecem em Online/Quick Match/Team.
- Preview de posicionamento de navio só funciona com mouse (`onMouseEnter`/`onMouseLeave`), quebrado em touch.
- Três estilos de gerenciamento de estado diferentes para o mesmo domínio (useState solto vs. useReducer), com regras de negócio duplicadas (`shouldShowUpgrade` vs. `needsUpgrade`).
- `OnlineGame.jsx` (634 linhas) e `TeamGame.jsx` (572 linhas) são componentes "deus" misturando reducer, WebSocket e ~10 views inline.
- Duplicação de componente (`MiniBoard` em `TeamGame.jsx` quase idêntico a `renderMiniBoard` em `TeamBattleScreen.jsx`) e de dados (mapas de ícone de modo repetidos em 3 arquivos).
- Zero testes automatizados no projeto inteiro.
- Acessibilidade quase inexistente na tela de batalha (sem aria-label nas células, sem aria-live nos resultados).
- Shuffle de upgrades estatisticamente enviesado (`sort(() => Math.random() - 0.5)`).
- GameOver (momento de clímax emocional) é a tela com menos "juice" do app.

## Problemas críticos

1. **Tabuleiro do oponente exposto no cliente ("map hack")** — o `server.js` é um relay sem autoridade de jogo; o cliente recebe as posições reais das naves do adversário assim que o posicionamento termina, e o "fog of war" é só uma convenção de UI (`cell.shot`/`cell.revealed`). Qualquer inspeção de estado React revela tudo.
2. **Sem reconexão / grace period no servidor** — qualquer desconexão (`ws.on('close')`) derruba a sala inteira instantaneamente para todos, incluindo os 3 jogadores restantes em uma partida 2v2 quando apenas 1 se desconecta.
3. **Corrida de sincronização de `gameMode`** — o jogador convidado no `OnlineGame` pode começar a posicionar peças (ou até entrar em batalha) com o modo padrão errado antes do relay do host aplicar o modo real escolhido.
4. **Onboarding ausente em Online/Team** — jogador nunca vê as regras básicas fora do fluxo Local, o que é especialmente grave para quem baixa o app pela primeira vez e vai direto para Quick Match.
5. **Sem validação nenhuma no servidor** — índices de ataque, ordem de turno e tamanho de payload de `relay` não são verificados; um cliente malicioso pode atirar fora de turno, mandar índices inválidos ou payloads grandes sem qualquer bloqueio.

## Melhorias recomendadas

- Adicionar uma etapa curta de explicação de regras (reaproveitando o conteúdo de `Menu.jsx`) antes da primeira partida em Online/Quick Match/Team, ou um botão "Como jogar" acessível de qualquer lugar.
- Trocar o preview de posicionamento para também responder a eventos de toque (`onTouchStart`/`onTouchMove`), não só mouse.
- Implementar um período de graça de reconexão no servidor (ex.: manter a sala viva por N segundos após um `close`, permitindo o mesmo jogador reconectar antes de notificar os demais).
- Mover a resolução de tiro (hit/miss/destroyed) para o servidor, ou ao menos parar de enviar posições de naves não reveladas ao cliente adversário.
- Unificar a lógica de "quando mostrar upgrade" (`shouldShowUpgrade`/`needsUpgrade`) em uma única função compartilhada em `src/game/`.
- Extrair um componente `MiniBoard` compartilhado entre `TeamGame.jsx` e `TeamBattleScreen.jsx`.
- Centralizar o mapa de ícones por modo de jogo em `constants.js` (hoje duplicado em `Menu.jsx`, `GameModeMenu.jsx`, `BattleScreen.jsx`, `OnlineGame.jsx`).
- Trocar o shuffle de upgrades por Fisher-Yates.
- Adicionar `aria-label`/`aria-live` nas células e mensagens de resultado da tela de batalha; corrigir o `aria-label="X"` (não traduzido) do botão fechar do `SettingsPanel`.
- Dar mais "juice" à tela de GameOver (som de vitória já existe — falta um efeito visual à altura, e um som de derrota distinto de `sfx.miss()`).
- Diferenciar sonoramente/visualmente os 4 eventos de Instabilidade (hoje 3 dos 4 reaproveitam sons de radar/plasma/miss) e considerar sincronizá-los entre os jogadores online, já que o design doc (`docs/game-mode.md`) descreve eventos como afetando "ambos os jogadores simultaneamente" — hoje cada cliente sorteia o seu de forma independente.
- Introduzir testes automatizados pelo menos para `src/game/logic.js`, `events.js` e `upgrades.js` (lógica pura, fácil de testar, e é o núcleo que mais custa caro quebrar silenciosamente).

## Roadmap priorizado por impacto

**P0 — bloqueadores de lançamento (fazer antes de publicar)**
1. Onboarding mínimo em Online/Quick Match/Team.
2. Preview de posicionamento funcionando em touch.
3. Grace period de reconexão no servidor (crítico para 2v2).

**P1 — alto impacto, resolver logo após o lançamento inicial**
4. Corrigir a corrida de sincronização de `gameMode` no `OnlineGame`.
5. Reduzir a exposição do tabuleiro do oponente no cliente (mesmo que a solução completa — servidor autoritativo — fique para depois, dá para não mandar posições não reveladas).
6. Validação básica de turno/índice no servidor para `relay` de ataque.

**P2 — qualidade e retenção**
7. Mais "juice" na tela de GameOver + som de derrota distinto.
8. Diferenciar os 4 eventos de Instabilidade (som/visual) e avaliar sincronizá-los entre jogadores online.
9. Acessibilidade da tela de batalha (aria-label/aria-live) + correção do `aria-label="X"`.

**P3 — saúde de longo prazo do código**
10. Unificar `shouldShowUpgrade`/`needsUpgrade` e os mapas de ícone de modo duplicados.
11. Extrair `MiniBoard` compartilhado, reduzir tamanho de `OnlineGame.jsx`/`TeamGame.jsx`.
12. Testes automatizados para `src/game/logic.js`, `events.js`, `upgrades.js`.
13. Corrigir o shuffle de upgrades (Fisher-Yates).
