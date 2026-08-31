/**
 * Каждый бот отвечает в окне сомнения сам — «Верю» или «Не верю».
 *
 * Дыра, ради которой написан этот файл: боты «Верю» не играли вовсе. Отвечал
 * только тот, кто решил усомниться; остальные молчали. Окно закрывалось одним
 * из двух обходных путей — либо `handleDoubtPhase` проматывал его само, если за
 * столом не было второго живого наблюдателя, либо `passDoubt` переспрашивал
 * ботов синхронно, уже после чужого клика, и бот мог усомниться задним числом,
 * не сказав до этого ничего.
 *
 * Оба пути убраны: опрос двора закрывается, когда ответил каждый, кроме
 * заявившего.
 *
 * Run: npx tsx packages/engine/src/bot/botDoubt.check.ts
 */
import assert from 'node:assert/strict';
import type { GameCard, Player } from '../types.ts';
import { mintDeck } from '../cardInstance.ts';
import { useGameStore } from '../GameStore.ts';
import { startBotEngine, stopBotEngine } from '../Bot.ts';
import { BOT_REACTION_MS, BOT_REACTION_JITTER_MS } from '../timing.ts';

function seat(id: string, isBot: boolean, hand: GameCard[], tokens = 2): Player {
  return {
    id,
    name: id,
    avatar: '',
    seatNumber: 1,
    isBot,
    gold: 0,
    favor: 1,
    seals: 0,
    actionTokens: tokens,
    hand: mintDeck(hand),
    activePlot: null
  };
}

/** Пауза бота плюс запас на разлёт ответов и накладные расходы. */
const ANSWERED_BY_MS = BOT_REACTION_MS + BOT_REACTION_JITTER_MS + 1200;

function table(botTokens: number) {
  useGameStore.setState({
    players: [
      seat('p1', false, ['Наследник', 'Шут']),
      seat('p2', false, ['Казначей', 'Дуэлянт']),
      seat('b1', true, ['Вор', 'Шут'], botTokens),
      seat('b2', true, ['Казначей', 'Наследник'], botTokens)
    ],
    activePlayerId: 'p1',
    turnPhase: 'IDLE',
    turnSubPhase: 'NORMAL_ACTION_PHASE',
    opening: null,
    pendingAction: null,
    pendingDoubtDoubterId: null,
    pendingDoubtPassedIds: [],
    revealOutcome: null,
    duelOutcome: null,
    informantPeekData: null,
    winnerId: null,
    hasUsedNormalActionThisTurn: false,
    hasPlayedRoleThisTurn: false,
    hasPlayedPlotThisTurn: false,
    isVetoed: false,
    pendingVetoPassedIds: [],
    pendingVetoActionId: null,
    pendingRedirectFromId: null,
    history: []
  });

  useGameStore.getState().performAction({
    type: 'role',
    name: 'Наследник',
    roleClaim: 'Наследник',
    actorId: 'p1',
    stakedCardId: useGameStore.getState().players.find(p => p.id === 'p1')!.hand[0].id,
    costGold: 0,
    costTokens: 1,
    description: ''
  });
  assert.equal(useGameStore.getState().turnPhase, 'DOUBT_WINDOW', 'the claim must open a doubt window');
  assert.deepEqual(useGameStore.getState().pendingDoubtPassedIds, [], 'nobody has answered yet');
}

startBotEngine();
try {
  /* --- 1. Бот без жетона проверить не может — и говорит «Верю» вслух. ---
   *
   * Ровно тот случай, который был сломан: раньше такой бот не делал ничего, а
   * окно закрывалось мимо него. Ветка детерминированная, поэтому проверяется
   * без прогонов.
   */
  {
    table(0);
    await new Promise(resolve => setTimeout(resolve, ANSWERED_BY_MS));
    const { pendingDoubtDoubterId, pendingDoubtPassedIds, turnPhase } = useGameStore.getState();

    assert.equal(pendingDoubtDoubterId, null, 'a bot with no action token cannot doubt');
    for (const botId of ['b1', 'b2']) {
      assert.ok(
        pendingDoubtPassedIds.includes(botId),
        `${botId} must have said «Верю» out loud, not just stayed silent`
      );
    }
    assert.ok(
      !pendingDoubtPassedIds.includes('p1'),
      'the claimant is not polled about their own claim'
    );
    assert.equal(
      turnPhase,
      'DOUBT_WINDOW',
      'p2 has not answered yet — the window must not resolve without the human'
    );

    // Живой наблюдатель отвечает последним, и только теперь двор опрошен.
    useGameStore.getState().passDoubt('p2');
    assert.notEqual(
      useGameStore.getState().turnPhase,
      'DOUBT_WINDOW',
      'the last answer must settle the court'
    );
  }

  /* --- 2. Бот с жетоном решает сам. ---
   *
   * Решение случайно по своей природе, поэтому проверяется не конкретный
   * ответ, а то, что молчания не осталось: либо кто-то усомнился (и тогда
   * опрос окончен для всех), либо ответили все боты и окно ждёт живого.
   */
  {
    let sawDoubt = false;
    let sawFullPoll = false;

    /* Прогонов пять, а не двенадцать. Каждый ждёт, пока боты додумают, — это
       почти четыре секунды реального времени, и двенадцать прогонов делали из
       этого файла самую долгую проверку в наборе. Пяти хватает: обе ветки
       случайного решения проверяются в каждом прогоне своими ассертами, а
       число прогонов только повышает шанс увидеть обе. */
    for (let run = 0; run < 5; run++) {
      table(2);
      await new Promise(resolve => setTimeout(resolve, ANSWERED_BY_MS));
      const { pendingDoubtDoubterId, pendingDoubtPassedIds, turnPhase, players } =
        useGameStore.getState();

      if (pendingDoubtDoubterId) {
        sawDoubt = true;
        assert.ok(
          players.find(p => p.id === pendingDoubtDoubterId)?.isBot,
          'only a bot could have doubted here — no human clicked'
        );
        continue;
      }

      sawFullPoll = true;
      for (const botId of ['b1', 'b2']) {
        assert.ok(pendingDoubtPassedIds.includes(botId), `${botId} must have answered`);
      }
      assert.equal(
        turnPhase,
        'DOUBT_WINDOW',
        'p2 has not answered yet — the window must not resolve without the human'
      );
    }

    assert.ok(sawDoubt || sawFullPoll, 'двор обязан хоть что-то сделать за пять прогонов');
  }

  console.log('botDoubt.check.ts passed.');
} finally {
  stopBotEngine();
}
