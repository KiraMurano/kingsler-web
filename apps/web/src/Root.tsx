import { useState } from 'react';
import { Globe, Swords } from 'lucide-react';
import App from './App';
import { Lobby } from './online/Lobby';
import { onlineClient } from './online/OnlineGameClient';
import { Button } from './components/ui/Button';
import './styles/screen.css';

type Mode = 'menu' | 'offline' | 'online-lobby' | 'online-game';

export default function Root() {
  const [mode, setMode] = useState<Mode>(
    () => (new URLSearchParams(location.search).has('room') ? 'online-lobby' : 'menu')
  );

  const exitToMenu = () => {
    onlineClient.leave();
    if (location.search) history.replaceState(null, '', location.pathname);
    setMode('menu');
  };

  if (mode === 'menu') {
    return (
      <div className="screen">
        <div className="screen__panel">
          <div className="brand brand--hero">
            <div className="brand__title">
              <span className="brand__rule" />
              <span className="gilded">КИНГСЛЕР</span>
              <span className="brand__rule brand__rule--r" />
            </div>
            <div className="brand__sub">Битва за престол</div>
          </div>

          <div className="dialog__panel lobbycard">
            <Button
              tone="gold"
              size="lg"
              block
              sub="Быстрая партия против королевского двора ботов"
              onClick={() => setMode('offline')}
            >
              <Swords size={18} /> Играть с ботами
            </Button>
            <Button
              tone="calm"
              size="lg"
              block
              sub="Соберите комнату и позовите друзей"
              onClick={() => setMode('online-lobby')}
            >
              <Globe size={18} /> Играть онлайн
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'offline') {
    return <App mode="offline" onExit={exitToMenu} />;
  }

  if (mode === 'online-lobby') {
    return <Lobby onGameStarted={() => setMode('online-game')} onExit={exitToMenu} />;
  }

  return <App mode="online" onExit={exitToMenu} />;
}
