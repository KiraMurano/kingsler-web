/**
 * Обычное действие — широкая карточка со своим артом.
 *
 * Раньше это были строки без арта, и комментарий над ними объяснял почему: «у
 * них нет ни лица, ни арта, и крупная плитка обещала больше, чем в них есть».
 * Теперь лицо у них есть, и обещание стало правдой — четыре действия двора
 * перестали быть списком настроек и читаются как то же, чем играют.
 *
 * Формат 3:1 — тот же, в котором нарисованы арты, и он же держит карточку
 * широкой полосой, а не картой: обычное действие картой не является, и путать
 * его с рукой нельзя.
 *
 * Компонент один на модалку и на кодекс. Место, где показывают одно и то же,
 * должно показывать это одинаково, а два похожих блока в двух файлах
 * расходятся на первой же правке.
 */
import React from 'react';
import type { InspectableItem } from '@kinglier/engine/data/cardDescriptions';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';

export const ActionCard: React.FC<{
  action: InspectableItem;
  /** Плашка в правом верхнем углу: цена или состояние. */
  badge?: React.ReactNode;
  /** Описание под названием. */
  children: React.ReactNode;
  /**
   * Действие сейчас недоступно.
   *
   * Не `disabled`: тот глушит клики по всему, что внутри кнопки, а внутри
   * «Распустить слух» живут ссылки на карты — прочитать про «Королевский
   * приём» должно быть можно и тогда, когда на само действие не хватает
   * золота. Кнопка остаётся кнопкой и остаётся в обходе с клавиатуры, а
   * недоступность объявляет `aria-disabled`.
   */
  off?: boolean;
  onClick?: () => void;
}> = ({ action, badge, children, off = false, onClick }) => {
  const info = CARD_DESCRIPTIONS[action];

  return (
    <button
      type="button"
      className={`actioncard${off ? ' actioncard--off' : ''}`}
      aria-disabled={off}
      onClick={onClick}
      style={info.artImage ? { backgroundImage: `url(${info.artImage})` } : undefined}
    >
      {/* Полог под текстом: арт светлый и подробный, буквы по нему не читаются.
          Отдельным узлом, а не тенью на тексте, — тень обводит каждую букву и
          на длинном описании превращается в грязь. */}
      <span className="actioncard__veil" aria-hidden />
      <span className="actioncard__text">
        <span className="actioncard__head">
          <span className="actioncard__name">{info.name}</span>
          {badge}
        </span>
        <span className="actioncard__desc">{children}</span>
      </span>
    </button>
  );
};
