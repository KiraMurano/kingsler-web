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
const START_Y = 130;
const APEX_Y = -86;

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

const EASE = [0.23, 1, 0.32, 1] as const;

/** Один бросок: смонтирован ровно на время своего жребия. */
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

  const starting = toss.startsAt !== null;
  const viewerReady = !!viewer && toss.readyIds.includes(viewer.id);
  const fade = { duration: reduce ? 0.12 : 0.34, ease: EASE };

  const prompt = starting
    ? 'Все готовы — начинаем'
    : viewerReady
      ? 'Ждём остальных'
      : 'Подтвердите готовность';

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
            initial={reduce ? { opacity: 0 } : { y: START_Y, scale: 0.7, opacity: 0 }}
            animate={
              reduce
                ? { opacity: 1 }
                : { y: [START_Y, APEX_Y, 0], scale: [0.7, 1.08, 1], opacity: [0, 1, 1] }
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
              {/* Обе грани — одна и та же монета: у монеты нет стороны, на
                  которой она перестаёт быть монетой. Вторая грань нужна не
                  ради другой картинки, а чтобы `backface-visibility` не гасил
                  её на половине оборота; развёрнута заранее, иначе встала бы к
                  зрителю зеркально. */}
              <img className="toss__face toss__face--back" src="/assets/ui/coin-500.webp" alt="" />
              <img className="toss__face" src="/assets/ui/coin-500.webp" alt="" />
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          className="toss__verdict"
          animate={{ opacity: landed ? 1 : 0 }}
          transition={fade}
        >
          <div className="eyebrow">Жребий брошен</div>
          <div className="toss__who">
            <Portrait src={winner.avatar} name={winner.name} className="toss__portrait" />
            <span className="toss__line">
              Первым ходит <span className="toss__name">{winner.name}</span>
            </span>
          </div>
        </motion.div>

        <motion.div
          className="toss__ready"
          animate={{ opacity: landed ? 1 : 0 }}
          transition={fade}
          style={{ pointerEvents: landed ? 'auto' : 'none' }}
          aria-hidden={!landed}
        >
          <div className={`eyebrow ${starting ? 'toss__prompt--go' : ''}`}>{prompt}</div>

          <div className="toss__seats">
            {humans.map(player => {
              const ready = toss.readyIds.includes(player.id);
              const isViewer = player.id === viewer?.id;
              const actionable = isViewer && !ready;
              return (
                <button
                  key={player.id}
                  type="button"
                  className={[
                    'readymark',
                    ready ? 'readymark--on' : '',
                    actionable ? 'readymark--mine' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  /* Нажимается только своя строка: чужую готовность подтвердить
                     нельзя, и `disabled` честнее молча проглоченного клика. */
                  disabled={!actionable}
                  onClick={actionable ? onReady : undefined}
                >
                  {/* Аватар первым — как и в пилюле с именем выше: круглые
                      кружки обеих строк встают по одной вертикали, и колонка
                      перестаёт выглядеть собранной из разных кусков. */}
                  <Portrait src={player.avatar} name={player.name} className="readymark__portrait" />
                  <span className="readymark__name">{player.name}</span>
                  <span className="readymark__state">
                    {ready ? 'готов' : isViewer ? 'нажмите' : 'ждём'}
                  </span>
                  <span className="readymark__box">
                    {ready && <Check size={14} strokeWidth={3} />}
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
    /* `key` по `landsAt`: новая партия получает свежий полёт вместо
       доигрывания прошлого. */
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
