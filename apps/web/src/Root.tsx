import { useState } from 'react';
import App from './App';
import { Lobby } from './online/Lobby';

type Mode = 'menu' | 'offline' | 'online-lobby' | 'online-game';

export default function Root() {
  const [mode, setMode] = useState<Mode>(
    () => (new URLSearchParams(location.search).has('room') ? 'online-lobby' : 'menu')
  );

  if (mode === 'menu') {
    return (
      <div className="lobby">
        <h1 className="lobby__title">👑 KINGLIER</h1>
        <button className="btn btn--gold" onClick={() => setMode('offline')}>Играть с ботами</button>
        <button className="btn" onClick={() => setMode('online-lobby')}>Играть онлайн</button>
      </div>
    );
  }

  if (mode === 'offline') {
    return <App mode="offline" />;
  }

  if (mode === 'online-lobby') {
    return <Lobby onGameStarted={() => setMode('online-game')} />;
  }

  return <App mode="online" />;
}
