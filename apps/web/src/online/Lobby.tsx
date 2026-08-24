import { useRef, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import { Check, Copy, Crown, LogIn, CirclePlus, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { OnlineGameClient, type LobbyMessage } from './OnlineGameClient';
import { bindOnlineStore } from './bindOnlineStore';
import '../styles/screen.css';

interface LobbyProps {
  onGameStarted: () => void;
}

const MAX_SEATS = 4;

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="brand brand--hero">
      <div className="brand__title">
        <span className="brand__rule" />
        <span className="gilded">КИНГСЛЕР</span>
        <span className="brand__rule brand__rule--r" />
      </div>
      <div className="brand__sub">{subtitle}</div>
    </div>
  );
}

export function Lobby({ onGameStarted }: LobbyProps) {
  const clientRef = useRef<OnlineGameClient>(new OnlineGameClient());
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(location.search).get('room') ?? '');
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const attachRoom = (newRoom: Room) => {
    newRoom.onMessage('lobby', (data: LobbyMessage) => {
      setLobby(data);
      if (data.phase === 'PLAYING') {
        bindOnlineStore(newRoom);
        onGameStarted();
      }
    });
    setRoom(newRoom);
    newRoom.send('lobby');
  };

  const handleCreate = async () => {
    setError(null);
    try {
      const created = await clientRef.current.createRoom(nickname || 'Игрок');
      history.replaceState(null, '', `?room=${created.roomId}`);
      attachRoom(created);
    } catch {
      setError('Не удалось создать комнату. Проверьте соединение с сервером.');
    }
  };

  const handleJoin = async () => {
    setError(null);
    if (!joinCode.trim()) return;
    try {
      const joined = await clientRef.current.joinRoom(joinCode.trim(), nickname || 'Игрок');
      attachRoom(joined);
    } catch {
      setError('Комната не найдена или игра уже началась.');
    }
  };

  const copyInviteLink = () => {
    if (!room) return;
    const link = `${location.origin}${location.pathname}?room=${room.roomId}`;
    navigator.clipboard.writeText(link).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  };

  if (!room || !lobby) {
    return (
      <div className="screen">
        <div className="screen__panel">
          <Brand subtitle="Игра онлайн" />

          <div className="dialog__panel lobbycard">
            <input
              className="field"
              placeholder="Ваше имя"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={24}
            />

            <Button tone="gold" size="lg" block onClick={handleCreate}>
              <CirclePlus size={18} /> Создать комнату
            </Button>

            <div className="lobby__divider">
              <span>или</span>
            </div>

            <div className="lobby__joinrow">
              <input
                className="field"
                placeholder="Код комнаты"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
              />
              <Button tone="calm" onClick={handleJoin}>
                <LogIn size={16} /> Войти
              </Button>
            </div>

            {error && <div className="notice notice--danger">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  const isHost = room.sessionId === lobby.hostSessionId;
  const hostPlayerId = lobby.seats[0]?.playerId;
  const emptySeatCount = Math.max(0, MAX_SEATS - lobby.seats.length);

  return (
    <div className="screen">
      <div className="screen__panel">
        <Brand subtitle="Комната ожидания" />

        <div className="dialog__panel lobbycard">
          <div className="lobby__roomhead">
            <span className="eyebrow">Код комнаты</span>
            <button
              type="button"
              className="roomcode"
              onClick={copyInviteLink}
              title="Скопировать ссылку для друзей"
            >
              <span className="roomcode__code">{room.roomId}</span>
              {linkCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <p className="lobby__hint">
              {linkCopied ? 'Ссылка скопирована!' : 'Отправьте ссылку друзьям, чтобы они присоединились'}
            </p>
          </div>

          <ul className="seatlist">
            {lobby.seats.map(seat => (
              <li key={seat.playerId} className="seatrow">
                <span className="seatrow__avatar">
                  <Users size={16} />
                </span>
                <span className="seatrow__name">{seat.nickname}</span>
                {seat.playerId === hostPlayerId && (
                  <Tag tone="gold">
                    <Crown size={11} /> Хост
                  </Tag>
                )}
                {!seat.connected && <Tag tone="danger">Отключился</Tag>}
              </li>
            ))}
            {Array.from({ length: emptySeatCount }).map((_, i) => (
              <li key={`empty-${i}`} className="seatrow seatrow--empty">
                <span className="seatrow__avatar seatrow__avatar--empty">?</span>
                <span className="seatrow__name">Свободно</span>
                <Tag>Займёт бот</Tag>
              </li>
            ))}
          </ul>

          {isHost ? (
            <Button tone="gold" size="lg" block onClick={() => clientRef.current.startGame()}>
              Начать игру
            </Button>
          ) : (
            <div className="lobby__waiting">
              <span className="lobby__waiting-dot" />
              Ожидаем, пока хост начнёт игру…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
