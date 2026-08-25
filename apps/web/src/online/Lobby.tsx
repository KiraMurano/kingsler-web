import { useState, type ReactNode } from 'react';
import type { Room } from '@colyseus/sdk';
import { Check, Copy, Crown, LogIn, CirclePlus, Users, ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { onlineClient, type LobbyMessage } from './OnlineGameClient';
import { ROOM_CODE_LENGTH, sanitizeRoomCode } from './roomCode';
import { useToast } from '../lib/toast';
import '../styles/screen.css';

interface LobbyProps {
  onGameStarted: () => void;
  onExit: () => void;
}

const MAX_SEATS = 4;

function ScreenBack({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="iconbtn screen__back" onClick={onClick}>
      {children}
    </button>
  );
}

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

export function Lobby({ onGameStarted, onExit }: LobbyProps) {
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(() =>
    sanitizeRoomCode(new URLSearchParams(location.search).get('room') ?? '')
  );
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const showToast = useToast();

  const attachRoom = (newRoom: Room) => {
    newRoom.onMessage('lobby', (data: LobbyMessage) => {
      setLobby(data);
      if (data.phase === 'PLAYING') {
        onlineClient.bindStore();
        onGameStarted();
      }
    });
    setRoom(newRoom);
    newRoom.send('lobby');
  };

  const handleCreate = async () => {
    try {
      const created = await onlineClient.createRoom(nickname || 'Игрок');
      history.replaceState(null, '', `?room=${created.roomId}`);
      attachRoom(created);
    } catch {
      showToast('Не удалось создать комнату. Проверьте соединение с сервером.');
    }
  };

  const handleJoin = async () => {
    const code = sanitizeRoomCode(joinCode);
    if (code.length !== ROOM_CODE_LENGTH) return;
    try {
      const joined = await onlineClient.joinRoom(code, nickname || 'Игрок');
      attachRoom(joined);
    } catch {
      showToast('Комната не найдена или игра уже началась.');
    }
  };

  const copyInviteLink = () => {
    if (!room) return;
    const link = `${location.origin}${location.pathname}?room=${room.roomId}`;
    navigator.clipboard.writeText(link).then(
      () => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 1600);
      },
      () => showToast('Не удалось скопировать ссылку')
    );
  };

  if (!room || !lobby) {
    return (
      <div className="screen">
        <ScreenBack onClick={onExit}>
          <ArrowLeft size={15} /> Назад
        </ScreenBack>
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
                className="field field--roomcode"
                placeholder="Код комнаты"
                value={joinCode}
                onChange={e => setJoinCode(sanitizeRoomCode(e.target.value))}
                maxLength={ROOM_CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
              <Button tone="gold" size="lg" onClick={handleJoin} disabled={joinCode.length !== ROOM_CODE_LENGTH}>
                <LogIn size={18} /> Войти
              </Button>
            </div>
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
      <ScreenBack onClick={onExit}>
        <LogOut size={15} /> Выйти
      </ScreenBack>
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
            <Button tone="gold" size="lg" block onClick={() => onlineClient.startGame()}>
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
