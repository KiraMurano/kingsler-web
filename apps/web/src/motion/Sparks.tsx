/**
 * Искры — один сноп на всё, что на этом столе бьёт.
 *
 * Раньше сноп жил внутри дуэли, и это было верно ровно до тех пор, пока
 * искрила только она. Как только их попросила и сработавшая интрига, копия
 * холста рядом стала бы вторым таким же файлом с теми же ста строками физики —
 * а разъехались бы они на первой же правке цвета уголька.
 *
 * Поэтому здесь холст, а снаружи — одна функция `strike(x, y)`. Дуэль зовёт её
 * в точке, где сходятся карты; интрига — в своей середине.
 *
 * Рисуется на `canvas`, а не элементами: искр под сотню, каждая живёт меньше
 * секунды, и держать под них DOM-узлы значит просить браузер пересобирать
 * раскладку шестьдесят раз в секунду ради того, что нельзя ни выделить, ни
 * нажать. Холст — один узел на все снопы разом.
 *
 * Физика простая и настоящая: искре задаются угол и скорость, дальше её ведёт
 * тяготение и сопротивление воздуха. Поэтому сноп сам собой ложится в дугу —
 * вверх и в стороны от удара, потом вниз, — и не выглядит нарисованным по
 * ключевым кадрам. Тяжёлые угли живут дольше и успевают долететь до сукна,
 * где гаснут; лёгкие искры сгорают на лету.
 *
 * Холст лежит порталом в `body` поверх карт — искра, пролетающая ЗА картой,
 * это не искра. Он ничего не ловит: `pointer-events: none`.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { designViewport, uiScale } from '../lib/uiScale.ts';

/** Сколько искр в полном снопе. Больше — каша, меньше — не читается как удар. */
const SPARKS = 96;
/** Тяготение, px/с². Подобрано так, чтобы дуга была видна за полсекунды. */
const GRAVITY = 1500;
/** Сопротивление воздуха за секунду: сколько скорости остаётся. */
const DRAG = 0.34;
/** Сколько живёт вспышка и ударная волна, мс. */
const FLASH_MS = 260;
const WAVE_MS = 520;

/** Насколько сильно бьёт этот сноп: 1 — дуэль, меньше — событие поменьше. */
export interface StrikeOptions {
  /** Доля от полного снопа: и число искр, и их скорость, и размер вспышки. */
  force?: number;
}

interface Spark {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  width: number;
  heat: number;
}

interface Burst {
  at: number;
  x: number;
  y: number;
  force: number;
  sparks: Spark[];
}

/** Разлёт от удара: вбок сильнее, чем вверх, — так бьют клинок о клинок. */
function makeSparks(x: number, y: number, force: number): Spark[] {
  const sparks: Spark[] = [];
  const count = Math.max(8, Math.round(SPARKS * force));
  for (let i = 0; i < count; i++) {
    /* Угол тянется к горизонтали: `cos` сгущает выборку у краёв круга. */
    const spread = (Math.random() - 0.5) * Math.PI;
    const angle = spread * 0.72 - Math.PI / 2 + (Math.random() < 0.5 ? 0 : Math.PI);
    const heavy = Math.random() < 0.18;
    const speed = ((heavy ? 120 : 260) + Math.random() * (heavy ? 220 : 560)) * force;
    const max = (heavy ? 0.85 : 0.34) + Math.random() * (heavy ? 0.7 : 0.4);
    sparks.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 220 * force,
      life: 0,
      max,
      width: heavy ? 1.6 + Math.random() * 1.4 : 0.8 + Math.random(),
      heat: Math.random()
    });
  }
  return sparks;
}

/** Белое ядро → золото → уголь. Цвет искры — это её остывание. */
function emberColour(t: number, heat: number): string {
  if (t < 0.18) return `rgba(255, 250, 232, ${1 - t})`;
  if (t < 0.55) return `rgba(255, ${196 + heat * 40}, ${96 + heat * 60}, ${1.1 - t})`;
  return `rgba(${226 - t * 60}, ${104 - t * 50}, 48, ${Math.max(0, 1.2 - t * 1.3)})`;
}

/**
 * Живые снопы. Модульная переменная, а не состояние React: сноп ставят из
 * таймера и из эффекта чужого компонента, а холст читает её в своём кадре —
 * перерисовывать ради этого дерево незачем.
 */
const bursts: Burst[] = [];

/** Сколько снопов держим разом. Больше — это уже не удар, а фейерверк. */
const MAX_BURSTS = 4;

/**
 * Ударить искрой в точке — в пикселях макета (см. `lib/uiScale.ts`), тех же,
 * в которых меряет якоря слой карт.
 *
 * Ничего не возвращает и ни на что не жалуется: искры — украшение, и место,
 * которое их просит, не должно уметь обходиться без них по-особому.
 */
export function strike(x: number, y: number, { force = 1 }: StrikeOptions = {}): void {
  if (bursts.length >= MAX_BURSTS) bursts.shift();
  bursts.push({ at: performance.now(), x, y, force, sparks: makeSparks(x, y, force) });
}

/**
 * Холст искр. Один на приложение; ставится рядом со столом.
 *
 * Кадр крутится всегда, даже когда снопов нет: он тогда стоит одну очистку
 * пустого холста, а заводить и глушить цикл на каждый удар — это лишний повод
 * промахнуться мимо первых кадров самого удара.
 */
export const SparkLayer: React.FC = () => {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;

      /* Холст растянут на окно, но лежит внутри масштаба интерфейса: его
         CSS-размер меряется в пикселях макета, а не экрана, и один макетный
         пиксель занимает `dpr * uiScale()` физических. Искры прилетают из
         ректов якорей, то есть тоже в макетных, — система координат одна. */
      const ratio = (window.devicePixelRatio || 1) * uiScale();
      const { width, height } = designViewport();
      if (node.width !== Math.round(width * ratio)) {
        node.width = Math.round(width * ratio);
        node.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (bursts.length === 0) return;

      ctx.lineCap = 'round';
      for (let i = bursts.length - 1; i >= 0; i--) {
        const live = bursts[i];
        const age = now - live.at;

        /* Вспышка: короткая и яркая, гаснет раньше, чем глаз её разберёт. */
        if (age < FLASH_MS) {
          const t = age / FLASH_MS;
          const r = (30 + t * 120) * live.force;
          const glow = ctx.createRadialGradient(live.x, live.y, 0, live.x, live.y, r);
          glow.addColorStop(0, `rgba(255, 248, 226, ${0.85 * (1 - t)})`);
          glow.addColorStop(0.4, `rgba(255, 196, 96, ${0.45 * (1 - t)})`);
          glow.addColorStop(1, 'rgba(255, 150, 40, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(live.x, live.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        /* Ударная волна: тонкое кольцо, разбегающееся от точки удара. */
        if (age < WAVE_MS) {
          const t = age / WAVE_MS;
          ctx.strokeStyle = `rgba(255, 226, 168, ${0.5 * (1 - t) ** 2 * live.force})`;
          ctx.lineWidth = 2.5 * (1 - t);
          ctx.beginPath();
          ctx.arc(live.x, live.y, (18 + t * 190) * live.force, 0, Math.PI * 2);
          ctx.stroke();
        }

        let alive = 0;
        for (const s of live.sparks) {
          if (s.life >= s.max) continue;
          alive++;
          s.life += delta;
          s.px = s.x;
          s.py = s.y;
          /* Сопротивление — экспоненциальное затухание скорости, тяготение —
             постоянное ускорение вниз. Ничего сверх школьной механики. */
          const keep = DRAG ** delta;
          s.vx *= keep;
          s.vy = s.vy * keep + GRAVITY * delta;
          s.x += s.vx * delta;
          s.y += s.vy * delta;

          const t = s.life / s.max;
          ctx.strokeStyle = emberColour(t, s.heat);
          ctx.lineWidth = s.width * (1 - t * 0.6);
          ctx.beginPath();
          ctx.moveTo(s.px, s.py);
          ctx.lineTo(s.x, s.y);
          ctx.stroke();
        }

        if (!alive && age > WAVE_MS) bursts.splice(i, 1);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return createPortal(
    <canvas
      ref={canvas}
      className="clash"
      aria-hidden
      style={{ width: '100%', height: '100%' }}
    />,
    document.body
  );
};
