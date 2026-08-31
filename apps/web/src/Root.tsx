import { useEffect, useState } from 'react';
import { Globe, Swords, UserRoundPen } from 'lucide-react';
import App from './App';
import { Lobby } from './online/Lobby';
import { onlineClient } from './online/OnlineGameClient';
import { LandingScreen } from './auth/LandingScreen';
import { consumeTokenFromUrl, fetchMe, logout, type Account } from './auth/AuthClient';
import { CardBackdrop } from './components/CardBackdrop';
import { PreloadScreen } from './components/PreloadScreen';
import { useAssetPreload } from './lib/preloadAssets';
import { RulesDialog } from './rules/RulesDialog';
import type { GameRules } from '@kinglier/engine/rules';
import { ProfileDialog } from './components/ProfileDialog';
import { Brand } from './components/Brand';
import { Button } from './components/ui/Button';
import './styles/screen.css';
import './styles/rules.css';

type Mode = 'menu' | 'offline' | 'online-lobby' | 'online-game';

export default function Root() {
  const [account, setAccount] = useState<Account | null | 'loading'>('loading');
  const [profileOpen, setProfileOpen] = useState(false);
  const [autoJoinRoomId, setAutoJoinRoomId] = useState<string | null>(null);
  const [offlineRules, setOfflineRules] = useState<GameRules | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(
    () => (new URLSearchParams(location.search).has('room') ? 'online-lobby' : 'menu')
  );

  /*
   * Прогрев артов начинается вместе с приложением, а не с партией.
   *
   * Пока игрок читает лендинг, входит и ждёт сбора двора, семь мегабайт
   * картинок успевают лечь в кэш — и за столом карта появляется вместе с
   * ходом, а не через мгновение после него. Экран поверх показывается только
   * если прогрев не уложился в первые доли секунды: на прогретом кэше его
   * не будет вовсе (см. `useAssetPreload`).
   */
  const preload = useAssetPreload();

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

  const isGame =
    (mode === 'offline' || mode === 'online-game') && account !== null && account !== 'loading';

  return (
    <>
      {/* Поверх всего и порталом: экран прогрева не принадлежит ни одному
          режиму — он про то, что стол ещё не готов показываться. */}
      <PreloadScreen visible={preload.visible} ratio={preload.ratio} />
      <CardBackdrop hidden={isGame} />
      {account === 'loading' ? (
        <div className="booting">СОЗЫВ ДВОРА</div>
      ) : !account ? (
        <LandingScreen onLoggedIn={setAccount} />
      ) : mode === 'menu' ? (
        <div className="screen">
          <div className="screen__panel">
            <Brand />

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
                onClick={() => setRulesOpen(true)}
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

          {/* Настройки открываются поверх меню, а не уводят на свой экран:
              это шаг перед партией, а не место, где живут тридцать ползунков. */}
          <RulesDialog
            open={rulesOpen}
            onClose={() => setRulesOpen(false)}
            onStart={rules => {
              setOfflineRules(rules);
              setRulesOpen(false);
              setMode('offline');
            }}
          />
        </div>
      ) : mode === 'offline' ? (
        <App
          mode="offline"
          account={account}
          onExit={exitToMenu}
          offlineRules={offlineRules ?? undefined}
        />
      ) : mode === 'online-lobby' ? (
        <Lobby
          onGameStarted={() => setMode('online-game')}
          onExit={exitToMenu}
          autoJoinRoomId={autoJoinRoomId}
        />
      ) : (
        <App mode="online" account={account} onExit={exitToMenu} />
      )}
    </>
  );
}
