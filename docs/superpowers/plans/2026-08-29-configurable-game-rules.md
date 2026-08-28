# Настраиваемые правила партии — план реализации (Фаза 2)

> **Замечание об уровне детализации.** План исполняется в той же сессии, где
> написан, поэтому шаги описывают решения и границы задач, а не каждое нажатие.
> Если план будет исполнять агент без контекста — сначала прочитать спеку
> `docs/superpowers/specs/2026-08-29-configurable-game-rules-design.md`.

**Goal:** Вынести правила партии в настраиваемый объект `GameRules`, который
хост задаёт в лобби, а игрок с ботами — на экране перед стартом.

**Architecture:** `GameRules` живёт в `GameState.rules` и доезжает до онлайн-
клиентов сам (`GameStateData` выводится структурно, `redactStateForPlayer`
разливает через `...rest`). Резолверы читают `get().rules`; чистые функции
получают нужное число параметром. Валидация — на сервере, клиенту не верим.

**Tech Stack:** TypeScript, zustand, npm workspaces. Тесты — исполняемые
`*.check.ts`, запуск `npx tsx <файл>`.

## Global Constraints

- Пользовательский текст — русский. Комментарии в движке — русские там, где
  объясняют правило или неочевидное решение.
- Каждая задача заканчивается коммитом, сообщение по-русски, `тип(область): …`.
- Каждый `*.check.ts` печатает `console.log('<имя>.check: ok');` в конце.
- Ничего из «Границ» спеки не делать: ни пресетов, ни смены правил посреди
  партии, ни настройки наград печатями.
- После каждой задачи прогонять затронутые тесты; в конце — весь набор и линтер.

## Порядок задач

Ядро (1–2) → правила по одному (3–8) → интерфейсы (9–10) → боты (11) → свод (12).
Такой порядок даёт рабочую игру после каждой задачи: правило переезжает на
`rules`, дефолт совпадает с прежним поведением, тесты это фиксируют.

---

### Task 1: `GameRules`, дефолты и нормализация

**Files:** создать `packages/engine/src/rules.ts`, `packages/engine/src/rules.check.ts`

**Produces:**
```ts
export interface GameRules {
  crownsToWin: number;        // 1..10, default 5
  actionTokens: number;       // 1..10, default 2
  feastCost: number;          // 1..10, default 3
  rumorCost: number;          // 1..10, default 5
  blackmailCost: number;      // 0..10, default 0
  duelCostsToken: boolean;    // default true
  vetoOnVeto: boolean;        // default false
  unmaskEnabled: boolean;     // default false
  unmaskCost: number;         // 1..10, default 3
  paidDoubtEnabled: boolean;  // default false
  paidDoubtCost: number;      // 1..10, default 3
  deck: Record<GameCard, number>; // 0..10 копий
}
export const DEFAULT_RULES: GameRules;
export const MIN_DECK_SIZE = 8;          // 4 игрока x 2 карты в руку
export function normalizeRules(raw: unknown): GameRules;
export function deckSize(rules: GameRules): number;
export function rulesProblems(rules: GameRules): string[]; // пусто = можно стартовать
```

`normalizeRules` зажимает диапазоны, подставляет дефолты для отсутствующих
полей и разрешает взаимоисключение: если `paidDoubtEnabled`, то
`unmaskEnabled` принудительно `false`. Она же — серверная валидация: клиенту
верить нельзя.

`rulesProblems` возвращает человекочитаемые причины, по которым старт
запрещён (сейчас одна: колода меньше `MIN_DECK_SIZE`). UI показывает их
текстом, а не гасит кнопку молча.

**Тесты:** дефолты; зажим выходов за диапазон с обеих сторон; мусор на входе
(`null`, строки, лишние ключи) даёт валидные правила; `paidDoubtEnabled`
гасит `unmaskEnabled`; `deckSize(DEFAULT_RULES) === 51`; `rulesProblems`
ловит малую колоду и молчит на дефолтах.

**Коммит:** `feat(engine): GameRules — правила партии одним объектом`

---

### Task 2: правила в состоянии игры и в сборке колоды

**Files:** `types.ts` (+`rules: GameRules` в `GameState`, сигнатура `startGame`),
`GameStore.ts` (`startGame(seats, rules)`), `cards.ts`
(`createInitialDeck(rules?)`), создать `rules.deck.check.ts`

`createInitialDeck` начинает принимать правила и собирать колоду по
`rules.deck`; без аргумента — по `DEFAULT_RULES`, чтобы существующие вызовы в
тестах не сломались. `CARD_COPIES_MAP` остаётся источником умолчаний.

`startGame` кладёт `normalizeRules(rules)` в состояние и собирает колоду по
ним. Поле `rules` доедет до клиентов само — транспорт не трогаем, но это надо
подтвердить тестом.

**Тесты (`rules.deck.check.ts`):** дефолтные правила дают те же 51 карту и то
же распределение; `deck['Право вето'] = 0` убирает вето из колоды целиком;
кастомный состав собирается ровно как заказан; `startGame` кладёт
нормализованные правила в состояние; `toGameStateData` их не теряет.

**Коммит:** `feat(engine): колода собирается по правилам партии`

---

### Task 3: порог победы

**Files:** `resolvers/coronation.ts`, `resolvers/sealsResolver.ts`,
`resolvers/turnResolver.ts`, `resolvers/roleResolver.ts`,
`resolvers/plotResolver.ts`, `resolvers/doubtResolver.ts`,
`resolvers/crownLoss.ts`, `GameStore.ts`, `apps/web/src/components/Modals.tsx`

Все вхождения `6` как порога победы и как потолка корон переезжают на
`rules.crownsToWin`. Чистые функции получают его параметром:
`fallenCoronationPatch(candidateId, fallenId, newFavor, crownsToWin)`,
`resolveCoronationAtTurnStart(nextId, players, candidateId, originId, crownsToWin)`,
`addSealsToPlayer(get, set, playerId, count)` читает из `get().rules`.

Найти всё: `grep -rn ">= 6\|Math.min(6\|< 6\|6 👑" packages/engine/src apps/web/src`.

**Тесты (`rules.engine.check.ts`, создать):** победа наступает на
`crownsToWin` при значениях 1, 5 и 10; при 1 первая же корона выигрывает;
потолок корон равен порогу (Наследник не перевалит за него); круг коронации
срывается при падении ниже порога.

**Коммит:** `feat(engine): порог победы задаётся правилами`

---

### Task 4: жетоны хода

**Files:** `GameStore.ts` (стартовые `actionTokens`), `resolvers/turnResolver.ts`
(восполнение), `rules.engine.check.ts`

**Тесты:** старт с `rules.actionTokens`; восполнение в начале хода до него же;
при 1 жетоне игрок делает одно действие за ход.

**Коммит:** `feat(engine): число жетонов хода задаётся правилами`

---

### Task 5: экономика — пир, слух, шантаж

**Files:** `GameStore.ts` (`performAction`: кап пира, списание шантажа),
`resolvers/normalActionResolver.ts`, `apps/web/src/components/CourtActionsDialog.tsx`,
`apps/web/src/App.tsx`, `rules.engine.check.ts`

* Пир: цена `rules.feastCost`, кап `rules.crownsToWin - 1`.
* Слух: цена `rules.rumorCost`.
* Шантаж: `rules.blackmailCost` списывается **при заявлении** и не
  возвращается ни при блефе, ни при вето, ни при отступлении с дуэли.
  Не хватает золота — заявка отклоняется (и в UI, и в движке).

Диалог действий двора показывает цены из правил, а не литералы.

**Тесты:** пир списывает `feastCost` и заперт на `crownsToWin - 1`; слух
списывает `rumorCost`; шантаж списывает `blackmailCost` при заявлении;
пойманный на блефе шантажист денег не возвращает; при нехватке золота заявка
«Шантажист» отклоняется движком.

**Коммит:** `feat(engine): цены пира, слуха и шантажа задаются правилами`

---

### Task 6: дуэль тратит жетон

**Files:** `resolvers/duelResolver.ts` (`targetDeclareDuel`), `rules.engine.check.ts`

При `duelCostsToken: false` вызов на дуэль не списывает жетон и доступен при
0 ⚡. Проверка «НЕ ВЕРЮ!» этим тумблером не управляется — у неё Задача 8.

**Тесты:** при `true` жетон списан и без жетона дуэль невозможна; при `false`
жетон не списан и дуэль возможна с 0 ⚡.

**Коммит:** `feat(engine): стоимость дуэли в жетонах задаётся правилами`

---

### Task 7: вето на вето

**Files:** `types.ts` (`vetoChain: number`), `resolvers/instantResolver.ts`,
`resolvers/doubtResolver.ts`, `GameStore.ts`, создать `vetoChain.check.ts`

`isVetoed` становится производным от `vetoChain % 2 === 1` и пишется всегда
вместе с ним, одним `set` — иначе поля разъедутся. При `vetoOnVeto: true`
сыгранное вето перезапускает окно с новым `vetoDeadlineAt` вместо того, чтобы
его закрыть.

Осторожно с местом, где окно потребляется синхронно
(`proceedAfterVetoWindow`, комментарий про бота, который иначе тратит вето
впустую): перезапуск обязан ставить `turnPhase` обратно в `'VETO_WINDOW'` в том
же `set`, что и новый дедлайн.

**Тесты (`vetoChain.check.ts`):** при `false` второе вето не принимается;
при `true` цепочка длиной 2 применяет эффект, длиной 3 — отменяет; окно
перезапускается с новым дедлайном; цепочка длиной 5 отрабатывает; перепись
карт (`assertCardCensus`) сходится после цепочки.

**Коммит:** `feat(engine): вето на вето — цепочка вместо одноразового окна`

---

### Task 8: платная проверка и срыв масок

**Files:** `resolvers/doubtResolver.ts` (`doubtAction`), `GameStore.ts`,
`apps/web/src` (кнопка «Не верю» показывает, чем платит), создать
`paidDoubt.check.ts`

Оплата автоматическая: есть жетон → жетон; нет жетона, правило включено,
золота хватает → золото. «Срыв масок» — то же, но только когда проверяющий
является целью текущей атаки «Вора» или «Шантажиста».

**Тесты:** без жетона и с выключенными правилами проверка невозможна; с
`paidDoubtEnabled` списывается `paidDoubtCost`; при нехватке золота невозможна;
с `unmaskEnabled` жертва атаки может заплатить, а посторонний — нет; при
наличии жетона всегда тратится жетон, а не золото.

**Коммит:** `feat(engine): проверку можно оплатить золотом`

---

### Task 9: экран правил и режим с ботами

**Files:** создать `apps/web/src/rules/RulesEditor.tsx`,
`apps/web/src/rules/rulesStorage.ts` (+`.check.ts`), `apps/web/src/Root.tsx`

Один компонент на два режима: `readOnly` для не-хоста в лобби. Секции —
Победа, Экономика, Реакции, Состав колоды (свёрнута, счётчик карт в
заголовке). Причины из `rulesProblems` показываются текстом над кнопкой
старта.

`Root.tsx`: «Играть с ботами» ведёт на экран правил, оттуда «Начать партию».
Правила переживают перезагрузку через `localStorage`, есть «Сбросить к
умолчаниям».

**Тесты (`rulesStorage.check.ts`):** сохранение и чтение; битый JSON в
хранилище не роняет игру, а даёт дефолты; правила из хранилища проходят через
`normalizeRules`.

**Коммит:** `feat(web): экран правил партии перед игрой с ботами`

---

### Task 10: правила в лобби и валидация на сервере

**Files:** `apps/server/src/KinglierRoom.ts`, `apps/server/src/GameWorkerClient.ts`,
`apps/server/src/gameWorker.ts`, `apps/web/src/online/Lobby.tsx`,
`apps/web/src/online/OnlineGameClient.ts`, `KinglierRoom.lobby.check.ts`

Хост правит правила, они уходят сообщением `rules` и попадают в
`lobbySnapshot`, откуда остальные видят их живьём. `handleStart` пропускает их
через `normalizeRules` перед передачей в воркер — клиенту не верим.
Не-хост правил не меняет: сообщение от не-хоста отбрасывается.

**Тесты:** `rules` от хоста меняют снапшот и рассылаются всем; `rules` от
не-хоста игнорируются; мусорные правила нормализуются; `handleStart` передаёт
в воркер нормализованные правила.

**Коммит:** `feat(online): хост настраивает правила партии в лобби`

---

### Task 11: боты читают правила

**Files:** `packages/engine/src/bot/botTurnPlanner.ts`,
`bot/botTargeting.ts`, `bot/botReactions.ts`

Литералы `costGold: 5`, `costGold: 3` и пороги корон (`favor >= 5`,
`favor >= 4`) переезжают на `rules`. Боты умеют платить за проверку золотом,
когда правило включено и жетона нет.

**Тесты:** прогнать `botTargeting.check.ts`, `botDoubt.check.ts`,
`botIntrigues.check.ts` (последний — с нестандартными правилами: порог победы
3, чтобы партия дошла до победы за отведённое окно).

**Коммит:** `feat(bots): боты играют по правилам партии`

---

### Task 12: свод правил

**Files:** `RULES.md`

Новый раздел «Настройки партии» с таблицей регуляторов, их диапазонами и
умолчаниями. Числа в остальном тексте помечаются как значения по умолчанию, а
не как незыблемые: порог победы, жетоны, цены пира и слуха. Описать вето на
вето, платную проверку и срыв масок.

**Коммит:** `docs(rules): настройки партии в своде правил`

---

## Проверка готовности фазы

- [ ] Весь набор `*.check.ts` зелёный, `npm run lint` чист, оба `tsc --noEmit` чисты
- [ ] Партия с ботами на дефолтных правилах играется как до фазы (кроме порога 5)
- [ ] Партия с порогом 1 выигрывается первой короной
- [ ] Колода из 8 карт стартует; из 7 — не даёт стартовать с внятной причиной
- [ ] Вето на вето: цепочка из трёх вето отменяет эффект, из двух — применяет
- [ ] Без жетона с включённой платной проверкой кнопка «Не верю» показывает цену в 🪙
- [ ] Правила, выставленные хостом в лобби, видны остальным и применяются в партии
