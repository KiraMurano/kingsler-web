/**
 * Прогрев картинок при открытии сайта.
 *
 * Арты за столом весят под восемь мегабайт, и пока каждый из них грузился в тот
 * момент, когда впервые понадобился, карта проявлялась уже после того, как её
 * положили: локально этого не видно, потому что файл берётся с диска, а через
 * сеть — видно всегда. Лечится не ускорением загрузки, а её переносом: пока
 * игрок читает лендинг, входит и ждёт сбора двора, всё нужное успевает лечь в
 * кэш браузера.
 *
 * Список собирается из тех же данных, что рисуют игру, а не переписывается
 * рядом: список-копия расходится с игрой на первом же новом арте, и расходится
 * молча — не грузится ровно то, что забыли дописать.
 *
 * Прогрев ничего не блокирует и ничего не ломает: не загрузившаяся картинка
 * просто останется на своём обычном пути — браузер возьмёт её тогда, когда она
 * понадобится, как и раньше.
 */
import { useEffect, useRef, useState } from 'react';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { PROFILE_AVATARS } from '@kinglier/engine/profile';
import { cardArt, TABLE_ART_WIDTH } from './cardArt.ts';

/**
 * Сколько картинок тянем разом.
 *
 * Не «все сразу»: восемь десятков параллельных запросов забивают соединение и
 * отодвигают то, что нужно прямо сейчас, — вход, лобби, само состояние стола.
 * Шесть примерно совпадает с тем, сколько браузер и так держит на домен.
 */
const LANES = 6;

/**
 * Картинки, которые не выводятся из данных: рубашка карты и штучный интерфейс.
 * Всё остальное берётся из описаний карт и списка аватаров.
 */
const FIXED = [
  cardArt('/assets/cards/back-dual-face.webp', TABLE_ART_WIDTH),
  '/assets/ui/thumbsup-500.webp',
  '/assets/ui/coin-500.webp',
  '/assets/ui/coin-side-500.webp',
  /* Пушки салюта. Греются вместе со всем: они выкатываются рывком за секунду
     до выстрела, и подгружаться в этот момент им уже поздно. */
  '/assets/ui/cannon-500.webp'
];

/** Порядок важен: первым греем то, что появится на столе раньше всего. */
function assetList(extra: readonly string[]): string[] {
  /* Греем ровно ту копию, которой стол и рисует карты. Прогрев оригиналов был
     бы прогревом впустую: браузер всё равно пошёл бы за другим файлом. */
  const arts = Object.values(CARD_DESCRIPTIONS)
    .map(info => info.artImage)
    .filter((src): src is string => !!src)
    .map(src => cardArt(src, TABLE_ART_WIDTH));

  /* `Set` не только от дублей: аватар вошедшего игрока обычно уже есть в
     списке профилей, и грузить его дважды незачем. */
  return [...new Set([...FIXED, ...arts, ...PROFILE_AVATARS, ...extra])];
}

/** Уже прогретое. Повторный вызов — не повод тянуть всё заново. */
const warmed = new Set<string>();

function warm(src: string): Promise<void> {
  return new Promise(resolve => {
    if (warmed.has(src)) {
      resolve();
      return;
    }
    const img = new Image();
    /* И удача, и неудача заканчивают одинаково: прогрев — это ускорение, а не
       условие работы, и падать ему не на чем. Иначе одна отсутствующая
       картинка держала бы экран загрузки навсегда. */
    const done = () => {
      warmed.add(src);
      resolve();
    };
    img.onload = done;
    img.onerror = done;
    img.src = src;
  });
}

/** Ход прогрева: сколько уже готово из скольких. */
export interface PreloadProgress {
  done: number;
  total: number;
  /** Доля от 0 до 1. Пустой список считается готовым, а не нулевым. */
  ratio: number;
  ready: boolean;
}

/**
 * Начинает прогрев и сообщает о ходе.
 *
 * `extra` — то, чего нет в общих списках: например, аватар вошедшего игрока,
 * если он когда-нибудь станет своим файлом, а не выбором из готовых.
 */
export function preloadGameAssets(
  extra: readonly string[] = [],
  onProgress?: (progress: PreloadProgress) => void
): void {
  const list = typeof window === 'undefined' ? [] : assetList(extra);
  const total = list.length;
  let done = list.filter(src => warmed.has(src)).length;

  const report = () =>
    onProgress?.({
      done,
      total,
      /* Делить на ноль нельзя, а «нечего грузить» — это готовность, а не
         нулевой прогресс: экран загрузки на пустом списке не должен висеть. */
      ratio: total === 0 ? 1 : done / total,
      ready: done >= total
    });

  report();
  if (done >= total) return;

  const queue = list.filter(src => !warmed.has(src));
  let next = 0;

  const lane = async () => {
    while (next < queue.length) {
      await warm(queue[next++]);
      done++;
      report();
    }
  };

  for (let i = 0; i < LANES; i++) void lane();
}

/**
 * Ход прогрева для интерфейса.
 *
 * Экран загрузки показывается НЕ всегда, и это два разных правила:
 *
 *  - `SHOW_AFTER_MS` — на прогретом кэше всё готово за десятки миллисекунд, и
 *    экран, мелькнувший на два кадра, читается как сбой, а не как загрузка.
 *    Поэтому сначала пауза: не успели — показываем.
 *  - `MIN_SHOW_MS` — а уж если показали, держим достаточно, чтобы его успели
 *    прочесть. Полоса, дошедшая до середины и исчезнувшая, выглядит хуже, чем
 *    её отсутствие.
 */
const SHOW_AFTER_MS = 180;
const MIN_SHOW_MS = 700;

export function useAssetPreload(): { visible: boolean; ratio: number } {
  const [progress, setProgress] = useState<PreloadProgress>({
    done: 0,
    total: 0,
    ratio: 0,
    ready: false
  });
  const [shown, setShown] = useState(false);
  const [held, setHeld] = useState(false);

  /* Готовность нужна таймеру ниже — тому, который решает, показывать ли экран
     вообще. Он срабатывает один раз и в замыкании видел бы состояние на момент
     монтирования, то есть всегда «не готово». */
  const ready = useRef(false);

  useEffect(() => {
    preloadGameAssets([], next => {
      ready.current = next.ready;
      setProgress(next);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      /* Успели за паузу — экран не нужен вовсе: на прогретом кэше он мелькнул
         бы на два кадра и прочитался как сбой. */
      if (ready.current) return;
      setShown(true);
      setHeld(true);
      window.setTimeout(() => setHeld(false), MIN_SHOW_MS);
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return { visible: shown && (!progress.ready || held), ratio: progress.ratio };
}
