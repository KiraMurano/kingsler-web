import { useEffect, useState, type ReactNode } from 'react';
import type { Room } from '@colyseus/sdk';
import { Check, Copy, Crown, LogIn, CirclePlus, ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { onlineClient, type LobbyMessage } from './OnlineGameClient';
import { RulesEditor } from '../rules/RulesEditor';
import { DEFAULT_RULES, rulesProblems, type GameRules } from '@kinglier/engine/rules';
import { ROOM_CODE_LENGTH, sanitizeRoomCode } from './roomCode';
import { useToast } from '../lib/toast';
import '../styles/screen.css';
import '../styles/rules.css';

interface LobbyProps {
  onGameStarted: () => void;
  onExit: () => void;
  autoJoinRoomId: string | null;
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

export function Lobby({ onGameStarted, onExit, autoJoinRoomId }: LobbyProps) {
  const [joinCode, setJoinCode] = useState(() =>
    sanitizeRoomCode(new URLSearchParams(location.search).get('room') ?? '')
  );
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [restoring, setRestoring] = useState(!!autoJoinRoomId);
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

  useEffect(() => {
    if (!autoJoinRoomId) return;
    let cancelled = false;
    onlineClient
      .joinRoom(autoJoinRoomId)
      .then(joined => {
        if (!cancelled) attachRoom(joined);
      })
      .catch(() => {
        if (!cancelled) showToast('Не удалось восстановить прошлую партию.');
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    try {
      const created = await onlineClient.createRoom();
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
      const joined = await onlineClient.joinRoom(code);
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

  if (restoring) {
    return <div className="booting">СОЗЫВ ДВОРА</div>;
  }

  if (!room || !lobby) {
    return (
      <div className="screen">
        <ScreenBack onClick={onExit}>
          <ArrowLeft size={15} /> Назад
        </ScreenBack>
        <div className="screen__panel">
          <Brand subtitle="Игра онлайн" />

          <div className="dialog__panel lobbycard">
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
  /* Комната могла быть создана прошлой версией клиента — тогда правил в
     снапшоте нет, и падать из-за этого лобби не должно. */
  const rules: GameRules = lobby.rules ?? DEFAULT_RULES;
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
                  <img src={seat.avatar} alt="" />
                </span>
                <span className="seatrow__identity">
                  <span className="seatrow__title">{seat.title}</span>
                  <span className="seatrow__name">{seat.nickname}</span>
                </span>
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

          {/* Правила видит весь стол, а правит только хост: играть по ним всем,
              и узнавать о них в первом же ходу — плохая шутка. */}
          <RulesEditor
            rules={rules}
            readOnly={!isHost}
            onChange={next => onlineClient.sendRules(next)}
          />

          {isHost ? (
            <Button
              tone="gold"
              size="lg"
              block
              disabled={rulesProblems(rules).length > 0}
              onClick={() => onlineClient.startGame()}
            >
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
