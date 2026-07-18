Item: Coleta de dados (Data Safety form)
Status: ✅ Resolvido
Observação: O apelido do jogador trafega pelo servidor (mesmo que não seja armazenado). No formulário de "Segurança dos
Dados" do Play Console isso precisa ser declarado como dado coletado/processado, mesmo sendo efêmero — declarar
errado (dizendo "não coleta nada") é motivo comum de rejeição.
Encaminhamento: guia com as respostas exatas a marcar no formulário em `docs/PLAY_STORE_DATA_SAFETY.md`
(o código em si já não armazena o apelido em lugar nenhum — ver `PRIVACY.md` seção 1 — o que faltava era
documentar como declarar isso no Play Console).
────────────────────────────────────────
Item: Conteúdo gerado por usuário (nome exposto ao oponente)
Status: ✅ Resolvido
Observação: cleanName() em server.js só limita tamanho (14 chars), sem filtro de palavrão. Baixo risco por não ser chat
livre, mas vale um filtro básico antes de publicar, já que é texto de um jogador visível a outro jogador real.
Encaminhamento: `cleanName()` em `server.js` agora rejeita apelidos com termos ofensivos comuns em pt/en/es
(lista `BLOCKED_NAME_WORDS`, comparação sem acento/maiúsculas) e cai no nome padrão "Astronauta" quando bate.
Não é exaustivo nem resiste a leetspeak — proporcional ao risco (não é chat livre).
