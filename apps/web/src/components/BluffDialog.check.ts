import assert from 'node:assert/strict';
import {
  BLUFF_POP_EDGE,
  BLUFF_POP_GAP,
  BLUFF_POP_WIDTH,
  placeBluffPopup
} from './BluffDialog.tsx';

const hand = { left: 480, top: 500, width: 320 };
const at = placeBluffPopup(hand, { width: 1280, height: 720 });
assert.equal(at.width, BLUFF_POP_WIDTH);
assert.equal(at.left, hand.left + hand.width / 2 - BLUFF_POP_WIDTH / 2);
assert.equal(at.bottom, 720 - 500 + BLUFF_POP_GAP);
assert.equal(at.maxHeight, 500 - BLUFF_POP_GAP - BLUFF_POP_EDGE);

const flush = placeBluffPopup({ left: 1000, top: 500, width: 320 }, { width: 1280, height: 720 });
assert.equal(flush.left, 1280 - BLUFF_POP_WIDTH - BLUFF_POP_EDGE);

console.log('BluffDialog.check.ts passed.');
