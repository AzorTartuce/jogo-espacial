content = """# Estrutura de Menu e UX: Fluxo de Conexão e Partida

Este documento detalha a arquitetura de informação e a hierarquia de menus para o fluxo de inicialização de partidas do jogo. A estrutura foi desenhada seguindo o **princípio de menus em camadas (progressive disclosure)**, garantindo uma experiência de usuário (UX) intuitiva, rápida e com baixa carga cognitiva.

---

## 1. Princípios de Design Aplicados

* **Divisão em Camadas (Layered Decisions):** Cada tela apresenta apenas uma decisão simples por vez. O jogador não precisa processar múltiplas variáveis simultaneamente.
* **Divulgação Progressiva (Progressive Disclosure):** Informações e opções mais complexas (como o formato 1v1 ou 2v2) só são exibidas quando estritamente relevantes (apenas no fluxo Online).
* **Consistência de Saída (Universal Leaf Nodes):** Independentemente do caminho de conexão escolhido, o ponto final de configuração do modo de jogo é idêntico (Clássico, Void, Customizar). Isso cria familiaridade e reduz o tempo de aprendizado.
* **Baixa Carga Cognitiva:** Evita que o jogador precise memorizar combinações complexas antes de iniciar a partida, minimizando a fricção até o gameplay.

---

## 2. Diagrama de Fluxo (Hierarquia)

Abaixa está o diagrama basico do fluxo do Jogo

Tela de inicio do jogo = Modos de jogo {O modo de jogar no mesmo telefone, modo online, personalizado}

Quando clica no modo de jogo aparece, as opção de jogo, por exemplo: 
Modo de jogar no mesmo telefone = Aparece partida classica, e partida void 
Modo online = vai aparecer modo classico e partida void 
Modo personalizado = Vai ter o 2v2, e vai ter como escolher o modo e mapa e todas a as opção de jogos que você quiser, personalizar o tipo de partida que você vai jogar 

