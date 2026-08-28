/**
 * Ставит стол в дуэль — только для разработки.
 *
 * Дуэль в настоящей партии случается редко и не по заказу: нужно, чтобы бот
 * пошёл целевой атакой, а жертва ответила вызовом. Смотреть на анимацию
 * стычки, дожидаясь такого совпадения, невозможно, поэтому здесь она
 * собирается руками из того же состояния, которое построил бы движок.
 *
 * Ничего, кроме состояния, тумблер не трогает: те же поля, те же карты руки,
 * тот же `turnPhase`. Слой карт не знает, что дуэль поддельная.
 */
import { useGameStore } from '@kinglier/engine/GameStore';
import type { Player } from '@kinglier/engine/types';

/** Кто с кем: атакующий — первый, у кого есть карта, защитник — следующий. */
function pair(players: Player[]): { attacker: Player; defender: Player } | null {
  const attacker = players.find(p => p.hand.length > 0);
  const defender = players.find(p => p.id !== attacker?.id && p.hand.length > 0);
  return attacker && defender ? { attacker, defender } : null;
}

/** Развести карты по дуэльным слотам и открыть окно атакующего. */
export function startDevDuel(): void {
  const state = useGameStore.getState();
  const sides = pair(state.players);
  if (!sides) return;

  const { attacker, defender } = sides;
  useGameStore.setState({
    activePlayerId: attacker.id,
    turnPhase: 'DUEL_ATTACKER_WINDOW',
    duelOutcome: null,
    revealOutcome: null,
    overlayInstant: null,
    pendingDuelDefenderCardId: defender.hand[0].id,
    pendingDuelDefenderRoleClaim: 'Казначей',
    pendingAction: {
      id: 'dev-duel',
      type: 'role',
      name: 'Вор',
      roleClaim: 'Вор',
      actorId: attacker.id,
      targetId: defender.id,
      stakedCardId: attacker.hand[0].id,
      costGold: 0,
      costTokens: 1,
      description: 'Учебная дуэль для отладки анимации.'
    }
  });
}

/** Вернуть стол в спокойное состояние. */
export function endDevDuel(): void {
  useGameStore.setState({
    turnPhase: 'IDLE',
    pendingAction: null,
    pendingDuelDefenderCardId: null,
    pendingDuelDefenderRoleClaim: null,
    duelOutcome: null
  });
}
