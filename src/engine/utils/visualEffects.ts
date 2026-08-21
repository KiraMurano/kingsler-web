import type { GameCard, Role, GameState } from '../types';

type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export function triggerResourceFloat(
  set: StateSetter,
  playerId: string,
  text: string,
  isGain: boolean
): void {
  const id = Math.random().toString(36).substring(7);
  set(state => ({
    floatingResourceEvents: [...state.floatingResourceEvents, { id, playerId, text, isGain }]
  }));

  window.setTimeout(() => {
    set(state => ({
      floatingResourceEvents: state.floatingResourceEvents.filter(e => e.id !== id)
    }));
  }, 2400);
}

export function triggerSingleCardFlight(
  set: StateSetter,
  flightType: 'to_discard' | 'to_hand' | 'to_plot',
  actorId?: string,
  roleClaim?: Role,
  revealedRole?: GameCard,
  wasTruth?: boolean
): void {
  const id = Math.random().toString(36).substring(7);
  set({
    hasCardDeparted: true,
    cardFlightEvent: {
      id,
      isDuel: false,
      flightType,
      actorId,
      roleClaim,
      revealedRole,
      wasTruth
    }
  });

  window.setTimeout(() => {
    set({
      cardFlightEvent: null
    });
  }, 850);
}

export function triggerDuelCardFlight(
  set: StateSetter,
  attackerFlight: 'to_discard' | 'to_hand',
  attackerId: string,
  defenderFlight: 'to_discard' | 'to_hand',
  defenderId: string,
  attackerRevealedRole?: GameCard,
  attackerWasTruth?: boolean,
  defenderRevealedRole?: GameCard,
  defenderWasTruth?: boolean
): void {
  const id = Math.random().toString(36).substring(7);
  set({
    hasCardDeparted: true,
    cardFlightEvent: {
      id,
      isDuel: true,
      attackerFlight,
      attackerId,
      attackerRevealedRole,
      attackerWasTruth,
      defenderFlight,
      defenderId,
      defenderRevealedRole,
      defenderWasTruth
    }
  });

  window.setTimeout(() => {
    set({
      cardFlightEvent: null
    });
  }, 850);
}
