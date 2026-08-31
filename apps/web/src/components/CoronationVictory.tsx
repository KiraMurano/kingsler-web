/**
 * Коронация: салют, объявление и только потом итоги.
 *
 * Раньше партия заканчивалась так: последний ход — и сразу таблица влияния.
 * Победа при этом не показывалась вовсе, о ней сообщал заголовок диалога, то
 * есть событие, ради которого играли пять кругов, читалось как системное
 * уведомление. Здесь у него появляется своё время.
 *
 * Салют идёт в три такта, и такт заводки здесь главный. Хлопушка, стрелявшая
 * в первом же кадре, читалась не как праздник, а как испуг: полсотни листков
 * появлялись из ничего разом, и глазу не за что было зацепиться до того, как
 * это случилось. Поэтому сперва по углам выкатываются две золотые пушки —
 * их видно, к ним готовишься, — и только потом они бьют. Сам залп тоже
 * растянут: листки вылетают снопом за четверть секунды, а не одним кадром.
 *
 * Очередь — то есть салют, бьющий всё объявление, — здесь уже стояла, и от неё
 * пришлось отказаться: то, что сыплется непрерывно, перестаёт быть событием и
 * становится фоном. Выстрел один, а держит экран не он, а долгое падение
 * листков после него.
 *
 * Итоги отдаются через `children`, а не рисуются здесь: этот файл про
 * расписание, а не про содержимое таблицы.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { designRect, designViewport, uiScale } from '../lib/uiScale';

/* --- Расписание салюта, в миллисекундах от начала ----------------------- */

/** Пауза между появлением левой пушки и правой: разом — это одна пушка вдвое. */
const CANNON_STAGGER_MS = 130;
/**
 * Когда пушки бьют.
 *
 * Это и есть заводка: пушкам нужно успеть выкатиться, встать и на мгновение
 * замереть. Меньше — выстрел догоняет собственное появление и снова читается
 * как рывок; больше — пауза становится ожиданием.
 */
const FIRE_AT_MS = 1000;
/** За сколько вылетает весь сноп. Не кадр — иначе это стена, а не выстрел. */
const EMIT_MS = 260;
/** Через сколько после залпа выходит объявление. */
const BANNER_AT_MS = FIRE_AT_MS + 750;
/** Когда пушки уезжают: отстрелялись — и не загораживают собой праздник. */
const CANNONS_OUT_AT_MS = FIRE_AT_MS + 1500;
/** Сколько всё это держится до итогов. */
const TOTAL_MS = 8000;

/* --- Пушка -------------------------------------------------------------- */

/**
 * Куда смотрит ствол на самом арте, в градусах (экранных: вниз — плюс).
 *
 * Меряно по картинке: от шара на казённике до среза дула. Число нужно, чтобы
 * прицел задавался в градусах прицела, а не в «на сколько повернуть картинку»:
 * второе развалится молча, если арт когда-нибудь перерисуют.
 */
const ART_BARREL_DEG = -7.5;
/**
 * Куда целится левая пушка. Правая — её зеркало, и своего числа не имеет.
 *
 * Прицел взят навстречу, в середину экрана, а не «вверх и в сторону»: пушки
 * стоят по нижним углам, и стреляющие круто вверх дают два столба у краёв при
 * пустой середине. Наведённые друг на друга, они кроют бумагой ровно то место,
 * куда через секунду выйдет объявление.
 *
 * Угол круче прямой линии на центр (та отсюда всего −17°) намеренно: бумагу
 * тянет вниз, и по прямой она прошла бы под целью. Стреляют, как и положено,
 * с превышением — вершина дуги приходится чуть выше середины экрана.
 */
const AIM_DEG = -34;
/** Насколько повернуть арт, чтобы ствол смотрел в прицел. */
const GUN_ROTATE_DEG = AIM_DEG - ART_BARREL_DEG;
/** Отдача: на сколько пикселей макета пушку отбрасывает назад по оси ствола. */
const RECOIL_PX = 30;

/**
 * Дуло в долях картинки — оттуда и вылетает бумага.
 *
 * Само положение вылета читается из DOM (`designRect` по этой точке), а не
 * считается из этих долей: пушка стоит по CSS, поворачивается по CSS, и
 * повторять её геометрию в арифметике значит завести вторую правду, которая
 * разойдётся с первой на первом же изменении раскладки.
 */
const MUZZLE = { left: '96%', top: '17.5%' };

/** Прицел в радианах — тем же числом, каким повёрнута сама пушка. */
const AIM_RAD = (AIM_DEG * Math.PI) / 180;
/** Зеркало относительно вертикали: угол θ переходит в π − θ. */
const AIM_RAD_MIRRORED = Math.PI - AIM_RAD;

/** Точка вылета и направление — всё, что залпу нужно знать о пушке. */
interface Muzzle {
  x: number;
  y: number;
  aim: number;
}

/* --- Физика листка, в пикселях макета и секундах ------------------------- */

/** Тяжесть: постоянное ускорение вниз. */
const GRAVITY = 1080;
/**
 * Быстрее этого листок не падает: бумага широкая и лёгкая, воздух её держит.
 * Именно потолок скорости, а не тяжесть, делает падение медленным и бумажным —
 * без него всё сыпалось бы камнями.
 *
 * Он же задаёт длину праздника: при 190 последние листки садятся ровно к
 * `TOTAL_MS`, и салют кончается тогда же, когда приходят итоги. Больше — и
 * последние секунды объявление стоит на пустом экране.
 */
const TERMINAL = 190;
/**
 * Сопротивление воздуха: доля скорости, остающаяся за секунду.
 *
 * Оно же и задаёт разлёт: путь, который листок проходит по горизонтали, равен
 * его начальной скорости, делённой на `-ln(DRAG_PER_S)`. При 0.06 это скорость
 * впятеро меньшая — самые быстрые листки перелетают через весь экран, самые
 * медленные оседают у своей пушки. Сделай сопротивление сильнее — и обе
 * хлопушки соберутся в два букета по углам, а середина останется пустой.
 */
const DRAG_PER_S = 0.06;
/** Толчки вбок: воздух водит листок из стороны в сторону, пока тот падает. */
const SWAY = 2600;
/**
 * Как часто листок переворачивается на лету: радиан поворота на пиксель
 * падения. Не по времени, а по пройденному пути — зависший листок и не
 * должен мельтешить.
 */
const FLUTTER_PER_PX = 0.09;

/** Сколько листков в одной пушке. */
const BURST_SIZE = 170;

/** За сколько от края экрана листок перестаёт существовать. */
const CULL_MARGIN = 240;

/**
 * Листок бумаги в полёте.
 *
 * Это именно листок, а не кружок: у него две стороны, лицо и изнанка, и весь
 * фокус в том, что он их поочерёдно показывает. Переворот считается не
 * вращением в трёх измерениях, а сжатием по вертикали: высота множится на
 * косинус — листок сплющивается в линию, проходит через ноль и раскрывается
 * снова, уже изнанкой. Один косинус, и прямоугольник перестаёт быть
 * прямоугольником.
 *
 * Наклон хранится не углом, а парой `cos`/`sin`. Он постоянен на всю жизнь
 * листка, а рисуется листок готовой матрицей поворота (см. ниже) — считать её
 * из угла заново каждый кадр незачем.
 */
interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  /** Косинус и синус постоянного наклона — готовая матрица поворота. */
  cos: number;
  sin: number;
  /** Сдвиг фазы переворота — иначе весь залп сплющивался бы одновременно. */
  phase: number;
  /** Момент вылета. До него листка ещё нет — он в стволе. */
  bornAt: number;
  face: string;
  back: string;
}

/** Золото двора и серебро казны — палитра игры, а не радуга. */
const PAPERS = [
  { face: '#f0d68f', back: '#8a6a24' },
  { face: '#e8c877', back: '#6d5217' },
  { face: '#c8a04a', back: '#5a4413' },
  { face: '#dfe3ea', back: '#7d8694' },
  { face: '#f4e8c8', back: '#9a8248' }
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Один залп из дула.
 *
 * Разброс по скорости и углу широкий намеренно: у настоящей хлопушки бумага
 * вылетает снопом, и половина листков едва перелетает через край, пока другая
 * уходит под потолок. Одинаковая скорость читается как анимация, а не как
 * выстрел.
 *
 * `now` — время выстрела: каждый листок получает свой момент вылета в пределах
 * `EMIT_MS`. Это и есть «плавнее»: сноп вырастает из дула за четверть секунды
 * вместо того, чтобы возникнуть целиком в одном кадре.
 */
function burst(muzzle: Muzzle, now: number): Leaf[] {
  const leaves: Leaf[] = [];
  for (let i = 0; i < BURST_SIZE; i++) {
    const angle = muzzle.aim + rand(-0.6, 0.6);
    /* Квадрат равномерной величины сгущает залп к слабым скоростям: у
       хлопушки далеко улетают единицы, а не половина. */
    const speed = 700 + Math.random() ** 2 * 4000;
    const width = rand(9, 15);
    const tiltRad = rand(0, Math.PI * 2);
    leaves.push({
      x: muzzle.x,
      y: muzzle.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      width,
      /* Не квадрат: у бумажного листка есть длинная сторона, и по ней он и
         переворачивается. */
      height: width * rand(1.3, 2.0),
      cos: Math.cos(tiltRad),
      sin: Math.sin(tiltRad),
      phase: rand(0, 200),
      bornAt: now + Math.random() * EMIT_MS,
      ...PAPERS[(Math.random() * PAPERS.length) | 0]
    });
  }
  return leaves;
}

/**
 * Бумага в воздухе.
 *
 * Холст живёт всё празднование, а стреляет один раз: `fire` вызывают снаружи,
 * из расписания, и вызывают ровно тогда, когда пушки дёрнулись отдачей. Точки
 * вылета приходят оттуда же — измеренными по самим пушкам.
 *
 * ## Почему листок рисуется матрицей
 *
 * На залпе кадр проседал, и виновата оказалась ровно одна вещь — обвязка
 * вокруг `fillRect`. Каждый листок рисовался четвёркой
 * `save` → `translate` → `rotate` → `restore`, то есть шестью обращениями к
 * контексту вместо двух, и на трёхстах сорока листках это давало больше двух
 * тысяч вызовов в кадр. Замер на 300 кадрах: **45 мс против 15**, ровно на
 * этой замене и ни на чём другом.
 *
 * Здесь вместо стека состояний ставится готовая матрица: наклон у листка
 * постоянный, его `cos`/`sin` посчитаны при рождении, масштаб холста
 * вмножается прямо в неё. Остаются `setTransform` и `fillRect`.
 *
 * Всё остальное в кадре стоит ничего, и проверено это тем же замером: физика
 * трёхсот сорока листков вместе с чисткой холста — 0.9 мс на те же 300 кадров.
 * Поэтому ни выделения массива на кадр, ни `Math.random` на листок здесь не
 * трогаются: гоняться за ними значило бы усложнять код ради шума. Условная
 * установка `fillStyle` тоже ничего не дала и убрана.
 */
const Confetti: React.FC<{ fireRef: React.RefObject<((m: Muzzle[]) => void) | null> }> = ({
  fireRef
}) => {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;

    let leaves: Leaf[] = [];
    let raf = 0;
    let last = performance.now();

    fireRef.current = muzzles => {
      const now = performance.now();
      for (const muzzle of muzzles) leaves = leaves.concat(burst(muzzle, now));
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;

      /* До выстрела рисовать нечего, и холст пуст — чистить его незачем. Кадр
         целиком остаётся выкатывающимся пушкам. */
      if (leaves.length === 0) return;

      /* Холст лежит внутри масштаба интерфейса — его CSS-размер меряется в
         пикселях макета, и один такой занимает `dpr * uiScale()` физических
         (см. `lib/uiScale.ts`). */
      const { width, height } = designViewport();
      const ratio = (window.devicePixelRatio || 1) * uiScale();
      if (node.width !== Math.round(width * ratio)) {
        node.width = Math.round(width * ratio);
        node.height = Math.round(height * ratio);
      }
      /* Чистка — в пикселях холста: единичная матрица тут дешевле и честнее,
         чем масштабная, всё равно её сейчас перепишет каждый листок. */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, node.width, node.height);

      const keep = DRAG_PER_S ** delta;
      const bottom = height + 40;
      const leftEdge = -CULL_MARGIN;
      const rightEdge = width + CULL_MARGIN;

      const alive: Leaf[] = [];
      for (const leaf of leaves) {
        /* Ещё в стволе: ждёт своей очереди вылететь, но уже существует —
           иначе пришлось бы держать вторую очередь на невылетевших. */
        if (now < leaf.bornAt) {
          alive.push(leaf);
          continue;
        }

        /* Сопротивление — экспоненциальное затухание скорости; тяжесть —
           постоянное ускорение вниз, упирающееся в потолок скорости; качание —
           случайный толчок вбок на каждом кадре. Последнее и делает полёт
           бумажным: листок рыскает, а не падает по дуге. */
        leaf.vx = leaf.vx * keep + rand(-1, 1) * SWAY * delta;
        leaf.vy = Math.min(leaf.vy * keep + GRAVITY * delta, TERMINAL);
        leaf.x += leaf.vx * delta;
        leaf.y += leaf.vy * delta;

        /* Ушёл вниз или унесён далеко вбок — назад не вернётся: горизонтальную
           скорость сопротивление гасит за доли секунды. Вверх — вернётся, и
           там вычёркивать нельзя. */
        if (leaf.y > bottom || leaf.x < leftEdge || leaf.x > rightEdge) continue;
        alive.push(leaf);
        if (leaf.y < -CULL_MARGIN) continue;

        /* Сжатие по вертикали — и есть переворот. Знак косинуса говорит, какой
           стороной листок сейчас к зрителю. */
        const flip = Math.cos((leaf.y + leaf.phase) * FLUTTER_PER_PX);
        const drawn = leaf.height * flip;

        ctx.fillStyle = flip > 0 ? leaf.face : leaf.back;
        /* Поворот, сдвиг и масштаб холста одной матрицей — вместо
           `save`/`translate`/`rotate`/`restore` вокруг каждого листка. */
        const a = ratio * leaf.cos;
        const b = ratio * leaf.sin;
        ctx.setTransform(a, b, -b, a, ratio * leaf.x, ratio * leaf.y);
        ctx.fillRect(-leaf.width / 2, -drawn / 2, leaf.width, drawn);
      }
      leaves = alive;

      /* Бумага осела — цикл больше ни для чего не нужен: до `TOTAL_MS` он
         крутился бы ещё несколько секунд, чистя пустой холст. */
      if (leaves.length === 0) cancelAnimationFrame(raf);
    };

    raf = requestAnimationFrame(frame);
    const stopFiring = fireRef;
    return () => {
      cancelAnimationFrame(raf);
      stopFiring.current = null;
    };
  }, [fireRef]);

  return <canvas ref={canvas} className="victory__confetti" aria-hidden />;
};

/**
 * Одна пушка: выкатывается, целится, бьёт и уезжает.
 *
 * Зеркалит правую сторону обёртка (`.cannon--right`), а не эта разметка:
 * внутри зеркального бокса поворот и отдача считаются в его же координатах, и
 * обеим пушкам достаётся один и тот же угол и один и тот же вектор отдачи.
 * Иначе пришлось бы держать два набора чисел, которые обязаны совпадать.
 */
const Cannon: React.FC<{
  side: 'left' | 'right';
  delayMs: number;
  fired: boolean;
  leaving: boolean;
  muzzleRef: React.RefObject<HTMLSpanElement | null>;
}> = ({ side, delayMs, fired, leaving, muzzleRef }) => {
  /* Отдача — назад по оси ствола, то есть против прицела. */
  const back = {
    x: -Math.cos(AIM_RAD) * RECOIL_PX,
    y: -Math.sin(AIM_RAD) * RECOIL_PX
  };

  return (
    <div className={`cannon cannon--${side}`} aria-hidden>
      <motion.div
        className="cannon__gun"
        /* Выкатывается снизу, из-за края: пушку подвезли, а не проявили. */
        initial={{ opacity: 0, scale: 0.35, x: 0, y: 90, rotate: GUN_ROTATE_DEG - 26 }}
        animate={
          leaving
            ? { opacity: 0, scale: 0.86, x: 0, y: 70, rotate: GUN_ROTATE_DEG - 8,
                transition: { duration: 0.5, ease: [0.4, 0, 1, 1] } }
            : fired
              ? {
                  opacity: 1,
                  scale: 1,
                  /* Рывок и возврат: два ключевых кадра вместо пружины — у
                     отдачи есть резкое начало, и пружина его сглаживает. */
                  x: [back.x, 0],
                  y: [back.y, 0],
                  rotate: [GUN_ROTATE_DEG - 7, GUN_ROTATE_DEG],
                  transition: {
                    x: { duration: 0.5, times: [0.12, 1], ease: [0.16, 1, 0.3, 1] },
                    y: { duration: 0.5, times: [0.12, 1], ease: [0.16, 1, 0.3, 1] },
                    rotate: { duration: 0.55, times: [0.1, 1], ease: [0.16, 1, 0.3, 1] }
                  }
                }
              : {
                  opacity: 1,
                  scale: 1,
                  x: 0,
                  y: 0,
                  rotate: GUN_ROTATE_DEG,
                  transition: {
                    delay: delayMs / 1000,
                    type: 'spring',
                    stiffness: 420,
                    damping: 13,
                    mass: 0.8,
                    opacity: { delay: delayMs / 1000, duration: 0.16 }
                  }
                }
        }
      >
        <img className="cannon__art" src="/assets/ui/cannon-500.webp" alt="" />
        {/* Точка вылета. Она же вспышка: одна и та же метка и светит, и
            отвечает на вопрос «откуда бумага» — разъехаться им нельзя. */}
        <span className="cannon__muzzle" ref={muzzleRef} style={MUZZLE}>
          <motion.span
            className="cannon__flash"
            initial={{ opacity: 0, scale: 0.2 }}
            animate={fired ? { opacity: [1, 0], scale: [0.4, 2.6] } : { opacity: 0, scale: 0.2 }}
            transition={{ duration: 0.34, ease: 'easeOut' }}
          />
        </span>
      </motion.div>
    </div>
  );
};

/**
 * Салют целиком: две пушки и бумага, которую они выбрасывают.
 *
 * Собран в один компонент не для удобства, а потому что залп обязан вылетать
 * ИЗ дул, а не из углов экрана: точки вылета меряются по самим пушкам
 * (`designRect`) в момент выстрела. Считать их из констант значило бы завести
 * вторую геометрию рядом с CSS — и она разошлась бы с первой молча.
 */
const Salute: React.FC = () => {
  const fireRef = useRef<((m: Muzzle[]) => void) | null>(null);
  const leftMuzzle = useRef<HTMLSpanElement | null>(null);
  const rightMuzzle = useRef<HTMLSpanElement | null>(null);
  const [fired, setFired] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const shot = window.setTimeout(() => {
      setFired(true);
      const at = (node: HTMLSpanElement | null, aim: number): Muzzle | null => {
        if (!node) return null;
        const r = designRect(node);
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, aim };
      };
      const muzzles = [
        at(leftMuzzle.current, AIM_RAD),
        at(rightMuzzle.current, AIM_RAD_MIRRORED)
      ].filter((m): m is Muzzle => m !== null);
      fireRef.current?.(muzzles);
    }, FIRE_AT_MS);
    const away = window.setTimeout(() => setLeaving(true), CANNONS_OUT_AT_MS);
    return () => {
      window.clearTimeout(shot);
      window.clearTimeout(away);
    };
  }, []);

  return (
    <>
      <Confetti fireRef={fireRef} />
      <div className="victory__cannons" aria-hidden>
        <Cannon side="left" delayMs={0} fired={fired} leaving={leaving} muzzleRef={leftMuzzle} />
        <Cannon
          side="right"
          delayMs={CANNON_STAGGER_MS}
          fired={fired}
          leaving={leaving}
          muzzleRef={rightMuzzle}
        />
      </div>
    </>
  );
};

const EASE = [0.16, 1, 0.3, 1] as const;

const Banner: React.FC<{ name: string }> = ({ name }) => {
  const reduce = !!useReducedMotion();
  const stage = { hidden: {}, shown: { transition: { staggerChildren: reduce ? 0 : 0.12 } } };
  const line = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 },
    shown: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: reduce ? 0.15 : 0.7, ease: EASE }
    }
  };
  const rule = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, scaleX: 0 },
    shown: { opacity: 1, scaleX: 1, transition: { duration: reduce ? 0.15 : 0.8, ease: EASE } }
  };

  /* Имя — как его написал сам игрок: ник это имя собственное, и капитель его
     коверкает. По той же причине и «коронован!» строчными: это обычное слово
     при имени, а не заголовок. */
  return (
    <div className="fanfare fanfare--victory" role="status" aria-live="polite">
      <motion.span
        className="fanfare__glow"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.15 : 0.9, ease: 'easeOut' }}
      />
      <motion.div className="fanfare__inner" variants={stage} initial="hidden" animate="shown">
        <motion.span className="fanfare__rule" aria-hidden variants={rule} />
        <motion.span className="fanfare__lead" variants={line}>
          {name}
        </motion.span>
        <motion.span className="fanfare__tail" variants={line}>
          коронован!
        </motion.span>
        <motion.span className="fanfare__rule" aria-hidden variants={rule} />
      </motion.div>
    </div>
  );
};

export const CoronationVictory: React.FC<{
  /** Имя коронованного. `null` — ничья: короновать некого, празднования нет. */
  winnerName: string | null;
  children: React.ReactNode;
}> = ({ winnerName, children }) => {
  const reduce = !!useReducedMotion();
  /* Ничью и «беречь движение» пропускаем сразу к итогам: в первом случае
     праздновать нечего, во втором праздник противопоказан. */
  const celebrate = !!winnerName && !reduce;
  const [showBanner, setShowBanner] = useState(false);
  const [done, setDone] = useState(!celebrate);

  useEffect(() => {
    if (!celebrate) return;
    const toBanner = window.setTimeout(() => setShowBanner(true), BANNER_AT_MS);
    const toBoard = window.setTimeout(() => setDone(true), TOTAL_MS);
    return () => {
      window.clearTimeout(toBanner);
      window.clearTimeout(toBoard);
    };
  }, [celebrate]);

  return (
    <>
      {celebrate && !done && createPortal(<Salute />, document.body)}
      {celebrate && showBanner && !done && winnerName &&
        createPortal(<Banner name={winnerName} />, document.body)}
      {done && children}
    </>
  );
};
