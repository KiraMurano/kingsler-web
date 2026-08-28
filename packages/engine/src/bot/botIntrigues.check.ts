/**
 * Боты играют партию с «Стражей покоев» и «Охранной грамотой» в колоде, и
 * по дороге ни одна атака не проходит сквозь защиту.
 *
 * Это замена ручной прогонки в браузере: боты ходят сами, а инварианты
 * проверяются на каждом кадре состояния. Ловит две вещи, которые юнит-тесты
 * поймать не могут: зависание (бот выбрал ход, который движок молча отклонил)
 * и дырку в защите, собранную из нескольких правил сразу.
 *
 * Победы тест НЕ дожидается: окно вето висит 5 с на каждое действие, и партия
 * до 6 корон идёт больше десяти минут реального времени. Проверяется, что стол
 * живой (прогресс не встаёт) и что защита ни разу не протекла.
 * Run: npx tsx packages/engine/src/bot/botIntrigues.check.ts
 */
import assert from 'node:assert/strict';
import { useGameStore } from '../GameStore.ts';
import { startBotEngine } from './botEngine.ts';
import { canBeTargetedBy } from '../targeting.ts';
import { timerManager } from '../utils/timerManager.ts';
import { mintDeck } from '../cardInstance.ts';

startBotEngine();

let guardSeen = 0;
let charterSeen = 0;
let attacksChecked = 0;

/* Заявка проверяется РОВНО ОДИН раз — в кадре, где она впервые появилась.
   Позже цель законно перестаёт быть допустимой: Вор уже забрал золото, и
   `gold === 0` в момент применения эффекта — это результат атаки, а не
   нарушение правила выбора цели. */
const validated = new Set<string>();

/* Держатель грамоты не может терять короны. Сравниваем соседние кадры и
   смотрим только на тех, у кого грамота лежала И до, и после. */
let prevFavor = new Map<string, number>();
let prevCharter = new Set<string>();

const unsubscribe = useGameStore.subscribe(state => {
  const favor = new Map<string, number>();
  const charter = new Set<string>();

  for (const p of state.players) {
    favor.set(p.id, p.favor);
    const plot = p.activePlot?.type;
    if (plot === 'Стража покоев') guardSeen++;
    if (plot === 'Охранная грамота') {
      charterSeen++;
      charter.add(p.id);
    }
    if (prevCharter.has(p.id) && charter.has(p.id)) {
      const before = prevFavor.get(p.id) ?? p.favor;
      assert.ok(
        p.favor >= before,
        `«Охранная грамота» не удержала корону у ${p.name}: ${before} 👑 -> ${p.favor} 👑`
      );
    }
  }
  prevFavor = favor;
  prevCharter = charter;

  const pending = state.pendingAction;
  if (pending?.roleClaim && pending.targetId) {
    // Ключ включает цель: «Перенаправление» меняет её у той же заявки.
    const key = `${pending.id}:${pending.targetId}`;
    if (!validated.has(key)) {
      validated.add(key);
      const victim = state.players.find(p => p.id === pending.targetId);
      if (victim) {
        attacksChecked++;
        assert.ok(
          canBeTargetedBy(victim, pending.roleClaim),
          `движок принял «${pending.roleClaim}» против недопустимой цели ` +
            `(интрига: ${victim.activePlot?.type ?? 'нет'}, 🪙${victim.gold}, 👑${victim.favor})`
        );
      }
    }
  }
});

/* Признак зависания — не общая длительность, а остановка прогресса: окно вето
   висит 5 с на каждое действие, и честная партия идёт минуты. Считаем партию
   застрявшей, если состояние не менялось STALL_MS. */
const STALL_MS = 45_000;
const RUN_MS = 150_000;
const started = Date.now();
let lastChange = Date.now();
let frames = 0;

useGameStore.subscribe(() => {
  frames++;
  lastChange = Date.now();
});

useGameStore.getState().startGame();

/* Карты в руки раздаются явно, а не вытягиваются из колоды: иначе тест зависит
   от перемешивания и краснеет через раз — в колоде 51 карта, и за короткое
   окно новые интриги могут не прийти никому.

   `favor: 4` первому боту нужен, чтобы сработала его эвристика на грамоту:
   она карта фаворита, с двумя коронами он её не выложит. */
useGameStore.setState({
  openingToss: null,
  players: useGameStore.getState().players.map((p, i) => {
    const base = { ...p, isBot: true };
    if (i === 0) return { ...base, favor: 4, hand: mintDeck(['Охранная грамота', 'Наследник']) };
    if (i === 1) return { ...base, gold: 5, hand: mintDeck(['Стража покоев', 'Рыцарь']) };
    return base;
  })
});

const timer = setInterval(() => {
  const state = useGameStore.getState();
  const idleMs = Date.now() - lastChange;
  const elapsed = Math.round((Date.now() - started) / 1000);
  const stalled = idleMs >= STALL_MS;

  if (!state.winnerId && !stalled && Date.now() - started < RUN_MS) return;

  clearInterval(timer);
  unsubscribe();
  timerManager.clearAll();

  const score = state.players.map(p => `${p.name}:${p.favor}👑`).join(' ');
  assert.ok(
    !stalled,
    `стол встал: состояние не менялось ${Math.round(idleMs / 1000)} с. ` +
      `Фаза ${state.turnPhase}, ход у ${state.activePlayerId}, счёт ${score}`
  );
  assert.ok(
    guardSeen + charterSeen > 0,
    'розданные в руки Стража и Грамота так и не легли на стол — боты их не разыгрывают'
  );

  /* Адресные атаки в коротком окне могут и не случиться: ранняя игра идёт
     через Наследника и Рыцаря. Число выводится, но не утверждается — предикат
     целей покрыт отдельно в `targeting.check.ts`, здесь он лишь наблюдается
     в бою. */
  console.log(
    `botIntrigues.check: ok (${elapsed} с игры, ${frames} кадров, ` +
      `адресных атак под наблюдением: ${attacksChecked}, ` +
      `кадров со Стражей: ${guardSeen}, с Грамотой: ${charterSeen})`
  );
  process.exit(0);
}, 1000);
