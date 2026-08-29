import React from 'react';
import './StartMenu.css';

interface StartMenuProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  roomSize: number;
  setRoomSize: (size: number) => void;
  onStartSingle: () => void;
  onStartMultiplayer: () => void;
}

const StartMenu: React.FC<StartMenuProps> = ({
  playerName,
  setPlayerName,
  roomSize,
  setRoomSize,
  onStartSingle,
  onStartMultiplayer,
}) => {
  return (
    <div className="start-screen">
      <div className="start-panel">
        <div className="brand">
          <span className="brand-badge">FISS</span>
          <h1>Card Table</h1>
          <p>Fast, focused, polished card gameplay in your browser.</p>
        </div>

        <div className="config-card">
          <label>
            Your name
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter player name"
            />
          </label>

          <label>
            Players
            <div className="player-count-group">
              {[2, 3, 4].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={roomSize === count ? 'active' : ''}
                  onClick={() => setRoomSize(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </label>

          <div className="action-buttons">
            <button className="primary" onClick={onStartSingle}>
              Single Player
            </button>
            <button className="secondary" onClick={onStartMultiplayer}>
              Multiplayer
            </button>
          </div>
        </div>

        <div className="start-footer">
          <div className="feature-pill">Modern card table UI</div>
          <div className="feature-pill">Responsive on desktop and mobile</div>
          <div className="feature-pill">Match, draw, discard, and win</div>
        </div>
      </div>
    </div>
  );
};

export default StartMenu;
