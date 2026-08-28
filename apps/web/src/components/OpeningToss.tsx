/**
 * Стартовый жребий: монетка взлетает, крутится и падает, под ней проступает имя
 * того, кто ходит первым, — и стол ждёт, пока каждый живой игрок скажет
 * «Готов».
 *
 * Компонент ничего не решает: победителя выбрал движок, готовность и отсчёт до
 * первого хода лежат в том же `openingToss`. И оффлайн, и все клиенты
 * онлайн-стола читают одно поле состояния, поэтому бросок, галочки и момент
 * старта у всех одни.
 *
 * Всё нарисовано с самого начала и только проступает по прозрачности: блок,
 * который появляется, своей высотой сдвигал бы сцену ровно в тот момент, когда
 * монетка приземляется. Панель держит постоянный размер от первого кадра.
 *
 * Оверлей лежит порталом в `body` поверх всего: скрим — это ещё и заслонка.
 * Пока экран жребия держится, стол ходов не принимает — воркер отбивает всё,
 * кроме «Готов» (см. `apps/server/src/gameWorker.ts`), потому что онлайн-клиент
 * может прислать действие и мимо чужого скрима.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import type { Easing } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@kinglier/engine/GameStore';
import { TOSS_SPIN_MS } from '@kinglier/engine/timing';
import type { OpeningTossData, Player } from '@kinglier/engine/types';
import { Portrait } from './Portrait';
import { Tooltip } from './ui/Tooltip';

/**
 * Сколько оборотов монетка делает за полёт.
 *
 * Число целое, поэтому монетка приземляется той же гранью, что и взлетела:
 * дробный остаток читается как «легла на ребро».
 *
 * Держать его маленьким. Оборотов было семь, и на такой скорости монетка не
 * читается как монетка — виден мерцающий диск. Глаз должен успевать за каждым
 * переворотом.
 */
const SPINS = 3;

/** Ключевые высоты полёта, px. Вверх — отрицательное. */
const START_Y = 210;
const APEX_Y = -120;
/** Отскок: монетка не прилипает к столу с первого касания. */
const BOUNCE_Y = -26;

/**
 * Доли полёта: верхняя точка, первое касание, верх отскока.
 *
 * Подъём короче падения, а отскок — короче их обоих: так и падает тяжёлое.
 */
const TIMES = [0, 0.38, 0.74, 0.87, 1];

/** Доля полёта до первого касания — на нём вращение и заканчивается. */
const TOUCHDOWN_AT = TIMES[2];

/**
 * Своя кривая на каждый отрезок дуги.
 *
 * Одна общая кривая тормозит монетку и на взлёте, и на падении, и подброс
 * читается как рывок вверх с зависанием. Здесь: вверх — торможение, вниз —
 * разгон, и то же самое на отскоке.
 */
const FLIGHT_EASE: Easing[] = ['easeOut', 'easeIn', 'easeOut', 'easeIn'];

/**
 * Вращение: ровно почти весь полёт и торможение на последнем полуобороте.
 *
 * Монетке в воздухе незачем ускоряться и замедляться, но и встать как вкопанной
 * она не может — последний оборот доводится с замедлением, уже на подлёте.
 *
 * Заканчивается ровно на первом касании, а не на конце полёта: монетка должна
 * коснуться стола плашмя, а не докручиваться на отскоке.
 */
const SPIN_EASE: Easing[] = ['linear', 'easeOut'];
const SPIN_TIMES = [0, 0.72, 1];

const EASE = [0.23, 1, 0.32, 1] as const;

/** Один бросок: смонтирован ровно на время своего жребия. */
const TossOverlay: React.FC<{
  toss: OpeningTossData;
  winner: Player;
  others: Player[];
  viewer: Player | undefined;
  onReady: () => void;
}> = ({ toss, winner, others, viewer, onReady }) => {
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
  const fade = { duration: reduce ? 0.12 : 0.34, ease: EASE };

  return createPortal(
    <div className="scrim toss" role="status" aria-live="polite">
      <div className="toss__col">
        {/* Площадка постоянной высоты: монетка летит внутри неё и никуда не
            двигает то, что ниже. */}
        <div className="toss__stage">
          {/* Полёт и вращение — два узла, а не один.
              Свечение монеты нельзя дать `filter`-ом на вращающемся элементе:
              `filter` — группирующее свойство, он схлопывает трёхмерный
              контекст, и `backface-visibility` перестаёт прятать изнанку —
              монетка мигает сама сквозь себя. Поэтому свет живёт на внешнем
              узле (он только летит), а `preserve-3d` — на внутреннем. */}
          <motion.div
            className="toss__coin"
            initial={reduce ? { opacity: 0 } : { y: START_Y, scale: 0.72, opacity: 0 }}
            animate={
              reduce
                ? { opacity: 1 }
                : {
                    y: [START_Y, APEX_Y, 0, BOUNCE_Y, 0],
                    scale: [0.72, 1.06, 1, 1, 1],
                    opacity: [0, 1, 1, 1, 1]
                  }
            }
            transition={
              reduce
                ? { duration: 0.2 }
                : { duration: flightS, ease: FLIGHT_EASE, times: TIMES }
            }
          >
            <motion.div
              className="toss__coin-spin"
              initial={{ rotateX: 0 }}
              animate={{
                rotateX: reduce ? 0 : [0, SPINS * 360 - 180, SPINS * 360]
              }}
              transition={
                reduce
                  ? { duration: 0 }
                  : { duration: flightS * TOUCHDOWN_AT, ease: SPIN_EASE, times: SPIN_TIMES }
              }
            >
              {/* Обе грани — одна и та же монета: у монеты нет стороны, на
                  которой она перестаёт быть монетой. Вторая грань нужна не
                  ради другой картинки, а чтобы `backface-visibility` не гасил
                  её на половине оборота; развёрнута заранее, иначе встала бы к
                  зрителю зеркально. */}
              <img className="toss__face toss__face--back" src="/assets/ui/coin-500.webp" alt="" />
              <img className="toss__face" src="/assets/ui/coin-500.webp" alt="" />
            </motion.div>
          </motion.div>
          <motion.div
            className="toss__verdict"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }}
            animate={{ opacity: landed ? 1 : 0, scale: landed ? 1 : 0.94 }}
            transition={fade}
          >
            <Portrait src={winner.avatar} name={winner.name} className="toss__portrait" />
            <span className="toss__line">
              Первым ходит <span className="toss__name">{winner.name}</span>
            </span>
          </motion.div>
        </div>

        {/* Ряд готовности: слева кружки остальных, справа своя кнопка.
            Цвет здесь — единственный носитель состояния: пока игрок не
            отметился, его портрет обесцвечен, и по ряду сразу видно, кого ещё
            ждут. Имя прячется в подсказку — четыре подписи в строку не
            помещаются и превращают ряд в список. */}
        <motion.div
          className="toss__ready"
          animate={{ opacity: landed ? 1 : 0 }}
          transition={fade}
          style={{ pointerEvents: landed ? 'auto' : 'none' }}
          aria-hidden={!landed}
        >
          <div className="toss__marks">
            {others.map(player => (
              /* Кружок ничего не делает по нажатию, поэтому подсказка
                 открывается обычным тапом, а не удержанием. */
              <Tooltip key={player.id} text={player.name} tapToOpen>
                <span
                  className={`facemark ${toss.readyIds.includes(player.id) ? 'facemark--on' : ''}`}
                >
                  <Portrait src={player.avatar} name={player.name} className="facemark__img" />
                </span>
              </Tooltip>
            ))}
          </div>

          {viewer && (
            <button
              type="button"
              className={`readybtn ${viewerReady ? 'readybtn--on' : ''}`}
              disabled={viewerReady}
              onClick={viewerReady ? undefined : onReady}
            >
              {/* Подсказка на живой кнопке открывается удержанием: обычный тап
                  должен нажимать кнопку, а не объяснять её. */}
              <Tooltip text={viewer.name}>
                <span className={`facemark ${viewerReady ? 'facemark--on' : ''}`}>
                  <Portrait src={viewer.avatar} name={viewer.name} className="facemark__img" />
                </span>
              </Tooltip>
              <span className="readybtn__label">Готов</span>
            </button>
          )}
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

  /* Оффлайн `viewerId` не задан — там живой игрок ровно один, и это он. */
  const viewer = viewerId
    ? players.find(p => p.id === viewerId)
    : players.find(p => !p.isBot);
  /* В ряду весь стол, а не только люди: боты отмечаются сами, и их кружки —
     половина того, что на этом экране вообще происходит. */
  const others = players.filter(p => p.id !== viewer?.id);

  return (
    /* `key` по `landsAt`: новая партия получает свежий полёт вместо
       доигрывания прошлого. */
    <TossOverlay
      key={openingToss.landsAt}
      toss={openingToss}
      winner={winner}
      others={others}
      viewer={viewer}
      onReady={() => viewer && markReady(viewer.id)}
    />
  );
};
