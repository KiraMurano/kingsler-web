/**
 * Search Chambers: play only when urgent, otherwise hold for a role / bluff.
 * Run: node --experimental-strip-types src/engine/bot/botTargeting.check.ts
 */
import assert from 'node:assert/strict';
import type { Player } from '../types.ts';
import {
  shouldPlaySearchNow,
  shouldActivateConspiracyNow,
  selectBestConspiracyTarget,
  selectBestRedirectionTarget
} from './botTargeting.ts';
import { mintDeck } from '../cardInstance.ts';
import type { Coronation } from '../resolvers/coronation.ts';

function player(partial: Partial<Player> & Pick<Player, 'id' | 'name'>): Player {
  return {
    avatar: '',
    seatNumber: 1,
    isBot: true,
    gold: 4,
    favor: 3,
    seals: 0,
    actionTokens: 2,
    hand: mintDeck(['Обыск покоев', 'Право вето']),
    activePlot: null,
    ...partial
  };
}

const bot = player({ id: 'b1', name: 'Бот' });
const rival = player({
  id: 'p2',
  name: 'Анна',
  seatNumber: 2,
  isBot: false,
  activePlot: { id: 'x', type: 'Тайный заговор', charges: 3 }
});
const ctx = {
  players: [bot, rival],
  activePlayerId: bot.id,
  coronations: [] as Coronation[]
};

assert.equal(shouldPlaySearchNow(bot, rival, ctx, () => 1), true);

const atFive = player({ ...bot, favor: 5 });
assert.equal(
  shouldPlaySearchNow(
    atFive,
    player({ ...rival, activePlot: { id: 'd', type: 'Досье' } }),
    { ...ctx, players: [atFive, rival] },
    () => 0
  ),
  false
);

const next = player({
  id: 'p2',
  name: 'Анна',
  seatNumber: 2,
  isBot: false,
  activePlot: { id: 'r', type: 'Королевский приём' }
});
assert.equal(
  shouldPlaySearchNow(bot, next, { ...ctx, players: [bot, next] }, () => 1),
  true
);

const crowned = player({
  ...rival,
  activePlot: { id: 'b', type: 'Золотая булла' }
});
assert.equal(
  shouldPlaySearchNow(bot, crowned, { ...ctx, players: [bot, crowned], coronations: [{ candidateId: crowned.id, originId: crowned.id }] }, () => 1),
  true
);

const withHeir = player({ ...bot, hand: mintDeck(['Обыск покоев', 'Наследник']) });
const weak = player({
  ...rival,
  favor: 2,
  activePlot: { id: 'd', type: 'Досье' }
});
assert.equal(
  shouldPlaySearchNow(withHeir, weak, { ...ctx, players: [withHeir, weak] }, () => 0),
  false
);

const noRole = player({ id: 'b1', name: 'Бот', hand: mintDeck(['Обыск покоев', 'Право вето']) });
const rich = player({ id: 'p2', name: 'Анна', gold: 5, favor: 2 });

/* Заговор разряжается только на полных 4 зарядах: частичных ударов в правилах
   больше нет, поэтому на 1–3 зарядах бот ждёт независимо от всего остального. */
for (const charges of [0, 1, 2, 3]) {
  assert.equal(
    shouldActivateConspiracyNow(noRole, player({ ...rich, favor: 5 }), charges, null, () => 0),
    false,
    `на ${charges} зарядах Заговор не разряжается даже по лидеру`
  );
}

// Полный заряд по цели с коронами — бить.
assert.equal(
  shouldActivateConspiracyNow(noRole, player({ ...rich, favor: 4 }), 4, [], () => 0),
  true
);

// Срыв круга коронации — бить, даже с выигрышной ролью на руках.
assert.equal(
  shouldActivateConspiracyNow(
    player({ ...noRole, hand: mintDeck(['Наследник', 'Шут']) }),
    player({ ...rich, gold: 4, favor: 1 }),
    4,
    [],
    () => 0
  ),
  true
);

// Держатель «Охранной грамоты» — законная цель: удар сожжёт грамоту.
assert.equal(
  shouldActivateConspiracyNow(
    noRole,
    player({
      ...rich,
      favor: 0,
      gold: 0,
      activePlot: { id: 'ch', cardId: 'c1', type: 'Охранная грамота' }
    }),
    4,
    [],
    () => 1
  ),
  true,
  'по грамоте бьём, даже когда отнимать больше нечего'
);

// Сам на пороге победы — не тратить ход на Заговор.
assert.equal(
  shouldActivateConspiracyNow(player({ ...noRole, favor: 5 }), player({ ...rich, favor: 4 }), 4, [], () => 1),
  false
);

const poorLeader = player({ id: 'a', name: 'Лидер', favor: 5, gold: 0 });
const fat = player({ id: 'b', name: 'Богач', favor: 1, gold: 6 });
assert.equal(selectBestConspiracyTarget([fat, poorLeader], 4)?.id, 'a');

const attacker = player({ id: 'atk', name: 'Атакующий' });
const brokeTarget = player({ id: 'p2', name: 'Бедняк', gold: 0, favor: 3 });
const richTarget = player({ id: 'p3', name: 'Богач', gold: 5, favor: 0 });
assert.equal(
  selectBestRedirectionTarget(attacker, brokeTarget, [richTarget], 'Вор')?.id,
  'p3',
  'Вор redirect must skip a target with no gold to steal'
);
assert.equal(
  selectBestRedirectionTarget(attacker, brokeTarget, [richTarget], 'Шантажист')?.id,
  undefined,
  'Шантажист redirect must skip a target with no crowns to steal'
);

console.log('botTargeting.check: ok');
