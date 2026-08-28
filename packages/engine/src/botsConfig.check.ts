/**
 * Характер бота принадлежит боту.
 *
 * Дыра, ради которой написан этот файл: весь ИИ спрашивал архетип как
 * `getBotArchetype(bot.id)`, строковая ветка шла в карту `b1/b2/b3 → кандидат
 * 0/1/2`, а id раздаются по позиции. Перебор кандидатов работал — менялись
 * имя, аватар и титул, — но за столом всегда думали первые три характера
 * списка. Отсюда и жалоба «боты всегда одни и те же».
 *
 * Run: npx tsx packages/engine/src/botsConfig.check.ts
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_BOT_CANDIDATES, getBotArchetype } from './botsConfig.ts';
import { useGameStore } from './GameStore.ts';

// 1. Двор укомплектован: восемь непохожих кандидатов.
assert.equal(ALL_BOT_CANDIDATES.length, 8, 'the court must hold eight bots');
assert.equal(
  new Set(ALL_BOT_CANDIDATES.map(c => c.name)).size,
  8,
  'bot names must be distinct'
);
assert.equal(
  new Set(ALL_BOT_CANDIDATES.map(c => c.avatar)).size,
  8,
  'each bot must have their own portrait'
);
assert.equal(
  new Set(ALL_BOT_CANDIDATES.map(c => c.archetype.title)).size,
  8,
  'titles are what the table reads on the chip — they must differ'
);

// Портреты существуют: битая ссылка тихо подменяется заглушкой в `Portrait`,
// и восемь разных ботов оказываются на одно лицо.
const publicDir = fileURLToPath(new URL('../../../apps/web/public', import.meta.url));
for (const candidate of ALL_BOT_CANDIDATES) {
  assert.ok(
    existsSync(publicDir + candidate.avatar),
    `${candidate.name}: portrait ${candidate.avatar} is missing`
  );
}

// Характеры расходятся числами, а не только именами: два бота одного типа
// (Елена и Тихон — оба cautious) должны вести себя по-разному.
const fingerprints = ALL_BOT_CANDIDATES.map(c =>
  [c.archetype.bluffRate, c.archetype.doubtAggression, c.archetype.blockBluffRate,
   c.archetype.greed, c.archetype.targetAggression].join('/')
);
assert.equal(new Set(fingerprints).size, 8, 'no two bots may share the same tuning');

// 2. Каждый посаженный бот думает СВОИМ характером.
for (let i = 0; i < 30; i++) {
  useGameStore.getState().startGame([{ id: 'p1', name: 'Аня' }]);
  for (const bot of useGameStore.getState().players.filter(p => p.isBot)) {
    const candidate = ALL_BOT_CANDIDATES.find(c => c.name === bot.name);
    assert.ok(candidate, `${bot.name} must come from the candidate list`);
    assert.deepEqual(
      getBotArchetype(bot),
      candidate.archetype,
      `${bot.name} must think with their own archetype, not a neighbour's`
    );
  }
}

// 3. У живого игрока архетипа нет — он получает ровный дефолт, а не чужой.
{
  useGameStore.getState().startGame([{ id: 'p1', name: 'Аня' }]);
  const human = useGameStore.getState().players.find(p => !p.isBot)!;
  const arch = getBotArchetype(human);
  assert.equal(arch.title, 'Придворный', 'a human must fall back to the neutral archetype');
}

console.log('botsConfig.check.ts passed.');
