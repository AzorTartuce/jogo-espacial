import { useState } from 'react';
import { FLEET, RADAR_COST, PLASMA_COST } from '../game/constants.js';
import { sfx } from '../game/sound.js';

export default function Menu({ onStart }) {
  const [name1, setName1] = useState('');
  const [name2, setName2] = useState('');

  function start() {
    sfx.click();
    onStart([name1.trim() || 'Jogador 1', name2.trim() || 'Jogador 2']);
  }

  return (
    <div className="screen menu fade-in">
      <p className="tagline">
        A equipe de astronautas do seu rival está perdida no espaço.
        <br />
        Encontre todos antes que ele encontre os seus!
      </p>

      <div className="menu-fleet">
        {FLEET.map((p) => (
          <div key={p.id} className="menu-fleet-item">
            <span className="fleet-emoji">{p.emoji}</span>
            <span>{p.name}</span>
            <span className="fleet-size">
              {Array.from({ length: p.size }, () => '■').join('')}
            </span>
          </div>
        ))}
      </div>

      <div className="menu-rules">
        <div>🎯 Acertou? Joga de novo!</div>
        <div>⚡ Ganhe energia a cada turno</div>
        <div>📡 Radar ({RADAR_COST}⚡): revela uma área 3x3</div>
        <div>☄️ Plasma ({PLASMA_COST}⚡): atinge 5 células em cruz</div>
        <div>⏱️ 30 segundos por turno — pense rápido!</div>
      </div>

      <div className="menu-names">
        <input
          placeholder="Nome do Jogador 1"
          value={name1}
          maxLength={14}
          onChange={(e) => setName1(e.target.value)}
        />
        <span className="vs">VS</span>
        <input
          placeholder="Nome do Jogador 2"
          value={name2}
          maxLength={14}
          onChange={(e) => setName2(e.target.value)}
        />
      </div>

      <button className="big-btn" onClick={start}>
        🚀 Iniciar Missão
      </button>
    </div>
  );
}
