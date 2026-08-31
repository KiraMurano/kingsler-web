import React, { useContext } from 'react';
import { UiIcon, type UiIconKind, type UiIconSize } from '../components/ui/Icon';
import type { InspectableItem } from '@kinglier/engine/data/cardDescriptions';
import { InspectCardContext } from './inspectCardContext';

const EMOJI_TO_KIND: Record<string, UiIconKind> = {
  '🪙': 'coin',
  '👑': 'crown',
  '⚜️': 'bulla',
  '⚜': 'bulla',
  '⚡': 'move'
};

const ICON_SPLIT_REGEX = /(🪙|👑|⚜️|⚜|⚡)/g;

/**
 * Словоформы карт и обычных действий Kinglier для интерактивной подсветки и навигации.
 */
const ITEM_FORMS_MAP: Record<string, InspectableItem> = {
  // Роли
  'Наследник': 'Наследник',
  'Наследника': 'Наследник',
  'Наследником': 'Наследник',
  'Казначей': 'Казначей',
  'Казначея': 'Казначей',
  'Казначеем': 'Казначей',
  'Вор': 'Вор',
  'Вора': 'Вор',
  'Вором': 'Вор',
  'Шантажист': 'Шантажист',
  'Шантажиста': 'Шантажист',
  'Шантажистом': 'Шантажист',
  'Дуэлянт': 'Дуэлянт',
  'Дуэлянта': 'Дуэлянт',
  'Дуэлянтом': 'Дуэлянт',
  'Шут': 'Шут',
  'Шута': 'Шут',
  'Шутом': 'Шут',

  // Интриги
  'Королевский приём': 'Королевский приём',
  'Королевского приёма': 'Королевский приём',
  'Королевский прием': 'Королевский приём',
  'Королевскому приёму': 'Королевский приём',
  'Чёрная книга': 'Чёрная книга',
  'Чёрной книги': 'Чёрная книга',
  'Черная книга': 'Чёрная книга',
  'Сеть информаторов': 'Сеть информаторов',
  'Сети информаторов': 'Сеть информаторов',
  'Тайный заговор': 'Тайный заговор',
  'Тайного заговора': 'Тайный заговор',
  'Тайному заговору': 'Тайный заговор',
  'Тайным заговором': 'Тайный заговор',
  'Заговор': 'Тайный заговор',
  'Заговора': 'Тайный заговор',
  'Заговором': 'Тайный заговор',
  'Стража покоев': 'Стража покоев',
  'Стражи покоев': 'Стража покоев',
  'Стражу покоев': 'Стража покоев',
  'Стражей покоев': 'Стража покоев',
  'Охранная грамота': 'Охранная грамота',
  'Охранной грамоты': 'Охранная грамота',
  'Охранную грамоту': 'Охранная грамота',
  'Охранной грамотой': 'Охранная грамота',
  'Досье': 'Досье',

  // Инстанты
  'Право вето': 'Право вето',
  'Права вето': 'Право вето',
  'Правом вето': 'Право вето',
  'Перенаправление': 'Перенаправление',
  'Перенаправления': 'Перенаправление',
  'Перенаправлением': 'Перенаправление',
  'Ва-банк': 'Ва-банк',
  'Ва-банка': 'Ва-банк',
  'Ва-банком': 'Ва-банк',
  'Дворцовый переполох': 'Дворцовый переполох',
  'Дворцового переполоха': 'Дворцовый переполох',
  'Дворцовым переполохом': 'Дворцовый переполох',
  'Обыск покоев': 'Обыск покоев',
  'Обыска покоев': 'Обыск покоев',
  'Обыском покоев': 'Обыск покоев',
  'Обвинение в измене': 'Обвинение в измене',
  'Обвинения в измене': 'Обвинение в измене',
  'Обвинением в измене': 'Обвинение в измене',

  // Обычные действия
  'Просить содержание': 'Просить содержание',
  'Просить содержания': 'Просить содержание',
  'Прошение содержания': 'Просить содержание',
  'содержание': 'Просить содержание',
  'содержания': 'Просить содержание',
  'Устроить пир': 'Устроить пир',
  'Устроив пир': 'Устроить пир',
  'Устройте пир': 'Устроить пир',
  'пиром': 'Устроить пир',
  'пира': 'Устроить пир',
  'пир': 'Устроить пир',
  'Распустить слух': 'Распустить слух',
  'Распустив слух': 'Распустить слух',
  'Распустите слух': 'Распустить слух',
  'Распускать слух': 'Распустить слух',
  'слухом': 'Распустить слух',
  'слуха': 'Распустить слух',
  'слух': 'Распустить слух',
  'Сменить карты': 'Сменить карты',
  'Сменить карту': 'Сменить карты',
  'Смена карт': 'Сменить карты',
  'Смену карт': 'Сменить карты',
  'Смене карт': 'Сменить карты',
  'Смены карт': 'Сменить карты',
  'Сменив карты': 'Сменить карты',
  'Обмен карт': 'Сменить карты',
  'Обмене карт': 'Сменить карты'
};

const ITEM_REGEX_PATTERN = Object.keys(ITEM_FORMS_MAP)
  .sort((a, b) => b.length - a.length)
  .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const ITEM_SPLIT_REGEX = new RegExp(`(?<=^|[\\s«"(\\[,.:;—–-]|^)(${ITEM_REGEX_PATTERN})(?=[\\s»")\\],.:;!?—–-]|$)`, 'gu');

export const CardLink: React.FC<{
  card?: InspectableItem;
  item?: InspectableItem;
  children: React.ReactNode;
  onInspect?: (item: InspectableItem) => void;
}> = ({ card, item, children, onInspect }) => {
  const target = item ?? card;
  const contextInspect = useContext(InspectCardContext);
  const handler = onInspect ?? contextInspect;

  return (
    <span
      className="cardlink"
      onClick={e => {
        if (handler && target) {
          e.stopPropagation();
          handler(target);
        }
      }}
    >
      {children}
    </span>
  );
};

function renderTextWithLinks(
  text: string,
  keyPrefix: string,
  onInspect?: (item: InspectableItem) => void
): React.ReactNode {
  if (!ITEM_SPLIT_REGEX.test(text)) return text;
  ITEM_SPLIT_REGEX.lastIndex = 0;
  const tokens = text.split(ITEM_SPLIT_REGEX);

  return tokens.map((tok, idx) => {
    const item = ITEM_FORMS_MAP[tok];
    if (item) {
      return (
        <CardLink key={`${keyPrefix}-c-${idx}`} item={item} onInspect={onInspect}>
          {tok}
        </CardLink>
      );
    }
    return tok;
  });
}

/**
 * Replaces game resource emojis in text with crisp inline WebP icons,
 * and transforms card and action mentions into interactive links.
 */
export function renderWithIcons(
  text: React.ReactNode,
  size: UiIconSize = 'sm',
  onInspect?: (item: InspectableItem) => void
): React.ReactNode {
  if (typeof text !== 'string') return text;

  const parts = text.split(ICON_SPLIT_REGEX);

  return parts.map((part, index) => {
    const iconKind = EMOJI_TO_KIND[part];
    if (iconKind) {
      return <UiIcon key={`icon-${index}`} kind={iconKind} size={size} />;
    }
    return renderTextWithLinks(part, `seg-${index}`, onInspect);
  });
}
