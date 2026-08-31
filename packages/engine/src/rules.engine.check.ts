/**
 * Правила партии реально управляют движком, а не лежат в состоянии мёртвым
 * грузом: порог победы, потолок корон, число жетонов.
 * Run: npx tsx packages/engine/src/rules.engine.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from './types.ts';
import { useGameStore } from './GameStore.ts';
import { resolveCoronationsAtTurnStart, survivingCoronations } from './resolvers/coronation.ts';
import { addSealsToPlayer } from './resolvers/sealsResolver.ts';
import { mintDeck } from './cardInstance.ts';
import { timerManager } from './utils/timerManager.ts';
import { duelPayment } from './resolvers/duelResolver.ts';
import { normalizeRules } from './rules.ts';

/** Партия на заданных правилах, ход у первого места, жребий снят. */
function table(rules: Parameters<typeof useGameStore.getState>[0] extends never ? never : object) {
  useGameStore.getState().startGame(undefined, rules);
  const state = useGameStore.getState();
  const meId = state.players[0].id;
  useGameStore.setState({
    opening: null,
    activePlayerId: meId,
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE'
  });
  return meId;
}

function patch(id: string, fields: Partial<Player>) {
  useGameStore.setState({
    players: useGameStore.getState().players.map(p => (p.id === id ? { ...p, ...fields } : p))
  });
}

function hand(cards: GameCard[]) {
  return mintDeck(cards);
}

// ==========================================================================
// Порог победы
// ==========================================================================

// --- Чистые функции получают порог параметром ---
{
  const players: Player[] = [
    { id: 'p1', name: 'p1', avatar: '', seatNumber: 1, isBot: false, gold: 0, favor: 3, seals: 0, actionTokens: 2, hand: [], activePlot: null }
  ];
  const circle = [{ candidateId: 'p1', originId: 'p1' }];
  assert.equal(resolveCoronationsAtTurnStart('p1', players, circle, 3).verdict.kind, 'win', 'на пороге 3 трёх корон хватает');
  assert.equal(resolveCoronationsAtTurnStart('p1', players, circle, 4).verdict.kind, 'abort', 'на пороге 4 — нет');

  assert.deepEqual(survivingCoronations(circle, 'p1', 2, 3), [], 'ниже порога круг снят');
  assert.deepEqual(survivingCoronations(circle, 'p1', 3, 3), circle, 'на пороге круг держится');
}

// --- Круг коронации открывается на пороге из правил ---
for (const crownsToWin of [1, 5, 10]) {
  const meId = table({ crownsToWin });
  patch(meId, { favor: crownsToWin - 1, actionTokens: 2, hand: hand(['Наследник', 'Шут']) });
  useGameStore.setState({ coronations: [] });

  // Прямое начисление короны через печати: 2 ⚜️ = 1 👑.
  patch(meId, { seals: 1 });
  addSealsToPlayer(useGameStore.getState, useGameStore.setState, meId, 1);

  const after = useGameStore.getState();
  const me = after.players.find(p => p.id === meId)!;
  assert.equal(me.favor, crownsToWin, `порог ${crownsToWin}: корона добрана`);
  assert.deepEqual(
    after.coronations.map(c => c.candidateId),
    [meId],
    `порог ${crownsToWin}: круг коронации открыт`
  );
  timerManager.clearAll();
}

// --- Потолок корон равен порогу ---
{
  const meId = table({ crownsToWin: 3 });
  patch(meId, { favor: 3, seals: 1 });
  addSealsToPlayer(useGameStore.getState, useGameStore.setState, meId, 5);
  const me = useGameStore.getState().players.find(p => p.id === meId)!;
  assert.equal(me.favor, 3, 'выше порога корон не набрать');
  timerManager.clearAll();
}

// --- Ниже порога круг срывается ---
{
  const meId = table({ crownsToWin: 4 });
  const victim = useGameStore.getState().players[1].id;
  patch(victim, { favor: 4 });
  useGameStore.setState({ coronations: [{ candidateId: victim, originId: meId }] });

  // Прямая потеря короны через тот же путь, что и все атаки.
  const { loseCrowns } = await import('./resolvers/crownLoss.ts');
  loseCrowns(useGameStore.getState, useGameStore.setState, victim, 1, 'проверки');
  assert.deepEqual(useGameStore.getState().coronations, [], 'круг сорван падением ниже порога');
  timerManager.clearAll();
}

// ==========================================================================
// Жетоны хода
// ==========================================================================

for (const actionTokens of [1, 2, 5]) {
  const meId = table({ actionTokens });
  const me = useGameStore.getState().players.find(p => p.id === meId)!;
  assert.equal(me.actionTokens, actionTokens, `старт с ${actionTokens} ⚡`);
  timerManager.clearAll();
}

// --- Восполнение в начале хода идёт до значения из правил ---
{
  const meId = table({ actionTokens: 4 });
  const state = useGameStore.getState();
  const nextId = state.players[1].id;
  patch(nextId, { actionTokens: 0 });

  /* Ход передаётся нажатием, а не сам: истраченные жетоны его больше не
     заканчивают (см. `resolvers/turnHandover.check.ts`). Здесь проверяется
     восполнение на входе в следующий ход, а не то, чем предыдущий кончился, —
     поэтому ход отдаётся тем же способом, что и в игре. */
  patch(meId, { actionTokens: 0 });
  useGameStore.getState().endTurnManually();

  const active = useGameStore.getState().players.find(
    p => p.id === useGameStore.getState().activePlayerId
  )!;
  assert.equal(active.actionTokens, 4, 'жетоны восполнены до значения из правил');
  timerManager.clearAll();
}

// ==========================================================================
// Экономика: пир, слух, шантаж
// ==========================================================================

/** Заявляет действие от лица `meId` и говорит, приняли ли его. */
function acted(meId: string, action: Parameters<ReturnType<typeof useGameStore.getState>['performAction']>[0]): boolean {
  const before = useGameStore.getState().players.find(p => p.id === meId)!;
  useGameStore.getState().performAction(action);
  const after = useGameStore.getState().players.find(p => p.id === meId)!;
  timerManager.clearAll();
  return after.actionTokens < before.actionTokens;
}

// --- Пир стоит feastCost и заперт на crownsToWin - 1 ---
{
  const meId = table({ feastCost: 7, crownsToWin: 6 });
  patch(meId, { gold: 10, favor: 0 });
  assert.equal(acted(meId, { type: 'normal', name: 'Устроить пир', actorId: meId, costGold: 7, costTokens: 1, description: '' }), true);
  assert.equal(useGameStore.getState().players.find(p => p.id === meId)!.gold, 3, 'списано 7 🪙');
}
{
  const meId = table({ feastCost: 2, crownsToWin: 6 });
  patch(meId, { gold: 10, favor: 5 });
  assert.equal(
    acted(meId, { type: 'normal', name: 'Устроить пир', actorId: meId, costGold: 2, costTokens: 1, description: '' }),
    false,
    'на crownsToWin - 1 короне пир заперт'
  );
}
{
  const meId = table({ feastCost: 2, crownsToWin: 6 });
  patch(meId, { gold: 1, favor: 0 });
  assert.equal(
    acted(meId, { type: 'normal', name: 'Устроить пир', actorId: meId, costGold: 2, costTokens: 1, description: '' }),
    false,
    'без золота пир недоступен'
  );
}

// --- Слух стоит rumorCost ---
{
  const meId = table({ rumorCost: 8 });
  const victim = useGameStore.getState().players[1].id;
  patch(meId, { gold: 9 });
  patch(victim, { favor: 2 });
  assert.equal(
    acted(meId, { type: 'normal', name: 'Распустить слух', actorId: meId, targetId: victim, costGold: 8, costTokens: 1, description: '' }),
    true
  );
  assert.equal(useGameStore.getState().players.find(p => p.id === meId)!.gold, 1, 'списано 8 🪙');
}

// --- Шантаж: цена списывается при заявлении ---
{
  const meId = table({ blackmailCost: 4 });
  const victim = useGameStore.getState().players[1].id;
  patch(meId, { gold: 6, hand: hand(['Шантажист', 'Шут']) });
  patch(victim, { favor: 3, gold: 3, activePlot: null });

  const staked = useGameStore.getState().players.find(p => p.id === meId)!.hand[0].id;
  assert.equal(
    acted(meId, {
      type: 'role', name: 'Шантажист', actorId: meId, targetId: victim,
      roleClaim: 'Шантажист', stakedCardId: staked, costGold: 0, costTokens: 1, description: ''
    }),
    true,
    'заявка принята'
  );
  assert.equal(
    useGameStore.getState().players.find(p => p.id === meId)!.gold,
    2,
    'цена шантажа списана при заявлении, ещё до всякой проверки'
  );
}

// --- Шантаж: не хватает золота — заявка отклоняется даже блефом ---
{
  const meId = table({ blackmailCost: 5 });
  const victim = useGameStore.getState().players[1].id;
  patch(meId, { gold: 4, hand: hand(['Шут', 'Наследник']) });
  patch(victim, { favor: 3, activePlot: null });

  const staked = useGameStore.getState().players.find(p => p.id === meId)!.hand[0].id;
  assert.equal(
    acted(meId, {
      type: 'role', name: 'Шантажист', actorId: meId, targetId: victim,
      roleClaim: 'Шантажист', stakedCardId: staked, costGold: 0, costTokens: 1, description: ''
    }),
    false,
    'блефовать Шантажистом без денег тоже нельзя'
  );
  assert.equal(useGameStore.getState().players.find(p => p.id === meId)!.gold, 4, 'ничего не списано');
}

// --- При нулевой цене шантаж бесплатен, как раньше ---
{
  const meId = table({ blackmailCost: 0 });
  const victim = useGameStore.getState().players[1].id;
  patch(meId, { gold: 0, hand: hand(['Шантажист', 'Шут']) });
  patch(victim, { favor: 3, activePlot: null });

  const staked = useGameStore.getState().players.find(p => p.id === meId)!.hand[0].id;
  assert.equal(
    acted(meId, {
      type: 'role', name: 'Шантажист', actorId: meId, targetId: victim,
      roleClaim: 'Шантажист', stakedCardId: staked, costGold: 0, costTokens: 1, description: ''
    }),
    true,
    'дефолтная нулевая цена ничего не меняет'
  );
}

// ==========================================================================
// Дуэль тратит жетон хода
// ==========================================================================

/** Ставит стол в окно реакции жертвы на атаку Шантажиста. */
async function underAttack(rules: object) {
  const meId = table(rules);
  const victim = useGameStore.getState().players[1].id;
  patch(meId, { gold: 9, hand: hand(['Шантажист', 'Шут']) });
  patch(victim, { favor: 3, activePlot: null, hand: hand(['Дуэлянт', 'Шут']) });

  const staked = useGameStore.getState().players.find(p => p.id === meId)!.hand[0].id;
  useGameStore.getState().performAction({
    type: 'role', name: 'Шантажист', actorId: meId, targetId: victim,
    roleClaim: 'Шантажист', stakedCardId: staked, costGold: 0, costTokens: 1, description: ''
  });
  assert.equal(useGameStore.getState().turnPhase, 'TARGET_REACTION_WINDOW', 'жертва в окне реакции');
  return victim;
}

// --- Тумблер включён: жетон списан ---
{
  const victim = await underAttack({ duelCostsToken: true });
  patch(victim, { actionTokens: 2 });
  const shield = useGameStore.getState().players.find(p => p.id === victim)!.hand[0].id;
  useGameStore.getState().targetDeclareDuel(victim, shield);
  assert.equal(useGameStore.getState().turnPhase, 'DUEL_CLASH', 'дуэль объявлена и разыгрывается сама');
  assert.equal(useGameStore.getState().players.find(p => p.id === victim)!.actionTokens, 1, 'жетон списан');
  timerManager.clearAll();
}

// --- Тумблер включён, жетонов нет: дуэль невозможна ---
{
  const victim = await underAttack({ duelCostsToken: true });
  patch(victim, { actionTokens: 0 });
  const shield = useGameStore.getState().players.find(p => p.id === victim)!.hand[0].id;
  useGameStore.getState().targetDeclareDuel(victim, shield);
  assert.equal(useGameStore.getState().turnPhase, 'TARGET_REACTION_WINDOW', 'без жетона щит не поднять');
  timerManager.clearAll();
}

// --- Тумблер выключен: дуэль бесплатна и доступна при 0 жетонов ---
{
  const victim = await underAttack({ duelCostsToken: false });
  patch(victim, { actionTokens: 0 });
  const shield = useGameStore.getState().players.find(p => p.id === victim)!.hand[0].id;
  useGameStore.getState().targetDeclareDuel(victim, shield);
  assert.equal(useGameStore.getState().turnPhase, 'DUEL_CLASH', 'бесплатная дуэль доступна без жетонов');
  assert.equal(useGameStore.getState().players.find(p => p.id === victim)!.actionTokens, 0, 'жетоны не ушли в минус');
  timerManager.clearAll();
}

// ==========================================================================
// Стоимость дуэли: три настройки, одна цена
// ==========================================================================
//
// Надбавка золотом, требование жетона и возможность заменить жетон золотом
// складываются в одну цену, и складываться должны в одном месте: порознь их
// уже пробовали, и меню на карте успело разойтись с движком.

/** Цена вызова при этих правилах для защитника с такими ресурсами. */
const price = (rules: object, tokens: number, gold: number) =>
  duelPayment(normalizeRules(rules), {
    id: 'd', name: 'Защитник', avatar: '', seatNumber: 1, isBot: false,
    gold, favor: 0, seals: 0, actionTokens: tokens, hand: [], activePlot: null
  });

// Надбавка независима от жетона: платится и вместо него, и вместе с ним.
assert.deepEqual(
  price({ duelCostsToken: false, duelCost: 1 }, 0, 1),
  { tokens: 0, gold: 1 },
  'жетон не нужен — дуэль за монету'
);
assert.deepEqual(
  price({ duelCostsToken: true, duelCost: 1 }, 2, 1),
  { tokens: 1, gold: 1 },
  'жетон нужен — за жетон И монету'
);
assert.equal(
  price({ duelCostsToken: false, duelCost: 1 }, 5, 0),
  null,
  'надбавку нечем платить — дуэли нет, сколько бы ни было жетонов'
);
assert.deepEqual(
  price({ duelCostsToken: true, duelCost: 0 }, 1, 0),
  { tokens: 1, gold: 0 },
  'без надбавки всё как раньше: один жетон'
);

/* Платная дуэль: жетона нет, его выкупает золото по СВОЕЙ цене — и надбавка
   платится сверх неё. Раньше цену занимала «Платная проверка», и включить
   выкуп щита нельзя было, не разрешив заодно покупать проверки. */
const paidDuel = { duelCostsToken: true, paidDuelEnabled: true, paidDuelCost: 2, duelCost: 1 };
assert.deepEqual(price(paidDuel, 1, 5), { tokens: 1, gold: 1 }, 'жетон есть — платит им');
assert.deepEqual(price(paidDuel, 0, 5), { tokens: 0, gold: 3 }, 'жетона нет — 2 за выкуп + 1 надбавка');
assert.equal(price(paidDuel, 0, 2), null, 'на выкуп не хватает — дуэли нет');

/* Цена выкупа своя и на цену проверки не смотрит вовсе. */
assert.deepEqual(
  price({ ...paidDuel, paidDoubtEnabled: true, paidDoubtCost: 9 }, 0, 5),
  { tokens: 0, gold: 3 },
  'дорогая проверка выкуп щита не удорожает'
);

/* Зависимость у «Платной дуэли» осталась одна, и держит её `normalizeRules`,
   а не экран: правила приходят от клиента-хоста, и верить им нельзя. */
assert.equal(
  normalizeRules({ ...paidDuel, duelCostsToken: false }).paidDuelEnabled,
  false,
  'без требования жетона выкупать нечего'
);
assert.equal(
  normalizeRules({ ...paidDuel, paidDoubtEnabled: false }).paidDuelEnabled,
  true,
  'а вот платная проверка ей больше не нужна: у выкупа своя цена'
);
assert.equal(normalizeRules({}).duelCost, 0, 'по умолчанию дуэль золота не стоит');

// --- И то же самое на живом столе: без жетона щит покупается ---
{
  const victim = await underAttack(paidDuel);
  patch(victim, { actionTokens: 0, gold: 6 });
  const shield = useGameStore.getState().players.find(p => p.id === victim)!.hand[0].id;
  useGameStore.getState().targetDeclareDuel(victim, shield);

  const after = useGameStore.getState();
  assert.equal(after.turnPhase, 'DUEL_CLASH', 'платная дуэль поднимает щит без жетона');
  assert.equal(after.players.find(p => p.id === victim)!.gold, 3, 'списаны 2 за выкуп + 1 надбавка');
  timerManager.clearAll();
}

console.log('rules.engine.check: ok');
