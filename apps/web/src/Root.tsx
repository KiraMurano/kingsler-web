import { useState } from 'react';
import { Globe, Swords } from 'lucide-react';
import App from './App';
import { Lobby } from './online/Lobby';
import { Button } from './components/ui/Button';
import './styles/screen.css';

type Mode = 'menu' | 'offline' | 'online-lobby' | 'online-game';

export default function Root() {
  const [mode, setMode] = useState<Mode>(
    () => (new URLSearchParams(location.search).has('room') ? 'online-lobby' : 'menu')
  );

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

          <div className="menu__actions">
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
    return <App mode="offline" />;
  }

  if (mode === 'online-lobby') {
    return <Lobby onGameStarted={() => setMode('online-game')} />;
  }

  return <App mode="online" />;
}
