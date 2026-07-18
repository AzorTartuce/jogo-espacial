# Análise de Nome — "Void Strike"

**Data:** julho de 2026
**Objetivo:** avaliar se "Void Strike" é um bom nome para o jogo (batalha naval espacial de dedução, com tema de resgate de astronautas) ou se deveria ser trocado, com base em pesquisa de mercado real.

---

## 1. Resumo executivo

**Recomendação: trocar o nome.** "Void Strike" tem dois problemas independentes, qualquer um dos dois já seria suficiente para recomendar a troca:

1. **Colisão de mercado real e direta** — já existem múltiplos jogos ativos ou em lançamento chamados "Void Strike" / "VoidStrike", todos no mesmo gênero (espacial), incluindo um lançamento comercial na Steam previsto para o mesmo ano (2026).
2. **Descompasso de tom** — "Strike" (golpe/ataque) vende a promessa de um jogo de ação/tiro. O jogo real é uma dedução estratégica por turnos com narrativa de **resgate** ("encontre a equipe perdida do rival"), muito mais próximo de Batalha Naval do que de um shooter.

Abaixo estão as evidências e as alternativas sugeridas.

---

## 2. Colisão de nome no mercado

Pesquisa feita em produtos reais (Steam, itch.io, Google Play, redes sociais), não é uma suposição:

| Produto | Onde | Gênero | Status |
|---|---|---|---|
| **Void Strike** (BareboneDev) | Steam | Roguelite "bullet hell" espacial (naves, ondas de inimigos) | Em desenvolvimento, **lançamento previsto Q4 2026** |
| **VoidStrike — The Online Space Shooter** | itch.io / IndieDB / X (@VoidStrikeGame) / Facebook | Space shooter multiplayer online | Ativo, com presença em redes sociais própria |
| **Voidstrike** | github.com/braedonsaunders/voidstrike | RTS multiplayer no navegador (WebGPU) | Projeto ativo |
| **voidstrike.com** | domínio próprio | — | Domínio já registrado e em uso |
| **"Void Strike"** (jogo neon 2D shooter, indexado no Google) | game-game.com | Space shooter | Já indexado em buscas |

**Por que isso importa na prática:**
- Em app stores (Google Play/App Store) e na Steam, a busca pelo nome "Void Strike" **não vai levar até o seu jogo** — vai competir por atenção com pelo menos 3-4 produtos já publicados ou anunciados, todos também espaciais.
- SEO/ASO (App Store Optimization) fica comprometido: é essencially impossível "ranquear" para esse termo com um app novo competindo contra um lançamento Steam do mesmo ano.
- Existe até risco de confusão de marca genuíno (não apenas SEO): um usuário que procurar "Void Strike" no Google pode achar o trailer/página do jogo da BareboneDev e nunca chegar ao seu.
- Não é coincidência isolada: pesquisei também variações como **"Void Signal"**, **"Void Rescue"** e **"Void Beacon"** — todas já têm jogos existentes usando exatamente esse nome. **"Void" como prefixo está extremamente saturado** no universo indie/sci-fi de jogos (há dezenas de "Void ___": Void Stranger, Void Salvage, The Void, Void Resurgence, Voices of the Void, etc). Qualquer combinação "Void + palavra genérica de sci-fi" tem alta chance de já existir.

---

## 3. Descompasso entre nome e produto

Olhando o conteúdo real do jogo (textos em `src/i18n/translations.js`, mecânica em `src/game/`):

- A frota não é militar/agressiva: **Estação Espacial, Nave de Resgate, Módulo Lunar, Dupla em Caminhada, Astronauta Perdido**.
- A moldura narrativa do menu é resgate, não guerra: *"A equipe de astronautas do seu rival está perdida no espaço. Encontre todos antes que ele encontre os seus!"*
- O feedback de jogo usa linguagem de **busca/sinal**, não de combate: *"Sinal de vida detectado! Continue!"*, *"Nada por aqui... passando a vez."*, radar, "sensor".
- Mecanicamente é uma **dedução por grade** (like Batalha Naval), não um shooter ou jogo de ação em tempo real.

"Strike" comunica ação/agressão imediata (companhia com "Bloodstrike", "Mobile Strike" — nomes de shooters militares mobile). Isso cria uma expectativa errada em quem vê o nome pela primeira vez na loja de apps, o que tende a gerar **downloads que desistem rápido** (churn na primeira sessão) por não encontrarem o jogo de ação que o nome prometia — e, ao mesmo tempo, afasta quem gostaria do jogo de dedução/puzzle real, porque o nome não sinaliza isso.

---

## 4. O que "Void Strike" faz bem (pontos positivos, para registro)

- Curto, fácil de pronunciar e lembrar em PT/EN/ES (idiomas do jogo).
- Visualmente forte para logo/capa (referência sci-fi, já há um documento de estilo visual pronto em `docs/estilo_logo_capa.md`).
- "Void" tem apelo estético genuíno para o tema espacial.

Ou seja, o problema não é a "vibe" do nome — é que (a) ele já está ocupado por concorrentes diretos, e (b) a metade "Strike" não representa o jogo.

---

## 5. Alternativas sugeridas

Testadas contra busca de mercado (Steam/Google Play/itch.io) no momento desta análise — "risco de colisão" é uma estimativa qualitativa, não uma garantia de disponibilidade de marca registrada.

### Opção recomendada: manter a metade "Void" (reaproveita logo, appId, copy já feitos), trocar "Strike"

| Nome | Conceito | Risco de colisão | Observação |
|---|---|---|---|
| **Void Signal** | Ecoa a mecânica de radar/sinal já usada no texto do jogo | **Alto** — já existe jogo Steam com esse nome exato | Descartar |
| **Void Recon** | "Reconhecimento no vazio" — combina com a mecânica de escanear/detectar | Baixo (nenhuma colisão direta encontrada) | Ainda soa mais "militar" que "resgate" |
| **Void Rescue** | Tradução direta do conceito real do jogo | **Alto** — já existe jogo (itch.io, Ludum Dare) com o nome exato | Descartar |

### Opção alternativa: abandonar "Void" e ir para um nome que descreva melhor a mecânica de resgate/dedução

| Nome | Conceito | Por que funciona |
|---|---|---|
| **Sinal Perdido** / **Lost Signal** | Usa a própria linguagem do jogo ("sinal detectado") | Nome único, memorável, comunica mecânica de busca/dedução sem prometer ação |
| **SOS Cósmico** / **Cosmic SOS** | Reforça a narrativa de resgate/socorro | Curto, fácil de internacionalizar, tom mais "casual/família" alinhado ao público mobile |
| **Frota Perdida** / **Lost Fleet** | Junta "frota" (mecânica de esconder peças) com "perdida" (narrativa de resgate) | Comunica bem o objetivo do jogo já no nome |
| **Resgate Estelar** / **Stellar Rescue** | Evolução natural do nome antigo ("Resgate Espacial"), mais "premium" | Menor ruptura de marca para quem já conhecia o jogo, mantém fidelidade ao conceito |

**Sugestão prática:** dado que o nome antigo ("Resgate Espacial"/"Space Rescue") já comunicava bem o conceito e não teve problema de colisão identificado na pesquisa, a opção de menor risco e esforço é evoluir esse nome (ex.: **"Resgate Estelar" / "Stellar Rescue"**) em vez de adotar "Void Strike". Como segunda opção, se quiser manter identidade nova e distinta, **"Sinal Perdido" / "Lost Signal"** é a que melhor descreve a mecânica central (detectar sinais de vida numa grade) sem colidir com produtos existentes.

---

## 6. Nota sobre custo de trocar de novo

Uma parte do rebranding para "Void Strike" já foi feita neste projeto (título, i18n, `capacitor.config.json`, `applicationId` Android `br.com.voidstrike`, textos, documento de estilo de logo). Trocar de novo tem custo real, mas é muito mais barato agora — antes de publicar nas lojas — do que depois de lançado (troca de nome pós-lançamento no Google Play tende a resetar reviews/ranking e confundir usuários existentes). Se a decisão for trocar, o ideal é fazer antes do primeiro lançamento público.
