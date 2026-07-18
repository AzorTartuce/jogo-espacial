# Formulário "Segurança dos dados" do Play Console — como preencher

Resolve o item "Coleta de dados (Data Safety form)" de `docs/problemas/resolver.md`.

## O dado em questão

O apelido que o jogador digita (`menu.player1ph`/`player2ph` no cliente) é enviado
ao servidor (`server.js`, `cleanName()`) para ser repassado ao oponente durante a
partida. Ele **não é gravado em banco de dados nem em disco** — vive só na memória
do processo enquanto a sala existe (`rooms`/`games`, ver `server.js`) e some quando
a sala fecha. Ver `PRIVACY.md` seção 1 para a explicação voltada ao jogador final.

Isso é exatamente o padrão que a Play Store chama de **dado processado, não
armazenado** — e é aqui que a maioria das rejeições acontece: times respondem "não
coletamos nada" porque "não salvamos em banco", mas o formulário pergunta sobre
**processar/transmitir**, não só sobre persistir.

## O que marcar no formulário

No Play Console, em **Política e programas do app → Segurança dos dados**:

1. **"Seu app coleta ou compartilha algum tipo de dado do usuário exigido?"**
   → **Sim**.

2. **Tipo de dado** → categoria **Informações pessoais** → subtipo **Nome**
   (a definição do Google para "Nome" inclui apelido/nome de exibição, que é
   exatamente o caso aqui).

3. Para esse item:
   - **Coletado**: Sim.
   - **Compartilhado com terceiros**: Não (o único destino é o outro jogador da
     mesma sala, via relay do próprio servidor do jogo — não é um terceiro
     externo).
   - **Processado de forma efêmera** (opção "This data is processed ephemerally"
     / "dados processados de forma efêmera"): marque **Sim** — é exatamente esse
     o caso (transmitido em tempo real, nunca persistido, descartado ao fim da
     sessão).
   - **Finalidade**: Funcionalidade do app (exibir o nome do oponente durante a
     partida).
   - **Coleta obrigatória ou opcional**: Opcional — se o campo fica em branco, o
     cliente usa um nome padrão (`t('menu.defaultP1')`/`defaultP2`, ex.
     "Astronauta"), então o jogador não é obrigado a fornecer um apelido real.

4. **Nenhum outro tipo de dado** precisa ser declarado como coletado — o jogo não
   usa analytics, não tem login, não acessa localização/câmera/contatos (ver
   `PRIVACY.md` seção 2).

5. O formulário também pede a **URL da política de privacidade pública**: use
   `https://resgate-espacial.onrender.com/privacy.html` (URL real do serviço
   configurado em `render.yaml`, já mencionada no rodapé de `PRIVACY.md`).

## Por que declarar mesmo sendo efêmero

A carve-out de "processamento efêmero" do Google existe para evitar declarar como
"coletado" dados que só passam pelo servidor sem nunca serem lidos, guardados ou
usados por qualquer lógica — não é uma isenção de declarar o tipo de dado, é uma
forma de declará-lo com mais precisão. Marcar a caixa "Sim, coleta" + "processado
de forma efêmera" é a combinação correta; marcar "Não coleta nada" para o app
inteiro é a resposta que costuma gerar rejeição, porque o nome do jogador
claramente sai do dispositivo dele (mesmo que só de forma transitória).
