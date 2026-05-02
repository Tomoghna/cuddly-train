// frontend/src/App.tsx
import React, { useState } from 'react';
import StartMenu from './components/StartMenu';
import GameUI from './components/GameUI';

type ViewState = 'startMenu' | 'game';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('startMenu');
  const [playerName, setPlayerName] = useState('');
  const [gameMode, setGameMode] = useState<'single' | 'multiplayer' | null>(null);
  const [playerCount, setPlayerCount] = useState(2);

  const handlePlayGame = () => {
    // Load game settings and hide start menu
    setView('game');
    setGameMode('single');
    // Initialize your game here
  };

  const handleSettings = () => {
    // Navigate to settings page or show settings modal
    console.log('Opening settings');
  };

  const handleMultiplayer = (count: number) => {
    // Navigate to multiplayer page
    setView('game');
    setGameMode('multiplayer');
    setPlayerCount(count);
    console.log('Opening multiplayer mode with', count, 'players');
  };

  const handleLeaderboard = () => {
    // Navigate to leaderboard page
    console.log('Opening leaderboard');
  };

  const handleBackToMenu = () => {
    setView('startMenu');
    setGameMode(null);
    setPlayerCount(2);
  };

  return (
    <div className="app">
      {view === 'startMenu' && (
        <StartMenu
          onPlayGame={handlePlayGame}
          onSettings={handleSettings}
          onMultiplayer={handleMultiplayer}
          onLeaderboard={handleLeaderboard}
          playerName={playerName}
          setPlayerName={setPlayerName}
        />
      )}
      
      {view === 'game' && <GameUI gameMode={gameMode} playerCount={playerCount} onBack={handleBackToMenu} />}
    </div>
  );
};

export default App;