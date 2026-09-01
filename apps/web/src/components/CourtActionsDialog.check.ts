import assert from 'node:assert/strict';
import {
  COURT_POP_EDGE,
  COURT_POP_GAP,
  COURT_POP_WIDTH,
  placeCourtPopup
} from './CourtActionsDialog.tsx';

const bar = { left: 1016, top: 480, width: 248 };
const at = placeCourtPopup(bar, { width: 1280, height: 720 });
assert.equal(at.width, COURT_POP_WIDTH);
assert.equal(at.left, 1280 - COURT_POP_WIDTH - COURT_POP_EDGE);
assert.equal(at.bottom, 720 - 480 + COURT_POP_GAP);
assert.equal(at.maxHeight, 480 - COURT_POP_GAP - COURT_POP_EDGE);

const mid = placeCourtPopup({ left: 400, top: 480, width: 248 }, { width: 1280, height: 720 });
assert.equal(mid.left, 400 + 248 / 2 - COURT_POP_WIDTH / 2);

console.log('CourtActionsDialog.check.ts passed.');
