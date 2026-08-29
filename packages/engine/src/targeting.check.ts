/**
 * Один предикат допустимых целей на весь проект: UI, боты и серверная
 * проверка в `performAction` спрашивают его, а не переписывают правила у себя.
 * Run: npx tsx packages/engine/src/targeting.check.ts
 */
import assert from 'node:assert/strict';
import type { Player } from './types.ts';
import { canBeTargetedBy } from './targeting.ts';
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

timerManager.clearAll();

console.log('targeting.check: ok');
