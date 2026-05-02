// frontend/src/components/StartMenu.tsx
import React from 'react';
import './StartMenu.css';

interface StartMenuProps {
  onPlayGame: () => void;
  onSettings: () => void;
  onMultiplayer: (playerCount: number) => void;
  onLeaderboard: () => void;
  playerName: string;
  setPlayerName: (name: string) => void;
}

const StartMenu: React.FC<StartMenuProps> = ({
  onPlayGame,
  onSettings,
  onMultiplayer,
  onLeaderboard,
  playerName,
  setPlayerName
}) => {
  const [selectedPlayerCount, setSelectedPlayerCount] = React.useState(2);

  const handleMultiplayerClick = () => {
    onMultiplayer(selectedPlayerCount);
  };

  return (
    <div className="start-menu">
      {/* Background */}
      <div className="start-menu-background"></div>
      
      {/* Game Title */}
      <div className="start-menu-title">
        <h1 className="game-title">CARD MASTER</h1>
        <p className="subtitle">Master Your Deck, Win The Game!</p>
      </div>
      
      {/* Player Info */}
      <div className="start-menu-player-info">
        <div className="player-input-container">
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            className="player-name-input"
          />
        </div>
        
        {/* Player Count Selector */}
        <div className="player-count-selector">
          <label className="player-count-label">Number of Players:</label>
          <div className="player-count-buttons">
            {[2, 3, 4].map((count) => (
              <button
                key={count}
                className={`player-count-btn ${selectedPlayerCount === count ? 'active' : ''}`}
                onClick={() => setSelectedPlayerCount(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Main Menu Buttons */}
      <div className="start-menu-buttons">
        <button className="menu-btn play-btn" onClick={onPlayGame}>
          <span className="btn-icon">🎮</span>
          <span className="btn-text">Play Single Player</span>
        </button>
        
        <button className="menu-btn multiplayer-btn" onClick={handleMultiplayerClick}>
          <span className="btn-icon">👥</span>
          <span className="btn-text">Multiplayer</span>
        </button>
        
        <button className="menu-btn settings-btn" onClick={onSettings}>
          <span className="btn-icon">⚙️</span>
          <span className="btn-text">Settings</span>
        </button>
        
        <button className="menu-btn leaderboard-btn" onClick={onLeaderboard}>
          <span className="btn-icon">🏆</span>
          <span className="btn-text">Leaderboard</span>
        </button>
      </div>
      
      {/* Decorative Elements */}
      <div className="start-menu-decoration">
        <div className="card-decoration">🃏</div>
        <div className="card-decoration">♠️</div>
        <div className="card-decoration">♥️</div>
        <div className="card-decoration">♦️</div>
        <div className="card-decoration">♣️</div>
      </div>
      
      {/* Footer */}
      <div className="start-menu-footer">
        <p>Version 1.0.0</p>
        <p>© 2024 Card Master Game</p>
      </div>
    </div>
  );
};

export default StartMenu;