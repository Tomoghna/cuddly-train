import React, { useState } from 'react';
import './index.css';
import StartMenu from './components/StartMenu';
import GameUI from './components/GameUI';

type ViewState = 'start' | 'game';
type GameMode = 'single' | 'multiplayer';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('start');
  const [gameMode, setGameMode] = useState<GameMode>('single');
  const [playerName, setPlayerName] = useState('Player');
  const [roomSize, setRoomSize] = useState(2);

  const handleStartSingle = () => {
    setGameMode('single');
    setView('game');
  };

  const handleStartMultiplayer = () => {
    setGameMode('multiplayer');
    setView('game');
  };

  const handleBack = () => {
    setView('start');
  };

  return (
    <div className="app">
      {view === 'start' ? (
        <StartMenu
          playerName={playerName}
          setPlayerName={setPlayerName}
          roomSize={roomSize}
          setRoomSize={setRoomSize}
          onStartSingle={handleStartSingle}
          onStartMultiplayer={handleStartMultiplayer}
        />
      ) : (
        <GameUI
          gameMode={gameMode}
          playerName={playerName}
          roomSize={roomSize}
          onBack={handleBack}
        />
      )}
    </div>
  );
};

export default App;
