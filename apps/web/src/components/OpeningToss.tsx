/**
 * Стартовый жребий: монетка взлетает, крутится и падает, поверх неё проступает
 * имя того, кто ходит первым, — и стол ждёт, пока каждый живой игрок скажет
 * «Готов».
 *
 * Компонент ничего не решает: победителя выбрал движок, а готовность лежит в
 * том же `openingToss`. И оффлайн, и все клиенты онлайн-стола читают одно поле
 * состояния, поэтому бросок и галочки у всех одни.
 *
 * Стадия считается от `openingToss.landsAt`, а не от монтирования. Игрок,
 * переподключившийся в середине броска, должен досмотреть остаток и увидеть
 * имя — а не начать круг заново и не пропустить надпись вовсе.
 *
 * Оверлей лежит порталом в `body` поверх всего: скрим — это ещё и заслонка.
 * Пока экран жребия держится, стол ходов не принимает — воркер отбивает всё,
 * кроме «Готов» (см. `apps/server/src/gameWorker.ts`), потому что онлайн-клиент
 * может прислать действие и мимо чужого скрима.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Easing } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@kinglier/engine/GameStore';
import { TOSS_SPIN_MS } from '@kinglier/engine/timing';
import type { OpeningTossData, Player } from '@kinglier/engine/types';
import { Portrait } from './Portrait';

/**
 * Сколько оборотов монетка делает за полёт.
 *
 * Число целое, поэтому монетка приземляется той же гранью, что и взлетела:
 * дробный остаток читается как «легла на ребро».
 */
const SPINS = 7;

/** Откуда монетка вылетает и до чего поднимается, px. Вверх — отрицательное. */
const START_Y = 220;
const APEX_Y = -150;

/** Доля полёта до верхней точки: вверх быстрее, вниз дольше. */
const APEX_AT = 0.42;

/**
 * Разгон и торможение полёта.
 *
 * Дуга разбита на два отрезка со своими кривыми, а не одной общей: одна кривая
 * на оба отрезка тормозит монетку и на взлёте, и на падении, и подброс читается
 * как рывок вверх с зависанием. Вверх — торможение, вниз — разгон: так и падает
 * тяжёлое.
 */
const FLIGHT_EASE: Easing[] = ['easeOut', 'easeIn'];

const VERDICT_EASE = [0.23, 1, 0.32, 1] as const;

/** Насколько монетка уходит в фон, когда поверх неё встаёт имя. */
const COIN_BEHIND = { opacity: 0.18, scale: 1.5 };

/**
 * Один бросок. Смонтирован ровно на время своего жребия — `key` по `landsAt` в
 * `OpeningToss` даёт новой партии свежий полёт вместо доигрывания прошлого.
 */
const TossOverlay: React.FC<{
  toss: OpeningTossData;
  winner: Player;
  humans: Player[];
  viewer: Player | undefined;
  onReady: () => void;
}> = ({ toss, winner, humans, viewer, onReady }) => {
  const reduce = !!useReducedMotion();

  /* Остаток полёта, снятый один раз при монтировании: подключившийся в
     середине досматривает то, что осталось, а не начинает круг заново. */
  const [flightS] = useState(() =>
    Math.max(0, Math.min(TOSS_SPIN_MS, toss.landsAt - Date.now())) / 1000
  );
  const [landed, setLanded] = useState(() => flightS <= 0);

  useEffect(() => {
    if (landed) return;
    const id = window.setTimeout(() => setLanded(true), flightS * 1000);
    return () => window.clearTimeout(id);
  }, [landed, flightS]);

  const viewerReady = !!viewer && toss.readyIds.includes(viewer.id);

  return createPortal(
    <div className="scrim toss" role="status" aria-live="polite">
      <div className="toss__panel">
        {/* Сцена фиксированного размера: имя встаёт ПОВЕРХ монетки, а не под
            ней. Блок под монеткой пришлось бы чем-то освобождать, и монетка
            прыгала бы вверх ровно в тот момент, когда на неё смотрят. */}
        <div className="toss__stage">
          <motion.div
            className="toss__coinbox"
            animate={landed ? COIN_BEHIND : { opacity: 1, scale: 1 }}
            transition={{ duration: reduce ? 0.12 : 0.45, ease: VERDICT_EASE }}
          >
            {/* Полёт и вращение — два узла, а не один.
                Свечение монеты нельзя дать `filter`-ом на вращающемся
                элементе: `filter` — группирующее свойство, он схлопывает
                трёхмерный контекст, и `backface-visibility` перестаёт прятать
                изнанку — вместо короны зритель видит ту же монету вверх
                ногами. Поэтому свет живёт на внешнем узле (он только летит), а
                `preserve-3d` — на внутреннем (он только крутится). */}
            <motion.div
              className="toss__coin"
              initial={reduce ? { opacity: 0 } : { y: START_Y, scale: 0.7, opacity: 0 }}
              animate={
                reduce
                  ? { opacity: 1 }
                  : { y: [START_Y, APEX_Y, 0], scale: [0.7, 1.1, 1], opacity: [0, 1, 1] }
              }
              transition={
                reduce
                  ? { duration: 0.2 }
                  : { duration: flightS, ease: FLIGHT_EASE, times: [0, APEX_AT, 1] }
              }
            >
              {/* Вращение ровное: у монетки в воздухе нет причин ускоряться и
                  замедляться, а общая с полётом кривая делала именно это. */}
              <motion.div
                className="toss__coin-spin"
                initial={{ rotateX: 0 }}
                animate={{ rotateX: reduce ? 0 : SPINS * 360 }}
                transition={{ duration: reduce ? 0 : flightS, ease: 'linear' }}
              >
                <img className="toss__face toss__face--crown" src="/assets/ui/crown-500.webp" alt="" />
                <img className="toss__face toss__face--coin" src="/assets/ui/coin-500.webp" alt="" />
              </motion.div>
            </motion.div>
          </motion.div>

          {landed && (
            <motion.div
              className="toss__verdict"
              initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: reduce ? 0.12 : 0.34, ease: VERDICT_EASE }}
            >
              <div className="toss__eyebrow">Жребий брошен</div>
              <div className="toss__who">
                <Portrait src={winner.avatar} name={winner.name} className="toss__portrait" />
                <div className="toss__line">
                  Первым ходит <span className="toss__name">{winner.name}</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Список готовности отрисован с самого начала и только гаснет: если
            он появлялся бы вместе с именем, его высота сдвигала бы всю сцену
            ровно в тот момент, когда монетка приземляется. */}
        <motion.div
          className="toss__ready"
          animate={{ opacity: landed ? 1 : 0 }}
          transition={{ duration: reduce ? 0.12 : 0.34, ease: VERDICT_EASE }}
          style={{ pointerEvents: landed ? 'auto' : 'none' }}
          aria-hidden={!landed}
        >
          <div className="toss__eyebrow">
            {viewerReady ? 'Ждём остальных' : 'Подтвердите готовность'}
          </div>
          <div className="toss__seats">
            {humans.map(player => {
              const ready = toss.readyIds.includes(player.id);
              const isViewer = player.id === viewer?.id;
              const label = ready ? 'Готов' : isViewer ? 'Я готов' : 'Ещё не готов';
              return (
                <button
                  key={player.id}
                  type="button"
                  className={[
                    'readymark',
                    ready ? 'readymark--on' : '',
                    isViewer ? 'readymark--mine' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  /* Кнопка только у себя: чужую готовность нажать нельзя, и
                     `disabled` здесь честнее, чем молча проглоченный клик. */
                  disabled={!isViewer || ready}
                  onClick={isViewer && !ready ? onReady : undefined}
                >
                  <span className="readymark__box">{ready && <Check size={13} strokeWidth={3} />}</span>
                  <Portrait src={player.avatar} name={player.name} className="readymark__portrait" />
                  <span className="readymark__text">
                    <span className="readymark__name">{player.name}</span>
                    <span className="readymark__state">{label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>,
    document.body
  );
};

export const OpeningToss: React.FC = () => {
  const { openingToss, players, viewerId, markReady } = useGameStore(
    useShallow(s => ({
      openingToss: s.openingToss,
      players: s.players,
      viewerId: s.viewerId,
      markReady: s.markReady
    }))
  );

  if (!openingToss) return null;
  const winner = players.find(p => p.id === openingToss.winnerId);
  if (!winner) return null;

  const humans = players.filter(p => !p.isBot);
  /* Оффлайн `viewerId` не задан — там живой игрок ровно один, и это он. */
  const viewer = viewerId ? humans.find(p => p.id === viewerId) : humans[0];

  return (
    <TossOverlay
      key={openingToss.landsAt}
      toss={openingToss}
      winner={winner}
      humans={humans}
      viewer={viewer}
      onReady={() => viewer && markReady(viewer.id)}
    />
  );
};
