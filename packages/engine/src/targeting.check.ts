/**
 * Один предикат допустимых целей на весь проект: UI, боты и серверная
 * проверка в `performAction` спрашивают его, а не переписывают правила у себя.
 * Run: npx tsx packages/engine/src/targeting.check.ts
 */
import assert from 'node:assert/strict';
import type { Player } from './types.ts';
import { canBeTargetedBy, canBeTargetedByInstant } from './targeting.ts';
import { mintCard } from './cardInstance.ts';
import { useGameStore } from './GameStore.ts';
import { timerManager } from './utils/timerManager.ts';

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: partial.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 3,
    favor: 3,
    seals: 0,
    actionTokens: 2,
    hand: [],
    activePlot: null,
    ...partial
  };
}

const guard = { id: 'x', cardId: 'c1', type: 'Стража покоев' as const };
const charter = { id: 'y', cardId: 'c2', type: 'Охранная грамота' as const };

// --- Обычная цель доступна обеим атакующим ролям ---
{
  const rich = player({ id: 'p1' });
  assert.equal(canBeTargetedBy(rich, 'Вор'), true);
  assert.equal(canBeTargetedBy(rich, 'Шантажист'), true);
}

// --- Пустая казна закрыта для Вора ---
{
  const broke = player({ id: 'p1', gold: 0 });
  assert.equal(canBeTargetedBy(broke, 'Вор'), false, 'Вора нельзя на игрока с 0 🪙');
  assert.equal(canBeTargetedBy(broke, 'Шантажист'), true, 'короны у него есть');
}

// --- Ноль корон закрыт для Шантажиста ---
{
  const pauper = player({ id: 'p1', favor: 0 });
  assert.equal(canBeTargetedBy(pauper, 'Шантажист'), false, 'Шантажиста нельзя на игрока с 0 👑');
  assert.equal(canBeTargetedBy(pauper, 'Вор'), true, 'золото у него есть');
}

// --- Стража покоев отшивает обе атакующие роли ---
{
  const guarded = player({ id: 'p1', activePlot: guard });
  assert.equal(canBeTargetedBy(guarded, 'Вор'), false, 'Стража отшивает Вора');
  assert.equal(canBeTargetedBy(guarded, 'Шантажист'), false, 'Стража отшивает Шантажиста');
}

// --- Стража не мешает неатакующим ролям ---
{
  const guarded = player({ id: 'p1', activePlot: guard });
  assert.equal(canBeTargetedBy(guarded, 'Наследник'), true);
  assert.equal(canBeTargetedBy(guarded, 'Казначей'), true);
  assert.equal(canBeTargetedBy(guarded, 'Рыцарь'), true);
  assert.equal(canBeTargetedBy(guarded, 'Шут'), true);
}

// --- Охранная грамота отводит Шантажиста, но не Вора ---
{
  const chartered = player({ id: 'p1', activePlot: charter });
  assert.equal(
    canBeTargetedBy(chartered, 'Шантажист'),
    false,
    'Шантажист заведомо ничего не отнимет — целью держатель грамоты не выбирается'
  );
  assert.equal(canBeTargetedBy(chartered, 'Вор'), true, 'грамота держит короны, а не золото');
  assert.equal(canBeTargetedBy(chartered, 'Наследник'), true, 'неатакующим ролям грамота не помеха');
}

// ==========================================================================
// Заслонка в `performAction`: предикат обязан стоять и на сервере, а не только
// красить места в UI. Клиент присылает цель как есть — `KinglierRoom` стампует
// только `actorId`.
// ==========================================================================

function seatTable(victim: Partial<Player>): { actorId: string; victimId: string } {
  useGameStore.getState().startGame();
  const state = useGameStore.getState();
  const actorId = state.players[0].id;
  const victimId = state.players[1].id;
  useGameStore.setState({
    opening: null,
    activePlayerId: actorId,
    turnPhase: 'IDLE',
    turnSubPhase: 'CARD_PLAY_PHASE',
    players: state.players.map((p, i) =>
      i === 1 ? { ...p, ...victim } : { ...p, actionTokens: 2 }
    )
  });
  return { actorId, victimId };
}

function attack(actorId: string, victimId: string, roleClaim: 'Вор' | 'Шантажист'): boolean {
  const before = useGameStore.getState().players.find(p => p.id === actorId)!.actionTokens;
  useGameStore.getState().performAction({
    type: 'role',
    name: roleClaim,
    actorId,
    targetId: victimId,
    roleClaim,
    costGold: 0,
    costTokens: 1,
    description: `Заявляет «${roleClaim}».`
  });
  const after = useGameStore.getState().players.find(p => p.id === actorId)!.actionTokens;
  timerManager.clearAll();
  return after < before; // жетон списан => заявка принята
}

// Вор на пустую казну — починенный баг: раньше UI это пропускал.
{
  const { actorId, victimId } = seatTable({ gold: 0, favor: 3, activePlot: null });
  assert.equal(attack(actorId, victimId, 'Вор'), false, 'Вора нельзя объявить на игрока с 0 🪙');
}

// Шантажист на ноль корон.
{
  const { actorId, victimId } = seatTable({ gold: 3, favor: 0, activePlot: null });
  assert.equal(attack(actorId, victimId, 'Шантажист'), false, 'Шантажиста нельзя на игрока с 0 👑');
}

// Стража покоев отшивает обоих на уровне движка.
{
  const { actorId, victimId } = seatTable({ gold: 3, favor: 3, activePlot: guard });
  assert.equal(attack(actorId, victimId, 'Вор'), false, 'движок отклоняет Вора под Стражей');
}
{
  const { actorId, victimId } = seatTable({ gold: 3, favor: 3, activePlot: guard });
  assert.equal(attack(actorId, victimId, 'Шантажист'), false, 'движок отклоняет Шантажиста под Стражей');
}

// Грамота отшивает Шантажиста, но Вора пускает.
{
  const { actorId, victimId } = seatTable({ gold: 3, favor: 3, activePlot: charter });
  assert.equal(attack(actorId, victimId, 'Шантажист'), false, 'движок отклоняет Шантажиста под Грамотой');
}
{
  const { actorId, victimId } = seatTable({ gold: 3, favor: 3, activePlot: charter });
  assert.equal(attack(actorId, victimId, 'Вор'), true, 'Вор под Грамотой проходит: золото она не держит');
}

// Обычная цель по-прежнему атакуема — заслонка не глушит игру целиком.
{
  const { actorId, victimId } = seatTable({ gold: 3, favor: 3, activePlot: null });
  assert.equal(attack(actorId, victimId, 'Шантажист'), true, 'обычная цель атакуема');
}

// --- «Обыск покоев» не играется по игроку без интриги ---
//
// Он сбрасывает активную интригу цели, и против пустого места не делает
// ничего: резолвер честно писал в летопись «не сработал», но карта к тому
// моменту была уже сброшена, а жетон списан. Боты это правило знали всегда
// (`selectBestSearchTarget` отбирает только тех, у кого интрига есть) — не
// знали интерфейс и движок.
{
  assert.equal(
    canBeTargetedByInstant(player({ id: 'p1', activePlot: null }), 'Обыск покоев'),
    false,
    'обыскивать нечего'
  );
  assert.equal(
    canBeTargetedByInstant(player({ id: 'p1', activePlot: guard }), 'Обыск покоев'),
    true,
    'а вот лежащую интригу — есть'
  );
  /* «Дворцовый переполох» меняет руку — она есть у любого, и пустой цели у
     него не бывает. «Перенаправление» свои ограничения проверяет на месте
     вызова: они про перевод удара, а не про цель саму по себе. */
  for (const instant of ['Дворцовый переполох', 'Перенаправление'] as const) {
    assert.equal(
      canBeTargetedByInstant(player({ id: 'p1', activePlot: null }), instant),
      true,
      `${instant} цель не перебирает`
    );
  }
}

// --- «Обвинение в измене» не играется туда, где короны не отнять ---
//
// Та же дыра и то же лечение: против 0 👑 и против «Охранной грамоты» оно
// печатало в летопись «не сработало», уже потратив карту и жетон.
{
  const обвинение = 'Обвинение в измене' as const;
  assert.equal(
    canBeTargetedByInstant(player({ id: 'p1', favor: 0, activePlot: null }), обвинение),
    false,
    'у цели нечего отнимать'
  );
  assert.equal(
    canBeTargetedByInstant(player({ id: 'p1', favor: 3, activePlot: charter }), обвинение),
    false,
    'грамота держит корону — обвинение уходит впустую'
  );
  assert.equal(
    canBeTargetedByInstant(player({ id: 'p1', favor: 3, activePlot: null }), обвинение),
    true,
    'обычная цель обвиняема'
  );
  /* А «Стража покоев» обвинению не помеха: она держит только Вора и
     Шантажиста (RULES.md §8). */
  assert.equal(
    canBeTargetedByInstant(player({ id: 'p1', favor: 3, activePlot: guard }), обвинение),
    true,
    'Стража не защищает от обвинения'
  );
}

// И движок отбивает такой ход, а не только прячет цель в интерфейсе: сюда же
// приходят ходы по сети.
{
  const { actorId, victimId } = seatTable({ activePlot: null });
  const handBefore = useGameStore.getState().players.find(p => p.id === actorId)!.hand.length;
  const searchCard = mintCard('Обыск покоев');
  useGameStore.setState({
    players: useGameStore.getState().players.map(p =>
      p.id === actorId ? { ...p, hand: [...p.hand, searchCard] } : p
    )
  });
  const tokensBefore = useGameStore.getState().players.find(p => p.id === actorId)!.actionTokens;

  useGameStore.getState().playInstant(actorId, 'Обыск покоев', searchCard.id, victimId);

  const actor = useGameStore.getState().players.find(p => p.id === actorId)!;
  assert.equal(actor.actionTokens, tokensBefore, 'жетон не списан');
  assert.equal(
    actor.hand.length,
    handBefore + 1,
    'карта осталась на руках: движок отверг ход, а не сжёг «Обыск покоев»'
  );
  timerManager.clearAll();
}

// А по игроку с интригой — играется как обычно.
{
  const { actorId, victimId } = seatTable({ activePlot: guard });
  const searchCard = mintCard('Обыск покоев');
  useGameStore.setState({
    players: useGameStore.getState().players.map(p =>
      p.id === actorId ? { ...p, hand: [...p.hand, searchCard] } : p
    )
  });
  const tokensBefore = useGameStore.getState().players.find(p => p.id === actorId)!.actionTokens;

  useGameStore.getState().playInstant(actorId, 'Обыск покоев', searchCard.id, victimId);

  assert.equal(
    useGameStore.getState().players.find(p => p.id === actorId)!.actionTokens,
    tokensBefore - 1,
    'обыск по живой интриге стоит жетона и проходит'
  );
  timerManager.clearAll();
}

timerManager.clearAll();

console.log('targeting.check: ok');
