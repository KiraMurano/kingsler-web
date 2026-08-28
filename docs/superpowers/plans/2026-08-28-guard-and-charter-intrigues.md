# Стража покоев и Охранная грамота — план реализации (Фаза 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ввести в игру две новые интриги — «Стража покоев» (нельзя выбрать целью Вора и Шантажиста) и «Охранная грамота» (нельзя потерять короны, но и печати не идут).

**Architecture:** Потеря корон сегодня размазана по четырём резолверам, и каждый сам чинит круг коронации. Грамота требует свести это в одну функцию `loseCrowns`. Выбор цели продублирован в UI и в ботах, а на сервере не проверяется вовсе — Стража требует свести это в один предикат `canBeTargetedBy`. Оба рефактора делаются до карт, чтобы карты приземлялись в одну точку, а не в четыре.

**Tech Stack:** TypeScript, zustand (`GameStore`), монорепо npm workspaces. Тесты — исполняемые файлы `*.check.ts` рядом с кодом, запуск `npx tsx <файл>`, без тест-раннера.

## Global Constraints

- Весь пользовательский текст — на русском. Названия карт в коде — русские строковые литералы (`'Стража покоев'`), это ключи типа `GameCard`.
- Комментарии в движке пишутся по-русски там, где объясняют игровое правило или неочевидное решение; английский встречается в старом коде — не переписывать.
- Порог победы в этой фазе остаётся захардкоженной `6`. Его централизация — предмет Фазы 2. **Не трогать.**
- Тесты — файлы `*.check.ts` рядом с кодом. Каждый заканчивается строкой `console.log('<имя>.check: ok');`. Ассерты — `node:assert/strict`. Импорты внутри check-файлов идут с расширением `.ts`.
- Арты уже лежат на месте: `apps/web/public/assets/cards/intrigue-guard.webp` и `intrigue-protection.webp`. Новых картинок не создавать.
- Каждая задача заканчивается коммитом. Сообщения коммитов — по-русски, в формате `тип(область): описание`, как в истории репозитория.
- Спека: `docs/superpowers/specs/2026-08-28-guard-and-charter-intrigues-design.md`.

## Структура файлов

| Файл | Что делает | Задача |
|---|---|---|
| `packages/engine/src/data/cardDescriptions.ts` | Типы карт и их описания. **Изменяется:** +2 литерала в `PlotType`, +2 в `ALL_PLOTS`, +2 записи в `CARD_DESCRIPTIONS` | 1 |
| `packages/engine/src/cards.ts` | Сборка колоды. **Изменяется:** +2 записи в `CARD_COPIES_MAP` | 1 |
| `packages/engine/src/data/cardDescriptions.check.ts` | **Создаётся.** Полнота описаний и состав колоды | 1 |
| `packages/engine/src/resolvers/crownLoss.ts` | **Создаётся.** `loseCrowns` + `discardProtectiveIntrigueOnBluff` — единственное место, где короны уходят и где защита перестаёт работать | 2, 3, 6 |
| `packages/engine/src/resolvers/crownLoss.check.ts` | **Создаётся.** Тесты потери корон и грамоты | 2, 3, 5, 6 |
| `packages/engine/src/resolvers/normalActionResolver.ts` | Слух. **Изменяется:** переезд на `loseCrowns`, сжигание грамоты | 2, 5 |
| `packages/engine/src/resolvers/roleResolver.ts` | Шантажист. **Изменяется:** переезд на `loseCrowns`, кража ровно того, что снялось | 2 |
| `packages/engine/src/resolvers/instantResolver.ts` | Обвинение в измене, Перенаправление. **Изменяется:** переезд на `loseCrowns`, проверка цели при перенаправлении | 2, 7 |
| `packages/engine/src/resolvers/plotResolver.ts` | Тайный заговор. **Изменяется:** переезд на `loseCrowns` | 2 |
| `packages/engine/src/resolvers/sealsResolver.ts` | Печати. **Изменяется:** грамота гасит начисление | 4 |
| `packages/engine/src/resolvers/doubtResolver.ts` | Проверка «Не верю». **Изменяется:** сжигание защитной интриги пойманного | 6 |
| `packages/engine/src/resolvers/duelResolver.ts` | Дуэль. **Изменяется:** сжигание защитной интриги уличённых | 6 |
| `packages/engine/src/targeting.ts` | **Создаётся.** `canBeTargetedBy` — единственный источник правды о допустимых целях | 7 |
| `packages/engine/src/targeting.check.ts` | **Создаётся.** Тесты предиката целей | 7 |
| `packages/engine/src/GameStore.ts` | **Изменяется:** серверная проверка цели в `performAction`, устаревший комментарий про 44 карты | 1, 7 |
| `apps/web/src/components/SeatsRow.tsx` | **Изменяется:** `isValidTarget` переезжает на `canBeTargetedBy` | 7 |
| `packages/engine/src/bot/botTargeting.ts` | **Изменяется:** переезд на `canBeTargetedBy` | 7 |
| `packages/engine/src/bot/botTurnPlanner.ts` | **Изменяется:** боты выкладывают новые интриги | 8 |
| `packages/engine/src/bot/botReactions.ts` | **Изменяется:** не бояться Шантажиста под грамотой | 8 |
| `RULES.md` | **Изменяется:** §3 состав колоды, §8 две новые интриги | 9 |

---

### Task 1: Регистрация двух карт в колоде

Карты добавляются в данные и в состав колоды. Никаких эффектов пока нет — карту можно выложить, и она просто ляжет в слот интриги, ничего не делая. Это намеренно: эффекты приезжают отдельными задачами, каждая со своим тестом.

**Files:**
- Modify: `packages/engine/src/data/cardDescriptions.ts`
- Modify: `packages/engine/src/cards.ts:22-45`
- Modify: `packages/engine/src/GameStore.ts:121`
- Test: `packages/engine/src/data/cardDescriptions.check.ts` (создаётся)

**Interfaces:**
- Consumes: ничего.
- Produces: два новых литерала типа `PlotType` — `'Стража покоев'` и `'Охранная грамота'`. Все последующие задачи опираются ровно на эти строки.

- [ ] **Step 1: Написать падающий тест**

Создать `packages/engine/src/data/cardDescriptions.check.ts`:

```ts
/**
 * Колода описана полностью и сходится по числу карт: у каждой карты есть
 * запись описания и число копий, а `createInitialDeck` выдаёт ровно то, что
 * обещает `CARD_COPIES_MAP`.
 * Run: npx tsx packages/engine/src/data/cardDescriptions.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard } from './cardDescriptions.ts';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS, CARD_DESCRIPTIONS } from './cardDescriptions.ts';
import { CARD_COPIES_MAP, TOTAL_DECK_SIZE, createInitialDeck } from '../cards.ts';

const everyCard: GameCard[] = [...ALL_ROLES, ...ALL_PLOTS, ...ALL_INSTANTS];

for (const card of everyCard) {
  const info = CARD_DESCRIPTIONS[card];
  assert.ok(info, `у карты «${card}» нет записи в CARD_DESCRIPTIONS`);
  assert.equal(info.name, card, `запись «${card}» названа иначе: «${info.name}»`);
  assert.ok(info.artImage.endsWith('.webp'), `у карты «${card}» арт не webp: ${info.artImage}`);
  assert.ok(CARD_COPIES_MAP[card] >= 1, `у карты «${card}» нет числа копий`);
}

// Две новые интриги на месте, по 2 копии каждая.
for (const card of ['Стража покоев', 'Охранная грамота'] as const) {
  assert.ok(ALL_PLOTS.includes(card), `«${card}» не попала в ALL_PLOTS`);
  assert.equal(CARD_DESCRIPTIONS[card].category, 'plot', `«${card}» должна быть интригой`);
  assert.equal(CARD_COPIES_MAP[card], 2, `«${card}» должна идти в 2 копиях`);
}

assert.equal(TOTAL_DECK_SIZE, 51, 'колода 47 + 4 новые карты = 51');

const deck = createInitialDeck();
assert.equal(deck.length, TOTAL_DECK_SIZE, 'createInitialDeck расходится с TOTAL_DECK_SIZE');
for (const card of everyCard) {
  const minted = deck.filter(c => c.card === card).length;
  assert.equal(minted, CARD_COPIES_MAP[card], `«${card}»: в колоде ${minted}, обещано ${CARD_COPIES_MAP[card]}`);
}

const ids = new Set(deck.map(c => c.id));
assert.equal(ids.size, deck.length, 'id карт в колоде не уникальны');

console.log('cardDescriptions.check: ok');
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
npx tsx packages/engine/src/data/cardDescriptions.check.ts
```

Ожидается: падение на `«Стража покоев» не попала в ALL_PLOTS` (либо ошибка типов на строковом литерале — тоже засчитывается как красный тест).

- [ ] **Step 3: Добавить литералы в тип и в список интриг**

В `packages/engine/src/data/cardDescriptions.ts` расширить `PlotType`:

```ts
export type PlotType =
  | 'Королевский приём'
  | 'Чёрная книга'
  | 'Сеть информаторов'
  | 'Досье'
  | 'Золотая булла'
  | 'Тайный заговор'
  | 'Стража покоев'
  | 'Охранная грамота';
```

И `ALL_PLOTS`:

```ts
export const ALL_PLOTS: PlotType[] = [
  'Королевский приём',
  'Чёрная книга',
  'Сеть информаторов',
  'Досье',
  'Золотая булла',
  'Тайный заговор',
  'Стража покоев',
  'Охранная грамота'
];
```

- [ ] **Step 4: Добавить две записи описаний**

В `CARD_DESCRIPTIONS`, сразу после записи `'Тайный заговор'` (конец блока интриг), добавить:

```ts
  'Стража покоев': {
    name: 'Стража покоев',
    category: 'plot',
    title: 'Личный караул',
    themeColor: '#64748b',
    gradient: 'linear-gradient(180deg, #334155 0%, #1e293b 50%, #0f172a 100%)',
    borderColor: '#94a3b8',
    artImage: '/assets/cards/intrigue-guard.webp',
    shortDescription: 'Вас нельзя выбрать целью Вора и Шантажиста.',
    fullDescription: 'Пока карта лежит перед вами, вас нельзя выбрать целью «Вора» и «Шантажиста» — в том числе «Перенаправлением». НЕ защищает от «Распустить слух», «Обвинения в измене» и «Тайного заговора». Сбрасывается «Обыском покоев» или в тот момент, когда вас уличают в блефе.',
    strategyTip: 'Выкладывайте, когда набрали золото или короны и стали очевидной мишенью. Помните: слух за 5 🪙 и «Обвинение в измене» проходят насквозь.',
    loreQuote: '«Для вас меня сегодня нет. И завтра, пожалуй, тоже.»',
    cost: 0,
    targeted: false,
    copiesCount: 2
  },

  'Охранная грамота': {
    name: 'Охранная грамота',
    category: 'plot',
    title: 'Королевское заступничество',
    themeColor: '#a855f7',
    gradient: 'linear-gradient(180deg, #581c87 0%, #3b0764 50%, #0f172a 100%)',
    borderColor: '#d8b4fe',
    artImage: '/assets/cards/intrigue-protection.webp',
    shortDescription: 'Вы не теряете 👑, но и не получаете ⚜️.',
    fullDescription: 'Пока карта лежит перед вами, вы не можете потерять короны — ни от «Шантажиста», ни от «Обвинения в измене», ни от «Тайного заговора», ни от дуэли, ни от слуха. Цена защиты: вы не получаете королевских печатей ⚜️. Сбрасывается тремя способами: «Распустить слух» против вас (корону вы не теряете, но грамота сгорает), «Обыск покоев», или когда вас уличают в блефе.',
    strategyTip: 'Козырь фаворита в круге коронации: сбить вас можно будет только слухом за 5 🪙 или «Обыском покоев». Но пока грамота лежит, печати вам не идут — второй путь к короне закрыт.',
    loreQuote: '«Всё совершенно законно. Именно поэтому это так неприятно.»',
    cost: 0,
    targeted: false,
    copiesCount: 2
  },
```

- [ ] **Step 5: Добавить копии в состав колоды**

В `packages/engine/src/cards.ts` в `CARD_COPIES_MAP` заменить блок интриг:

```ts
  // 8 Интриг (7 типов × 2 + Тайный заговор × 3 = 17 карт)
  'Королевский приём': 2,
  'Чёрная книга': 2,
  'Сеть информаторов': 2,
  'Досье': 2,
  'Золотая булла': 2,
  'Тайный заговор': 3,
  'Стража покоев': 2,
  'Охранная грамота': 2,
```

- [ ] **Step 6: Поправить устаревший комментарий**

В `packages/engine/src/GameStore.ts:121` строка сейчас говорит про 44 карты, хотя колода давно считается из `CARD_COPIES_MAP`:

```ts
    const deck = createInitialDeck(); // состав считается из CARD_COPIES_MAP
```

- [ ] **Step 7: Запустить тесты и убедиться, что они проходят**

```bash
npx tsx packages/engine/src/data/cardDescriptions.check.ts
```

Ожидается: `cardDescriptions.check: ok`

Затем прогнать переписи карт, которые могли зависеть от состава колоды:

```bash
npx tsx packages/engine/src/resolvers/cardCensus.check.ts && npx tsx packages/engine/src/GameStore.seats.check.ts
```

Ожидается: обе строки `...check: ok`. `GameStore.seats.check.ts` считает колоду через `TOTAL_DECK_SIZE`, поэтому правок не требует.

- [ ] **Step 8: Коммит**

```bash
git add packages/engine/src/data/cardDescriptions.ts packages/engine/src/data/cardDescriptions.check.ts packages/engine/src/cards.ts packages/engine/src/GameStore.ts
git commit -m "feat(cards): две новые интриги — Стража покоев и Охранная грамота

Пока только регистрация в колоде: типы, описания, по 2 копии.
Эффекты приезжают следующими задачами. Колода 47 -> 51."
```

---

### Task 2: `loseCrowns` — потеря корон в одной точке

Чистый рефактор, поведение не меняется. Сейчас короны отнимаются в четырёх местах, и каждое само зовёт `fallenCoronationPatch`, само зовёт `_disruptPlayerPlotsOnLoss` и само рисует всплывашку. Грамота, добавленная в каждое по отдельности, гарантированно где-нибудь забудется.

**Files:**
- Create: `packages/engine/src/resolvers/crownLoss.ts`
- Test: `packages/engine/src/resolvers/crownLoss.check.ts` (создаётся)
- Modify: `packages/engine/src/resolvers/normalActionResolver.ts:37-52`
- Modify: `packages/engine/src/resolvers/roleResolver.ts:73-101`
- Modify: `packages/engine/src/resolvers/instantResolver.ts:261-289`
- Modify: `packages/engine/src/resolvers/plotResolver.ts:303-326`

**Interfaces:**
- Consumes: `PlotType` из Задачи 1.
- Produces:
  - `export type CrownLossResult = { kind: 'lost'; amount: number } | { kind: 'blocked_by_charter' } | { kind: 'no_crowns' }`
  - `export function loseCrowns(get, set, victimId: string, amount: number, reason: string, floatLabel?: string): CrownLossResult`

  Вариант `'blocked_by_charter'` объявляется уже здесь и до Задачи 3 недостижим. Это сделано намеренно: все четыре вызывающих места пишутся один раз и сразу разбирают три исхода, вместо того чтобы переписываться в следующей задаче.

  `reason` — существительное в родительном падеже (`'шантажа'`, `'обвинения в измене'`), оно подставляется и в срыв «Королевского приёма», и в строку о сорванной коронации. `floatLabel` — необязательный суффикс всплывашки (`'Измена!'`), чтобы не потерять флейвор, который сегодня пишут вызывающие.

- [ ] **Step 1: Написать падающий тест**

Создать `packages/engine/src/resolvers/crownLoss.check.ts`:

```ts
/**
 * Короны уходят ровно одним путём — через `loseCrowns`. Он же чинит круг
 * коронации, жжёт «Королевский приём» и знает про «Охранную грамоту».
 * Run: npx tsx packages/engine/src/resolvers/crownLoss.check.ts
 */
import assert from 'node:assert/strict';
import type { CardInstance, GameState, Player } from '../types.ts';
import { loseCrowns } from './crownLoss.ts';
import { disruptPlayerPlotsOnLoss } from './plotResolver.ts';

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: partial.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 2,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: [],
    activePlot: null,
    ...partial
  };
}

function makeHarness(players: Player[], overrides: Partial<GameState> = {}) {
  const api = {
    players,
    discardPile: [] as CardInstance[],
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    history: [] as string[],
    ...overrides
  } as unknown as GameState;

  const get = (): GameState => api;
  const set: Parameters<typeof loseCrowns>[1] = partial => {
    const patch = typeof partial === 'function' ? partial(api) : partial;
    Object.assign(api, patch);
  };

  // Резолверы зовут срыв интриг через метод стора; в лёгком стенде его
  // подменяет прямой вызов той же функции.
  (api as unknown as Record<string, unknown>)._disruptPlayerPlotsOnLoss =
    (victimId: string, reason: string) => disruptPlayerPlotsOnLoss(get, set, victimId, reason);

  return { api, get, set };
}

// --- 1. Обычная потеря короны ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1', favor: 3 })]);
  const result = loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.deepEqual(result, { kind: 'lost', amount: 1 });
  assert.equal(api.players[0].favor, 2, 'корона снята');
}

// --- 2. Больше, чем есть, снять нельзя ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1', favor: 1 })]);
  const result = loseCrowns(get, set, 'p1', 2, 'шантажа');
  assert.deepEqual(result, { kind: 'lost', amount: 1 }, 'снимается только то, что есть');
  assert.equal(api.players[0].favor, 0);
}

// --- 3. У игрока нет корон ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1', favor: 0 })]);
  const result = loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.deepEqual(result, { kind: 'no_crowns' });
  assert.equal(api.players[0].favor, 0);
}

// --- 4. Потеря срывает круг коронации ---
{
  const { api, get, set } = makeHarness(
    [player({ id: 'p1', favor: 6 })],
    { coronationCandidateId: 'p1', coronationOriginId: 'p2' }
  );
  loseCrowns(get, set, 'p1', 1, 'обвинения в измене');
  assert.equal(api.coronationCandidateId, null, 'круг коронации снят');
  assert.equal(api.coronationOriginId, null, 'источник круга снят вместе с ним');
}

// --- 5. Потеря сжигает «Королевский приём» жертвы ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 2,
      activePlot: { id: 'x', cardId: 'c1', type: 'Королевский приём' }
    })
  ]);
  loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.equal(api.players[0].activePlot, null, '«Королевский приём» сорван потерей');
  assert.equal(api.discardPile.length, 1, 'сорванная интрига ушла в сброс');
  assert.equal(api.discardPile[0].id, 'c1', 'в сброс ушёл тот же экземпляр карты');
}

// --- 6. Без потери «Королевский приём» цел ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 0,
      activePlot: { id: 'x', cardId: 'c1', type: 'Королевский приём' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.deepEqual(result, { kind: 'no_crowns' });
  assert.ok(api.players[0].activePlot, 'потери не было — интрига цела');
}

console.log('crownLoss.check: ok');
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts
```

Ожидается: падение вида `Cannot find module './crownLoss.ts'`.

- [ ] **Step 3: Написать `loseCrowns`**

Создать `packages/engine/src/resolvers/crownLoss.ts`:

```ts
/**
 * Единственная точка, где короны уходят с игрока.
 *
 * Раньше это делали четыре резолвера, и каждый сам чинил круг коронации,
 * сам жёг «Королевский приём» и сам рисовал всплывашку. Пятое правило —
 * «Охранная грамота» — в такой россыпи гарантированно где-нибудь забылось бы,
 * поэтому механическая часть потери живёт здесь, а флейворную строку в
 * историю по-прежнему пишет вызывающий: он один знает, чем именно бьёт.
 */
import type { GameState } from '../types';
import { genOf } from '../utils/russianText';
import { triggerResourceFloat } from '../utils/visualEffects';
import { fallenCoronationPatch } from './coronation';

type StateGetter = () => GameState;
type StateSetter = (
  partial: Partial<GameState> | ((state: GameState) => Partial<GameState>)
) => void;

export type CrownLossResult =
  | { kind: 'lost'; amount: number }
  | { kind: 'blocked_by_charter' }
  | { kind: 'no_crowns' };

/**
 * Снимает до `amount` корон с игрока.
 *
 * @param reason      существительное в родительном падеже: «шантажа»,
 *                    «обвинения в измене». Идёт и в срыв «Королевского приёма»,
 *                    и в строку о сорванной коронации.
 * @param floatLabel  необязательный суффикс всплывашки: «Измена!», «Заговор!».
 * @returns сколько корон реально снялось и почему, если не снялось.
 *          «Шантажист» крадёт ровно `amount` из результата: под грамотой это 0,
 *          и переносить себе ему нечего.
 */
export function loseCrowns(
  get: StateGetter,
  set: StateSetter,
  victimId: string,
  amount: number,
  reason: string,
  floatLabel?: string
): CrownLossResult {
  const { players } = get();
  const idx = players.findIndex(p => p.id === victimId);
  if (idx === -1) return { kind: 'no_crowns' };
  const victim = players[idx];

  if (victim.activePlot?.type === 'Охранная грамота') {
    set(state => ({
      history: [
        `📜 «Охранная грамота» защищает ${genOf(victim)}: ${reason} не отнимает корон.`,
        ...state.history
      ].slice(0, 50)
    }));
    triggerResourceFloat(set, victimId, '📜 Грамота держит', true);
    return { kind: 'blocked_by_charter' };
  }

  const lost = Math.min(amount, victim.favor);
  if (lost <= 0) return { kind: 'no_crowns' };

  const newFavor = victim.favor - lost;
  const newPlayers = [...players];
  newPlayers[idx] = { ...victim, favor: newFavor };

  set(state => ({
    players: newPlayers,
    ...fallenCoronationPatch(state.coronationCandidateId, victimId, newFavor),
    history: [
      ...(state.coronationCandidateId === victimId && newFavor < 6
        ? [`⚖️ Коронация ${victim.name} сорвана: ${reason}. Влияние упало ниже 6 👑!`]
        : []),
      ...state.history
    ].slice(0, 50)
  }));

  triggerResourceFloat(set, victimId, `-${lost} 👑${floatLabel ? ` ${floatLabel}` : ''}`, false);
  get()._disruptPlayerPlotsOnLoss(victimId, reason);

  return { kind: 'lost', amount: lost };
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts
```

Ожидается: `crownLoss.check: ok`

- [ ] **Step 5: Перевести «Распустить слух» на `loseCrowns`**

В `packages/engine/src/resolvers/normalActionResolver.ts` добавить импорт:

```ts
import { loseCrowns } from './crownLoss';
```

Заменить ветку слуха (сейчас строки 37–52) на:

```ts
  } else if (action.name.includes('Слух') || action.name.includes('слух')) {
    if (action.targetId) {
      // `loseCrowns` читает игроков из стора, поэтому накопленные правки
      // сначала кладутся туда, а после вызова перечитываются обратно.
      set({ players: newPlayers });
      const result = loseCrowns(get, set, action.targetId, 1, 'распущенных слухов');
      newPlayers = [...get().players];
      if (result.kind === 'lost') {
        const victim = newPlayers.find(p => p.id === action.targetId);
        if (victim) {
          set(state => ({
            history: [`📜 Слухи о ${genOf(victim)} расползлись по двору: -1 👑!`, ...state.history].slice(0, 50)
          }));
        }
      }
    }
  } else if (action.name.includes('Сменить') || action.name.includes('сменить')) {
```

Добавить импорт `genOf`, если его ещё нет в файле:

```ts
import { genOf } from '../utils/russianText';
```

Убрать локальную переменную `rumorVictimId` и её объявление (`let rumorVictimId: string | null = null;`), а также блок в конце функции:

```ts
  if (rumorVictimId) {
    get()._disruptPlayerPlotsOnLoss(rumorVictimId, 'распущенных слухов');
  }
```

Срыв интриг теперь делает `loseCrowns`, дублировать его нельзя — иначе «Королевский приём» сгорит дважды и уедет в сброс двумя копиями.

Финальный `set({ players: newPlayers })` в конце функции оставить: он нужен остальным веткам.

- [ ] **Step 6: Перевести «Шантажиста» на `loseCrowns`**

В `packages/engine/src/resolvers/roleResolver.ts` добавить импорт `import { loseCrowns } from './crownLoss';` и заменить ветку Шантажиста (строки 73–101) на:

```ts
  } else if (role === 'Шантажист' && action.targetId) {
    set({ players: newPlayers });
    const maxSteal = isVB ? 2 : 1;
    const result = loseCrowns(get, set, action.targetId, maxSteal, 'шантажа');
    newPlayers = [...get().players];

    // Шантажист крадёт, а не уничтожает: себе он забирает ровно столько, сколько
    // реально снялось с жертвы. Под «Охранной грамотой» это ноль.
    const stolen = result.kind === 'lost' ? result.amount : 0;
    if (stolen > 0) {
      const idx = newPlayers.findIndex(p => p.id === action.actorId);
      const thief = newPlayers[idx];
      const nextFavor = Math.min(6, thief.favor + stolen);
      const actualGained = nextFavor - thief.favor;
      newPlayers[idx] = { ...thief, favor: nextFavor };
      set({ players: newPlayers });
      triggerResourceFloat(set, thief.id, `+${actualGained} 👑${isVB ? ' (x2 Ва-банк!)' : ''}`, true);
    }

    timerManager.scheduleDelay(() => {
      get()._checkEndgameAndAdvanceTurn();
    }, ACTION_HOLD_MS);
  } else {
```

Импорт `fallenCoronationPatch` из этого файла убрать, если после правки он больше нигде не используется.

- [ ] **Step 7: Перевести «Обвинение в измене» на `loseCrowns`**

В `packages/engine/src/resolvers/instantResolver.ts` добавить импорт `import { loseCrowns } from './crownLoss';` и заменить блок (строки 261–289) на:

```ts
  if (instantType === 'Обвинение в измене' && action.targetId) {
    const victim = players.find(p => p.id === action.targetId);
    if (victim) {
      const result = loseCrowns(get, set, victim.id, 1, 'обвинения в измене', 'Измена!');
      if (result.kind === 'lost') {
        set(state => ({
          history: [`⛓️ «Обвинение в измене»: ${victim.name} теряет -1 👑!`, ...state.history].slice(0, 50)
        }));
        triggerResourceFloat(set, actor.id, `⛓️ Донос на ${victim.name}!`, true);
      } else if (result.kind === 'no_crowns') {
        set(state => ({
          history: [`⛓️ «Обвинение в измене» против ${victim.name} не сработало: у цели 0 👑!`, ...state.history].slice(0, 50)
        }));
      }
      // kind === 'blocked_by_charter': строку в историю уже написала грамота.
    }
    if (isOwnTurn) holdThenAdvance();
    return;
  }
```

Импорт `fallenCoronationPatch` в этом файле убрать, если он больше не используется.

- [ ] **Step 8: Перевести «Тайный заговор» на `loseCrowns`**

В `packages/engine/src/resolvers/plotResolver.ts` добавить импорт `import { loseCrowns } from './crownLoss';` и заменить ветку короны (строки 303–326) на:

```ts
  } else {
    const newPlayers = players.map(p =>
      p.id === player.id ? { ...p, activePlot: null } : p
    );
    set(state => ({
      players: newPlayers,
      discardPile: newDiscard,
      conspiracyPrompt: null
    }));

    const result = loseCrowns(get, set, target.id, 1, 'удара Заговора', 'Заговор!');
    if (result.kind === 'lost') {
      set(state => ({
        history: [
          `💥 «Тайный заговор» (${charges} зар.): ${target.name} лишается 1 👑 короны!`,
          ...state.history
        ].slice(0, 50)
      }));
      triggerResourceFloat(set, player.id, `⚔️ Лишение 1 👑 у ${target.name}!`, true);
    }
  }
```

Внимание: сброс самой карты Заговора (`activePlot: null` у разыгравшего и `newDiscard`) должен произойти **до** вызова `loseCrowns` — иначе `loseCrowns` прочитает `players` из стора, а следующий `set` затрёт его правку своим снимком.

После этой правки `coronationCandidateId` перестаёт использоваться в функции — убрать его из деструктуризации в начале `applyConspiracyEffect`, иначе линтер справедливо ругнётся на неиспользуемую переменную.

- [ ] **Step 9: Прогнать все затронутые тесты**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts \
&& npx tsx packages/engine/src/resolvers/cardConservation.check.ts \
&& npx tsx packages/engine/src/resolvers/coronation.check.ts \
&& npx tsx packages/engine/src/resolvers/duelResolver.check.ts \
&& npx tsx packages/engine/src/resolvers/doubtResolver.check.ts \
&& npx tsx packages/engine/src/GameStore.check.ts
```

Ожидается: шесть строк `...check: ok`. Поведение — прежнее: это рефактор.

- [ ] **Step 10: Коммит**

```bash
git add packages/engine/src/resolvers/
git commit -m "refactor(engine): потеря корон в одной точке — loseCrowns

Слух, Шантажист, Обвинение в измене и Тайный заговор снимали короны
каждый по-своему: свой fallenCoronationPatch, свой срыв интриг, своя
всплывашка. Механическая часть съезжает в loseCrowns, флейворную строку
по-прежнему пишет вызывающий. Поведение не меняется.

Шантажист теперь крадёт ровно то, что реально снялось с жертвы."
```

---

### Task 3: Охранная грамота блокирует потерю корон

**Files:**
- Modify: `packages/engine/src/resolvers/crownLoss.check.ts` (дописать тесты)

Сама ветка `blocked_by_charter` уже написана в Задаче 2 — здесь она получает первое покрытие, а вызывающие места проверяются на то, что они её честно разбирают.

**Interfaces:**
- Consumes: `loseCrowns`, `CrownLossResult` из Задачи 2; литерал `'Охранная грамота'` из Задачи 1.
- Produces: ничего нового.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `packages/engine/src/resolvers/crownLoss.check.ts` перед финальным `console.log`:

```ts
// --- 7. Охранная грамота держит удар ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 4,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'шантажа');
  assert.deepEqual(result, { kind: 'blocked_by_charter' });
  assert.equal(api.players[0].favor, 4, 'корона на месте');
  assert.ok(api.players[0].activePlot, 'грамота остаётся лежать — она не одноразовая');
  assert.equal(api.discardPile.length, 0, 'ничего не ушло в сброс');
}

// --- 8. Грамота держит и удвоенный удар Ва-банка ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 5,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 2, 'шантажа');
  assert.deepEqual(result, { kind: 'blocked_by_charter' });
  assert.equal(api.players[0].favor, 5);
}

// --- 9. Грамота держит круг коронации ---
{
  const { api, get, set } = makeHarness(
    [player({
      id: 'p1',
      favor: 6,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })],
    { coronationCandidateId: 'p1', coronationOriginId: 'p2' }
  );
  loseCrowns(get, set, 'p1', 1, 'обвинения в измене');
  assert.equal(api.coronationCandidateId, 'p1', 'круг коронации не сорван');
  assert.equal(api.players[0].favor, 6);
}

// --- 9б. Грамота держит и удар «Тайного заговора» ---
// Блокировка не смотрит на источник, но каждая формулировка `reason` попадает
// в историю — проверяется, что ни одна из них не проваливается мимо ветки.
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 3,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'удара Заговора', 'Заговор!');
  assert.deepEqual(result, { kind: 'blocked_by_charter' });
  assert.equal(api.players[0].favor, 3);
  assert.ok(
    api.history.some(h => h.includes('удара Заговора')),
    'в истории названа причина, от которой грамота защитила'
  );
}

// --- 10. Стража покоев корон НЕ защищает ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 3,
      activePlot: { id: 'x', cardId: 'c1', type: 'Стража покоев' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'обвинения в измене');
  assert.deepEqual(result, { kind: 'lost', amount: 1 }, 'Стража защищает от ролей, а не от корон');
  assert.equal(api.players[0].favor, 2);
}
```

- [ ] **Step 2: Запустить тесты**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts
```

Ожидается: `crownLoss.check: ok`. Тесты проходят сразу — ветка грамоты написана в Задаче 2. Если хоть один падает, значит Задача 2 сделана неверно; чинить надо `crownLoss.ts`, а не тест.

- [ ] **Step 3: Проверить Шантажиста против грамоты в живом сторе**

Дописать в `packages/engine/src/resolvers/crownLoss.check.ts`:

```ts
// --- 11. Шантажист против грамоты: жертва цела, атакующий пуст ---
{
  const { api, get, set } = makeHarness([
    player({ id: 'p1', favor: 1 }),
    player({
      id: 'p2',
      favor: 4,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p2', 1, 'шантажа');
  const stolen = result.kind === 'lost' ? result.amount : 0;
  assert.equal(stolen, 0, 'красть нечего — грамота удержала корону');
  assert.equal(api.players[0].favor, 1, 'атакующий не получил чужой короны');
  assert.equal(api.players[1].favor, 4, 'жертва не потеряла корону');
}
```

- [ ] **Step 4: Запустить тесты**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts
```

Ожидается: `crownLoss.check: ok`

- [ ] **Step 5: Коммит**

```bash
git add packages/engine/src/resolvers/crownLoss.check.ts
git commit -m "test(engine): Охранная грамота держит все источники потери корон

Шантаж, удвоенный шантаж под Ва-банком, Обвинение в измене, круг
коронации. Плюс контрольный тест: Стража покоев корон не защищает."
```

---

### Task 4: Охранная грамота гасит печати

Цена защиты. Печати не копятся и не откладываются — они просто не начисляются. Прямые короны («Чёрная книга», проверенный «Шут») грамота не трогает: это короны, а не печати.

**Files:**
- Modify: `packages/engine/src/resolvers/sealsResolver.ts:10-22`
- Test: `packages/engine/src/resolvers/sealsResolver.check.ts` (создаётся)

**Interfaces:**
- Consumes: литерал `'Охранная грамота'` из Задачи 1.
- Produces: ничего нового; поведение `addSealsToPlayer` меняется.

> Прямые короны от «Чёрной книги» и от проверенного «Шута» грамота не трогает, и отдельного теста это не требует: обе награды начисляются в `doubtResolver` правкой `favor` напрямую и через `addSealsToPlayer` не проходят вовсе. Заслонка стоит только на печатях — по построению.

- [ ] **Step 1: Написать падающий тест**

Создать `packages/engine/src/resolvers/sealsResolver.check.ts`:

```ts
/**
 * «Охранная грамота» — не бесплатная крепость: пока она лежит, печати её
 * держателю не идут. Прямые короны («Чёрная книга», проверенный «Шут») она не
 * трогает — это короны, а не печати.
 * Run: npx tsx packages/engine/src/resolvers/sealsResolver.check.ts
 */
import assert from 'node:assert/strict';
import type { CardInstance, GameState, Player } from '../types.ts';
import { addSealsToPlayer } from './sealsResolver.ts';

function player(partial: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    name: partial.id,
    avatar: '',
    seatNumber: 1,
    isBot: false,
    gold: 0,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: [],
    activePlot: null,
    ...partial
  };
}

function makeHarness(players: Player[]) {
  const api = {
    players,
    discardPile: [] as CardInstance[],
    coronationCandidateId: null as string | null,
    coronationOriginId: null as string | null,
    activePlayerId: players[0].id,
    floatingResourceEvents: [] as GameState['floatingResourceEvents'],
    history: [] as string[]
  } as unknown as GameState;

  const get = (): GameState => api;
  const set: Parameters<typeof addSealsToPlayer>[1] = partial => {
    const patch = typeof partial === 'function' ? partial(api) : partial;
    Object.assign(api, patch);
  };
  return { api, get, set };
}

// --- 1. Без грамоты печати начисляются как раньше ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1', seals: 1 })]);
  addSealsToPlayer(get, set, 'p1', 1);
  assert.equal(api.players[0].favor, 1, '2 печати сложились в корону');
  assert.equal(api.players[0].seals, 0, 'остаток печатей обнулён');
}

// --- 2. Под грамотой печати не идут ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      seals: 1,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  addSealsToPlayer(get, set, 'p1', 1);
  assert.equal(api.players[0].seals, 1, 'печать не начислена и не отложена');
  assert.equal(api.players[0].favor, 0, 'короны из неё не выросло');
  assert.ok(
    api.history.some(h => h.includes('Охранная грамота')),
    'игрок должен видеть, почему печать не пришла'
  );
}

// --- 3. Под грамотой не срабатывает и бонус Золотой буллы ---
// (обе интриги в один слот не влезают, но проверка фиксирует порядок:
//  выход по грамоте происходит раньше, чем что-либо начисляется)
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      gold: 5,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  addSealsToPlayer(get, set, 'p1', 2);
  assert.equal(api.players[0].gold, 5, 'золото не изменилось');
  assert.equal(api.players[0].favor, 0);
}

// --- 4. Стража покоев печатям не мешает ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      seals: 1,
      activePlot: { id: 'x', cardId: 'c1', type: 'Стража покоев' }
    })
  ]);
  addSealsToPlayer(get, set, 'p1', 1);
  assert.equal(api.players[0].favor, 1, 'Стража печати не гасит');
}

console.log('sealsResolver.check: ok');
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
npx tsx packages/engine/src/resolvers/sealsResolver.check.ts
```

Ожидается: падение на тесте 2 — `печать не начислена и не отложена`, потому что печать сложится в корону.

- [ ] **Step 3: Добавить проверку грамоты**

В `packages/engine/src/resolvers/sealsResolver.ts`, сразу после проверки `if (player.favor >= 6) return;`, добавить:

```ts
  /* Цена «Охранной грамоты»: пока она лежит, печати держателю не идут.
     Именно не идут, а не копятся — иначе защита была бы бесплатной, а после
     сброса грамоты в игрока прилетала бы пачка отложенных корон. */
  if (player.activePlot?.type === 'Охранная грамота') {
    set(state => ({
      history: [
        `📜 «Охранная грамота» ${player.name}: печать (+${count} ⚜️) не начислена — такова цена защиты.`,
        ...state.history
      ].slice(0, 50)
    }));
    return;
  }
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
npx tsx packages/engine/src/resolvers/sealsResolver.check.ts
```

Ожидается: `sealsResolver.check: ok`

- [ ] **Step 5: Прогнать соседние тесты**

```bash
npx tsx packages/engine/src/resolvers/duelResolver.check.ts \
&& npx tsx packages/engine/src/resolvers/doubtResolver.check.ts \
&& npx tsx packages/engine/src/resolvers/coronation.check.ts
```

Ожидается: три строки `...check: ok`.

- [ ] **Step 6: Коммит**

```bash
git add packages/engine/src/resolvers/sealsResolver.ts packages/engine/src/resolvers/sealsResolver.check.ts
git commit -m "feat(engine): Охранная грамота гасит королевские печати

Цена защиты. Печати не копятся и не откладываются — иначе после сброса
грамоты в игрока прилетала бы пачка корон. Прямые короны (Чёрная книга,
проверенный Шут) грамота не трогает."
```

---

### Task 5: Слух сжигает Охранную грамоту

Единственная контрмера, доступная каждому за 5 🪙, и то, что держит грамоту в рамках. Корону слух при этом не снимает — грамота честно её удержала — но сама грамота сгорает. Слух полностью оплачен в любом случае.

**Files:**
- Modify: `packages/engine/src/resolvers/normalActionResolver.ts` (ветка слуха из Задачи 2)
- Modify: `packages/engine/src/resolvers/crownLoss.ts` (добавляется `burnCharterOnRumor`)
- Modify: `packages/engine/src/resolvers/crownLoss.check.ts`

**Interfaces:**
- Consumes: `loseCrowns`, `CrownLossResult` из Задачи 2.
- Produces: `export function burnCharterOnRumor(get, set, victimId: string): boolean` — сжигает «Охранную грамоту» жертвы слуха, возвращает `true`, если сожгла.

> Спека перечисляла среди проверок «„Королевский приём“ держателя не сорван». Такой случай недостижим: слот активной интриги один, и держатель грамоты физически не может одновременно держать «Приём». Тест не пишем — вместо него ниже проверяется, что при заблокированной потере `loseCrowns` вообще не доходит до срыва интриг.

- [ ] **Step 1: Написать падающий тест**

Дописать в `packages/engine/src/resolvers/crownLoss.check.ts` (импорт наверху расширить: `import { burnCharterOnRumor, loseCrowns } from './crownLoss.ts';`):

```ts
// --- 12. Слух сжигает грамоту, но короны не забирает ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 4,
      activePlot: { id: 'x', cardId: 'c1', type: 'Охранная грамота' }
    })
  ]);
  const result = loseCrowns(get, set, 'p1', 1, 'распущенных слухов');
  assert.deepEqual(result, { kind: 'blocked_by_charter' });

  const burned = burnCharterOnRumor(get, set, 'p1');
  assert.equal(burned, true, 'слух сжигает грамоту');
  assert.equal(api.players[0].favor, 4, 'корона осталась при владельце');
  assert.equal(api.players[0].activePlot, null, 'грамота больше не лежит');
  assert.equal(api.discardPile.length, 1, 'грамота ушла в сброс');
  assert.equal(api.discardPile[0].id, 'c1', 'в сброс ушёл тот же экземпляр');
  assert.equal(api.discardPile[0].card, 'Охранная грамота');
}

// --- 13. Слух не трогает Стражу покоев ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 4,
      activePlot: { id: 'x', cardId: 'c1', type: 'Стража покоев' }
    })
  ]);
  const burned = burnCharterOnRumor(get, set, 'p1');
  assert.equal(burned, false, 'слух жжёт только грамоту');
  assert.ok(api.players[0].activePlot, 'Стража осталась на месте');
}
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts
```

Ожидается: падение вида `The requested module './crownLoss.ts' does not provide an export named 'burnCharterOnRumor'`.

- [ ] **Step 3: Написать `burnCharterOnRumor`**

Дописать в `packages/engine/src/resolvers/crownLoss.ts` (расширив импорт типов до `import type { CardInstance, GameState } from '../types';`):

```ts
/**
 * «Распустить слух» против держателя «Охранной грамоты»: корону слух не
 * забирает (её удержала грамота), но саму грамоту сжигает.
 *
 * Это единственная контрмера, доступная каждому за 5 🪙, и то, что не даёт
 * грамоте стать неснимаемой крепостью: иначе её брали бы только два
 * «Обыска покоев» на всю колоду.
 *
 * @returns была ли грамота сожжена.
 */
export function burnCharterOnRumor(
  get: StateGetter,
  set: StateSetter,
  victimId: string
): boolean {
  const { players } = get();
  const idx = players.findIndex(p => p.id === victimId);
  if (idx === -1) return false;

  const victim = players[idx];
  const plot = victim.activePlot;
  if (plot?.type !== 'Охранная грамота') return false;

  const burned: CardInstance = { id: plot.cardId, card: 'Охранная грамота' };
  const newPlayers = [...players];
  newPlayers[idx] = { ...victim, activePlot: null };

  set(state => ({
    players: newPlayers,
    discardPile: [...state.discardPile, burned],
    history: [
      `📜 Слухи подточили «Охранную грамоту» ${genOf(victim)}: корона цела, но грамота сгорела.`,
      ...state.history
    ].slice(0, 50)
  }));
  triggerResourceFloat(set, victimId, '📜 Грамота сгорела', false);

  return true;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts
```

Ожидается: `crownLoss.check: ok`

- [ ] **Step 5: Подключить сжигание к слуху**

В `packages/engine/src/resolvers/normalActionResolver.ts` расширить импорт до `import { burnCharterOnRumor, loseCrowns } from './crownLoss';` и в ветке слуха, написанной в Задаче 2, разобрать третий исход:

```ts
  } else if (action.name.includes('Слух') || action.name.includes('слух')) {
    if (action.targetId) {
      set({ players: newPlayers });
      const result = loseCrowns(get, set, action.targetId, 1, 'распущенных слухов');
      if (result.kind === 'blocked_by_charter') {
        burnCharterOnRumor(get, set, action.targetId);
      }
      newPlayers = [...get().players];
      if (result.kind === 'lost') {
        const victim = newPlayers.find(p => p.id === action.targetId);
        if (victim) {
          set(state => ({
            history: [`📜 Слухи о ${genOf(victim)} расползлись по двору: -1 👑!`, ...state.history].slice(0, 50)
          }));
        }
      }
    }
  } else if (action.name.includes('Сменить') || action.name.includes('сменить')) {
```

- [ ] **Step 6: Прогнать тесты**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts \
&& npx tsx packages/engine/src/resolvers/cardConservation.check.ts \
&& npx tsx packages/engine/src/GameStore.check.ts
```

Ожидается: три строки `...check: ok`. `cardConservation` важен особо: грамота должна оказаться в сбросе ровно одним экземпляром.

- [ ] **Step 7: Коммит**

```bash
git add packages/engine/src/resolvers/crownLoss.ts packages/engine/src/resolvers/crownLoss.check.ts packages/engine/src/resolvers/normalActionResolver.ts
git commit -m "feat(engine): слух сжигает Охранную грамоту, не забирая корону

Единственная контрмера, доступная каждому за 5 монет. Без неё грамоту
снимали бы только два Обыска покоев на всю колоду. Слух оплачен в любом
исходе."
```

---

### Task 6: Уличённый блеф сжигает защитную интригу

Обе новые карты уходят в сброс, когда их держателя ловят на лжи — при проверке «Не верю» или на дуэли. Это то, что не даёт защите быть бесплатной: держать её и блефовать одновременно нельзя.

**Files:**
- Modify: `packages/engine/src/resolvers/crownLoss.ts` (добавляется `discardProtectiveIntrigueOnBluff`)
- Modify: `packages/engine/src/resolvers/doubtResolver.ts` (ветка «заявитель блефовал», около строки 197)
- Modify: `packages/engine/src/resolvers/duelResolver.ts` (после `set` с исходом дуэли, около строки 205)
- Modify: `packages/engine/src/resolvers/crownLoss.check.ts`

**Interfaces:**
- Consumes: литералы `'Стража покоев'` и `'Охранная грамота'` из Задачи 1.
- Produces: `export function discardProtectiveIntrigueOnBluff(get, set, playerId: string): boolean` — сжигает защитную интригу уличённого, возвращает `true`, если сожгла.

- [ ] **Step 1: Написать падающий тест**

Дописать в `packages/engine/src/resolvers/crownLoss.check.ts` (импорт: `import { burnCharterOnRumor, discardProtectiveIntrigueOnBluff, loseCrowns } from './crownLoss.ts';`):

```ts
// --- 14. Уличённый в блефе теряет Стражу покоев ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      activePlot: { id: 'x', cardId: 'c1', type: 'Стража покоев' }
    })
  ]);
  const burned = discardProtectiveIntrigueOnBluff(get, set, 'p1');
  assert.equal(burned, true);
  assert.equal(api.players[0].activePlot, null, 'Стража сгорела');
  assert.equal(api.discardPile[0].card, 'Стража покоев');
  assert.equal(api.discardPile[0].id, 'c1', 'в сброс ушёл тот же экземпляр');
}

// --- 15. Уличённый в блефе теряет Охранную грамоту ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      favor: 5,
      activePlot: { id: 'x', cardId: 'c2', type: 'Охранная грамота' }
    })
  ]);
  const burned = discardProtectiveIntrigueOnBluff(get, set, 'p1');
  assert.equal(burned, true);
  assert.equal(api.players[0].activePlot, null, 'грамота сгорела');
  assert.equal(api.players[0].favor, 5, 'сама по себе потеря карты корон не отнимает');
  assert.equal(api.discardPile[0].card, 'Охранная грамота');
}

// --- 16. Прочие интриги блефом не сжигаются ---
{
  const { api, get, set } = makeHarness([
    player({
      id: 'p1',
      activePlot: { id: 'x', cardId: 'c3', type: 'Королевский приём' }
    })
  ]);
  const burned = discardProtectiveIntrigueOnBluff(get, set, 'p1');
  assert.equal(burned, false, 'горят только защитные интриги');
  assert.ok(api.players[0].activePlot, '«Королевский приём» не тронут');
  assert.equal(api.discardPile.length, 0);
}

// --- 17. Пустой слот интриги обрабатывается молча ---
{
  const { api, get, set } = makeHarness([player({ id: 'p1' })]);
  assert.equal(discardProtectiveIntrigueOnBluff(get, set, 'p1'), false);
  assert.equal(api.discardPile.length, 0);
}
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts
```

Ожидается: падение вида `does not provide an export named 'discardProtectiveIntrigueOnBluff'`.

- [ ] **Step 3: Написать `discardProtectiveIntrigueOnBluff`**

Дописать в `packages/engine/src/resolvers/crownLoss.ts`:

```ts
/** Интриги, которые перестают работать, как только держателя поймали на лжи. */
const PROTECTIVE_PLOTS = ['Стража покоев', 'Охранная грамота'] as const;

/**
 * Держателя защитной интриги уличили в блефе — интрига сгорает.
 *
 * Это то, что не даёт защите быть бесплатной: держать «Стражу» или «Грамоту»
 * и при этом блефовать ролями одновременно нельзя.
 *
 * @returns была ли интрига сожжена.
 */
export function discardProtectiveIntrigueOnBluff(
  get: StateGetter,
  set: StateSetter,
  playerId: string
): boolean {
  const { players } = get();
  const idx = players.findIndex(p => p.id === playerId);
  if (idx === -1) return false;

  const victim = players[idx];
  const plot = victim.activePlot;
  if (!plot) return false;
  if (!PROTECTIVE_PLOTS.some(type => type === plot.type)) return false;

  const burned: CardInstance = { id: plot.cardId, card: plot.type };
  const newPlayers = [...players];
  newPlayers[idx] = { ...victim, activePlot: null };

  set(state => ({
    players: newPlayers,
    discardPile: [...state.discardPile, burned],
    history: [
      `💥 «${plot.type}» ${genOf(victim)} сгорает: ${victim.name} уличён(а) в блефе.`,
      ...state.history
    ].slice(0, 50)
  }));
  triggerResourceFloat(set, playerId, `💥 ${plot.type} сорвана`, false);

  return true;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts
```

Ожидается: `crownLoss.check: ok`

- [ ] **Step 5: Подключить к проверке «Не верю»**

В `packages/engine/src/resolvers/doubtResolver.ts` добавить импорт:

```ts
import { discardProtectiveIntrigueOnBluff } from './crownLoss';
```

Найти финальный `set(...)` в `executeRevealOutcome`, который выставляет `revealOutcome: outcome` и `turnPhase: 'REVEAL_OUTCOME'`, и **сразу после него** (перед блоком `if (sealsWinnerId && sealsCount > 0)`) добавить:

```ts
  /* Защита рушится вместе с репутацией: пойманного на лжи «Стража покоев» и
     «Охранная грамота» больше не прикрывают. Сжигается после `set` выше,
     потому что читает и пишет уже применённое состояние. */
  if (!wasTruth) {
    discardProtectiveIntrigueOnBluff(get, set, actor.id);
  }
```

- [ ] **Step 6: Подключить к дуэли**

В `packages/engine/src/resolvers/duelResolver.ts` добавить импорт:

```ts
import { discardProtectiveIntrigueOnBluff } from './crownLoss';
```

Найти `set(...)`, который выставляет `duelOutcome: outcome` и `turnPhase: 'DUEL_OUTCOME'`, и **сразу после него**, до цикла `for (const award of sealAwards)`, добавить:

```ts
  /* На дуэли вскрываются обе карты — значит уличёнными могут оказаться оба.
     Порядок с печатями важен: интриги сжигаются до наград, иначе
     `addSealsToPlayer` прочитает уже сгоревшую «Охранную грамоту» как живую
     и не начислит печать тому, кто её только что потерял. */
  if (!actorWasTruth) discardProtectiveIntrigueOnBluff(get, set, actor.id);
  if (!defenderWasTruth) discardProtectiveIntrigueOnBluff(get, set, defender.id);
```

- [ ] **Step 7: Прогнать тесты**

```bash
npx tsx packages/engine/src/resolvers/crownLoss.check.ts \
&& npx tsx packages/engine/src/resolvers/doubtResolver.check.ts \
&& npx tsx packages/engine/src/resolvers/duelResolver.check.ts \
&& npx tsx packages/engine/src/resolvers/cardConservation.check.ts \
&& npx tsx packages/engine/src/resolvers/vetoWindow.check.ts
```

Ожидается: пять строк `...check: ok`.

- [ ] **Step 8: Коммит**

```bash
git add packages/engine/src/resolvers/
git commit -m "feat(engine): уличённый блеф сжигает Стражу и Грамоту

Держать защитную интригу и блефовать ролями одновременно нельзя. На дуэли
вскрываются обе карты, поэтому уличёнными могут оказаться оба. Интриги
сжигаются до начисления печатей — иначе сгоревшая грамота успела бы ещё
раз погасить печать своему бывшему владельцу."
```

---

### Task 7: `canBeTargetedBy` — общий предикат целей и эффект Стражи

Правило «кого можно выбрать целью» сегодня живёт в двух копиях (UI и боты) и не проверяется на сервере вовсе. Здесь оно становится одной функцией, получает эффект «Стражи покоев» и попутно чинит расхождение: Вора можно объявить на игрока с пустой казной через UI, хотя боты так не делают, а при перенаправлении это запрещено.

**Files:**
- Create: `packages/engine/src/targeting.ts`
- Test: `packages/engine/src/targeting.check.ts` (создаётся)
- Modify: `packages/engine/src/GameStore.ts:330-355` (проверка цели в `performAction`)
- Modify: `packages/engine/src/resolvers/instantResolver.ts:114-135` (ветка «Перенаправление»)
- Modify: `packages/engine/src/bot/botTargeting.ts:9-11,40-42,238-246`
- Modify: `apps/web/src/components/SeatsRow.tsx:37-46`

**Interfaces:**
- Consumes: литерал `'Стража покоев'` из Задачи 1.
- Produces: `export function canBeTargetedBy(target: Player, roleClaim: Role): boolean` из `@kinglier/engine/targeting`.

- [ ] **Step 1: Написать падающий тест**

Создать `packages/engine/src/targeting.check.ts`:

```ts
/**
 * Один предикат допустимых целей на весь проект: UI, боты и серверная
 * проверка в `performAction` спрашивают его, а не переписывают правила у себя.
 * Run: npx tsx packages/engine/src/targeting.check.ts
 */
import assert from 'node:assert/strict';
import type { Player } from './types.ts';
import { canBeTargetedBy } from './targeting.ts';

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

// --- Охранная грамота целью быть не мешает ---
{
  const chartered = player({ id: 'p1', activePlot: charter });
  assert.equal(canBeTargetedBy(chartered, 'Шантажист'), true, 'грамота держит корону, а не отводит атаку');
  assert.equal(canBeTargetedBy(chartered, 'Вор'), true, 'грамота золото не защищает');
}

console.log('targeting.check: ok');
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
npx tsx packages/engine/src/targeting.check.ts
```

Ожидается: падение вида `Cannot find module './targeting.ts'`.

- [ ] **Step 3: Написать предикат**

Создать `packages/engine/src/targeting.ts`:

```ts
/**
 * Кого можно выбрать целью атакующей роли.
 *
 * Раньше это правило жило двумя копиями — в `SeatsRow` для человека и в
 * `botTargeting` для ботов — и копии успели разъехаться: боты никогда не
 * посылали Вора на пустую казну, а UI позволял. На сервере правило не
 * проверялось вовсе, так что самописный клиент обходил его целиком.
 *
 * Ограничения, специфичные для «Перенаправления» (нельзя выбрать текущую цель
 * повторно и нельзя выбрать самого атакующего), живут на месте вызова: они про
 * перенаправление, а не про роль.
 */
import type { Player, Role } from './types';

export function canBeTargetedBy(target: Player, roleClaim: Role): boolean {
  const isGuarded = target.activePlot?.type === 'Стража покоев';

  if (roleClaim === 'Вор') {
    return target.gold > 0 && !isGuarded;
  }
  if (roleClaim === 'Шантажист') {
    return target.favor > 0 && !isGuarded;
  }
  return true;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
npx tsx packages/engine/src/targeting.check.ts
```

Ожидается: `targeting.check: ok`

- [ ] **Step 5: Добавить серверную проверку в `performAction`**

В `packages/engine/src/GameStore.ts` добавить импорт:

```ts
import { canBeTargetedBy } from './targeting';
```

В `performAction`, сразу после блока проверки золота (`if (actor.gold < actionData.costGold) { return; }`), добавить:

```ts
    /* Цель приходит от клиента как есть: `KinglierRoom` стампует только
       `actorId`. Без этой проверки самописный клиент бил бы Вором по пустой
       казне и Шантажистом сквозь «Стражу покоев». */
    if (actionData.roleClaim && actionData.targetId) {
      const victim = players.find(p => p.id === actionData.targetId);
      if (!victim || !canBeTargetedBy(victim, actionData.roleClaim)) {
        return;
      }
    }
```

- [ ] **Step 6: Добавить проверку в «Перенаправление»**

В `packages/engine/src/resolvers/instantResolver.ts` добавить импорт:

```ts
import { canBeTargetedBy } from '../targeting';
```

Заменить условие в ветке перенаправления:

```ts
  } else if (instantType === 'Перенаправление' && targetPlayerId) {
    const newTarget = players.find(p => p.id === targetPlayerId);
    const claim = pendingAction?.roleClaim;
    const redirectAllowed =
      !!pendingAction &&
      !!newTarget &&
      !!claim &&
      newTarget.id !== pendingAction.actorId &&
      canBeTargetedBy(newTarget, claim);

    if (redirectAllowed && pendingAction && newTarget) {
      const updatedAction = { ...pendingAction, targetId: targetPlayerId };
```

Остальное тело ветки не менять. Карта «Перенаправление» бесплатна (`tokenCost === 0`) и `set` в этой ветке ещё не вызывался, поэтому при отказе ничего не тратится и рука остаётся нетронутой.

- [ ] **Step 7: Перевести ботов на предикат**

В `packages/engine/src/bot/botTargeting.ts` добавить импорт:

```ts
import { canBeTargetedBy } from '../targeting';
```

Заменить фильтр в `selectBestThiefTarget` (строка 11):

```ts
  const valid = opponents.filter(p => canBeTargetedBy(p, 'Вор'));
```

Заменить фильтр в `selectBestBlackmailerTarget` (строка 42):

```ts
  const valid = opponents.filter(p => canBeTargetedBy(p, 'Шантажист'));
```

Заменить фильтр в `selectBestRedirectionTarget` (строки 238–246):

```ts
  const possibleTargets = allOpponents.filter(p => {
    if (p.id === currentTarget.id) return false;
    if (!roleClaim) return true;
    return canBeTargetedBy(p, roleClaim);
  });
```

- [ ] **Step 8: Перевести UI на предикат**

В `apps/web/src/components/SeatsRow.tsx` добавить импорт:

```ts
import { canBeTargetedBy } from '@kinglier/engine/targeting';
```

Заменить `isValidTarget` (строки 37–46) на:

```ts
  const isValidTarget = (player: Player): boolean => {
    if (!pendingTargetAction || player.id === human?.id) return false;

    if (pendingTargetAction.instantType === 'Перенаправление') {
      if (pendingAction?.actorId === player.id) return false;
      return !pendingAction?.roleClaim || canBeTargetedBy(player, pendingAction.roleClaim);
    }

    return !pendingTargetAction.roleClaim || canBeTargetedBy(player, pendingTargetAction.roleClaim);
  };
```

- [ ] **Step 9: Прогнать тесты и линтер**

```bash
npx tsx packages/engine/src/targeting.check.ts \
&& npx tsx packages/engine/src/GameStore.check.ts \
&& npx tsx packages/engine/src/GameStore.turnGuard.check.ts \
&& npx tsx packages/engine/src/resolvers/courtRules.check.ts \
&& npm run lint
```

Ожидается: четыре строки `...check: ok` и чистый линтер.

- [ ] **Step 10: Коммит**

```bash
git add packages/engine/src/targeting.ts packages/engine/src/targeting.check.ts packages/engine/src/GameStore.ts packages/engine/src/resolvers/instantResolver.ts packages/engine/src/bot/botTargeting.ts apps/web/src/components/SeatsRow.tsx
git commit -m "feat(engine): Стража покоев отводит Вора и Шантажиста

Правило выбора цели жило двумя копиями (UI и боты) и на сервере не
проверялось вовсе. Теперь это один предикат canBeTargetedBy, который
знает и про Стражу.

Попутно чинится расхождение: Вора нельзя объявить на игрока с 0 монет.
Боты это правило соблюдали, человеческий UI проверял золото только в
ветке перенаправления, движок не проверял вообще."
```

---

### Task 8: Боты играют новые интриги

Без этого боты никогда не выложат «Стражу» и «Грамоту» — карты будут мёртвым грузом в руке, а игрок увидит колоду, где четыре карты из 51 ничего не делают.

**Files:**
- Modify: `packages/engine/src/bot/botTurnPlanner.ts:155-185` (выбор интриги)
- Modify: `packages/engine/src/bot/botReactions.ts:135-140` (страх Шантажиста)

**Interfaces:**
- Consumes: литералы карт из Задачи 1, `canBeTargetedBy` из Задачи 7.
- Produces: ничего нового.

- [ ] **Step 1: Научить ботов выкладывать новые интриги**

В `packages/engine/src/bot/botTurnPlanner.ts`, внутри блока «Приоритет 1: Розыгрыш Интриги», добавить две ветки перед `} else if (plotCard === 'Тайный заговор') {`:

```ts
      } else if (plotCard === 'Охранная грамота') {
        /* Грамота — карта фаворита: она держит корону, но закрывает печати.
           Пока корон мало, второй путь к победе дороже защиты. */
        if (bot.favor >= 4) {
          useGameStore.getState().playPlotAction('Охранная грамота', plotId);
          return;
        }
      } else if (plotCard === 'Стража покоев') {
        /* Стража окупается только когда есть что отнимать: пустого двор не
           грабит, а слот интриги один. */
        const isRich = opponents.every(p => p.gold <= bot.gold);
        const isLeading = opponents.every(p => p.favor <= bot.favor);
        if (bot.gold >= 4 || isRich || isLeading) {
          useGameStore.getState().playPlotAction('Стража покоев', plotId);
          return;
        }
```

Ветки написаны так, что при невыполненном условии бот проваливается дальше по функции и разыграет роль вместо интриги — как он уже делает с «Королевским приёмом».

- [ ] **Step 2: Убрать страх перед бессильным Шантажистом**

В `packages/engine/src/bot/botReactions.ts` заменить блок с `fakeDuelChance` (строки 136–139) на:

```ts
      let fakeDuelChance = 0.25 * archetype.blockBluffRate;
      /* Под «Охранной грамотой» Шантажист не отнимет ничего — блефовать
         щитом ради неё значит зря жечь жетон и карту. */
      const charterHolds = target.activePlot?.type === 'Охранная грамота';
      if (pendingAction.roleClaim === 'Шантажист' && target.favor >= 4 && !charterHolds) {
        fakeDuelChance = 0.65;
      }
```

- [ ] **Step 3: Прогнать партию с ботами и убедиться, что она доигрывается**

```bash
npx tsx packages/engine/src/bot/botDoubt.check.ts && npx tsx packages/engine/src/botsConfig.check.ts
```

Ожидается: две строки `...check: ok`.

- [ ] **Step 4: Проверить живьём в браузере**

```bash
npm run dev:web
```

Открыть предпросмотр, начать партию с ботами. Убедиться, что:
- новые карты появляются в руке и в справочнике колоды с артом и описанием;
- при заявке «Вора» или «Шантажиста» место соперника со «Стражей покоев» гаснет и не кликается;
- бот с 4+ коронами выкладывает «Охранную грамоту», если она пришла в руку;
- партия доигрывается до победы без зависаний.

Консоль браузера не должна содержать ошибок.

- [ ] **Step 5: Коммит**

```bash
git add packages/engine/src/bot/
git commit -m "feat(bots): боты выкладывают Стражу и Грамоту

Грамота — карта фаворита от 4 корон: она держит корону ценой печатей.
Стража окупается, когда у бота есть что отнимать. Плюс: боты больше не
блефуют щитом против Шантажиста, который под грамотой всё равно ничего
не отнимет."
```

---

### Task 9: RULES.md

Свод правил — то, по чему играют вживую за столом. Две новых карты и новый размер колоды должны быть в нём, включая непечатное на арте взаимодействие грамоты со слухом.

**Files:**
- Modify: `RULES.md` (§3 состав двора, §8 слой интриг)

**Interfaces:**
- Consumes: правила карт из Задач 1–7.
- Produces: ничего.

- [ ] **Step 1: Обновить состав колоды в §3**

В `RULES.md`, в разделе «Состав двора», заменить строки про единую колоду и интриги:

```markdown
* **Единая колода двора (51 карта):** Все карты замешаны в одну общую колоду с одинаковой рубашкой:
  * **18 карт Ролей:** 6 персонажей × 3 копии (Наследник, Казначей, Вор, Шантажист, Рыцарь, Шут).
  * **17 карт Интриг 🎴:** 7 типов × 2 копии (Королевский приём, Чёрная книга, Сеть информаторов, Досье, Золотая булла, Стража покоев, Охранная грамота) + **3 копии «Тайного заговора»**.
  * **16 карт Инстантов ⚡:** Право вето (5 копий), Обвинение в измене (3 копии), Перенаправление (2 копии), Ва-банк (2 копии), Дворцовый переполох (2 копии), Обыск покоев (2 копии).
```

- [ ] **Step 2: Обновить заголовок §8**

Заменить строку заголовка:

```markdown
## 🎴 8. СЛОЙ ИНТРИГ (8 типов / 17 карт)
```

- [ ] **Step 3: Добавить две карты в §8**

В конец раздела §8, после блока «6. ⚔️ Тайный заговор», добавить:

```markdown
### 7. 🛡️ Стража покоев (2 шт)
* **Стоимость:** 1 ⚡. Выкладывается открыто перед собой. Перед выкладкой открывается окно вето.
* **Эффект (бессрочный):** Вас **нельзя выбрать целью «Вора» и «Шантажиста»** — ни при объявлении атаки, ни «Перенаправлением».
* **НЕ защищает от:** «Распустить слух», «Обвинение в измене», «Тайный заговор», «Дворцовый переполох», «Обыск покоев».
* **Сбрасывается:** «Обыском покоев» или в тот момент, когда вас **уличают в блефе** — при проверке или на дуэли.
* **Тактическое значение:** снимает вас с прицела двух самых частых атак разом. Но слот интриги один: пока лежит Стража, у вас нет ни «Приёма», ни «Чёрной книги», ни «Заговора».

### 8. 📜 Охранная грамота (2 шт)
* **Стоимость:** 1 ⚡. Выкладывается открыто перед собой. Перед выкладкой открывается окно вето.
* **Эффект (бессрочный):** Вы **не можете потерять короны** ничем — ни «Шантажистом», ни «Обвинением в измене», ни «Тайным заговором», ни дуэлью, ни слухом.
* **Цена защиты:** пока грамота лежит, вы **не получаете королевских печатей (⚜️)**. Печати не копятся и не откладываются — они просто не начисляются. Прямые короны от «Чёрной книги» и от проверенного «Шута» приходят как обычно: это короны, а не печати.
* **Сбрасывается тремя способами:**
  1. **«Распустить слух»** против вас: корону вы не теряете, но грамота сгорает. Слух при этом полностью оплачен.
  2. **«Обыск покоев»**.
  3. Когда вас **уличают в блефе** — при проверке или на дуэли.
* **Тактическое значение:** главный козырь фаворита в Круге Коронации. Сбить вас можно будет только слухом за 5 🪙 или «Обыском покоев» — но и второй путь к победе (печати) вы себе закрываете.

> ⚠️ **Важно для игры вживую:** на карте «Охранная грамота» напечатан только короткий текст. Правило «слух сбрасывает грамоту, не отнимая короны» на арте не указано — сверяйтесь с этим разделом.
```

- [ ] **Step 4: Проверить, что счёт карт сходится**

```bash
npx tsx packages/engine/src/data/cardDescriptions.check.ts
```

Ожидается: `cardDescriptions.check: ok` — тест держит `TOTAL_DECK_SIZE === 51`, то же число, что теперь в RULES.md. Глазами сверить: 18 ролей + 17 интриг + 16 инстантов = 51.

- [ ] **Step 5: Прогнать весь набор тестов**

```bash
for f in $(git ls-files '*.check.ts'); do echo "--- $f"; npx tsx "$f" || exit 1; done && npm run lint
```

Ожидается: каждый файл печатает свою строку `...check: ok`, линтер чист.

- [ ] **Step 6: Коммит**

```bash
git add RULES.md
git commit -m "docs(rules): Стража покоев и Охранная грамота в своде правил

Колода 47 -> 51, интриг 8 типов / 17 карт. Отдельно отмечено, что
взаимодействие грамоты со слухом на арте не напечатано."
```

---

## Проверка готовности фазы

После Задачи 9 должно выполняться всё сразу:

- [ ] Все `*.check.ts` проходят: `for f in $(git ls-files '*.check.ts'); do npx tsx "$f" || break; done`
- [ ] `npm run lint` чист
- [ ] Партия с ботами доигрывается до победы, обе новые карты встречаются в руках и на столе
- [ ] Соперник со «Стражей покоев» не кликается при заявке «Вора» и «Шантажиста»
- [ ] Держатель «Охранной грамоты» не теряет корон, но и печатей не получает
- [ ] Слух против держателя грамоты сжигает её, оставляя корону
- [ ] Уличённый в блефе теряет свою защитную интригу
- [ ] Вора нельзя заявить на игрока с 0 🪙 (починенный баг)

Фаза 2 (`GameRules`: 13 регуляторов, ползунки копий для всех 20 карт, экраны настроек, вето на вето, платная проверка, срыв масок, порог победы 5) — отдельная спека и отдельный план.
