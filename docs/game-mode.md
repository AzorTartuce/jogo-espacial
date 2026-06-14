# Documento de Especificação: Sistema de Modos de Jogo

## 1. Objetivo
Expandir o jogo base adicionando múltiplos modos de jogo para aumentar a rejogabilidade, oferecendo desde experiências competitivas puras até partidas caóticas e imprevisíveis.

## 2. Fluxo de Seleção (UI/UX)
O fluxo do Menu Principal deve ser alterado para acomodar a nova seleção:
1. **Seleção de Conexão:** O jogador escolhe entre `Jogar no Mesmo Computador` ou `Jogar Online (Sala)`.
2. **Seleção de Modo de Jogo (NOVA ETAPA):** Uma nova tela/modal é apresentada com as 4 opções de modos disponíveis.
3. **Início da Partida:** A partida é iniciada aplicando os modificadores do modo selecionado.

---

## 3. Modos de Jogo

### Modo 1: Clássico
* **Conceito:** A experiência pura e competitiva do jogo, focada 100% na habilidade (skill) do jogador.
* **Mecânicas e Regras:**
  * Sistema de geração de energia está **desativado**.
  * Nenhum poder ou habilidade especial pode ser desbloqueado ou utilizado.
  * O jogo roda apenas com as mecânicas básicas de movimentação e ataque.
* **Público-alvo:** Jogadores competitivos, torneios e fãs de partidas perfeitamente equilibradas.

### Modo 2: Ascensão (Modo Atual)
* **Conceito:** O formato padrão atual do jogo, focado na evolução do jogador ao longo da partida.
* **Mecânicas e Regras:**
  * Jogadores acumulam energia gradualmente ou por ações.
  * A energia acumulada desbloqueia poderes especiais progressivos.
  * Mantém exatamente o comportamento e balanceamento da versão atual do jogo.

### Modo 3: Instabilidade
* **Conceito:** Partidas caóticas e imprevisíveis onde a adaptação é mais importante do que a estratégia pré-definida.
* **Mecânicas e Regras:**
  * O campo de jogo sofre mutações constantes através de **Eventos Globais** baseados em tempo (timers).
  * Quando um evento é acionado, ele afeta *ambos* os jogadores simultaneamente.
* **Pool de Eventos Aleatórios (Exemplos):**
  * Gravidade reduzida.
  * Velocidade global aumentada.
  * Controles de movimento invertidos temporariamente.
  * Escurecimento parcial do campo de visão.
  * Surgimento de obstáculos/objetos temporários.
  * Mudança dinâmica da zona segura.

### Modo 4: Duelo de Escolhas
* **Conceito:** Mistura combate competitivo com elementos de *Roguelike/RPG*, onde o jogador cria uma *build* durante a partida.
* **Mecânicas e Regras:**
  * Substitui o ganho automático de poderes do modo Ascensão por escolhas ativas.
  * Em intervalos de tempo definidos (ou marcos de pontuação), o jogador recebe um menu com opções estratégicas.
  * O jogador só pode escolher **UMA** opção por rodada de upgrades.
* **Exemplo de Árvore de Upgrades:**
  * *Tier 1 (Status):* +15% Velocidade | +20% Defesa | +10% Ataque
  * *Tier 2 (Habilidades):* Dash mais rápido | Recuperação de vida acelerada | Alcance de tiro maior
* **Diferencial:** Elimina a sorte excessiva, permitindo que o mesmo jogador teste builds focadas em mobilidade, defesa (tank) ou agressão (glass cannon) em partidas diferentes.

---

## 4. Critérios de Aceitação Técnicos (Para Implementação)

### 4.1. Interface (UI)
- [ ] Criar a tela/componente de Seleção de Modo após a escolha de Local/Online.
- [ ] Adicionar indicadores visuais na HUD da partida que mostrem qual modo está sendo jogado atualmente.

### 4.2. Persistência e Rede (Multiplayer)
- [ ] O estado do "Modo Escolhido" deve ser salvo na configuração da sala (room state).
- [ ] O modo deve ser sincronizado via rede entre os jogadores (host e client) antes do carregamento da cena da partida.

### 4.3. Lógica de Jogo (Game Loop)
- [ ] **Modo Clássico:** Garantir que o script de gerenciamento de energia retorne `0` ou seja desativado (`disabled`).
- [ ] **Modo Ascensão:** O sistema legado de poderes deve carregar normalmente.
- [ ] **Modo Instabilidade:** Criar um gerenciador de eventos (`EventManager`) com um timer cíclico que sorteia e aplica os modificadores globais, revertendo-os após o fim de seu tempo de duração.
- [ ] **Modo Duelo de Escolhas:** Implementar sistema de pausa ou pop-up assíncrono para a tela de seleção de upgrades, e um gerenciador de status (`StatModifier`) para aplicar os buffs escolhidos ao jogador específico.