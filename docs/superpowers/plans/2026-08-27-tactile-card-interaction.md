# Тактильное взаимодействие с картами — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести принятие решений с правой колонки кнопок на сами карты, а интерфейс сделать плавным и атомарным — без ремаунтов и морганий на каждом действии.

**Architecture:** Одна производная модель `TableView` выводится из стора чистой функцией и становится единственным источником того, что видно: правая колонка (`PhasePanel`), панель над картами (`HandBar`) и меню на карте читают её и физически не могут разъехаться. Ключи `AnimatePresence` строятся из `view.id`, который меняется только при изменении видимого, поэтому чужой ход не пересоздаёт панели. Взаимодействие с картой раскрывается меню над слотом руки, а не модалкой.

**Tech Stack:** TypeScript, React 19, Zustand 5, `motion` (наследник framer-motion), Vite, oxlint. Тесты — самостоятельные файлы `*.check.ts`, запускаются `npx tsx`.

## Global Constraints

- Спека: `docs/superpowers/specs/2026-08-27-tactile-card-interaction-design.md`. Читать перед началом.
- Тестовая конвенция: файл `foo.check.ts` рядом с `foo.ts`, `node:assert/strict`, последняя строка `console.log('foo.check: ok')`. Запуск: `npx tsx <path>`.
- Импорты между пакетами — через `@kinglier/engine/<module>` (см. `packages/engine/package.json`, `exports: "./*": "./src/*.ts"`).
- Полная проверка проекта, обязательна перед каждым коммитом:
  ```bash
  npm run build:web && npm run lint && for f in $(find packages/engine/src apps/web/src apps/server/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
  ```
- Язык интерфейса — русский. Никаких английских подписей в UI.
- Настоящее лицо карты (`face.known`) не раскрывается нигде, кроме вскрытия. Всё, что рисуется про карту на столе, берётся из заявки (`roleClaim` / `plotType` / `instantType`).
- Единственное изменение правил игры — длительность окна вето. Всё остальное поведение движка сохраняется.
- Токены движения берутся из `apps/web/src/motion/tokens.ts` (`spring`, `dur`). Новых магических длительностей не заводить.
- `useReducedMotion()` уважается везде, где появляется движение.

## File Structure

**Создаётся:**

| Файл | Ответственность |
|---|---|
| `apps/web/src/lib/tableView.ts` | Чистая `deriveTableView` + типы `TableView`. Вся логика «что сейчас можно» — здесь и только здесь. |
| `apps/web/src/lib/tableView.check.ts` | Тесты derivation, включая стабильность `id`. |
| `apps/web/src/components/ui/AnimatedNumber.tsx` | Число, которое анимируется без ремаунта узла. |
| `apps/web/src/components/ui/CrossfadeText.tsx` | Смена текста кроссфейдом внутри постоянного узла. |
| `apps/web/src/components/PhasePanel.tsx` | Правая колонка. Ни одной кнопки. |
| `apps/web/src/components/HandBar.tsx` | Панель кнопок над картами + полоска вето. |
| `apps/web/src/components/VetoTimerBar.tsx` | Полоска вето на `requestAnimationFrame`. |
| `apps/web/src/components/CardMenu.tsx` | Меню над слотом руки. |
| `apps/web/src/components/BluffDialog.tsx` | Модалка блефа — плитки ролей. |
| `apps/web/src/components/CourtActionsDialog.tsx` | Модалка действий двора — плитки с иконками. |
| `apps/web/src/components/ui/Tile.tsx` | Общая плитка для обеих модалок. |
| `apps/web/src/styles/tiles.css` | Стили плиток. |

**Удаляется:** `apps/web/src/components/ActionControls.tsx`, `apps/web/src/components/RoleClaimPopup.tsx`, `apps/web/src/components/NormalActionsPopup.tsx`.

**Правится:** `App.tsx`, `TopBar.tsx`, `Hand.tsx`, `Modals.tsx`, `CardDetailModal.tsx`, `SeatsRow.tsx`, `OpponentSeat.tsx`, `StakedCardArena.tsx`, `Chronicle.tsx`, `Codex.tsx`, `ui/Res.tsx`, `ui/Button.tsx`, `PlayerCrest.tsx`, `motion/CardLayer.tsx`, `styles/layout.css`, `styles/panels.css`, `styles/index.css`, `packages/engine/src/timing.ts`, `packages/engine/src/types.ts`, `packages/engine/src/GameStore.ts`, `packages/engine/src/resolvers/doubtResolver.ts`, `packages/engine/src/resolvers/instantResolver.ts`, `apps/web/src/online/bindOnlineStore.ts`.

**Порядок фаз:** 1 — плавность (Задачи 1–3), 2 — зоны (4–6), 3 — карты (7–8), 4 — вето и модалки (9–14). После каждой фазы игра остаётся играбельной.

---

### Task 1: Модель `TableView`

Чистая функция, из которой потом читают все три поверхности. Пишется первой, потому что задачи 4, 5 и 7 — это её отрисовка.

**Files:**
- Create: `apps/web/src/lib/tableView.ts`
- Test: `apps/web/src/lib/tableView.check.ts`

**Interfaces:**
- Consumes: `GameState`, `Player`, `Action` из `@kinglier/engine/types`; `CardId`, `CardInstance` из `@kinglier/engine/cardInstance`; `CARD_DESCRIPTIONS`, `ALL_ROLES`, `isPlot`, `isInstant` из `@kinglier/engine/data/cardDescriptions`.
- Produces: `deriveTableView(state: TableViewInput, viewerId: string): TableView`; типы `TableView`, `PhaseKind`, `BarButton`, `BarActionKind`, `CardMenuOption`, `CardMenuKind`, `PlayerRef`, `ClaimRef`.

> Спека называет доступ к меню `menuFor(cardId)`. Реализуется как словарь `menus: Record<CardId, CardMenuOption[]>` — та же вещь, но её можно сравнить и проверить тестом.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/tableView.check.ts`

```ts
/**
 * Self-check: `deriveTableView` — единственный источник того, что видно.
 *
 * Случай, ради которого всё затевалось, — №3: два разных `pendingAction.id`
 * при одинаковом видимом содержимом обязаны дать один и тот же `view.id`.
 * Именно на нём строятся ключи `AnimatePresence`, и именно его нестабильность
 * пересоздавала правую колонку на каждый ход бота.
 *
 * Run: npx tsx apps/web/src/lib/tableView.check.ts
 */
import assert from 'node:assert/strict';
import { deriveTableView } from './tableView.ts';
import type { TableViewInput } from './tableView.ts';
import type { Action, GameCard, Player } from '@kinglier/engine/types';
import type { CardInstance } from '@kinglier/engine/cardInstance';

let seq = 0;
function hand(...cards: GameCard[]): CardInstance[] {
  return cards.map(card => ({ id: `c${seq++}`, card }));
}

function player(id: string, over: Partial<Player> = {}): Player {
  return {
    id,
    name: id.toUpperCase(),
    gold: 10,
    favor: 0,
    seals: 0,
    actionTokens: 2,
    hand: hand('Наследник', 'Рыцарь'),
    activePlot: null,
    isBot: id !== 'p1',
    ...over
  } as Player;
}

function input(over: Partial<TableViewInput> = {}): TableViewInput {
  return {
    players: [player('p1'), player('p2'), player('p3')],
    activePlayerId: 'p1',
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE',
    pendingAction: null,
    pendingDoubtDoubterId: null,
    pendingDoubtPassedIds: [],
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    isVetoed: false,
    vetoDeadlineAt: null,
    coronationCandidateId: null,
    ...over
  };
}

function action(over: Partial<Action> = {}): Action {
  return {
    id: 'a1',
    type: 'role',
    name: 'Наследник',
    roleClaim: 'Наследник',
    actorId: 'p2',
    costGold: 0,
    costTokens: 1,
    description: '',
    ...over
  } as Action;
}

// 1. Свой ход: три кнопки в панели, у каждой карты — розыгрыш, блеф, подробнее.
{
  const view = deriveTableView(input(), 'p1');
  assert.equal(view.phase, 'turn');
  assert.deepEqual(
    view.bar.map(b => b.kind),
    ['court-actions', 'end-turn'],
    'заговора нет — значит и кнопки заговора нет'
  );
  assert.equal(view.viewerHandIds.length, 2, 'у зрителя две карты — два меню');
  for (const cardId of view.viewerHandIds) {
    assert.deepEqual(
      view.menus[cardId].map(o => o.kind),
      ['play', 'bluff', 'inspect'],
      'роль в свой ход играется, блефуется и читается'
    );
  }
}

// 2. Чужой ход: кнопок нет, у своих карт остаётся только «Подробнее».
{
  const view = deriveTableView(input({ activePlayerId: 'p2' }), 'p1');
  assert.equal(view.phase, 'waiting');
  assert.deepEqual(view.bar, [], 'в чужой ход нажимать нечего');
  assert.deepEqual(
    view.menus[view.viewerHandIds[0]].map(o => o.kind),
    ['inspect'],
    'чужой ход — карту можно только прочитать'
  );
}

// 3. ГЛАВНОЕ: id не зависит от того, что не видно.
{
  const a = deriveTableView(input({ activePlayerId: 'p2', pendingAction: action({ id: 'a1' }), turnPhase: 'DOUBT_WINDOW' }), 'p1');
  const b = deriveTableView(input({ activePlayerId: 'p2', pendingAction: action({ id: 'a2' }), turnPhase: 'DOUBT_WINDOW' }), 'p1');
  assert.equal(a.id, b.id, 'другой id действия при том же видимом — тот же view.id');

  const c = deriveTableView(input({ activePlayerId: 'p2', pendingAction: action({ id: 'a1', roleClaim: 'Вор' }), turnPhase: 'DOUBT_WINDOW' }), 'p1');
  assert.notEqual(a.id, c.id, 'сменилась заявка — сменился view.id');
}

// 4. Нападение: щит против Вора — Казначей, у него «дуэль: защита».
{
  const attacked = input({
    activePlayerId: 'p2',
    turnPhase: 'TARGET_REACTION_WINDOW',
    pendingAction: action({ roleClaim: 'Вор', targetId: 'p1' }),
    players: [
      player('p1', { hand: hand('Казначей', 'Перенаправление') }),
      player('p2'),
      player('p3')
    ]
  });
  const view = deriveTableView(attacked, 'p1');
  assert.equal(view.phase, 'under-attack');
  assert.deepEqual(view.bar.map(b => b.kind), ['accept-attack', 'doubt']);
  const [shieldId, redirectId] = view.viewerHandIds;
  assert.deepEqual(view.menus[shieldId].map(o => o.kind), ['duel-shield', 'inspect']);
  assert.deepEqual(view.menus[redirectId].map(o => o.kind), ['play', 'duel-bluff', 'inspect']);
}

// 5. Нападение чужой ролью: карта, не являющаяся щитом, идёт только в блеф-дуэль.
{
  const attacked = input({
    activePlayerId: 'p2',
    turnPhase: 'TARGET_REACTION_WINDOW',
    pendingAction: action({ roleClaim: 'Шантажист', targetId: 'p1' }),
    players: [player('p1', { hand: hand('Шут', 'Рыцарь') }), player('p2'), player('p3')]
  });
  const view = deriveTableView(attacked, 'p1');
  const [jester, knight] = view.viewerHandIds;
  assert.deepEqual(view.menus[jester].map(o => o.kind), ['duel-bluff', 'inspect']);
  assert.deepEqual(view.menus[knight].map(o => o.kind), ['duel-shield', 'inspect'], 'против Шантажиста щит — Рыцарь');
}

// 6. Окно вето: кнопок нет, вето играется картой, дедлайн доезжает до модели.
{
  const deadline = 1_000_000;
  const view = deriveTableView(input({
    turnPhase: 'VETO_WINDOW',
    activePlayerId: 'p2',
    pendingAction: action(),
    vetoDeadlineAt: deadline,
    players: [player('p1', { hand: hand('Право вето', 'Шут') }), player('p2'), player('p3')]
  }), 'p1');
  assert.equal(view.phase, 'veto');
  assert.deepEqual(view.bar, [], 'в окне вето кнопок нет — только карта');
  assert.equal(view.deadlineAt, deadline);
  const [vetoId, jesterId] = view.viewerHandIds;
  assert.deepEqual(view.menus[vetoId].map(o => o.kind), ['veto', 'inspect']);
  assert.deepEqual(view.menus[jesterId].map(o => o.kind), ['inspect']);
}

// 7. Глухие кнопки остаются видимыми и объясняют себя одним словом.
{
  const view = deriveTableView(input({
    players: [player('p1', { actionTokens: 0 }), player('p2'), player('p3')]
  }), 'p1');
  const court = view.bar.find(b => b.kind === 'court-actions')!;
  assert.equal(court.disabled, true);
  assert.equal(court.reason, 'нет ⚡');

  const spent = deriveTableView(input({ hasUsedNormalActionThisTurn: true }), 'p1');
  assert.equal(spent.bar.find(b => b.kind === 'court-actions')!.reason, 'уже было');
}

// 8. Реактивные инстанты и Ва-банк в свой ход не «разыгрываются».
{
  const view = deriveTableView(input({
    players: [player('p1', { hand: hand('Право вето', 'Ва-банк') }), player('p2'), player('p3')]
  }), 'p1');
  for (const id of view.viewerHandIds) {
    assert.deepEqual(view.menus[id].map(o => o.kind), ['bluff', 'inspect']);
  }
}

console.log('tableView.check: ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx apps/web/src/lib/tableView.check.ts`
Expected: FAIL — `Cannot find module './tableView.ts'`.

- [ ] **Step 3: Write the implementation** — `apps/web/src/lib/tableView.ts`

```ts
/**
 * Единственная производная правда о том, что видно за столом.
 *
 * Правая колонка, панель над картами и меню на карте — три отрисовки одного
 * значения. Раньше каждая из них выводила своё состояние сама, из сырых полей
 * стора, и они расходились: панель уже показывала новую фазу, пока меню ещё
 * предлагало действие из старой.
 *
 * `id` — договор с `AnimatePresence`. Он собирается ИСКЛЮЧИТЕЛЬНО из того, что
 * нарисовано, и никогда из `pendingAction.id`. Ход бота, который ничего не
 * меняет на экране игрока, обязан дать прежний `id`, иначе панель будет
 * пересоздаваться на каждое чужое действие — ровно тот дефект, ради которого
 * этот файл существует.
 */
import { CARD_DESCRIPTIONS, isInstant, isPlot } from '@kinglier/engine/data/cardDescriptions';
import type { CardId, CardInstance } from '@kinglier/engine/cardInstance';
import type { Action, GameCard, GameState, Player, Role } from '@kinglier/engine/types';

/** Инстанты, которые владелец может выложить открыто в свой ход. */
const OPENLY_PLAYABLE_INSTANTS: GameCard[] = [
  'Обыск покоев',
  'Дворцовый переполох',
  'Обвинение в измене'
];

export type PhaseKind =
  | 'turn'
  | 'waiting'
  | 'doubt'
  | 'reveal'
  | 'under-attack'
  | 'duel-answer'
  | 'veto'
  | 'coronation';

export interface PlayerRef {
  id: string;
  name: string;
  avatar?: string;
}

export interface ClaimRef {
  card: GameCard;
  rule: string;
}

export type BarActionKind =
  | 'court-actions'
  | 'conspiracy'
  | 'end-turn'
  | 'doubt'
  | 'believe'
  | 'accept-attack'
  | 'duel-accept'
  | 'duel-retreat';

export type Tone = 'gold' | 'danger' | 'calm' | 'good' | 'arcane';

export interface BarButton {
  kind: BarActionKind;
  label: string;
  tone: Tone;
  disabled: boolean;
  /** Одно слово, печатается на глухой кнопке. Скрывать кнопку нельзя. */
  reason?: string;
}

export type CardMenuKind = 'play' | 'bluff' | 'inspect' | 'veto' | 'duel-shield' | 'duel-bluff';

export interface CardMenuOption {
  kind: CardMenuKind;
  label: string;
  tone: Tone;
  disabled: boolean;
  reason?: string;
}

export interface TableView {
  id: string;
  phase: PhaseKind;
  title: string;
  actor: PlayerRef | null;
  claim: ClaimRef | null;
  awaiting: PlayerRef[];
  deadlineAt: number | null;
  tokens: number;
  spent: { court: boolean; plot: boolean; role: boolean };
  bar: BarButton[];
  /** Порядок слотов руки зрителя — тесты и `Hand` обходят её по нему. */
  viewerHandIds: CardId[];
  menus: Record<CardId, CardMenuOption[]>;
}

/** Ровно те поля стора, от которых зависит картинка. Ничего лишнего: всё, что
 *  сюда попадёт, начнёт участвовать в `id` и вернёт моргание. */
export interface TableViewInput {
  players: Player[];
  activePlayerId: string;
  turnPhase: GameState['turnPhase'];
  turnSubPhase: GameState['turnSubPhase'];
  pendingAction: Action | null;
  pendingDoubtDoubterId: string | null;
  pendingDoubtPassedIds: string[];
  hasUsedNormalActionThisTurn: boolean;
  hasPlayedRoleThisTurn: boolean;
  hasPlayedPlotThisTurn: boolean;
  isVetoed: boolean;
  vetoDeadlineAt: number | null;
  coronationCandidateId: string | null;
}

const ref = (p: Player): PlayerRef => ({ id: p.id, name: p.name, avatar: p.avatar });

/** Роль-щит против конкретного нападения. Против Вора — Казначей, иначе Рыцарь. */
export function shieldRoleFor(roleClaim: string | undefined): Role {
  return roleClaim === 'Вор' ? 'Казначей' : 'Рыцарь';
}

function claimOf(action: Action | null): ClaimRef | null {
  const card = (action?.roleClaim ?? action?.plotType ?? action?.instantType) as
    | GameCard
    | undefined;
  if (!card) return null;
  return { card, rule: CARD_DESCRIPTIONS[card].shortDescription };
}

function inspectOption(): CardMenuOption {
  return { kind: 'inspect', label: 'Подробнее', tone: 'calm', disabled: false };
}

/** Меню карты в свой ход. */
function ownTurnMenu(
  card: GameCard,
  viewer: Player,
  input: TableViewInput
): CardMenuOption[] {
  const options: CardMenuOption[] = [];
  const hasTokens = viewer.actionTokens >= 1;

  const playable =
    isPlot(card) || OPENLY_PLAYABLE_INSTANTS.includes(card) || (!isInstant(card) && !isPlot(card));

  if (playable) {
    const info = CARD_DESCRIPTIONS[card];
    let reason: string | undefined;
    if (!hasTokens) reason = 'нет ⚡';
    else if (isPlot(card) && input.hasPlayedPlotThisTurn) reason = 'интрига уже была';
    else if (!isPlot(card) && !isInstant(card) && input.hasPlayedRoleThisTurn) reason = 'роль уже была';
    else if (!isPlot(card) && !isInstant(card) && viewer.gold < info.cost) reason = 'дорого';

    options.push({
      kind: 'play',
      label: 'Разыграть',
      tone: 'gold',
      disabled: !!reason,
      reason
    });
  }

  const bluffReason = !hasTokens
    ? 'нет ⚡'
    : input.hasPlayedRoleThisTurn
      ? 'роль уже была'
      : undefined;
  options.push({
    kind: 'bluff',
    label: 'Блеф',
    tone: 'arcane',
    disabled: !!bluffReason,
    reason: bluffReason
  });

  options.push(inspectOption());
  return options;
}

/** Меню карты, когда зритель — цель нападения. */
function underAttackMenu(
  card: GameCard,
  viewer: Player,
  input: TableViewInput
): CardMenuOption[] {
  const options: CardMenuOption[] = [];
  const hasTokens = viewer.actionTokens >= 1;
  const shield = shieldRoleFor(input.pendingAction?.roleClaim);

  if (card === 'Перенаправление') {
    options.push({ kind: 'play', label: 'Разыграть', tone: 'gold', disabled: false });
    options.push({
      kind: 'duel-bluff',
      label: 'Дуэль: блеф',
      tone: 'danger',
      disabled: !hasTokens,
      reason: hasTokens ? undefined : 'нет ⚡'
    });
  } else if (card === shield) {
    options.push({
      kind: 'duel-shield',
      label: 'Дуэль: защита',
      tone: 'good',
      disabled: !hasTokens,
      reason: hasTokens ? undefined : 'нет ⚡'
    });
  } else {
    options.push({
      kind: 'duel-bluff',
      label: 'Дуэль: блеф',
      tone: 'danger',
      disabled: !hasTokens,
      reason: hasTokens ? undefined : 'нет ⚡'
    });
  }

  options.push(inspectOption());
  return options;
}

function menuFor(
  held: CardInstance,
  phase: PhaseKind,
  viewer: Player,
  input: TableViewInput
): CardMenuOption[] {
  const card = held.card;
  if (phase === 'turn') return ownTurnMenu(card, viewer, input);
  if (phase === 'under-attack') return underAttackMenu(card, viewer, input);
  if (phase === 'veto' && card === 'Право вето' && !input.isVetoed) {
    return [
      { kind: 'veto', label: 'Наложить вето', tone: 'danger', disabled: false },
      inspectOption()
    ];
  }
  return [inspectOption()];
}

function barFor(phase: PhaseKind, viewer: Player, input: TableViewInput): BarButton[] {
  const hasTokens = viewer.actionTokens >= 1;
  const noTokens = hasTokens ? undefined : 'нет ⚡';

  switch (phase) {
    case 'turn': {
      const courtReason = input.hasUsedNormalActionThisTurn
        ? 'уже было'
        : input.turnSubPhase !== 'NORMAL_ACTION_PHASE'
          ? 'уже было'
          : noTokens;
      const bar: BarButton[] = [
        {
          kind: 'court-actions',
          label: 'Действия двора',
          tone: 'calm',
          disabled: !!courtReason,
          reason: courtReason
        }
      ];
      const charges =
        viewer.activePlot?.type === 'Тайный заговор' ? (viewer.activePlot.charges ?? 0) : 0;
      if (charges >= 1) {
        bar.push({
          kind: 'conspiracy',
          label: `Свершить заговор · ${charges}/4`,
          tone: 'arcane',
          disabled: !hasTokens,
          reason: noTokens
        });
      }
      bar.push({ kind: 'end-turn', label: 'Завершить ход', tone: 'gold', disabled: false });
      return bar;
    }
    case 'doubt':
      return [
        {
          kind: 'doubt',
          label: 'Не верю',
          tone: 'danger',
          disabled: !hasTokens,
          reason: noTokens
        },
        { kind: 'believe', label: 'Верю', tone: 'good', disabled: false }
      ];
    case 'under-attack':
      return [
        { kind: 'accept-attack', label: 'Принять', tone: 'calm', disabled: false },
        {
          kind: 'doubt',
          label: 'Не верю',
          tone: 'danger',
          disabled: !hasTokens,
          reason: noTokens
        }
      ];
    case 'duel-answer':
      return [
        { kind: 'duel-accept', label: 'Принять бой', tone: 'danger', disabled: false },
        { kind: 'duel-retreat', label: 'Отступить', tone: 'calm', disabled: false }
      ];
    default:
      return [];
  }
}

function phaseOf(input: TableViewInput, viewer: Player): PhaseKind {
  const { turnPhase, pendingAction, activePlayerId, pendingDoubtDoubterId } = input;
  if (pendingDoubtDoubterId) return 'reveal';
  if (turnPhase === 'TARGET_REACTION_WINDOW' && pendingAction?.targetId === viewer.id) {
    return 'under-attack';
  }
  if (turnPhase === 'DUEL_ATTACKER_WINDOW' && pendingAction?.actorId === viewer.id) {
    return 'duel-answer';
  }
  if (turnPhase === 'VETO_WINDOW') return 'veto';
  if (turnPhase === 'DOUBT_WINDOW' && pendingAction?.actorId !== viewer.id) return 'doubt';
  if (input.coronationCandidateId) return 'coronation';
  if (activePlayerId === viewer.id && turnPhase === 'IDLE' && !pendingAction) return 'turn';
  return 'waiting';
}

function titleFor(phase: PhaseKind, actor: PlayerRef | null): string {
  switch (phase) {
    case 'turn': return 'Ваш ход';
    case 'doubt': return 'Окно сомнений';
    case 'reveal': return 'Проверка';
    case 'under-attack': return 'Вас атакуют';
    case 'duel-answer': return 'Вызов на дуэль';
    case 'veto': return 'Окно вето';
    case 'coronation': return 'Круг коронации';
    default: return actor ? `Ход: ${actor.name}` : 'Ожидание';
  }
}

/** Кого ещё ждут. Пусто там, где решение принимает один игрок. */
function awaitingFor(phase: PhaseKind, input: TableViewInput): PlayerRef[] {
  const { players, pendingAction, pendingDoubtPassedIds } = input;
  if (phase === 'doubt' && pendingAction) {
    return players
      .filter(p => p.id !== pendingAction.actorId && !pendingDoubtPassedIds.includes(p.id))
      .map(ref);
  }
  if (phase === 'under-attack' && pendingAction?.targetId) {
    const target = players.find(p => p.id === pendingAction.targetId);
    return target ? [ref(target)] : [];
  }
  return [];
}

export function deriveTableView(input: TableViewInput, viewerId: string): TableView {
  const viewer = input.players.find(p => p.id === viewerId) ?? input.players[0];
  const phase = phaseOf(input, viewer);
  const actorPlayer = input.players.find(
    p => p.id === (input.pendingAction?.actorId ?? input.activePlayerId)
  );
  const actor = actorPlayer ? ref(actorPlayer) : null;
  const claim = claimOf(input.pendingAction);
  const awaiting = awaitingFor(phase, input);
  const bar = barFor(phase, viewer, input);

  const viewerHandIds = viewer.hand.map(h => h.id);
  const menus: Record<CardId, CardMenuOption[]> = {};
  for (const held of viewer.hand) {
    menus[held.id] = menuFor(held, phase, viewer, input);
  }

  /* Подпись под тем, что нарисовано. Всё, чего здесь нет, менять картинку не
     имеет права; всё, что здесь есть, обязано её менять. */
  const id = [
    phase,
    actor?.id ?? '-',
    claim?.card ?? '-',
    awaiting.map(a => a.id).join(','),
    bar.map(b => `${b.kind}${b.disabled ? '!' : ''}${b.reason ?? ''}`).join(','),
    viewerHandIds.map(cid => menus[cid].map(o => `${o.kind}${o.disabled ? '!' : ''}`).join('.')).join('|')
  ].join('~');

  return {
    id,
    phase,
    title: titleFor(phase, actor),
    actor,
    claim,
    awaiting,
    deadlineAt: phase === 'veto' ? input.vetoDeadlineAt : null,
    tokens: viewer.actionTokens,
    spent: {
      court: input.hasUsedNormalActionThisTurn,
      plot: input.hasPlayedPlotThisTurn,
      role: input.hasPlayedRoleThisTurn
    },
    bar,
    viewerHandIds,
    menus
  };
}
```

- [ ] **Step 4: Add the state field the model reads**

`vetoDeadlineAt` появится в движке только в Задаче 9. Чтобы Задача 1 собиралась и тестировалась сейчас, поле объявляется в `TableViewInput` (уже сделано выше) и добавляется в `GameState` пустым — одна строка в `packages/engine/src/types.ts` рядом с `pendingVetoPassedIds`:

```ts
  /** Абсолютный timestamp закрытия окна вето. `null` вне окна. */
  vetoDeadlineAt: number | null;
```

и инициализация в `packages/engine/src/GameStore.ts` рядом с `pendingVetoPassedIds: []`:

```ts
  vetoDeadlineAt: null,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx apps/web/src/lib/tableView.check.ts`
Expected: PASS, `tableView.check: ok`.

- [ ] **Step 6: Full verification**

```bash
npm run build:web && npm run lint && for f in $(find packages/engine/src apps/web/src apps/server/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/tableView.ts apps/web/src/lib/tableView.check.ts packages/engine/src/types.ts packages/engine/src/GameStore.ts
git commit -m "feat(web): derive one table view from state

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Числа и текст перестают перемонтироваться

Дефект F2 из спеки: `.res__n`, `.crest__state span` и `.turnchip__copy` перемонтируются через `key=`, чтобы заново запустить CSS-анимацию. Это мигание цифр.

**Files:**
- Create: `apps/web/src/components/ui/AnimatedNumber.tsx`
- Create: `apps/web/src/components/ui/CrossfadeText.tsx`
- Modify: `apps/web/src/components/ui/Res.tsx:45-50`
- Modify: `apps/web/src/components/PlayerCrest.tsx:80`
- Modify: `apps/web/src/styles/tokens.css:324-327` (удалить `animation` у `.res__n`)
- Modify: `apps/web/src/styles/layout.css:1274-1277` (удалить `.crest__state span`)

**Interfaces:**
- Produces: `<AnimatedNumber value={number} />`, `<CrossfadeText>{string}</CrossfadeText>`.

- [ ] **Step 1: Write `AnimatedNumber`**

```tsx
/**
 * Число, которое меняется без ремаунта.
 *
 * Раньше `.res__n` получал `key={String(value)}`, чтобы CSS-анимация
 * `rise-in` запускалась заново. Ремаунт ради анимации — это ремаунт, и на
 * каждом изменении золота узел исчезал и появлялся. Здесь узел живёт всегда,
 * а меняется значение внутри motion-значения: React не рендерится ни разу за
 * время анимации.
 */
import React, { useEffect, useRef } from 'react';
import { animate, useMotionValue, useReducedMotion, useTransform, motion } from 'motion/react';
import { dur } from '../../motion/tokens.ts';

export const AnimatedNumber: React.FC<{ value: number; className?: string }> = ({
  value,
  className
}) => {
  const reduce = !!useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, latest => String(Math.round(latest)));
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduce) {
      first.current = false;
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: dur.panel, ease: [0.4, 0, 0.2, 1] });
    return () => controls.stop();
  }, [value, mv, reduce]);

  return <motion.span className={className}>{text}</motion.span>;
};
```

- [ ] **Step 2: Write `CrossfadeText`**

```tsx
/**
 * Смена строки кроссфейдом внутри постоянного узла.
 *
 * Замена приёму `<span key={text}>` с CSS `fade-in`: тот перемонтировал узел,
 * этот держит его на месте и перекрашивает содержимое. Обёртка сохраняет
 * ширину по самой длинной строке через grid-наложение, поэтому соседи не
 * дёргаются, пока текст меняется.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../../motion/tokens.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

export const CrossfadeText: React.FC<{ children: string; className?: string }> = ({
  children,
  className
}) => {
  const reduce = !!useReducedMotion();
  return (
    <span className={['xfade', className].filter(Boolean).join(' ')}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={children}
          className="xfade__line"
          initial={{ opacity: 0, y: reduce ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -4 }}
          transition={{ duration: reduce ? 0.12 : dur.fade, ease: EASE }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};
```

CSS в `apps/web/src/styles/panels.css`:

```css
.xfade {
  display: inline-grid;
  grid-template-areas: 'line';
}

.xfade__line {
  grid-area: line;
}
```

- [ ] **Step 3: Use them**

В `apps/web/src/components/ui/Res.tsx` заменить тело `<span>` значения:

```tsx
    <span>
      <span className="res__n">
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        {suffix ? ` ${suffix}` : ''}
      </span>
    </span>
```

(ключ `key={String(value)}` удаляется, импорт `AnimatedNumber` добавляется.)

В `apps/web/src/components/PlayerCrest.tsx` строку состояния:

```tsx
          <div className={`crest__state ${isActive ? 'crest__state--mine' : ''}`}>
            <CrossfadeText>{isActive ? 'ваш ход' : 'ожидание'}</CrossfadeText>
          </div>
```

В `apps/web/src/styles/tokens.css` удалить `animation: rise-in 0.22s var(--ease-out);` из `.res__n`; в `apps/web/src/styles/layout.css` удалить весь блок `.crest__state span`.

- [ ] **Step 4: Verify**

```bash
npm run build:web && npm run lint
```

Затем `npm run dev:web`, партия против ботов: цифры золота и корон меняются плавным счётом, не мигая.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui/AnimatedNumber.tsx apps/web/src/components/ui/CrossfadeText.tsx apps/web/src/components/ui/Res.tsx apps/web/src/components/PlayerCrest.tsx apps/web/src/styles/tokens.css apps/web/src/styles/layout.css apps/web/src/styles/panels.css
git commit -m "fix(web): animate numbers and labels without remounting them

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Селекторы вместо всего стора + временная починка ключа панели

Дефекты F1 и F3. Ключ `ActionControls` чинится одной строкой — панель проживёт до Задачи 6, но выигрыш виден сразу, а фаза 1 обязана оставлять игру лучше, чем взяла.

**Files:**
- Modify: `apps/web/src/App.tsx:47-70`
- Modify: `apps/web/src/components/SeatsRow.tsx:18`
- Modify: `apps/web/src/components/OpponentSeat.tsx:39-41,75`
- Modify: `apps/web/src/components/StakedCardArena.tsx`
- Modify: `apps/web/src/components/Chronicle.tsx`
- Modify: `apps/web/src/components/Codex.tsx`
- Modify: `apps/web/src/components/Modals.tsx:216-228`
- Modify: `apps/web/src/components/ActionControls.tsx:104,353`

- [ ] **Step 1: Заменить `useGameStore()` на селектор с `useShallow`**

Образец — `SeatsRow.tsx`:

```tsx
import { useShallow } from 'zustand/react/shallow';
// ...
  const { players, activePlayerId, pendingAction, viewerId } = useGameStore(
    useShallow(s => ({
      players: s.players,
      activePlayerId: s.activePlayerId,
      pendingAction: s.pendingAction,
      viewerId: s.viewerId
    }))
  );
```

То же самое проделать в `OpponentSeat.tsx` (там два вызова: `useSeatSpeech` и `floatingResourceEvents`), `StakedCardArena.tsx`, `Chronicle.tsx`, `Codex.tsx`, `Modals.tsx`, `ActionControls.tsx` и `App.tsx`. Правило: в объект селектора попадают **только** те поля, которые компонент действительно читает. `history` не берёт никто, кроме `Chronicle`; `floatingResourceEvents` — только `OpponentSeat` и `PlayerCrest`.

- [ ] **Step 2: Починить ключ панели** — `apps/web/src/components/ActionControls.tsx:353`

Было:

```tsx
  const panelKey = `${windowKey}|${view.variant}`;
```

Стало:

```tsx
  /* Ключ — только то, что нарисовано. `windowKey` содержит `pendingAction.id`
     и меняется на каждое действие любого игрока, включая ходы ботов, которые
     не меняют в панели ни строчки: панель пересоздавалась впустую. Сбросом
     `busy` `windowKey` по-прежнему занимается — см. эффект выше. */
  const panelKey = view.variant;
```

- [ ] **Step 3: Verify**

```bash
npm run build:web && npm run lint && for f in $(find packages/engine/src apps/web/src apps/server/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
```

Затем `npm run dev:web`: за чужой ход правая панель стоит неподвижно.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "perf(web): subscribe panels to the fields they read

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `PhasePanel` — правая колонка без кнопок

**Files:**
- Create: `apps/web/src/components/PhasePanel.tsx`
- Modify: `apps/web/src/styles/layout.css` (блок `.actions` → `.phase`)
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes: `TableView` из Задачи 1.
- Produces: `<PhasePanel view={view} />`.

- [ ] **Step 1: Компонент**

```tsx
/**
 * Правая колонка: что происходит прямо сейчас. Ни одной кнопки.
 *
 * Всё содержимое — из `TableView`, поэтому колонка не может разойтись с
 * панелью над картами. `AnimatePresence` ключуется на `view.phase`, а не на
 * `view.id`: смена фазы — это смена вида, а смена, скажем, состава ожидающих
 * должна анимироваться внутри вида, а не пересоздавать его.
 *
 * `mode="wait"`, а не `popLayout`. `popLayout` кладёт уходящий вид в
 * `position: absolute` и печатает его поверх приходящего: два разных текста
 * накладываются друг на друга на всё время кроссфейда, и это читается как
 * грязь, а не как переход. Замер на живой партии показал до семи таких слоёв
 * одновременно. `wait` даёт уходящему уйти целиком, и только потом приводит
 * следующий; высоту ведёт `layout` на рамке, поэтому рывка всё равно нет.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { dur } from '../motion/tokens.ts';
import { renderWithIcons, UiIcon } from './ui/Icon';
import { Portrait } from './Portrait';
import type { TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
const SLIDE = 8;

const ALERT: TableView['phase'][] = ['doubt', 'reveal', 'under-attack', 'duel-answer', 'veto', 'coronation'];

export const PhasePanel: React.FC<{ view: TableView }> = ({ view }) => {
  const reduce = !!useReducedMotion();
  const fade = reduce ? 0.12 : dur.panel;
  const travel = reduce ? 0 : SLIDE;
  const alert = ALERT.includes(view.phase);
  const info = view.claim ? CARD_DESCRIPTIONS[view.claim.card] : null;

  return (
    <motion.aside
      className={`phase ${alert ? 'phase--alert' : ''}`}
      layout={reduce ? false : 'size'}
      transition={{ layout: { duration: fade, ease: EASE } }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={view.phase}
          className="phase__view"
          initial={{ opacity: 0, y: -travel }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: travel }}
          transition={{ duration: fade, ease: EASE }}
        >
          <div className="phase__title">{view.title}</div>

          {view.actor && (
            <div className="phase__actor">
              <Portrait src={view.actor.avatar} name={view.actor.name} className="phase__portrait" />
              <span className="phase__actorname">{view.actor.name}</span>
            </div>
          )}

          {view.claim && info && (
            <div className="phase__claim">
              <div className={`phase__art cardframe cardframe--${info.category}`}>
                <img src={info.artImage} alt={info.name} />
              </div>
              <div className="phase__claimbody">
                <div className="phase__claimname">{info.name}</div>
                <div className="phase__claimrule">{renderWithIcons(view.claim.rule)}</div>
              </div>
            </div>
          )}

          {view.awaiting.length > 0 && (
            <div className="phase__awaiting">
              <span className="eyebrow">Ждут ответа</span>
              <div className="phase__faces">
                {view.awaiting.map(p => (
                  <Portrait key={p.id} src={p.avatar} name={p.name} className="phase__face" />
                ))}
              </div>
            </div>
          )}

          <div className="phase__spent">
            <span className="phase__tokens" title="Жетоны действия">
              {[0, 1].map(i => (
                <span key={i} className={view.tokens > i ? 'bolt' : 'bolt bolt--off'}>
                  <UiIcon kind="move" size="sm" />
                </span>
              ))}
            </span>
            <span className={`phase__spent-i ${view.spent.court ? 'is-spent' : ''}`}>двор</span>
            <span className={`phase__spent-i ${view.spent.plot ? 'is-spent' : ''}`}>интрига</span>
            <span className={`phase__spent-i ${view.spent.role ? 'is-spent' : ''}`}>роль</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
};
```

- [ ] **Step 2: CSS** — в `apps/web/src/styles/layout.css` заменить блок `.actions*` (строки ~1464–1555) на:

```css
/* --- Правая колонка: что происходит --- */
.phase {
  display: flex;
  flex-direction: column;
  width: 248px;
  flex: 0 0 auto;
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--line-cold);
  background: linear-gradient(180deg, rgba(20, 26, 38, 0.92) 0%, rgba(10, 13, 20, 0.94) 100%);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--dur-panel) var(--ease-out),
    background var(--dur-panel) var(--ease-out);
}

.phase--alert {
  border-color: rgba(180, 64, 90, 0.5);
  background: linear-gradient(180deg, rgba(38, 16, 24, 0.86) 0%, rgba(14, 8, 12, 0.9) 100%);
}

.phase__view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.phase__title {
  font-family: var(--font-display);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold-pale);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line-cold);
  transition: color var(--dur-fade) var(--ease-out);
}

.phase--alert .phase__title {
  color: var(--crimson-soft);
}

.phase__actor {
  display: flex;
  align-items: center;
  gap: 8px;
}

.phase__portrait {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.phase__actorname {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-soft);
}

.phase__claim {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.phase__art {
  width: 54px;
  flex: 0 0 auto;
  border-radius: 6px;
  overflow: hidden;
}

.phase__art img {
  width: 100%;
  display: block;
}

.phase__claimname {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--gold-pale);
}

.phase__claimrule {
  font-size: 0.73rem;
  line-height: 1.4;
  color: var(--text-muted);
}

.phase__awaiting {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.phase__faces {
  display: flex;
  gap: 5px;
}

.phase__face {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  filter: saturate(0.4) brightness(0.8);
}

.phase__spent {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-top: 9px;
  border-top: 1px solid var(--line-cold);
}

.phase__tokens {
  display: inline-flex;
  gap: 2px;
  margin-right: 2px;
}

.phase__spent-i {
  font-size: 0.63rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-soft);
  transition: color var(--dur-fade) var(--ease-out),
    text-decoration-color var(--dur-fade) var(--ease-out);
}

.phase__spent-i.is-spent {
  color: var(--text-dim);
  text-decoration: line-through;
}
```

- [ ] **Step 3: Подключить в `App.tsx`**

Добавить рядом с остальными хуками:

```tsx
  const view = useMemo(
    () => deriveTableView(
      {
        players, activePlayerId, turnPhase, turnSubPhase, pendingAction,
        pendingDoubtDoubterId, pendingDoubtPassedIds,
        hasUsedNormalActionThisTurn, hasPlayedRoleThisTurn, hasPlayedPlotThisTurn,
        isVetoed, vetoDeadlineAt, coronationCandidateId
      },
      human?.id ?? ''
    ),
    [
      players, activePlayerId, turnPhase, turnSubPhase, pendingAction,
      pendingDoubtDoubterId, pendingDoubtPassedIds,
      hasUsedNormalActionThisTurn, hasPlayedRoleThisTurn, hasPlayedPlotThisTurn,
      isVetoed, vetoDeadlineAt, coronationCandidateId, human
    ]
  );
```

и заменить `<ActionControls … />` в блоке `.hero` на `<PhasePanel view={view} />`. Недостающие поля добрать из стора в существующей деструктуризации.

- [ ] **Step 4: Verify**

```bash
npm run build:web && npm run lint
```
`npm run dev:web` — правая колонка показывает фазу, актора, заявку и потраченное; кнопок в ней нет. Кнопки временно недоступны — их вернёт Задача 5. Играть в этот момент нельзя; это единственный шаг плана, оставляющий игру неиграбельной, поэтому Задачи 4 и 5 идут подряд и коммитятся отдельно, но проверяются вместе.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PhasePanel.tsx apps/web/src/App.tsx apps/web/src/styles/layout.css
git commit -m "feat(web): show what is happening in the right column

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `HandBar` — кнопки над картами

**Files:**
- Create: `apps/web/src/components/HandBar.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles/layout.css` (блок `.hero`, `.hand`)

**Interfaces:**
- Consumes: `TableView`, `BarActionKind`.
- Produces: `<HandBar view={view} onAct={(kind: BarActionKind) => void} />`.

- [ ] **Step 1: Компонент**

```tsx
/**
 * Единственное место с фазовыми кнопками — прямо над рукой.
 *
 * Всё, что решается не картой, решается здесь; всё остальное — меню на карте.
 * Кнопки берутся из `TableView`, поэтому набор всегда согласован с тем, что
 * пишет правая колонка.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';
import { Button } from './ui/Button';
import { VetoTimerBar } from './VetoTimerBar';
import type { BarActionKind, TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

export const HandBar: React.FC<{
  view: TableView;
  onAct: (kind: BarActionKind) => void;
}> = ({ view, onAct }) => {
  const reduce = !!useReducedMotion();
  const fade = reduce ? 0.12 : dur.panel;
  const travel = reduce ? 0 : 8;

  const content =
    view.phase === 'veto' && view.deadlineAt !== null ? (
      <VetoTimerBar deadlineAt={view.deadlineAt} />
    ) : view.bar.length > 0 ? (
      <div className="handbar__row">
        {view.bar.map(b => (
          <Button
            key={b.kind}
            tone={b.tone}
            size="lg"
            disabled={b.disabled}
            sub={b.disabled ? b.reason : undefined}
            onClick={() => onAct(b.kind)}
          >
            {b.label}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <div className="handbar">
      {/* `wait`, а не `popLayout`: см. комментарий в `PhasePanel` — наложенные
          друг на друга наборы кнопок читаются как грязь. */}
      <AnimatePresence mode="wait">
        {content && (
          <motion.div
            key={view.phase}
            className="handbar__view"
            initial={{ opacity: 0, y: travel }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: travel }}
            transition={{ duration: fade, ease: EASE }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
```

`VetoTimerBar` появится в Задаче 10. До неё — заглушка в том же файле проекта, чтобы сборка шла:

```tsx
// apps/web/src/components/VetoTimerBar.tsx — временная версия, заменяется в Задаче 10
import React from 'react';
export const VetoTimerBar: React.FC<{ deadlineAt: number }> = () => (
  <div className="vetobar">Окно вето</div>
);
```

- [ ] **Step 2: CSS** — `apps/web/src/styles/layout.css`, рядом с `.hand`:

```css
/* --- Панель над картами: единственные фазовые кнопки --- */
.handstack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.handbar {
  min-height: 52px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
}

.handbar__row {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.handbar__row .btn {
  min-width: 168px;
}
```

и в `.hero` заменить прямых детей: `PlayerCrest`, затем `.handstack` (внутри — `HandBar` и `Hand`), затем `PhasePanel`.

- [ ] **Step 3: Диспетчер в `App.tsx`**

```tsx
  const runBarAction = (kind: BarActionKind) => {
    if (!human) return;
    switch (kind) {
      case 'court-actions': setCourtActionsOpen(true); break;
      case 'conspiracy': openConspiracyDialog(false); break;
      case 'end-turn': endTurnManually(); break;
      case 'doubt':
        if (view.phase === 'under-attack') targetDoubtAttack(human.id);
        else doubtAction(human.id);
        break;
      case 'believe': passDoubt(human.id); break;
      case 'accept-attack': targetAcceptAttack(human.id); break;
      case 'duel-accept': attackerAcceptDuel(human.id); break;
      case 'duel-retreat': attackerRetreatDuel(human.id); break;
    }
  };
```

и разметка:

```tsx
            <div className="hero">
              <PlayerCrest player={human} isActive={activePlayerId === human.id} />
              <div className="handstack">
                <HandBar view={view} onAct={runBarAction} />
                <Hand player={human} />
              </div>
              <PhasePanel view={view} />
            </div>
```

`setCourtActionsOpen` — переименованный `setNormalActionsOpen`; `endTurnManually` и `openConspiracyDialog` добрать из стора.

- [ ] **Step 4: Verify**

```bash
npm run build:web && npm run lint
```
`npm run dev:web`: партия проходится от начала до конца — ход, сомнение, нападение, дуэль. Кнопки над картами, колонка справа рассказывает.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/HandBar.tsx apps/web/src/components/VetoTimerBar.tsx apps/web/src/App.tsx apps/web/src/styles/layout.css
git commit -m "feat(web): put phase buttons above the hand

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Снос `ActionControls`, хоткеев и статус-чипа

**Files:**
- Delete: `apps/web/src/components/ActionControls.tsx`
- Modify: `apps/web/src/App.tsx:186-262` (обработчик `keydown`)
- Modify: `apps/web/src/components/TopBar.tsx`
- Modify: `apps/web/src/components/ui/Button.tsx`
- Modify: `apps/web/src/components/Arena.tsx:47` (`hotkey="Esc"`)
- Modify: `apps/web/src/styles/layout.css` (`.turnchip*`, `.btn__key`)

- [ ] **Step 1: Оставить от `keydown` только Escape**

Весь эффект в `App.tsx` заменяется на:

```tsx
  /* Единственная клавиша, которую знает игра. Всё остальное делается мышью:
     подсказки клавиш занимали место на каждой кнопке и не использовались. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      setCourtActionsOpen(false);
      setRoleClaimOpen(false);
      setRulesOpen(false);
      setCodexOpen(false);
      setChronicleOpen(false);
      setInspectedCard(null);
      setPendingTarget(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
```

> На этом шаге сбрасывается только то, что уже существует. Задача 7 добавит
> сюда `setOpenMenuCardId(null)`, Задача 11 заменит `setRoleClaimOpen(false)` на
> `setBluffCardId(null)`. Не писать их заранее — сборка упадёт.

- [ ] **Step 2: Убрать `hotkey` из `Button`**

В `apps/web/src/components/ui/Button.tsx` удалить поле `hotkey` из `ButtonProps` и из разметки; `.btn__key` удалить из `layout.css`. В `Arena.tsx` убрать `hotkey="Esc"`.

- [ ] **Step 3: Убрать статус-чип из `TopBar`**

Из `TopBarProps` удаляются `statusText`, `statusTone`, `hint`; блок `.turnchip` удаляется из разметки, стили `.turnchip*` — из `layout.css`. В `App.tsx` удаляется вычисление `status` целиком.

- [ ] **Step 4: Удалить панель**

```bash
git rm apps/web/src/components/ActionControls.tsx
```
и убрать импорт из `App.tsx`.

- [ ] **Step 5: Verify**

```bash
npm run build:web && npm run lint && for f in $(find packages/engine/src apps/web/src apps/server/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
```
Ожидается: сборка чистая, ни одной ссылки на `ActionControls`, `hotkey` или `turnchip`. Проверить `grep -rn "hotkey\|turnchip\|ActionControls" apps/web/src` — пусто.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src
git commit -m "refactor(web): drop the action column, hotkeys and status chip

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Меню на карте

**Files:**
- Create: `apps/web/src/components/CardMenu.tsx`
- Modify: `apps/web/src/components/Hand.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/motion/CardLayer.tsx:645-655` (клик по своей карте открывает меню)
- Modify: `apps/web/src/styles/layout.css`

**Interfaces:**
- Consumes: `CardMenuOption`, `CardMenuKind` из Задачи 1.
- Produces: `<CardMenu options={…} onPick={(kind: CardMenuKind) => void} onDismiss={() => void} />`.

- [ ] **Step 1: Компонент**

```tsx
/**
 * Столбик кнопок над картой.
 *
 * Живёт внутри `.hand__slot`, а не в `CardLayer`: слой карт весь построен на
 * `scale` от базового размера карты, и меню внутри него масштабировалось бы
 * вместе с летящей картой. Слот стоит на месте всегда — меню тоже.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur, spring } from '../motion/tokens.ts';
import type { CardMenuKind, CardMenuOption } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;

export const CardMenu: React.FC<{
  open: boolean;
  options: CardMenuOption[];
  onPick: (kind: CardMenuKind) => void;
}> = ({ open, options, onPick }) => {
  const reduce = !!useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cardmenu"
          initial={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: 0.12 } : spring.hover }}
          exit={{
            opacity: 0,
            y: reduce ? 0 : 6,
            scale: reduce ? 1 : 0.97,
            transition: { duration: reduce ? 0.12 : dur.fade, ease: EASE }
          }}
        >
          {options.map((o, i) => (
            <motion.button
              key={o.kind}
              type="button"
              className={`cardmenu__item cardmenu__item--${o.tone}`}
              disabled={o.disabled}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: reduce ? 0 : i * dur.stagger, duration: dur.fade, ease: EASE }
              }}
              onClick={() => onPick(o.kind)}
            >
              <span className="cardmenu__label">{o.label}</span>
              {o.disabled && o.reason && <span className="cardmenu__why">{o.reason}</span>}
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
```

- [ ] **Step 2: CSS**

```css
.cardmenu {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  translate: -50% 0;
  z-index: calc(var(--z-tabled) + 20);
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 168px;
  padding: 7px;
  border-radius: var(--radius);
  border: 1px solid var(--line-mid);
  background: linear-gradient(180deg, rgba(24, 30, 44, 0.97) 0%, rgba(12, 16, 24, 0.98) 100%);
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.72);
}

.cardmenu__item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--line-cold);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-soft);
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s var(--ease-out), border-color 0.16s var(--ease-out),
    color 0.16s var(--ease-out);
}

.cardmenu__item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--gold);
  color: var(--gold-pale);
}

.cardmenu__item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cardmenu__item--danger:hover:not(:disabled) { border-color: var(--crimson-soft); color: var(--crimson-soft); }
.cardmenu__item--good:hover:not(:disabled) { border-color: var(--sage-soft); color: var(--sage-soft); }
.cardmenu__item--arcane:hover:not(:disabled) { border-color: var(--arcane, #8b7ad8); color: var(--arcane, #8b7ad8); }

.cardmenu__why {
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-dim);
}
```

- [ ] **Step 3: `Hand` рендерит меню своего слота**

```tsx
export const Hand: React.FC<{
  player: Player;
  openCardId: CardId | null;
  menus: Record<CardId, CardMenuOption[]>;
  onPick: (cardId: CardId, kind: CardMenuKind) => void;
}> = ({ player, openCardId, menus, onPick }) => (
  <div className="hand">
    {([0, 1] as const).map(slot => {
      const held = player.hand[slot];
      return (
        <CardAnchor
          key={slot}
          className="hand__slot"
          zone={{ kind: 'hand', playerId: player.id, slot }}
        >
          <div className="hand__frame" />
          {held && (
            <CardMenu
              open={openCardId === held.id}
              options={menus[held.id] ?? []}
              onPick={kind => onPick(held.id, kind)}
            />
          )}
        </CardAnchor>
      );
    })}
  </div>
);
```

> Слот сопоставляется с картой по `slotBook` так же, как в `App.tsx`; если `player.hand[slot]` не совпадает со слотом книги, взять карту из `slotBook.current`. Проверить на партии, где одна карта ушла на кон: меню обязано открываться над оставшейся картой, а не над пустым слотом.

- [ ] **Step 4: Клик по карте открывает меню**

В `App.tsx` `handleCardClick` заменяется на:

```tsx
  const handleCardClick = (cardId: CardId) => {
    setOpenMenuCardId(current => (current === cardId ? null : cardId));
  };

  const pickCardAction = (cardId: CardId, kind: CardMenuKind) => {
    if (!human) return;
    const card = human.hand.find(h => h.id === cardId)?.card;
    setOpenMenuCardId(null);
    if (!card) return;

    switch (kind) {
      case 'inspect': setInspectedCard(card); break;
      case 'bluff': setBluffCardId(cardId); break;
      case 'veto': playInstant(human.id, 'Право вето', cardId); break;
      case 'duel-shield':
      case 'duel-bluff': targetDeclareDuel(human.id, cardId); break;
      case 'play': playAtFaceValue(cardId, card); break;
    }
  };
```

где `playAtFaceValue` разводит по типу карты:

```tsx
  /** «Разыграть» — карта играется тем, что она есть. */
  const playAtFaceValue = (cardId: CardId, card: GameCard) => {
    if (!human) return;

    if (view.phase === 'under-attack' && card === 'Перенаправление') {
      setPendingTarget({
        type: 'instant', name: 'Перенаправление', instantType: 'Перенаправление',
        isInstantDirect: true, stakedCardId: cardId, cost: 0
      });
      return;
    }
    if (isPlot(card)) {
      if (card === 'Досье') {
        setPendingTarget({ type: 'plot', name: 'Досье', cost: 0, isPlotDirect: true, plotType: 'Досье', stakedCardId: cardId });
      } else {
        playPlotAction(card as PlotType, cardId);
      }
      return;
    }
    if (isInstant(card)) {
      setPendingTarget({
        type: 'instant', name: card, cost: 0, isInstantDirect: true,
        instantType: card as InstantType, stakedCardId: cardId
      });
      return;
    }
    const info = CARD_DESCRIPTIONS[card];
    if (info.targeted) {
      setPendingTarget({ type: 'role', name: card, roleClaim: card as Role, stakedCardId: cardId, cost: info.cost });
      return;
    }
    performAction({
      type: 'role', name: card, roleClaim: card as Role, stakedCardId: cardId,
      actorId: human.id, withVaBanque: false, costGold: info.cost, costTokens: 1,
      description: info.fullDescription
    });
  };
```

`CardInteraction.isSelected` меняется на `placed => openMenuCardId === placed.id`; `hintFor` удаляется целиком (и из интерфейса в `CardLayer.tsx`, и из `App.tsx`, и `.handcard__hint` из CSS). Тост «Сейчас распоряжается …» удаляется вместе с `showToast` в `handleCardClick`.

- [ ] **Step 5: Клик мимо закрывает меню**

В `App.tsx` на `main.app__stage` вешается `onPointerDown={() => setOpenMenuCardId(null)}`, а `CardMenu` и сам карточный узел останавливают всплытие через `e.stopPropagation()`.

- [ ] **Step 6: Verify**

```bash
npm run build:web && npm run lint
```
`npm run dev:web` — по кругу проверить: свой ход (роль/интрига/инстант), нападение с щитом, нападение с перенаправлением, чужой ход. В каждом случае набор кнопок совпадает с таблицей в спеке.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): open an action menu on the card itself

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Снос пикеров и диалога перенаправления

**Files:**
- Modify: `apps/web/src/components/Modals.tsx` (удалить `RedirectChoiceDialog` и его пропсы)
- Modify: `apps/web/src/App.tsx` (удалить `redirectCardId`, `onRedirectAsInstant`, `onRedirectAsDuelBluff`)

- [ ] **Step 1: Удалить `RedirectChoiceDialog`**

Функция `RedirectChoiceDialog` (строки ~150–205) и ветка `if (redirectCardId !== null && pendingAction)` в `Modals` удаляются. Из `ModalsProps` уходят `redirectCardId`, `onCloseRedirect`, `onRedirectAsInstant`, `onRedirectAsDuelBluff`.

- [ ] **Step 2: Убрать состояние из `App.tsx`**

`const [redirectCardId, setRedirectCardId] = useState<CardId | null>(null)` и все его использования удаляются. Их работу делает меню на карте (Задача 7).

- [ ] **Step 3: Verify**

```bash
npm run build:web && npm run lint && grep -rn "redirectCardId\|RedirectChoice\|duelPicker" apps/web/src
```
Expected: сборка чистая, `grep` пустой.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "refactor(web): redirect and duel are card actions now

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Окно вето — всегда 7 секунд

**Files:**
- Modify: `packages/engine/src/timing.ts`
- Modify: `packages/engine/src/resolvers/doubtResolver.ts:355-416,445-520`
- Modify: `packages/engine/src/resolvers/instantResolver.ts:107-112`
- Modify: `packages/engine/src/types.ts` (удалить `pendingVetoPassedIds`)
- Modify: `packages/engine/src/GameStore.ts` (удалить `passVetoWindow`)
- Modify: `apps/web/src/online/bindOnlineStore.ts:8-10`
- Test: `packages/engine/src/resolvers/vetoWindow.check.ts`

**Interfaces:**
- Produces: `VETO_WINDOW_MS = 7000`; `GameState.vetoDeadlineAt: number | null` (поле заведено в Задаче 1).
- Removes: `passVetoWindow`, `pendingVetoPassedIds`, `proceedAfterVetoWindow` из `NETWORKED_METHODS`.

- [ ] **Step 1: Write the failing test** — добавить в `packages/engine/src/resolvers/vetoWindow.check.ts`

Файл уже содержит фабрики `mint`, `player` и `makeHarness` — новый случай
пользуется ими, ничего не изобретая. Добавить импорт `VETO_WINDOW_MS` из
`../timing.ts`.

```ts
// 4. Окно вето открывается ВСЕГДА — даже когда «Права вето» нет ни у кого на
//    руках — и закрывается само ровно через VETO_WINDOW_MS. Раньше в этом
//    случае эффект применялся через 800 мс и окна не было вовсе; разная длина
//    паузы читалась как подсказка о чужих картах.
{
  const actorHand = mint(['Королевский приём', 'Наследник']);
  const humanHand = mint(['Шут', 'Казначей']);
  const botHand = mint(['Вор', 'Рыцарь']);
  const deck = mint(['Наследник', 'Казначей']);
  const plotCardId: CardId = actorHand[0].id;
  const allIds = [...actorHand, ...humanHand, ...botHand, ...deck].map(c => c.id);

  const { get, set, api } = makeHarness({
    activePlayerId: 'p1',
    deck,
    players: [
      player({ id: 'p1', name: 'Анна', hand: actorHand }),
      player({ id: 'p2', name: 'Виктор', hand: humanHand }),
      player({ id: 'p3', name: 'Борис', isBot: true, hand: botHand })
    ]
  });

  playPlotAction(get, set, 'Королевский приём', plotCardId);

  assert.equal(
    api.turnPhase,
    'VETO_WINDOW',
    'окно открывается и без «Права вето» на руках — пауза одинакова всегда'
  );
  assert.ok(
    api.vetoDeadlineAt !== null && api.vetoDeadlineAt - Date.now() > VETO_WINDOW_MS - 500,
    'дедлайн — абсолютный timestamp примерно через 7 с'
  );
  assert.equal(
    api.players.find(p => p.id === 'p1')!.activePlot,
    null,
    'интрига не легла, пока окно открыто'
  );
  assertCardCensus(api, allIds, 'пока окно вето открыто');

  await new Promise(r => setTimeout(r, VETO_WINDOW_MS + 300));

  assert.notEqual(api.turnPhase, 'VETO_WINDOW', 'окно закрывается само');
  assert.equal(api.vetoDeadlineAt, null, 'дедлайн снят вместе с окном');
  assertCardCensus(api, allIds, 'после закрытия окна вето');
}
```

> Существующие случаи 1–3 в этом файле опираются на `passVetoWindow` и на ветку «бот держит вето → 2200 мс». Их надо переписать под новое поведение: случай 1 (поздний таймер бота после закрытия) остаётся, но закрытие теперь делает не `passVetoWindow`, а истечение 7 с; случай 2 сохраняется как есть; случай 3 — вето, сыгранное внутри окна, — сохраняется. То же в `doubtResolver.check.ts` (блок с `passVetoWindow`, строки 89–128) и `courtRules.check.ts` (четыре `assert.equal(api.turnPhase, 'VETO_WINDOW')` — они продолжают проходить, но ожидания по времени надо сверить).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx packages/engine/src/resolvers/vetoWindow.check.ts`
Expected: FAIL — `VETO_WINDOW_MS is not exported` / окно не открылось.

- [ ] **Step 3: Константа** — `packages/engine/src/timing.ts`

```ts
/**
 * Окно вето. Открывается на каждое ветируемое действие, независимо от того,
 * держит ли кто-то «Право вето»: пауза одинаковой длины предсказуема, а
 * разная — читается как подсказка о чужих картах.
 *
 * Цена — 7 с к каждому действию. Это одно число: если в игре окажется долго,
 * крутить здесь.
 */
export const VETO_WINDOW_MS = 7000;
```

- [ ] **Step 4: Резолвер** — `packages/engine/src/resolvers/doubtResolver.ts`

`triggerVetoWindowOrResolveEffect`: три ветки после проверки `isVetoed` заменяются на одну.

```ts
  set({
    turnPhase: 'VETO_WINDOW',
    vetoDeadlineAt: Date.now() + VETO_WINDOW_MS,
    isPendingActionAfterTruthChallenge: isAfterTruthChallenge
  });
  timerManager.scheduleDelay(() => {
    if (get().turnPhase === 'VETO_WINDOW') proceedAfterVetoWindow(get, set);
  }, VETO_WINDOW_MS);
```

Проверка `players.some(...)` и локальные `humanHoldsVeto` / `botHoldsVeto` удаляются вместе с ветками; импорт `holds` из `cardInstance` убрать, если он больше нигде в файле не нужен.

`proceedAfterVetoWindow`: в оба `set({ turnPhase: 'IDLE' })` добавить `vetoDeadlineAt: null`.

`passVetoWindow` удаляется целиком вместе с экспортом.

- [ ] **Step 5: Сыгранное вето снимает дедлайн** — `packages/engine/src/resolvers/instantResolver.ts:107`

```ts
    if (get().turnPhase === 'VETO_WINDOW') {
      timerManager.clearAll();
      /* Полоска обязана исчезнуть в тот же кадр, что и решение: она
         отсчитывала время на решение, которое уже принято. */
      set({ vetoDeadlineAt: null });
      timerManager.scheduleDelay(() => {
        get().proceedAfterVetoWindow();
      }, ACTION_HOLD_MS);
    }
```

- [ ] **Step 6: Убрать `pendingVetoPassedIds` и `passVetoWindow`**

Из `packages/engine/src/types.ts` — поле и его комментарий; из `GameStore.ts` — инициализация, метод `passVetoWindow`, импорт; из `apps/web/src/online/bindOnlineStore.ts` — `'passVetoWindow'` и `'proceedAfterVetoWindow'` из `NETWORKED_METHODS` (закрытие окна теперь принадлежит таймеру движка на сервере). Все прочие `pendingVetoPassedIds: []` в `set(...)` резолверов удалить.

- [ ] **Step 7: Run tests to verify they pass**

```bash
for f in $(find packages/engine/src apps/server/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
```
Expected: все `ok`, включая `vetoWindow.check`, `doubtResolver.check`, `courtRules.check`, `cardConservation.check`.

- [ ] **Step 8: Full verification and commit**

```bash
npm run build:web && npm run lint && for f in $(find packages/engine/src apps/web/src apps/server/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
git add packages/engine/src apps/web/src/online/bindOnlineStore.ts
git commit -m "feat(engine): open the veto window for a fixed seven seconds

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Полоска вето

**Files:**
- Modify: `apps/web/src/components/VetoTimerBar.tsx` (заглушка из Задачи 5 → настоящая)
- Modify: `apps/web/src/styles/layout.css`

- [ ] **Step 1: Компонент**

```tsx
/**
 * Полоска окна вето — на месте кнопок, над картами.
 *
 * Заливка и цифра секунд ведутся motion-значениями из `useAnimationFrame`, а
 * не состоянием: за все семь секунд компонент не рендерится ни разу. Цифра
 * отдаётся `motion.span` как MotionValue-ребёнок — motion обновляет
 * textContent напрямую, минуя React.
 *
 * Отсчёт идёт от абсолютного `deadlineAt`, а не от локального «осталось»:
 * в онлайне снимок состояния приходит с задержкой, и относительный отсчёт
 * начинался бы с уже потраченного времени.
 */
import React from 'react';
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'motion/react';
import { VETO_WINDOW_MS } from '@kinglier/engine/timing';

export const VetoTimerBar: React.FC<{ deadlineAt: number }> = ({ deadlineAt }) => {
  const progress = useMotionValue(1);

  useAnimationFrame(() => {
    const left = Math.max(0, deadlineAt - Date.now());
    progress.set(left / VETO_WINDOW_MS);
  });

  const seconds = useTransform(progress, p => String(Math.ceil(p * (VETO_WINDOW_MS / 1000))));
  /* Последние две секунды полоска уходит в багровый — предупреждение читается
     цветом раньше, чем цифрой. */
  const fill = useTransform(progress, [0, 0.29, 0.3, 1], [
    'var(--crimson-soft)',
    'var(--crimson-soft)',
    'var(--gold)',
    'var(--gold)'
  ]);

  return (
    <div className="vetobar" role="timer">
      <div className="vetobar__head">
        <span className="vetobar__label">Окно вето</span>
        <motion.span className="vetobar__secs">{seconds}</motion.span>
      </div>
      <div className="vetobar__track">
        <motion.div
          className="vetobar__fill"
          style={{ scaleX: progress, backgroundColor: fill }}
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: CSS**

```css
.vetobar {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 14px 11px;
  border-radius: var(--radius);
  border: 1px solid rgba(180, 64, 90, 0.45);
  background: linear-gradient(180deg, rgba(38, 16, 24, 0.9) 0%, rgba(14, 8, 12, 0.92) 100%);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.5);
}

.vetobar__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.vetobar__label {
  font-family: var(--font-display);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--crimson-soft);
}

.vetobar__secs {
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--gold-pale);
}

.vetobar__track {
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.07);
}

.vetobar__fill {
  height: 100%;
  width: 100%;
  transform-origin: left center;
  border-radius: 999px;
}

@media (prefers-reduced-motion: reduce) {
  .vetobar__fill { transition: none; }
}
```

- [ ] **Step 3: Verify**

```bash
npm run build:web && npm run lint
```
`npm run dev:web`: разыграть роль, дождаться окна вето. Полоска убывает ровно 7 с и краснеет на последних двух. С «Правом вето» на руках карта светится и играется кликом; без него — только полоска.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/VetoTimerBar.tsx apps/web/src/styles/layout.css
git commit -m "feat(web): show the veto window as a bar above the hand

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Общая плитка + модалка блефа

**Files:**
- Create: `apps/web/src/components/ui/Tile.tsx`
- Create: `apps/web/src/styles/tiles.css`
- Create: `apps/web/src/components/BluffDialog.tsx`
- Delete: `apps/web/src/components/RoleClaimPopup.tsx`
- Modify: `apps/web/src/styles/index.css` (импорт `tiles.css`)
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Produces: `<Tile art?={string} icon?={ReactNode} name={string} meta={ReactNode} desc={ReactNode} badge?={ReactNode} disabled?={boolean} onClick={() => void} />`; `<BluffDialog stakedCardId={CardId} onClose={() => void} />`.

- [ ] **Step 1: `Tile`**

```tsx
/**
 * Плитка выбора — одна форма для ролей и для действий двора.
 *
 * Приём взят у `.landing-highlight`: фон приглушён, на наведении расцветает и
 * поднимается. Там это украшение; здесь это ещё и обратная связь — глухая
 * плитка не расцветает и не поднимается, поэтому недоступность видна до
 * клика, а не после.
 */
import React from 'react';

export const Tile: React.FC<{
  art?: string;
  icon?: React.ReactNode;
  name: string;
  meta?: React.ReactNode;
  desc?: React.ReactNode;
  badge?: React.ReactNode;
  tone?: 'gold' | 'arcane';
  disabled?: boolean;
  onClick: () => void;
}> = ({ art, icon, name, meta, desc, badge, tone = 'gold', disabled, onClick }) => (
  <button
    type="button"
    className={`tile tile--${tone} ${art ? 'tile--art' : 'tile--icon'}`}
    style={art ? ({ '--tile-art': `url(${art})` } as React.CSSProperties) : undefined}
    disabled={disabled}
    onClick={onClick}
  >
    {icon && <span className="tile__icon">{icon}</span>}
    <span className="tile__body">
      <span className="tile__row">
        <span className="tile__name">{name}</span>
        {badge}
      </span>
      {meta && <span className="tile__meta">{meta}</span>}
      {desc && <span className="tile__desc">{desc}</span>}
    </span>
  </button>
);
```

- [ ] **Step 2: `tiles.css`**

```css
.tilegrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 188px;
  padding: 16px 14px 14px;
  text-align: left;
  overflow: hidden;
  isolation: isolate;
  cursor: pointer;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line-cold);
  background: var(--ink-800);
  box-shadow: var(--shadow-card);
  transition: transform 0.32s var(--ease-out), border-color 0.24s ease, box-shadow 0.32s ease;
}

/* Арт-плитка: приглушённая иллюстрация, расцветает под курсором. */
.tile--art::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image: var(--tile-art);
  background-size: cover;
  background-position: center 18%;
  filter: saturate(0.5) brightness(0.58);
  transform: scale(1.06);
  transition: transform 0.5s var(--ease-out), filter 0.32s ease;
}

.tile--art::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(
    180deg,
    rgba(8, 11, 18, 0.08) 0%,
    rgba(8, 11, 18, 0.44) 44%,
    rgba(8, 11, 18, 0.94) 78%,
    var(--ink-800) 100%
  );
}

.tile:hover:not(:disabled) {
  transform: translateY(-6px);
  border-color: var(--gold);
  box-shadow: 0 26px 50px rgba(0, 0, 0, 0.6);
}

.tile--art:hover:not(:disabled)::before {
  transform: scale(1.12);
  filter: saturate(1.15) brightness(0.92);
}

/* Иконочная плитка: градиент вместо арта, теплеет тем же жестом. */
.tile--icon::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(120% 90% at 50% 0%, rgba(200, 160, 74, 0.16) 0%, rgba(10, 13, 20, 0) 70%),
    linear-gradient(180deg, rgba(24, 30, 44, 0.9) 0%, rgba(10, 13, 20, 0.95) 100%);
  transition: opacity 0.32s ease;
}

.tile--icon:hover:not(:disabled)::before {
  background: radial-gradient(120% 90% at 50% 0%, rgba(200, 160, 74, 0.34) 0%, rgba(10, 13, 20, 0) 70%),
    linear-gradient(180deg, rgba(30, 37, 54, 0.92) 0%, rgba(12, 16, 24, 0.95) 100%);
}

.tile__icon {
  position: relative;
  z-index: 2;
  margin-bottom: auto;
  color: var(--gold-pale);
  opacity: 0.72;
  transition: opacity 0.28s ease, transform 0.32s var(--ease-out);
}

.tile:hover:not(:disabled) .tile__icon {
  opacity: 1;
  transform: translateY(-2px) scale(1.06);
}

.tile__body {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tile__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tile__name {
  font-family: var(--font-display);
  font-size: 1.04rem;
  color: var(--gold-pale);
  letter-spacing: 0.01em;
}

.tile__meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--text-soft);
}

.tile__desc {
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.tile:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.tile--arcane:hover:not(:disabled) {
  border-color: var(--arcane, #8b7ad8);
}

@media (max-width: 900px) {
  .tilegrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tile { min-height: 158px; }
}
```

Подключить в `apps/web/src/styles/index.css`: `@import './tiles.css';`

- [ ] **Step 3: `BluffDialog`**

Перенести **дословно** из `RoleClaimPopup.tsx` (файл ещё на месте — он удаляется
только в шаге 4): константы `VA_BANQUE_EFFECT`, чтение `staked` через
`byId(human.hand, stakedCardId)`, вычисления `hasVaBanque` / `canUseVaBanque`,
состояние `withVaBanque` и тело `onClick` у роли — ветку `startTargeting` для
`roleInfo.targeted` и ветку `performAction` для остальных. Назвать это тело
`claimRole(role: Role)`.

Не переносить: блоки «выложить открыто как интригу» и «разыграть инстант» —
их заменила кнопка `Разыграть` в меню карты. Список `.opt` заменяется сеткой
`Tile`.

```tsx
      <div className="tilegrid">
        {ALL_ROLES.map(role => {
          const info = CARD_DESCRIPTIONS[role];
          const affordable = human.gold >= info.cost && hasTokens && !hasPlayedRoleThisTurn;
          const truthful = role === card;
          return (
            <Tile
              key={role}
              art={info.artImage}
              name={role}
              tone={withVaBanque ? 'arcane' : 'gold'}
              badge={<Tag tone={truthful ? 'truth' : 'bluff'}>{truthful ? 'правда' : 'блеф'}</Tag>}
              meta={info.cost > 0 ? <>{info.cost} <UiIcon kind="coin" size="xs" /></> : 'бесплатно'}
              desc={renderWithIcons(withVaBanque ? VA_BANQUE_EFFECT[role] : info.shortDescription)}
              disabled={!affordable}
              onClick={() => claimRole(role)}
            />
          );
        })}
      </div>
```

Тумблер Ва-банка остаётся блоком `.notice--arcane` над сеткой, как сейчас.

- [ ] **Step 4: Подключить и удалить старое**

В `App.tsx`: состояние `bluffCardId` вместо `roleClaimOpen`/`stakedCardId`; `<BluffDialog stakedCardId={bluffCardId} onClose={() => setBluffCardId(null)} />`. Затем `git rm apps/web/src/components/RoleClaimPopup.tsx`.

- [ ] **Step 5: Verify**

```bash
npm run build:web && npm run lint
```
`npm run dev:web`: `Блеф` на карте открывает сетку из шести плиток; при наведении плитка расцветает и поднимается; недоступные глухие; тумблер Ва-банка перекрашивает сетку.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): pick a bluff from role tiles

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Модалка «Действия двора»

**Files:**
- Create: `apps/web/src/components/CourtActionsDialog.tsx`
- Delete: `apps/web/src/components/NormalActionsPopup.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Компонент**

Та же сетка `.tilegrid`, четыре плитки `tile--icon`, иконки из `lucide-react`:
`Coins`, `Crown`, `ScrollText`, `RefreshCw` (размер 28).

Вызовы перенести **дословно** из `NormalActionsPopup.tsx` (файл удаляется только
в шаге 2): четыре объекта, передаваемых в `performAction` / `startTargeting`, —
`Просить содержание`, `Устроить пир`, `Распустить слух`, `Сменить карту` и
`Сменить 2 карты` — вместе со всеми полями `costGold`, `costTokens`,
`stakedCardIds` и строками `description`. Строки `description` попадают в
летопись, и переписанная от руки строка сломает её текст.

Плитка «Сменить карты» — с `onClick`, переключающим локальное `exchangeOpen`; при раскрытии сетка сменяется тремя кнопками выбора («Сбросить 1», «Сбросить 2», «Сменить обе») с теми же `performAction`, что сейчас, обёрнутыми в `AnimatePresence` с `dur.panel`.

```tsx
        <Tile
          icon={<Coins size={28} />}
          name="Просить содержание"
          meta={<>+1 <UiIcon kind="coin" size="xs" /></>}
          desc="Одна монета из королевской казны, без риска."
          disabled={!hasTokens}
          onClick={() => { onClose(); performAction({
            type: 'normal', name: 'Просить содержание', actorId: human.id,
            costGold: 0, costTokens: 1, description: 'Получает 1 🪙 из казны.'
          }); }}
        />
```

Предел пира (`FEAST_CROWN_CAP = 5`) и его блокировка сохраняются: при `favor >= 5` плитка глухая, `meta` — «предел 5 👑».

- [ ] **Step 2: Подключить и удалить старое**

`<CourtActionsDialog onClose={() => setCourtActionsOpen(false)} />` в `App.tsx`, затем `git rm apps/web/src/components/NormalActionsPopup.tsx`.

- [ ] **Step 3: Verify**

```bash
npm run build:web && npm run lint
```
`npm run dev:web`: кнопка `Действия двора` открывает четыре плитки того же вида, что роли; «Сменить карты» раскрывается в выбор.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): court actions as tiles

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Модалка карты

**Files:**
- Modify: `apps/web/src/components/CardDetailModal.tsx`
- Modify: `apps/web/src/styles/panels.css` (блок `.detail*`)

- [ ] **Step 1: Перерисовать**

Две колонки: слева арт во всю высоту панели (`grid-template-columns: minmax(0, 240px) 1fr`), справа — название, категория, цена, правило, тактика, лор. Шапка — общий `Dialog`, как у `BluffDialog` и `CourtActionsDialog`.

```css
.detail {
  display: grid;
  grid-template-columns: minmax(0, 240px) 1fr;
  gap: 20px;
  align-items: start;
}

.detail__art {
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}

.detail__art img {
  width: 100%;
  display: block;
}

@media (max-width: 720px) {
  .detail { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Verify**

```bash
npm run build:web && npm run lint
```
`npm run dev:web`: `Подробнее` на карте, на чужой карте на столе и на карте из Кодекса открывает один и тот же диалог, оформленный как остальные два.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/CardDetailModal.tsx apps/web/src/styles/panels.css
git commit -m "feat(web): redraw the card dialog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Проверка плавности по приборам

Критерий приёмки из спеки: **за чужой ход `PhasePanel` и `HandBar` не перемонтируются ни разу.** Проверяется измерением, а не впечатлением.

**Files:**
- Modify: `apps/web/src/App.tsx` (временная обвязка `<Profiler>`, удаляется в Шаге 4)

- [ ] **Step 1: Обвязать `Profiler`**

```tsx
import { Profiler } from 'react';
// ...
        <Profiler
          id="stage"
          onRender={(id, phase, actual) => {
            console.log(`[profiler] ${id} ${phase} ${actual.toFixed(1)}ms`);
          }}
        >
          {/* существующее содержимое main.app__stage */}
        </Profiler>
```

- [ ] **Step 2: Снять показания**

`npm run dev:web`, две полные партии против ботов, консоль открыта. Записать: сколько записей `mount` появилось за чужие ходы.

Expected: за чужой ход — **ноль** записей с `phase === 'mount'` для поддерева сцены. Записи `update` допустимы: это перерисовка, а не пересоздание.

- [ ] **Step 3: Если mount-записи есть — найти виновника**

Смотреть на `view.id`: залогировать его рядом и сверить, менялся ли он в момент маунта. Если `id` не менялся, а маунт был — виноват ключ у `AnimatePresence` где-то ниже. Если `id` менялся — в него попало поле, которое на картинку не влияет; убрать его из сборки `id` в `tableView.ts` и дописать случай в `tableView.check.ts`.

- [ ] **Step 3b: Проверить, что игровой момент — это один кадр**

Спека требует «один `set` на игровой момент». React 19 батчит синхронные `set`
сам, поэтому шесть `set` внутри `performAction` уже дают один кадр — сливать их
руками незачем и рискованно. Проверять надо обратное: не осталось ли момента,
разорванного таймером на два кадра.

По логу из Шага 2 сопоставить записи `update` с игровыми событиями. Разрыв
выглядит как две записи подряд с интервалом меньше 100 мс на одно действие.

Для каждого найденного разрыва открыть резолвер и посмотреть, зачем там
`timerManager.scheduleDelay` с малой задержкой. Если задержка ничего не держит
(не пауза на прочтение, не ход бота) — убрать её и слить `set` в один. Если
держит — оставить: это намеренная пауза, а не рывок.

Expected: после правок ни одно действие не даёт двух `update` с интервалом
меньше 100 мс.

- [ ] **Step 4: Снять обвязку и закоммитить**

```bash
npm run build:web && npm run lint && for f in $(find packages/engine/src apps/web/src apps/server/src -name '*.check.ts'); do npx tsx "$f" || exit 1; done
git add apps/web/src
git commit -m "test(web): verify the stage does not remount on other turns

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
