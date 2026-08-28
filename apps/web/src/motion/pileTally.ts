/**
 * Сколько карт ещё летит в угол.
 *
 * Счётчик под стопкой читал длину массива из стора, а движок кладёт карту в
 * сброс в тот же миг, когда решает её судьбу: «Сброс: 0» становилось «1»
 * задолго до того, как карта долетала. Логически верно, на столе — враньё:
 * подпись обгоняла картинку.
 *
 * Поэтому стопка считает не то, что в состоянии, а то, что доехало. Слой карт
 * — единственный, кто знает, где карта на самом деле: он отмечает здесь начало
 * перелёта в угол и его конец, а `CardPiles` вычитает летящие из числа в сторе.
 *
 * Реестр модульный и живёт вне React намеренно: отмечает его кадровый цикл
 * `CardLayer`, до шестидесяти раз в секунду, и заводить на это состояние
 * компонента значило бы перерисовывать дерево на каждый кадр. Сюда пишут
 * только на переходах, и только тогда дёргаются подписчики.
 */
import { useSyncExternalStore } from 'react';
import type { CardId } from '@kinglier/engine/cardInstance';

/** Углы стола, у которых есть счётчик. */
export type PileKind = 'deck' | 'discard';

const flying: Record<PileKind, Set<CardId>> = { deck: new Set(), discard: new Set() };
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Карта отправилась в этот угол. */
export function markFlyingToPile(kind: PileKind, id: CardId): void {
  if (flying[kind].has(id)) return;
  flying[kind].add(id);
  notify();
}

/** Карта долетела — или передумала лететь и ушла в другую зону. */
export function markLandedAtPile(kind: PileKind, id: CardId): void {
  if (!flying[kind].delete(id)) return;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Сколько карт сейчас в пути к этому углу. */
export function usePileArrivals(kind: PileKind): number {
  return useSyncExternalStore(
    subscribe,
    () => flying[kind].size,
    () => 0
  );
}
