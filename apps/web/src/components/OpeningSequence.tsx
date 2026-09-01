/**
 * Открытие партии: сбор двора → жребий → раздача → «Битва за престол
 * начинается» → первый ход.
 *
 * Компонент ничего не решает: стадию, победителя жребия и готовность держит
 * движок в `opening`, и оффлайн, и все клиенты онлайн-стола читают одно поле.
 * Поэтому бросок, галочки и момент старта у всех одни.
 *
 * Экран сбора — непрозрачный: стол под ним ещё не для глаз, и просвет
 * выдал бы полусобранный интерфейс. Занавес из Root накрывает меню тем же
 * цветом, так что переход — это появление логотипа и списка, а не смена
 * картинки. Когда двор собран, экран тает и открывает стол под монетку.
 *
 * Стол при этом ходов не принимает всё открытие целиком — заслонка стоит в
 * движке (`performAction`) и в воркере, а не на этом оверлее: онлайн-клиент
 * может прислать действие и мимо чужого оверлея.
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import type { Easing } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@kinglier/engine/GameStore';
import { TOSS_SPIN_MS, TOSS_VERDICT_MS } from '@kinglier/engine/timing';
import type { OpeningData, Player } from '@kinglier/engine/types';
import { Portrait } from './Portrait';
import { Brand } from './Brand';
import { designRect } from '../lib/uiScale.ts';

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

/**
 * Упругость удара о стол: какая доля скорости остаётся после отскока.
 *
 * Металл о сукно — это не мяч: 0.5 даёт короткую, быстро затухающую дробь,
 * какую и слышно, когда монета ложится. Высота каждого следующего подскока
 * падает как квадрат этого числа, а время — как оно само.
 */
const RESTITUTION = 0.5;

/** Сколько раз монета ударяется о стол, прежде чем лечь. */
const BOUNCES = 4;

/**
 * Дуга полёта: подъём, падение и затухающая дробь отскоков.
 *
 * Считается, а не выписывается руками. Отскок был ровно один, заданный парой
 * чисел, и монета после него прилипала к столу — так не падает ничто. Здесь
 * каждый следующий подскок ниже предыдущего в `RESTITUTION²` раз и короче в
 * `RESTITUTION` раз, потому что время полёта пропорционально скорости отрыва,
 * а высота — её квадрату. Это и есть вся физика прыгающего тела; больше её
 * тут взять неоткуда, а меньше — уже неправда.
 */
function buildFlight() {
  const ys: number[] = [START_Y, APEX_Y, 0];
  /* Доли времени на отрезок. Подъём короче падения: монета стартует ниже
     точки покоя, и падать ей дальше, чем подниматься. */
  const spans: number[] = [1, 1.25];

  let height = -APEX_Y;
  let span = 1.25;
  for (let i = 0; i < BOUNCES; i++) {
    height *= RESTITUTION * RESTITUTION;
    span *= RESTITUTION;
    ys.push(-height, 0);
    spans.push(span, span);
  }

  const total = spans.reduce((sum, x) => sum + x, 0);
  const times: number[] = [0];
  let passed = 0;
  for (const span_ of spans) {
    passed += span_;
    times.push(passed / total);
  }

  /* Вверх — торможение, вниз — разгон. Одна общая кривая тормозила бы монету
     и на взлёте, и на падении, и подброс читался бы как рывок с зависанием. */
  const ease: Easing[] = spans.map((_, i) => (i % 2 === 0 ? 'easeOut' : 'easeIn'));

  /* Первое касание стола: на нём заканчивается вращение — дальше монета
     прыгает плашмя, а не докручивается в воздухе. */
  return { ys, times, ease, touchdownAt: times[2] };
}

const FLIGHT = buildFlight();

/**
 * Масштаб по той же дуге: монета летит НА зрителя и обратно.
 *
 * Только на первом взлёте — подскоки идут у самого стола, и раздувать их
 * значит превращать дробь в новые подбросы.
 */
const FLIGHT_SCALE = FLIGHT.ys.map((_, i) => (i === 0 ? 0.72 : i === 1 ? 1.06 : 1));
const FLIGHT_OPACITY = FLIGHT.ys.map((_, i) => (i === 0 ? 0 : 1));

/**
 * Вращение: ровно почти весь полёт и торможение на последнем полуобороте.
 *
 * Монетке в воздухе незачем ускоряться и замедляться, но и встать как вкопанной
 * она не может — последний оборот доводится с замедлением, уже на подлёте.
 *
 * Заканчивается ровно на первом касании стола, а не в конце полёта: дальше
 * монета прыгает плашмя, а не докручивается между отскоками.
 */
const SPIN_EASE: Easing[] = ['linear', 'easeOut'];
const SPIN_TIMES = [0, 0.72, 1];

/**
 * Толщина монеты, px, и из скольких срезов набрана её боковая грань.
 *
 * Грань — стопка одинаковых кругов, разнесённых по Z. Ребром к зрителю каждый
 * круг вырождается в линию, а вместе они сливаются в сплошной поясок: это
 * единственный способ дать телу толщину там, где нет ни одного объёмного
 * примитива. Срезов столько, чтобы шаг между ними был меньше пикселя — иначе
 * поясок расслаивается в гребёнку.
 */
const COIN_THICKNESS = 15;
const COIN_SLICES = 22;

/**
 * Цвет среза: середина ребра ловит свет, края уходят в тень.
 *
 * Серебро, а не золото — монета на арте серебряная. Основа взята с самого
 * арта: по его ободу цвет нейтральный, от почти чёрного в тенях до белёсого на
 * бликах, и ребро обязано попадать в тот же металл, иначе оно читается как
 * чужая деталь, приклеенная к монете.
 */
function rimShade(t: number): string {
  const lit = 0.42 + 0.58 * (1 - Math.abs(t - 0.5) * 1.7);
  const channel = (base: number) => Math.round(Math.max(0, Math.min(255, base * lit)));
  return `rgb(${channel(228)}, ${channel(231)}, ${channel(236)})`;
}

const COIN_EDGE = Array.from({ length: COIN_SLICES }, (_, i) => {
  const t = i / (COIN_SLICES - 1);
  return { z: (t - 0.5) * COIN_THICKNESS, color: rimShade(t) };
});

const EASE = [0.23, 1, 0.32, 1] as const;

/** Сколько монета проступает и сколько тает, мс. */
const TOSS_FADE_MS = 420;

/** Сколько тает экран сбора двора. Отсчитывается назад от конца паузы. */
const GATHER_FADE_MS = 520;

/**
 * Центр сукна в координатах окна.
 *
 * Замеряется, а не выводится из процентов. Круг стола центрирован не по окну:
 * над ним шапка, под ним рука, а сам он центрирован на 44% высоты `.app__stage`
 * (см. `.table` в `layout.css`). Повторять эту арифметику в CSS оверлея значит
 * держать две копии одной геометрии — и вторая уже разъехалась: монета падала
 * выше сукна. Здесь она падает туда, где стол на самом деле, при любом
 * масштабе и размере окна.
 *
 * `null`, пока стол не измерен: до первого замера монету не показываем, иначе
 * она успеет мигнуть в центре окна и прыгнуть на место.
 */
function useTableCenter(): { x: number; y: number } | null {
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const table = document.querySelector('.table');
    if (!table) return;

    const measure = () => {
      const r = designRect(table);
      setCenter({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    measure();

    /* Стол тянется вместе с окном, и монета обязана ехать за ним: жребий
       длиной в несколько секунд переживает и поворот телефона, и ресайз. */
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return center;
}

/**
 * Сбор двора: кто уже готов начать.
 *
 * Первая стадия и единственная, которая чего-то ждёт от игрока. Ни монетки, ни
 * карт здесь ещё нет — и это главное, что изменилось: раньше готовность
 * спрашивали ПОСЛЕ броска, то есть игрок подтверждал участие в партии, жребий
 * которой уже состоялся.
 *
 * Стол — столбцом, а не рядом. В ряду четыре кружка помещаются только мелкими
 * и без подписей, и «кого ждём» приходится доставать подсказкой из каждого. В
 * столбце у каждого своя строка: лицо и имя рядом, читается одним взглядом.
 *
 * Когда двор собран, оверлей уходит сам, не дожидаясь смены стадии: движок
 * держит паузу перед жребием (`tossAt`), и она же — время на то, чтобы экран
 * растаял и открыл стол, над которым полетит монета.
 */
const GatherOverlay: React.FC<{
  opening: OpeningData;
  players: Player[];
  viewer: Player | undefined;
  onReady: () => void;
}> = ({ opening, players, viewer, onReady }) => {
  const reduce = !!useReducedMotion();
  const viewerReady = !!viewer && opening.readyIds.includes(viewer.id);
  const gathered = opening.holdUntil !== null;

  /*
   * Оверлей уходит в КОНЦЕ паузы, а не в её начале.
   *
   * Пауза после последней галочки — это время посмотреть на собранный стол:
   * если начать растворять экран сразу, читать будет нечего, и пауза окажется
   * паузой на пустом месте. Поэтому две секунды экран стоит целым и только
   * потом тает — а следом летит монета.
   */
  const [leaving, setLeaving] = useState(false);
  const holdUntil = opening.holdUntil;

  useEffect(() => {
    /* Паузы нет — таять нечему и незачем. Обратного сброса здесь не нужно:
       пауза начинается один раз и назад не отыгрывается. */
    if (holdUntil === null) return;
    const delay = Math.max(0, holdUntil - Date.now() - GATHER_FADE_MS);
    const id = window.setTimeout(() => setLeaving(true), delay);
    return () => window.clearTimeout(id);
  }, [holdUntil]);

  return createPortal(
    <motion.div
      className="gather"
      role="status"
      aria-live="polite"
      initial={false}
      /* Пауза отстояла — растворяемся, открывая стол под монетку. */
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{
        duration: reduce ? 0.12 : leaving ? GATHER_FADE_MS / 1000 : 0,
        ease: EASE
      }}
      style={{ pointerEvents: gathered ? 'none' : 'auto' }}
    >
      <div className="gather__col">
        <div className="gather__head">
          <Brand />
          <span className="gather__title">Двор собирается</span>
          <span className="gather__sub">
            {gathered
              ? 'Двор собран — бросаем жребий'
              : viewerReady
                ? 'Ждём остальных'
                : 'Милорд, отметьтесь о прибытии'}
          </span>
        </div>

        {/* Весь стол одним списком, и своя строка — его же строка, только
            одетая в кнопку. Она стоит ВНУТРИ списка намеренно: пока кнопка
            была ему соседом, расстояние до неё складывалось из промежутка
            колонки и её собственного поля и выходило вдвое больше, чем между
            игроками. Один список — один промежуток, и разъехаться нечему. */}
        <ul className="gather__list">
          {players.filter(p => p.id !== viewer?.id).map(player => {
            const ready = opening.readyIds.includes(player.id);
            return (
              <li
                key={player.id}
                className={`gather__row ${ready ? 'gather__row--on' : ''}`}
              >
                <span className="gather__face">
                  <Portrait
                    src={player.avatar}
                    name={player.name}
                    className="gather__portrait"
                  />
                </span>
                <span className="gather__name">{player.name}</span>
              </li>
            );
          })}

          {viewer && (
            <li className="gather__row gather__row--self">
              <button
                type="button"
                className={`readybtn ${viewerReady ? 'readybtn--on' : ''}`}
                disabled={viewerReady}
                onClick={viewerReady ? undefined : onReady}
              >
                <span className="gather__face gather__face--self">
                  <Portrait
                    src={viewer.avatar}
                    name={viewer.name}
                    className="gather__portrait"
                  />
                </span>
                <span className="gather__name">{viewer.name}</span>
                <span className="readybtn__label">
                  {viewerReady ? 'Готов' : 'Отметиться'}
                </span>
              </button>
            </li>
          )}
        </ul>

      </div>
    </motion.div>,
    document.body
  );
};

/**
 * Один бросок: смонтирован ровно на время своего жребия.
 *
 * Летит над открытым столом, без скрима: карт на нём ещё нет, прятать нечего,
 * а монета, брошенная посреди стола, — это и есть жребий за этим столом, а не
 * заставка перед ним. Приходит и уходит по прозрачности: возникнуть и пропасть
 * в кадре она не имеет права — за ней следят.
 */
const TossOverlay: React.FC<{
  landsAt: number;
  winnerId: string;
  winner: Player;
}> = ({ landsAt, winnerId, winner }) => {
  const reduce = !!useReducedMotion();

  /* Остаток полёта, снятый один раз при монтировании: подключившийся в
     середине досматривает то, что осталось, а не начинает круг заново. */
  const [flightS] = useState(() =>
    Math.max(0, Math.min(TOSS_SPIN_MS, landsAt - Date.now())) / 1000
  );
  const [landed, setLanded] = useState(() => flightS <= 0);
  /* Уход начинается сам, до смены стадии: движок снимет жребий ровно через
     `TOSS_VERDICT_MS` после приземления, и монета должна успеть растаять к
     этому моменту, а не пропасть вместе со сменой стадии. */
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (landed) return;
    const id = window.setTimeout(() => setLanded(true), flightS * 1000);
    return () => window.clearTimeout(id);
  }, [landed, flightS]);

  useEffect(() => {
    if (!landed) return;
    const id = window.setTimeout(
      () => setLeaving(true),
      Math.max(0, TOSS_VERDICT_MS - TOSS_FADE_MS)
    );
    return () => window.clearTimeout(id);
  }, [landed]);

  /* Выбор стороны, которой приземлится монета: детерминированный псевдорандом
     по броску (landsAt + winnerId), чтобы все подключённые клиенты видели
     один и тот же результат броска. */
  const [isTails] = useState(() => {
    let hash = landsAt;
    for (let i = 0; i < winnerId.length; i++) {
      hash = ((hash << 5) - hash + winnerId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 2 === 1;
  });

  const targetAngle = isTails ? SPINS * 360 + 180 : SPINS * 360;
  const fade = { duration: reduce ? 0.12 : 0.34, ease: EASE };
  const center = useTableCenter();

  return createPortal(
    <motion.div
      className="toss"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving || !center ? 0 : 1 }}
      transition={{ duration: reduce ? 0.12 : TOSS_FADE_MS / 1000, ease: EASE }}
    >
      <div
        className="toss__col"
        style={center ? { left: center.x, top: center.y } : undefined}
      >
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
                : { y: FLIGHT.ys, scale: FLIGHT_SCALE, opacity: FLIGHT_OPACITY }
            }
            transition={
              reduce
                ? { duration: 0.2 }
                : { duration: flightS, ease: FLIGHT.ease, times: FLIGHT.times }
            }
          >
            <motion.div
              className="toss__coin-spin"
              initial={{ rotateX: 0 }}
              animate={{
                rotateX: reduce ? (isTails ? 180 : 0) : [0, targetAngle - 180, targetAngle]
              }}
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                    duration: flightS * FLIGHT.touchdownAt,
                    ease: SPIN_EASE,
                    times: SPIN_TIMES
                  }
              }
            >
              {/* Боковая грань: стопка одинаковых кругов, разнесённых по Z.
                  Ребром к зрителю каждый круг вырождается в линию, а вместе
                  они сливаются в поясок — так у монеты появляется толщина.
                  Стоит между гранями, потому что и лежит между ними. */}
              {COIN_EDGE.map(({ z, color }) => (
                <span
                  key={z}
                  className="toss__edge"
                  style={{ transform: `translateZ(${z}px)`, background: color }}
                />
              ))}

              {/* Обе грани монеты: оборотная (coin) и лицевая (coin-side).
                  Оборотная развёрнута заранее, чтобы при вращении обе стороны
                  смотрели правильной ориентацией, и каждая отодвинута на свою
                  половину толщины — иначе они склеились бы в один лист. */}
              <img className="toss__face toss__face--back" src="/assets/ui/coin-500.webp" alt="" />
              <img className="toss__face" src="/assets/ui/coin-side-500.webp" alt="" />
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
      </div>
    </motion.div>,
    document.body
  );
};

/**
 * «Битва за престол начинается» — точка между подготовкой и первым ходом.
 *
 * Без скрима намеренно: карты только что розданы, и закрывать стол ровно в
 * тот момент, когда его наконец собрали, значило бы прятать результат
 * раздачи. Надпись стоит поверх, стол читается сквозь неё.
 *
 * Две строки, а не одна: «Битва за престол» — это название того, что
 * начинается, а «начинается» — глагол при нём. В строку они читаются как
 * длинная подпись, в две — как объявление, а объявление здесь и требуется.
 * Строки и линии выходят по очереди, снизу вверх по смыслу: сперва линия,
 * потом имя, потом глагол — так их и читают.
 */
const FANFARE_EASE = [0.16, 1, 0.3, 1] as const;

const Fanfare: React.FC = () => {
  const reduce = !!useReducedMotion();

  /* Одна лестница задержек на весь блок: у каждого следующего узла свой шаг,
     и порядок выхода задаётся здесь, а не пятью разными `delay`. */
  const stage = {
    hidden: {},
    shown: { transition: { staggerChildren: reduce ? 0 : 0.11 } }
  };
  const line = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 },
    shown: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: reduce ? 0.15 : 0.7, ease: FANFARE_EASE }
    }
  };
  const rule = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, scaleX: 0 },
    shown: {
      opacity: 1,
      scaleX: 1,
      transition: { duration: reduce ? 0.15 : 0.8, ease: FANFARE_EASE }
    }
  };

  return createPortal(
    <div className="fanfare" role="status" aria-live="polite">
      {/* Свет живёт отдельным узлом под текстом: на самом тексте это была бы
          подложка, а нужен ореол — стол должен читаться сквозь него. */}
      <motion.span
        className="fanfare__glow"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.15 : 0.9, ease: 'easeOut' }}
      />
      <motion.div
        className="fanfare__inner"
        variants={stage}
        initial="hidden"
        animate="shown"
      >
        <motion.span className="fanfare__rule" aria-hidden variants={rule} />
        <motion.span className="fanfare__lead" variants={line}>
          Битва за престол
        </motion.span>
        <motion.span className="fanfare__tail" variants={line}>
          начинается
        </motion.span>
        <motion.span className="fanfare__rule" aria-hidden variants={rule} />
      </motion.div>
    </div>,
    document.body
  );
};

export const OpeningSequence: React.FC = () => {
  const { opening, players, viewerId, markReady } = useGameStore(
    useShallow(s => ({
      opening: s.opening,
      players: s.players,
      viewerId: s.viewerId,
      markReady: s.markReady
    }))
  );

  if (!opening) return null;
  const winner = players.find(p => p.id === opening.winnerId);
  if (!winner) return null;

  /* Оффлайн `viewerId` не задан — там живой игрок ровно один, и это он. */
  const viewer = viewerId
    ? players.find(p => p.id === viewerId)
    : players.find(p => !p.isBot);

  switch (opening.stage) {
    case 'READY':
      return (
        <GatherOverlay
          key={opening.id}
          opening={opening}
          players={players}
          viewer={viewer}
          onReady={() => viewer && markReady(viewer.id)}
        />
      );
    case 'TOSS':
      /* `key` по `id`: новая партия получает свежий полёт вместо доигрывания
         прошлого. `landsAt` на этой стадии уже проставлен. */
      return opening.landsAt === null ? null : (
        <TossOverlay
          key={opening.id}
          landsAt={opening.landsAt}
          winnerId={opening.winnerId}
          winner={winner}
        />
      );
    case 'DEAL':
      /* Стол открыт и раздаёт карты — оверлею здесь делать нечего. */
      return null;
    case 'FANFARE':
      /* Объявление отстояло своё и ушло — дальше идёт пауза перед первым
         ходом, и на ней экран пуст: между «партия началась» и первым действием
         должен быть вдох, а не надпись. */
      return opening.holdUntil === null ? <Fanfare key={opening.id} /> : null;
    default: {
      const _exhaustive: never = opening.stage;
      return _exhaustive;
    }
  }
};
