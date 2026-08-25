import { useEffect, useState } from 'react';
import { Globe, Swords, LogOut } from 'lucide-react';
import App from './App';
import { Lobby } from './online/Lobby';
import { onlineClient } from './online/OnlineGameClient';
import { LandingScreen } from './auth/LandingScreen';
import { consumeTokenFromUrl, fetchMe, logout, updateNickname, type Account } from './auth/AuthClient';
import { Button } from './components/ui/Button';
import './styles/screen.css';

type Mode = 'menu' | 'offline' | 'online-lobby' | 'online-game';

export default function Root() {
  const [account, setAccount] = useState<Account | null | 'loading'>('loading');
  const [autoJoinRoomId, setAutoJoinRoomId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(
    () => (new URLSearchParams(location.search).has('room') ? 'online-lobby' : 'menu')
  );

  useEffect(() => {
    consumeTokenFromUrl();
    fetchMe().then(me => {
      setAccount(me?.user ?? null);
      if (me?.activeRoom) {
        setAutoJoinRoomId(me.activeRoom.roomId);
        setMode('online-lobby');
      }
    });
  }, []);

  const exitToMenu = () => {
    onlineClient.leave();
    if (location.search) history.replaceState(null, '', location.pathname);
    setMode('menu');
  };

  if (account === 'loading') {
    return <div className="booting">СОЗЫВ ДВОРА</div>;
  }

  if (!account) {
    return <LandingScreen />;
  }

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

          <button
            type="button"
            className="landing__logout"
            onClick={() => {
              logout();
              setAccount(null);
            }}
          >
            <LogOut size={13} /> Выйти из аккаунта ({account.nickname})
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'offline') {
    return <App mode="offline" onExit={exitToMenu} />;
  }

  if (mode === 'online-lobby') {
    return (
      <Lobby
        onGameStarted={() => setMode('online-game')}
        onExit={exitToMenu}
        nickname={account.nickname}
        onNicknameChange={async nickname => {
          await updateNickname(nickname);
          setAccount(a => (a && a !== 'loading' ? { ...a, nickname } : a));
        }}
        autoJoinRoomId={autoJoinRoomId}
      />
    );
  }

  return <App mode="online" onExit={exitToMenu} />;
}
