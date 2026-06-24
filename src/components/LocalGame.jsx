import { useState, useCallback, useRef } from 'react';
import { ENERGY_PER_TURN } from '../game/constants.js';
import { UPGRADE_POOL } from '../game/upgrades.js';
import { allFound } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import Menu from './Menu.jsx';
import PlacementScreen from './PlacementScreen.jsx';
import PassScreen from './PassScreen.jsx';
import BattleScreen from './BattleScreen.jsx';
import UpgradeScreen from './UpgradeScreen.jsx';
import GameOver from './GameOver.jsx';

const initialStats = () => ({ shots: 0, hits: 0 });

export default function LocalGame({ gameMode, onChangeMode }) {
  // phase: menu | placement | pass | battle | upgrade | gameover
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
  const passTimeout = useRef(null);

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
    return (
      gameMode === 'duelo' &&
      turnsPlayed[player] > 0 &&
      turnsPlayed[player] % 3 === 0 &&
      upgrades[player].length < UPGRADE_POOL.length
    );
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

  function applyAttack({ board, shotsFired, hitsMade, anyHit, destroyed }) {
    const enemy = 1 - current;
    const nextBoards = boards.slice();
    nextBoards[enemy] = board;
    setBoards(nextBoards);
    setStats((s) => {
      const next = s.map((x) => ({ ...x }));
      next[current].shots += shotsFired;
      next[current].hits += hitsMade;
      return next;
    });

    if (allFound(board)) {
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
      {phase === 'menu' && <Menu gameMode={gameMode} onStart={startGame} onChangeMode={onChangeMode} />}

      {phase === 'pass' && afterPass && (
        <PassScreen
          name={names[afterPass.player]}
          action={afterPass.phase === 'placement' ? 'esconder sua equipe' : 'atacar'}
          onConfirm={confirmPass}
        />
      )}

      {phase === 'placement' && (
        <PlacementScreen
          key={current}
          playerName={names[current]}
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
          upgrades={gameMode === 'duelo' ? upgrades[current] : []}
          onAttack={applyAttack}
          onSpendEnergy={spendEnergy}
          onTimeout={handleTimeout}
          onUpgradeUsed={handleUpgradeUsed}
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
