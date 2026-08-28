/**
 * Стычка: вспышка, ударная волна и сноп искр в момент, когда карты сходятся.
 *
 * Рисуется на `canvas`, а не элементами: искр под сотню, каждая живёт меньше
 * секунды, и держать под них DOM-узлы значит просить браузер пересобирать
 * раскладку шестьдесят раз в секунду ради того, что нельзя ни выделить, ни
 * нажать. Холст — один узел на весь сноп.
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
import { useReducedMotion } from 'motion/react';
import { useGameStore } from '@kinglier/engine/GameStore';
import { useAnchorRects } from '../motion/AnchorRegistry.tsx';
import { zoneKey } from '../motion/zones.ts';

/** Сколько искр в снопе. Больше — каша, меньше — не читается как удар. */
const SPARKS = 96;
/** Тяготение, px/с². Подобрано так, чтобы дуга была видна за полсекунды. */
const GRAVITY = 1500;
/** Сопротивление воздуха за секунду: сколько скорости остаётся. */
const DRAG = 0.34;
/** Сколько живёт вспышка и ударная волна, мс. */
const FLASH_MS = 260;
const WAVE_MS = 520;

/**
 * Через сколько после начала дуэли карты сходятся, мс.
 *
 * Спросить об этом слой карт было бы честнее, но его признак прибытия —
 * попадание пружины в порог `0.6 px` — при заминке кадров не срабатывает
 * вовсе, так что ждать его нельзя.
 *
 * Бьём с опережением, а не по факту сближения. Пружина подходит к цели
 * асимптотически, и «точный» момент встречи — это когда карты уже стоят:
 * искра тогда читается как отдельное событие после движения, а не как его
 * причина. Удар на подлёте глаз связывает со столкновением.
 */
const CLASH_AT_MS = 450;

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
  sparks: Spark[];
}

/** Разлёт от удара: вбок сильнее, чем вверх, — так бьют клинок о клинок. */
function makeSparks(x: number, y: number): Spark[] {
  const sparks: Spark[] = [];
  for (let i = 0; i < SPARKS; i++) {
    /* Угол тянется к горизонтали: `cos` сгущает выборку у краёв круга. */
    const spread = (Math.random() - 0.5) * Math.PI;
    const angle = spread * 0.72 - Math.PI / 2 + (Math.random() < 0.5 ? 0 : Math.PI);
    const heavy = Math.random() < 0.18;
    const speed = (heavy ? 120 : 260) + Math.random() * (heavy ? 220 : 560);
    const max = (heavy ? 0.85 : 0.34) + Math.random() * (heavy ? 0.7 : 0.4);
    sparks.push({
      x,
      y,
      px: x,
      py: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - Math.random() * 220,
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

export const DuelClash: React.FC = () => {
  const rects = useAnchorRects();
  const reduce = !!useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const burst = useRef<Burst | null>(null);
  const raf = useRef<number | null>(null);

  /* Дуэль началась — значит, карты уже летят навстречу. Ждём, пока сойдутся,
     и бьём искрой в точку встречи. Замер делается в момент удара, а не сейчас:
     к тому времени карты уже стоят, и края у них там, где надо. */
  const duelLive = useGameStore(
    s =>
      s.pendingDuelDefenderCardId !== null &&
      (s.turnPhase === 'DUEL_ATTACKER_WINDOW' || s.turnPhase === 'DUEL_OUTCOME')
  );

  useEffect(() => {
    if (!duelLive || reduce) return;
    const timer = setTimeout(() => {
      const attacker = rects.get(zoneKey({ kind: 'duel', side: 'attacker' }));
      const defender = rects.get(zoneKey({ kind: 'duel', side: 'defender' }));
      if (!attacker || !defender) return;

      /* Точка удара — там, где смыкаются обращённые друг к другу края карт. */
      const [left, right] =
        attacker.left <= defender.left ? [attacker, defender] : [defender, attacker];
      const x = (left.right + right.left) / 2;
      const y = (left.top + left.height / 2 + right.top + right.height / 2) / 2;
      burst.current = { at: performance.now(), x, y, sparks: makeSparks(x, y) };
    }, CLASH_AT_MS);
    return () => clearTimeout(timer);
  }, [duelLive, reduce, rects]);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;

    let last = performance.now();
    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame);
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;

      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (node.width !== Math.round(width * dpr)) {
        node.width = Math.round(width * dpr);
        node.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const live = burst.current;
      if (!live) return;
      const age = now - live.at;

      /* Вспышка: короткая и яркая, гаснет раньше, чем глаз её разберёт. */
      if (age < FLASH_MS) {
        const t = age / FLASH_MS;
        const r = 30 + t * 120;
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
        ctx.strokeStyle = `rgba(255, 226, 168, ${0.5 * (1 - t) ** 2})`;
        ctx.lineWidth = 2.5 * (1 - t);
        ctx.beginPath();
        ctx.arc(live.x, live.y, 18 + t * 190, 0, Math.PI * 2);
        ctx.stroke();
      }

      let alive = 0;
      ctx.lineCap = 'round';
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

      if (!alive && age > WAVE_MS) burst.current = null;
    };

    raf.current = requestAnimationFrame(frame);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
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
