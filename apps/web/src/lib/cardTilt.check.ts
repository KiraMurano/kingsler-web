import assert from 'node:assert/strict';
import { cardTilt, type TiltBox } from './cardTilt.ts';

const CAP = 6;
const box: TiltBox = { left: 100, top: 200, width: 168, height: 252 };
const centreX = box.left + box.width / 2;
const centreY = box.top + box.height / 2;

/* В середине карта не наклонена вовсе. */
assert.deepEqual(cardTilt(box, centreX, centreY, CAP), { x: 0, y: 0 });

/* У краёв — ровно предел, и в правильную сторону. */
assert.equal(cardTilt(box, box.left + box.width, centreY, CAP).y, CAP);
assert.equal(cardTilt(box, box.left, centreY, CAP).y, -CAP);
assert.equal(cardTilt(box, centreX, box.top, CAP).x, CAP);
assert.equal(cardTilt(box, centreX, box.top + box.height, CAP).x, -CAP);

/* Половина пути от середины к краю — половина предела. */
assert.equal(cardTilt(box, centreX + box.width / 4, centreY, CAP).y, CAP / 2);

/* Курсор далеко за картой не выкручивает её сильнее предела. */
const far = cardTilt(box, box.left + box.width * 10, box.top - box.height * 10, CAP);
assert.deepEqual(far, { x: CAP, y: CAP });

/*
 * Главное свойство: наклон не зависит от масштаба.
 *
 * Ради него формула и живёт в долях от размера карты. Та же точка на карте,
 * выведенной втрое крупнее (1080p против 4K при забетонированном масштабе,
 * см. `lib/uiScale.ts`), обязана давать те же градусы.
 */
const k = 3;
const big: TiltBox = {
  left: box.left * k,
  top: box.top * k,
  width: box.width * k,
  height: box.height * k
};
for (const [fx, fy] of [[0.25, 0.1], [0.5, 0.5], [0.9, 0.75], [0, 1]]) {
  const small = cardTilt(box, box.left + box.width * fx, box.top + box.height * fy, CAP);
  const large = cardTilt(big, big.left + big.width * fx, big.top + big.height * fy, CAP);
  /* Сравнение с допуском, а не побитовое: величины разного порядка проходят
     через плавающую точку разными путями и расходятся в последнем разряде.
     Утверждение здесь — «тот же угол», и 1e-9 градуса это выражает честно. */
  assert.ok(
    Math.abs(large.x - small.x) < 1e-9 && Math.abs(large.y - small.y) < 1e-9,
    `наклон разошёлся на доле ${fx}/${fy}: ${JSON.stringify(small)} против ${JSON.stringify(large)}`
  );
}

console.log('cardTilt.check.ts passed.');
