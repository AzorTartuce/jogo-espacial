import { useState, useCallback, useRef } from 'react';
import { ENERGY_PER_TURN, MAPS, SIZE } from '../game/constants.js';
import { shouldOfferUpgrade } from '../game/upgrades.js';
import { resolveShots, allFound } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import Menu from './Menu.jsx';
import PlacementScreen from './PlacementScreen.jsx';
import PassScreen from './PassScreen.jsx';
import BattleScreen from './BattleScreen.jsx';
import UpgradeScreen from './UpgradeScreen.jsx';
import GameOver from './GameOver.jsx';

const initialStats = () => ({ shots: 0, hits: 0 });

export default function LocalGame({ gameMode, mapId, themeId, planetId, onChangeMode, onChangeMapTheme }) {
  // phase: menu | placement | pass | battle | upgrade | gameover
  const boardSize = MAPS.find((m) => m.id === mapId)?.size ?? SIZE;
  const [phase, setPhase] = useState('menu');
  const [names, setNames] = useState(['Jogador 1', 'Jogador 2']);
  const [boards, setBoards] = useState([null, null]);
  const [energy, setEnergy] = useState([0, 0]);
  const [stats, setStats] = useState([initialStats(), initialStats()]);
  const [current, setCurrent] = useState(0);
  const [afterPass, setAfterPass] = useState(null);
  const [winner, setWinner] = useState(null);
  const [turnKey, setTurnKey] = useState(0);
  const [turnsPlayed, setTurnsPlayed] = useState([0, 0]);
  const [upgrades, setUpgrades] = useState([[], []]);
  // Protocolo request→response do BattleScreen (mesmo padrão de OnlineGame/TeamGame):
  // o atacante sempre chama onSendShot/onSendProbe e espera a resolução voltar
  // por aqui, com `id` incremental para o dedupe interno do BattleScreen.
  const [shotResult, setShotResult] = useState(null);
  const [probeResult, setProbeResult] = useState(null);
  const passTimeout = useRef(null);
  // Guarda o board REAL (não o board "mascarado" que o BattleScreen devolve via
  // onAttack, que substitui o pieceId das células acertadas por um sentinela
  // opaco para nunca revelar o tipo de peça ao atacante). applyAttack usa este
  // ref — e não o campo `board` do payload — para não corromper o pieceId real
  // do defensor, já que em modo Local o mesmo array `boards` serve tanto de
  // "meu tabuleiro" quanto de "tabuleiro do inimigo" dependendo de quem ataca.
  const lastResolvedBoardRef = useRef(null);

  const goToPass = useCallback((nextPhase, player, delay = 0) => {
    clearTimeout(passTimeout.current);
    const go = () => {
      setAfterPass({ phase: nextPhase, player });
      setPhase('pass');
    };
    if (delay > 0) passTimeout.current = setTimeout(go, delay);
    else go();
  }, []);

  function startGame(playerNames) {
    setNames(playerNames);
    setBoards([null, null]);
    setEnergy([0, 0]);
    setStats([initialStats(), initialStats()]);
    setWinner(null);
    setCurrent(0);
    setTurnsPlayed([0, 0]);
    setUpgrades([[], []]);
    goToPass('placement', 0);
  }

  function shouldShowUpgrade(player) {
    return shouldOfferUpgrade({
      gameMode,
      turnsPlayed: turnsPlayed[player],
      pickedCount: upgrades[player].length,
    });
  }

  function confirmPass() {
    const { phase: nextPhase, player } = afterPass;
    setCurrent(player);
    if (nextPhase === 'battle') {
      if (gameMode !== 'classico') {
        setEnergy((e) => {
          const next = e.slice();
          next[player] += ENERGY_PER_TURN;
          return next;
        });
      }
      setTurnKey((k) => k + 1);
      // Um novo BattleScreen vai montar aqui (key muda com turnKey) com seus
      // refs internos lastShotId/lastProbeId zerados a 0; sem isto, um
      // shotResult/probeResult de id>0 sobrevivendo do turno anterior seria
      // reaplicado automaticamente no mount, encerrando o turno novo sozinho
      // (mesmo bug #15 já corrigido no multiplayer).
      setShotResult(null);
      setProbeResult(null);
      if (shouldShowUpgrade(player)) {
        setPhase('upgrade');
        return;
      }
    }
    setPhase(nextPhase);
  }

  function finishPlacement(board) {
    setBoards((b) => {
      const next = b.slice();
      next[current] = board;
      return next;
    });
    if (current === 0) {
      goToPass('placement', 1);
    } else {
      goToPass('battle', 0);
    }
  }

  // Resolve o tiro no tabuleiro REAL do inimigo (mesmo padrão de
  // OnlineGame.resolveAttack/TeamGame), já que aqui os dois jogadores
  // compartilham o mesmo estado React — não há rede, tudo é síncrono.
  function resolveAttack(indices) {
    const enemy = 1 - current;
    const { board, hitIndices, destroyed, sunkAll } = resolveShots(boards[enemy], indices);
    lastResolvedBoardRef.current = board;
    return { hitIndices, destroyed, sunkAll };
  }

  // BattleScreen também manda `kind`/`originIndex` (usados pelo servidor no
  // modo online pra recalcular as células ele mesmo) — aqui não fazem falta:
  // é o mesmo dispositivo dos dois lados, `indices`/`cells` já bastam.
  function onSendShot(indices) {
    const res = resolveAttack(indices);
    setShotResult((prev) => ({
      id: (prev?.id || 0) + 1,
      indices,
      hitIndices: res.hitIndices,
      destroyed: res.destroyed,
      sunkAll: res.sunkAll,
    }));
  }

  function onSendProbe(cells) {
    const board = boards[1 - current];
    const resolvedCells = cells.map((i) => ({ index: i, hasPiece: !!board[i].pieceId }));
    setProbeResult((prev) => ({
      id: (prev?.id || 0) + 1,
      cells: resolvedCells,
    }));
  }

  function applyAttack({ shotsFired, hitsMade, anyHit, destroyed }) {
    const enemy = 1 - current;
    const nextBoards = boards.slice();
    nextBoards[enemy] = lastResolvedBoardRef.current ?? boards[enemy];
    setBoards(nextBoards);
    setStats((s) => {
      const next = s.map((x) => ({ ...x }));
      next[current].shots += shotsFired;
      next[current].hits += hitsMade;
      return next;
    });

    if (allFound(nextBoards[enemy])) {
      setWinner(current);
      sfx.win();
      setTimeout(() => setPhase('gameover'), 1200);
      return;
    }
    if (destroyed) sfx.destroyed();

    if (!anyHit) {
      if (gameMode === 'duelo') {
        setTurnsPlayed((t) => {
          const next = [...t];
          next[current]++;
          return next;
        });
      }
      goToPass('battle', enemy, 1000);
    }
  }

  function spendEnergy(amount) {
    setEnergy((e) => {
      const next = e.slice();
      next[current] -= amount;
      return next;
    });
  }

  function handleTimeout() {
    if (gameMode === 'duelo') {
      setTurnsPlayed((t) => {
        const next = [...t];
        next[current]++;
        return next;
      });
    }
    goToPass('battle', 1 - current, 600);
  }

  function applyUpgrade(upgradeId) {
    if (!upgradeId) {
      setPhase('battle');
      return;
    }
    setUpgrades((u) => u.map((list, i) => (i === current ? [...list, upgradeId] : list)));
    if (upgradeId === 'energy_bonus') {
      setEnergy((e) => {
        const next = [...e];
        next[current] += 3;
        return next;
      });
    }
    setPhase('battle');
  }

  function handleUpgradeUsed(upgradeId) {
    setUpgrades((u) =>
      u.map((list, i) => (i === current ? list.filter((id) => id !== upgradeId) : list))
    );
  }

  return (
    <>
      {phase === 'menu' && (
        <Menu
          gameMode={gameMode}
          mapId={mapId}
          themeId={themeId}
          onStart={startGame}
          onChangeMode={onChangeMode}
          onChangeMapTheme={onChangeMapTheme}
        />
      )}

      {phase === 'pass' && afterPass && (
        <PassScreen
          name={names[afterPass.player]}
          action={afterPass.phase}
          onConfirm={confirmPass}
        />
      )}

      {phase === 'placement' && (
        <PlacementScreen
          key={current}
          playerName={names[current]}
          themeId={themeId}
          mapId={mapId}
          planetId={planetId}
          boardSize={boardSize}
          onDone={finishPlacement}
        />
      )}

      {phase === 'upgrade' && (
        <UpgradeScreen
          playerName={names[current]}
          pickedUpgrades={upgrades[current]}
          onPick={applyUpgrade}
        />
      )}

      {phase === 'battle' && (
        <BattleScreen
          key={`${current}-${turnKey}`}
          playerName={names[current]}
          enemyName={names[1 - current]}
          enemyBoard={boards[1 - current]}
          ownBoard={boards[current]}
          energy={energy[current]}
          gameMode={gameMode}
          themeId={themeId}
          mapId={mapId}
          planetId={planetId}
          boardSize={boardSize}
          upgrades={gameMode === 'duelo' ? upgrades[current] : []}
          onAttack={applyAttack}
          onSpendEnergy={spendEnergy}
          onTimeout={handleTimeout}
          onUpgradeUsed={handleUpgradeUsed}
          onSendShot={onSendShot}
          onSendProbe={onSendProbe}
          shotResult={shotResult}
          probeResult={probeResult}
        />
      )}

      {phase === 'gameover' && (
        <GameOver
          winnerName={names[winner]}
          stats={stats}
          names={names}
          onRestart={() => setPhase('menu')}
        />
      )}
    </>
  );
}
