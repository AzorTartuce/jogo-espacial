# Lançamento na Web — o que foi feito e o que falta

**Data:** 2026-09-26
**Escopo:** registro do trabalho feito nesta sessão (landing page + auditoria
de bugs + correção de um bug crítico de segurança de jogo) e um checklist do
que ainda falta antes de divulgar o jogo publicamente na web (fora do escopo
de loja de app — isso já tem seu próprio documento em
`docs/PLAY_STORE_DATA_SAFETY.md`).

---

## 1. O que foi feito nesta sessão

### 1.1 Landing page imersiva (tela inicial)
Novo componente `src/components/LandingScreen.jsx`, exibido uma única vez
antes do menu de modos (`ModeMenu`), com:
- Radar animado (varredura giratória + "blips" pulsantes) como elemento
  visual central.
- Frases de "sinal interceptado" em efeito de máquina de escrever, ciclando
  em loop — gera curiosidade sobre o jogo sem precisar de um texto longo.
- Um único CTA ("Iniciar resgate") levando ao menu de modos existente.
- i18n completo (pt/en/es) para os textos novos.

Não altera nenhum fluxo de jogo existente — só antecede o menu.

### 1.2 Auditoria de bugs críticos
Revisão de `server.js`, `src/game/{logic,events,upgrades}.js`,
`src/online/connection.js` e os componentes de fluxo online/local/team.
Achado principal: **o 2v2 online não tinha nenhuma autoridade de servidor**
— o próprio cliente do jogador atacado decidia (e podia mentir sobre) o
resultado de cada tiro, permitindo a um cliente adulterado nunca perder uma
partida 2v2. O 1v1/partida-rápida já era protegido contra isso; o
`docs/PENDENCIAS.md` estava desatualizado ao dizer o contrário — foi
corrigido no processo.

### 1.3 Correção do bug crítico (2v2 agora é autoritativo)
- `server.js`: novo bloco de autoridade para salas 2v2, espelhando o modelo
  já usado no 1v1 — o servidor guarda os 4 tabuleiros reais, valida turno,
  energia e índices, resolve hit/miss/afundamento ele mesmo e decide o
  vencedor. Novas mensagens dedicadas (`team-pick`, `team-submit-board`,
  `team-attack`, `team-probe`, `team-timeout`) substituem o relay cego usado
  antes para essas cinco operações.
- Corrigido de quebra um bug latente na reconexão: o payload de `sync` ao
  reconectar assumia formato 1v1 e teria lançado uma exceção não tratada se
  disparado numa sala 2v2 agora que ela também tem `room.game`.
- `src/components/TeamGame.jsx` e `TeamBattleScreen.jsx` atualizados para
  falar diretamente com o servidor nessas operações, sem mudar o formato de
  dados que o reducer já esperava — os testes existentes
  (`TeamGame.turn.test.js`) continuam válidos sem alteração.
- **Validado**: build limpo, 49/49 testes automatizados passando, e um teste
  manual ponta a ponta no navegador com 4 abas simulando uma sala 2v2
  completa (criação, entrada dos 4 jogadores, escolha de times,
  posicionamento, timeout de turno e resolução de um tiro), sem erros de
  console e com turno/energia corretos em todas as etapas.
- `docs/PENDENCIAS.md` reescrito para refletir o estado real (o que
  documentava um bug já resolvido no 1v1, e agora documenta a correção do
  2v2 com o mesmo nível de detalhe).

---

## 2. Estado atual do projeto (visão geral)

O que já está pronto para uma web pública, hoje:

- ✅ Servidor autoritativo (1v1 **e** 2v2) — sem exposição de tabuleiro nem
  possibilidade de um cliente mentir sobre o resultado de uma jogada.
- ✅ Reconexão com grace period (25s) em caso de queda de conexão, em vez de
  encerrar a sala na hora.
- ✅ Onboarding ("Como jogar", acessível de qualquer tela) e 4 modos de jogo
  + modo Void funcionando local e online.
- ✅ Responsividade mobile real (grid fluido, sem gestos indesejados, hover
  só em dispositivos com mouse).
- ✅ i18n em pt/en/es com detecção automática de idioma.
- ✅ Tema claro/escuro.
- ✅ 49 testes automatizados cobrindo lógica de jogo, upgrades, eventos e
  máquinas de estado de turno (local, online 1v1, online 2v2).
- ✅ Deploy configurado via Render Blueprint (`render.yaml`): build e start
  automáticos a partir do push no GitHub.
- ✅ Meta tags básicas de compartilhamento (`og:title`, `og:description`,
  `description`) e favicon.

---

## 3. Checklist para o lançamento web

`### 3.1 Bloqueadores reais (fazer antes de divulgar publicamente)
`
- [ ] **Decidir o nome do jogo.** `docs/analise-nome-do-jogo.md` documenta
  colisão de marca real com outros jogos "Void Strike"/"VoidStrike" já
  publicados (inclusive um lançamento Steam previsto para o mesmo ano). Isso
  afeta diretamente SEO/ASO e a própria URL/domínio do lançamento — trocar
  depois de já ter tráfego e links compartilhados é bem mais caro do que
  agora. Recomendação do próprio documento: evoluir para algo como "Resgate
  Estelar"/"Stellar Rescue" (menor ruptura) ou "Sinal Perdido"/"Lost Signal".
- [ ] **Resolver a inconsistência de nome no serviço/infra.** `render.yaml`
  usa `name: resgate-espacial` e `src/online/connection.js` tem
  `RENDER_WSS_URL` hardcoded como `wss://resgate-espacial.onrender.com/ws`
  (usado só no build Capacitor/mobile, não no build web). Isso não quebra o
  funcionamento hoje, mas qualquer decisão de nome/domínio final deve
  atualizar essas duas referências junto — senão a URL pública do site vai
  contradizer o nome mostrado na tela.
- [ ] **Considerar o plano gratuito do Render.** No plano free, o serviço
  "dorme" depois de um período sem tráfego e demora para acordar na próxima
  visita (cold start de alguns segundos a mais de um minuto) — a primeira
  pessoa a abrir o link depois de um tempo ocioso pode achar que o jogo
  "não carrega" ou que o modo online "não conecta" (o WebSocket tenta abrir
  antes do servidor estar pronto). Para um lançamento com divulgação real
  (redes sociais, grupos, etc.), vale migrar para um plano pago ou terno de
  monitoramento com ping periódico antes do pico de tráfego esperado.

### 3.2 Fortemente recomendado (não impede lançar, mas reduz risco)

- [ ] **Nenhum analytics ou monitoramento de erro em produção.** Hoje não há
  como saber quantas pessoas jogam, em que tela desistem, nem ficar sabendo
  de um erro de JS em produção sem alguém reportar manualmente. Mesmo uma
  solução leve e sem custo (ex.: um serviço de analytics respeitoso de
  privacidade, ou só logs estruturados no próprio `server.js`) ajuda muito a
  decidir o que priorizar depois do lançamento.
- [ ] **Sem imagem de preview social (`og:image`).** Ao compartilhar o link
  em WhatsApp/Twitter/Discord etc., o preview vai aparecer sem imagem — só
  título e descrição. Vale gerar uma arte de capa (já existe direção de arte
  pronta em `docs/estilo_logo_capa.md`) e adicionar a tag `og:image` (+
  `twitter:card`) no `index.html`.
- [ ] **Sem rate limiting por conexão.** O servidor já valida toda jogada
  (após a correção desta sessão), mas não limita quantas mensagens por
  segundo uma conexão pode mandar — um cliente abusivo não consegue mais
  trapacear no resultado, mas ainda poderia tentar sobrecarregar uma sala com
  mensagens repetidas. Baixo risco no tamanho atual do produto, mas vale
  revisitar se o tráfego crescer rápido.
- [ ] **Estado das salas só em memória.** `rooms`/`quickQueue` vivem num
  `Map`/array em memória no processo Node — um redeploy ou reinício do
  servidor (inclusive um crash) derruba todas as partidas em andamento sem
  aviso. Aceitável para um jogo casual gratuito, mas bom ter consciência
  disso ao agendar deploys (evitar publicar mudanças em horário de pico).

### 3.3 Lacunas de produto conhecidas (não bloqueiam, já documentadas)

- [ ] **2v2 não tem seletor de modo de jogo** — sempre roda equivalente ao
  modo Ascensão, sem Clássico/Instabilidade/Duelo de Escolhas (ver
  `docs/PENDENCIAS.md`, item P2).
- [ ] Mapas "em breve" (Triangular, Pegadinha, Gravidade Zero, Buraco Negro)
  e temas Fogo/Gelo ainda não implementados — evitar anunciá-los como já
  disponíveis (ver `docs/DOCUMENTO-LANDING-PAGE.md`, seções 5–6).

---

## 4. Resumo

O jogo está **funcionalmente pronto e seguro** para um lançamento web casual
hoje — o bug crítico que permitia nunca perder uma partida 2v2 foi corrigido
e validado, e a base (servidor autoritativo, reconexão, onboarding, testes)
já era sólida antes desta sessão. O que falta é majoritariamente decisão de
produto/marca (nome do jogo) e itens de infraestrutura de lançamento
(cold start do plano gratuito, analytics, preview social) — nenhum deles é
um bloqueador técnico, mas o nome do jogo é o item que fica mais caro de
mudar quanto mais se espera.
