import { useEffect, useRef, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import { Button } from '../components/ui/Button';
import { OnlineGameClient, type LobbyMessage } from './OnlineGameClient';
import { bindOnlineStore } from './bindOnlineStore';
import './lobby.css';

interface LobbyProps {
  onGameStarted: () => void;
}

export function Lobby({ onGameStarted }: LobbyProps) {
  const clientRef = useRef<OnlineGameClient>(new OnlineGameClient());
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(location.search).get('room') ?? '');
  const [lobby, setLobby] = useState<LobbyMessage | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!room) return;
    room.onMessage('lobby', (data: LobbyMessage) => {
      setLobby(data);
      if (data.phase === 'PLAYING') {
        bindOnlineStore(room);
        onGameStarted();
      }
    });
  }, [room, onGameStarted]);

  const handleCreate = async () => {
    setError(null);
    try {
      const created = await clientRef.current.createRoom(nickname || 'Игрок');
      history.replaceState(null, '', `?room=${created.roomId}`);
      setRoom(created);
    } catch {
      setError('Не удалось создать комнату. Проверьте соединение с сервером.');
    }
  };

  const handleJoin = async () => {
    setError(null);
    if (!joinCode.trim()) return;
    try {
      const joined = await clientRef.current.joinRoom(joinCode.trim(), nickname || 'Игрок');
      setRoom(joined);
    } catch {
      setError('Комната не найдена или игра уже началась.');
    }
  };

  if (!room || !lobby) {
    return (
      <div className="lobby">
        <h1 className="lobby__title">👑 KINGLIER ONLINE</h1>
        <input
          className="lobby__input"
          placeholder="Ваше имя"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={24}
        />
        <div className="lobby__row">
          <Button tone="gold" block onClick={handleCreate}>Создать комнату</Button>
        </div>
        <div className="lobby__row">
          <input
            className="lobby__input"
            placeholder="Код комнаты"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
          />
          <Button tone="calm" onClick={handleJoin}>Войти</Button>
        </div>
        {error && <p className="lobby__error">{error}</p>}
      </div>
    );
  }

  const isHost = room.sessionId === lobby.hostSessionId;

  return (
    <div className="lobby">
      <h1 className="lobby__title">Комната {room.roomId}</h1>
      <p className="lobby__hint">
        Ссылка для друзей: {location.origin}{location.pathname}?room={room.roomId}
      </p>
      <ul className="lobby__seats">
        {lobby.seats.map(seat => (
          <li key={seat.playerId}>{seat.nickname}{seat.connected ? '' : ' (отключился)'}</li>
        ))}
        {Array.from({ length: 4 - lobby.seats.length }).map((_, i) => (
          <li key={`empty-${i}`} className="lobby__seat--empty">Свободно (займёт бот)</li>
        ))}
      </ul>
      {isHost
        ? <Button tone="gold" onClick={() => clientRef.current.startGame()}>Начать игру</Button>
        : <p>Ожидаем, пока хост начнёт игру…</p>}
    </div>
  );
}
