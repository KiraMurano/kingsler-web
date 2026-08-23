/**
 * Self-check for the log sanitiser.
 * Run: node --experimental-strip-types src/lib/text.check.ts
 */
import assert from 'node:assert/strict';
import { courtly, resourceDeltaKind } from './text.ts';

assert.equal(courtly('🚫 Действие «Вор» отменено!'), 'Действие «Вор» отменено!');
assert.equal(courtly('Барон Дима получает +1 👑 и 3 🪙'), 'Барон Дима получает +1 👑 и 3 🪙');
assert.equal(courtly('⚜️ Печать за спор'), '⚜️ Печать за спор');
assert.equal(courtly('⚡ Жетон потрачен'), '⚡ Жетон потрачен');
assert.equal(courtly('🤺 ДУЭЛЬ: 🛡️ щит против 🗡 клинка'), 'ДУЭЛЬ: щит против клинка');
assert.equal(courtly('👩‍🦰 Графиня Елена блефует'), 'Графиня Елена блефует');
assert.equal(courtly('Двое поймались 💥 разом'), 'Двое поймались разом');

assert.equal(resourceDeltaKind('-1 ⚡'), 'act');
assert.equal(resourceDeltaKind('+1 👑'), 'crown');
assert.equal(resourceDeltaKind('+2 🪙'), 'gold');
assert.equal(resourceDeltaKind('+1 ⚜️'), 'seal');
assert.equal(resourceDeltaKind('ВА-БАНК (x2)'), 'other');

console.log('text.check: ok');
