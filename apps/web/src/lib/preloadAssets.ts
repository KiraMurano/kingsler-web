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
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { PROFILE_AVATARS } from '@kinglier/engine/profile';

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
  '/assets/cards/back-dual-face.webp',
  '/assets/ui/thumbsup-500.webp',
  '/assets/ui/coin-500.webp',
  '/assets/ui/coin-side-500.webp'
];

/** Порядок важен: первым греем то, что появится на столе раньше всего. */
function assetList(extra: readonly string[]): string[] {
  const arts = Object.values(CARD_DESCRIPTIONS)
    .map(info => info.artImage)
    .filter((src): src is string => !!src);

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
       условие работы, и падать ему не на чем. */
    const done = () => {
      warmed.add(src);
      resolve();
    };
    img.onload = done;
    img.onerror = done;
    img.src = src;
  });
}

/**
 * Начинает прогрев и сразу возвращает управление.
 *
 * `extra` — то, чего нет в общих списках: например, аватар вошедшего игрока,
 * если он когда-нибудь станет своим файлом, а не выбором из готовых.
 */
export function preloadGameAssets(extra: readonly string[] = []): void {
  if (typeof window === 'undefined') return;

  const queue = assetList(extra).filter(src => !warmed.has(src));
  let next = 0;

  const lane = async () => {
    while (next < queue.length) await warm(queue[next++]);
  };

  for (let i = 0; i < LANES; i++) void lane();
}
