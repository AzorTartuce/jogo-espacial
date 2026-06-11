import { useState, useCallback, useRef } from 'react';
import { ENERGY_PER_TURN } from '../game/constants.js';
import { allFound } from '../game/logic.js';
import { sfx } from '../game/sound.js';
import Menu from './Menu.jsx';
import PlacementScreen from './PlacementScreen.jsx';
import PassScreen from './PassScreen.jsx';
import BattleScreen from './BattleScreen.jsx';
import GameOver from './GameOver.jsx';

const initialStats = () => ({ shots: 0, hits: 0 });

export default function LocalGame() {
  // phase: menu | placement | pass | battle | gameover
  const [phase, setPhase] = useState('menu');
  const [names, setNames] = useState(['Jogador 1', 'Jogador 2']);
  const [boards, setBoards] = useState([null, null]);
  const [energy, setEnergy] = useState([0, 0]);
  const [stats, setStats] = useState([initialStats(), initialStats()]);
  const [current, setCurrent] = useState(0); // quem está jogando/posicionando
  const [afterPass, setAfterPass] = useState(null); // { phase, player }
  const [winner, setWinner] = useState(null);
  const [turnKey, setTurnKey] = useState(0); // reinicia o timer a cada turno
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
    goToPass('placement', 0);
  }

  function confirmPass() {
    const { phase: nextPhase, player } = afterPass;
    setCurrent(player);
    if (nextPhase === 'battle') {
      setEnergy((e) => {
        const next = e.slice();
        next[player] += ENERGY_PER_TURN;
        return next;
      });
      setTurnKey((k) => k + 1);
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

  // Aplica o resultado de um tiro (ou rajada) no tabuleiro do oponente
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

    // Acertou: continua jogando (a própria tela reinicia o timer).
    if (!anyHit) {
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
    goToPass('battle', 1 - current, 600);
  }

  return (
    <>
      {phase === 'menu' && <Menu onStart={startGame} />}

      {phase === 'pass' && afterPass && (
        <PassScreen
          name={names[afterPass.player]}
          action={
            afterPass.phase === 'placement' ? 'esconder sua equipe' : 'atacar'
          }
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

      {phase === 'battle' && (
        <BattleScreen
          key={`${current}-${turnKey}`}
          playerName={names[current]}
          enemyName={names[1 - current]}
          enemyBoard={boards[1 - current]}
          ownBoard={boards[current]}
          energy={energy[current]}
          onAttack={applyAttack}
          onSpendEnergy={spendEnergy}
          onTimeout={handleTimeout}
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
