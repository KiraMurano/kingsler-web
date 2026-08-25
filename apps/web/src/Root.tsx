import { useEffect, useState } from 'react';
import { Globe, Swords, UserRoundPen } from 'lucide-react';
import App from './App';
import { Lobby } from './online/Lobby';
import { onlineClient } from './online/OnlineGameClient';
import { LandingScreen } from './auth/LandingScreen';
import { consumeTokenFromUrl, fetchMe, logout, type Account } from './auth/AuthClient';
import { CardBackdrop } from './components/CardBackdrop';
import { ProfileDialog } from './components/ProfileDialog';
import { Button } from './components/ui/Button';
import './styles/screen.css';

type Mode = 'menu' | 'offline' | 'online-lobby' | 'online-game';

export default function Root() {
  const [account, setAccount] = useState<Account | null | 'loading'>('loading');
  const [profileOpen, setProfileOpen] = useState(false);
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

  const handleLogout = () => {
    onlineClient.leave();
    logout();
    setProfileOpen(false);
    setAccount(null);
  };

  if (account === 'loading') {
    return <div className="booting">СОЗЫВ ДВОРА</div>;
  }

  if (!account) {
    return <LandingScreen onLoggedIn={setAccount} />;
  }

  if (mode === 'menu') {
    return (
      <div className="screen">
        <CardBackdrop />
        <div className="screen__panel">
          <div className="brand brand--hero">
            <div className="brand__title">
              <span className="brand__rule" />
              <span className="gilded">КИНГСЛЕР</span>
              <span className="brand__rule brand__rule--r" />
            </div>
            <div className="brand__sub">Битва за престол</div>
          </div>

          <button type="button" className="account-button" onClick={() => setProfileOpen(true)}>
            <span className="account-button__avatar">
              <img src={account.avatar} alt="" />
            </span>
            <span className="account-button__identity">
              <span className="account-button__title">{account.title}</span>
              <span className="account-button__name">{account.nickname}</span>
            </span>
            <UserRoundPen size={16} />
          </button>

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

        {profileOpen && (
          <ProfileDialog
            open
            account={account}
            onClose={() => setProfileOpen(false)}
            onSaved={setAccount}
            onLogout={handleLogout}
          />
        )}
      </div>
    );
  }

  if (mode === 'offline') {
    return <App mode="offline" account={account} onExit={exitToMenu} />;
  }

  if (mode === 'online-lobby') {
    return (
      <Lobby
        onGameStarted={() => setMode('online-game')}
        onExit={exitToMenu}
        autoJoinRoomId={autoJoinRoomId}
      />
    );
  }

  return <App mode="online" account={account} onExit={exitToMenu} />;
}
