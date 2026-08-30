import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { Sparkles, Users, ScrollText, Zap, type LucideIcon } from 'lucide-react';
import { Button } from './ui/Button';
import { spring, tilt } from '../motion/tokens.ts';
import { cardTilt } from '../lib/cardTilt.ts';
import { cardArt } from '../lib/cardArt.ts';

type CategoryKey = 'roles' | 'plots' | 'instants';

interface FanCardData {
  id: string;
  name: string;
  category: CategoryKey;
  artImage: string;
  tagline: string;
}

const CATEGORY_DATA: Record<
  CategoryKey,
  {
    label: string;
    icon: LucideIcon;
    description: string;
    cards: FanCardData[];
  }
> = {
  roles: {
    label: 'Роли двора',
    icon: Users,
    description:
      'Шесть ключевых персонажей двора. Разыгрывайте их в открытую или блефуйте чужим именем: от тайных краж золота и вымогательства до парирования ударов и защиты от нападений.',
    cards: [
      {
        id: 'joker',
        name: 'Шут',
        category: 'roles',
        artImage: '/assets/cards/joker.webp',
        tagline: 'Хаос и спасительная защита от нападений'
      },
      {
        id: 'thief',
        name: 'Вор',
        category: 'roles',
        artImage: '/assets/cards/thief.webp',
        tagline: 'Ночная кража золота из чужой казны'
      },
      {
        id: 'knight',
        name: 'Рыцарь',
        category: 'roles',
        artImage: '/assets/cards/knight.webp',
        tagline: 'Честная дуэль и несокрушимый щит'
      },
      {
        id: 'heir',
        name: 'Наследник',
        category: 'roles',
        artImage: '/assets/cards/heir.webp',
        tagline: 'Законное право на корону и престол'
      },
      {
        id: 'treasurer',
        name: 'Казначей',
        category: 'roles',
        artImage: '/assets/cards/treasurer.webp',
        tagline: 'Сбор королевских податей и обогащение'
      },
      {
        id: 'blackmailer',
        name: 'Шантажист',
        category: 'roles',
        artImage: '/assets/cards/blackmailer.webp',
        tagline: 'Тайный шантаж и вымогательство ресурсов'
      }
    ]
  },
  plots: {
    label: 'Интриги',
    icon: ScrollText,
    description:
      'Карты долгосрочных замыслов и союзов. Закладывайте коварные планы, которые срабатывают каждое утро и шаг за шагом приближают вас к заветному престолу.',
    cards: [
      {
        id: 'reception',
        name: 'Королевский приём',
        category: 'plots',
        artImage: '/assets/cards/intrigue-reception.webp',
        tagline: 'Празднество для укрепления влияния'
      },
      {
        id: 'blackbook',
        name: 'Чёрная книга',
        category: 'plots',
        artImage: '/assets/cards/intrigue-blackbook.webp',
        tagline: 'Список тайных грехов и чужих долгов'
      },
      {
        id: 'informator',
        name: 'Сеть информаторов',
        category: 'plots',
        artImage: '/assets/cards/intrigue-inforator.webp',
        tagline: 'Глаза и уши во всех покоях замка'
      },
      {
        id: 'guard',
        name: 'Стража покоев',
        category: 'plots',
        artImage: '/assets/cards/intrigue-guard.webp',
        tagline: 'Караул у дверей: ни вору, ни шантажисту'
      },
      {
        id: 'protection',
        name: 'Охранная грамота',
        category: 'plots',
        artImage: '/assets/cards/intrigue-protection.webp',
        tagline: 'Королевское заступничество над вашими коронами'
      },
      {
        id: 'plot',
        name: 'Тайный заговор',
        category: 'plots',
        artImage: '/assets/cards/intrigue-plot.webp',
        tagline: 'Скрытый союз против главного фаворита'
      }
    ]
  },
  instants: {
    label: 'Мгновенные карты',
    icon: Zap,
    description:
      'Внезапные карты-реакции для перехвата инициативы. Наложите королевское вето, перенаправьте вражеский удар на обидчика или пойдите ва-банк в решающий момент.',
    cards: [
      {
        id: 'veto',
        name: 'Право вето',
        category: 'instants',
        artImage: '/assets/cards/instant-veto.webp',
        tagline: 'Немедленный запрет любого действия'
      },
      {
        id: 'switch',
        name: 'Перенаправление',
        category: 'instants',
        artImage: '/assets/cards/instant-switch.webp',
        tagline: 'Перевод вражеского удара на другого игрока'
      },
      {
        id: 'allin',
        name: 'Ва-банк',
        category: 'instants',
        artImage: '/assets/cards/instant-allin.webp',
        tagline: 'Рискованная ставка всем состоянием'
      },
      {
        id: 'uproar',
        name: 'Дворцовый переполох',
        category: 'instants',
        artImage: '/assets/cards/instant-uproar.webp',
        tagline: 'Смута, перемешивающая карты в руках'
      },
      {
        id: 'search',
        name: 'Обыск покоев',
        category: 'instants',
        artImage: '/assets/cards/instant-search.webp',
        tagline: 'Вскрытие чужих секретов и карт руки'
      },
      {
        id: 'treason',
        name: 'Обвинение в измене',
        category: 'instants',
        artImage: '/assets/cards/instant-treason.webp',
        tagline: 'Сокрушительный удар по чужой репутации'
      }
    ]
  }
};

const CATEGORIES: CategoryKey[] = ['roles', 'plots', 'instants'];

/** Насколько карта под курсором крупнее соседок. Одна цифра на весь веер. */
const HOVER_SCALE = 1.1;

type SlotAnimState = 'idle' | 'revealing' | 'waving';

/**
 * Одна карта веера.
 *
 * Вынесена из `.map()` не ради порядка, а по необходимости: притяжение к
 * курсору держится на моушен-значениях, а хуки в цикле не вызвать.
 *
 * Наведение сделано ровно тем же приёмом, что и у карт в руке за столом (см.
 * `motion/CardLayer.tsx`): карта не двигается с места, а слегка подрастает и
 * наклоняется в сторону курсора. Наклон живёт на отдельном узле, чтобы
 * вращаться вокруг середины карты, а не вокруг точки, по которой развёрнут
 * веер, — и потому же не дерётся за `transform` с переворотом внутри.
 *
 * То, что карта остаётся на месте, — не вкусовщина. Прошлый вариант поднимал
 * её на 46px и увеличивал в 1.12 вокруг точки под нижним краем: на крупном
 * экране карта уезжала из-под курсора, наведение слетало, карта возвращалась —
 * и так по кругу. Отсюда и «дёргается влево-вправо» на 4K. Увеличение вокруг
 * собственного центра из-под курсора уехать не может: точка внутри
 * прямоугольника при таком масштабировании остаётся внутри.
 */
const FanCard: React.FC<{
  card: FanCardData;
  index: number;
  total: number;
  animState: SlotAnimState;
  hovered: boolean;
  onHoverChange: (card: FanCardData | null) => void;
  onToggle: (card: FanCardData) => void;
}> = ({ card, index, total, animState, hovered, onHoverChange, onToggle }) => {
  const reduce = !!useReducedMotion();

  const tiltXTarget = useMotionValue(0);
  const tiltYTarget = useMotionValue(0);
  const tiltX = useSpring(tiltXTarget, spring.hover);
  const tiltY = useSpring(tiltYTarget, spring.hover);

  const releaseTilt = () => {
    tiltXTarget.set(0);
    tiltYTarget.set(0);
  };

  /* Наведение снимает не только курсор: переключение категории гасит его из
     родителя, и наклон обязан уехать в ноль вместе с ним. */
  useEffect(() => {
    if (hovered) return;
    tiltXTarget.set(0);
    tiltYTarget.set(0);
  }, [hovered, tiltXTarget, tiltYTarget]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    /* Пальцу наклонять нечего: наклон читается только когда курсор ходит по
       карте, а касание — это точка, которая появляется и исчезает. */
    if (reduce || e.pointerType !== 'mouse') return;
    const next = cardTilt(
      e.currentTarget.getBoundingClientRect(),
      e.clientX,
      e.clientY,
      tilt.pointerMax
    );
    tiltXTarget.set(next.x);
    tiltYTarget.set(next.y);
  };

  /* Симметричный разлёт: -2.5, -1.5, -0.5, 0.5, 1.5, 2.5 */
  const offset = index - (total - 1) / 2;

  return (
    <div
      className={`fan-card-wrapper ${hovered ? 'fan-card-wrapper--hovered' : ''}`}
      style={{
        '--rotate-deg': `${offset * 7.2}deg`,
        '--translate-x': `${offset * 116}px`,
        /* Квадратичный провис: крайние карты уходят вниз широкой дугой. */
        '--translate-y': `${offset * offset * 5.2}px`,
        zIndex: hovered ? 60 : 10 + index
      } as React.CSSProperties}
      onPointerEnter={() => onHoverChange(card)}
      onPointerLeave={() => {
        releaseTilt();
        onHoverChange(null);
      }}
      onPointerMove={onPointerMove}
      onClick={() => onToggle(card)}
    >
      <motion.div
        className="fan-card-tilt"
        style={{
          rotateX: reduce ? 0 : tiltX,
          rotateY: reduce ? 0 : tiltY,
          transformStyle: 'preserve-3d'
        }}
        /* Только `scale`: `rotateX`/`rotateY` выше — моушен-значения из
           `style`, и анимировать их ещё и отсюда значит драться за одно
           свойство. Тот же уговор действует у карт за столом. */
        animate={{ scale: hovered && !reduce ? HOVER_SCALE : 1 }}
        transition={spring.hover}
      >
        <div
          className={[
            'fan-card-3d',
            animState === 'revealing' ? 'fan-card-3d--reveal' : '',
            animState === 'waving' ? 'fan-card-3d--wave' : '',
            animState === 'idle' ? 'fan-card-3d--face-up' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={`fan-card-face fan-card-face--front fan-card-face--${card.category}`}>
            <img
              src={cardArt(card.artImage, 768)}
              alt={card.name}
              draggable={false}
              className="fan-card-face__art"
            />
            <div className="fan-card-face__glow" />
          </div>

          <div className="fan-card-face fan-card-face--back">
            <img
              src={cardArt('/assets/cards/back-dual-face.webp', 768)}
              alt="Рубашка карты"
              draggable={false}
              className="fan-card-face__art"
            />
            <div className="fan-card-face__glow" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export function CardFanShowcase({ onOpenLogin }: { onOpenLogin: () => void }) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('roles');
  
  // Stable card slots: each slot maintains its current data without unmounting DOM
  const [slotCards, setSlotCards] = useState<FanCardData[]>(() => CATEGORY_DATA.roles.cards);
  // Track wave flipping per slot
  const [slotAnimStates, setSlotAnimStates] = useState<SlotAnimState[]>([
    'idle', 'idle', 'idle', 'idle', 'idle', 'idle'
  ]);
  const [hoveredCard, setHoveredCard] = useState<FanCardData | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isTransitioningRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasRevealedRef = useRef(false);

  const clearAllTimers = () => {
    timersRef.current.forEach(t => clearTimeout(t));
    timersRef.current = [];
  };

  // Initial wave reveal when scrolled into view
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasRevealedRef.current) {
            hasRevealedRef.current = true;
            for (let i = 0; i < 6; i++) {
              const timer = setTimeout(() => {
                setSlotAnimStates(prev => {
                  const next = [...prev];
                  next[i] = 'revealing';
                  return next;
                });
              }, 120 + i * 65);
              timersRef.current.push(timer);
            }
          }
        });
      },
      { threshold: 0.2 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      clearAllTimers();
    };
  }, []);

  // Continuous Rolling Wave Flip on Category Switch
  const handleSelectCategory = useCallback(
    (newCat: CategoryKey) => {
      if (newCat === selectedCategory || isTransitioningRef.current) return;

      clearAllTimers();
      isTransitioningRef.current = true;
      setSelectedCategory(newCat);
      setHoveredCard(null);

      const targetCards = CATEGORY_DATA[newCat].cards;
      const stepDelay = 65; // Time between each card's wave start
      const halfFlipDuration = 200; // Time when card reaches 90° edge-on to swap image
      const fullFlipDuration = 420; // Time when single card finishes its 360/wave flip

      for (let i = 0; i < 6; i++) {
        // 1. Start continuous wave flip for card i
        const startTimer = setTimeout(() => {
          setSlotAnimStates(prev => {
            const next = [...prev];
            next[i] = 'waving';
            return next;
          });
        }, i * stepDelay);
        timersRef.current.push(startTimer);

        // 2. Midpoint: card i is edge-on (90°). Swap image seamlessly while invisible
        const swapTimer = setTimeout(() => {
          setSlotCards(prev => {
            const next = [...prev];
            next[i] = targetCards[i];
            return next;
          });
        }, i * stepDelay + halfFlipDuration);
        timersRef.current.push(swapTimer);

        // 3. Card i finishes flip and is back to face-up
        const finishCardTimer = setTimeout(() => {
          setSlotAnimStates(prev => {
            const next = [...prev];
            next[i] = 'idle';
            return next;
          });
        }, i * stepDelay + fullFlipDuration);
        timersRef.current.push(finishCardTimer);
      }

      // 4. Entire wave complete
      const endWaveTimer = setTimeout(() => {
        isTransitioningRef.current = false;
      }, 5 * stepDelay + fullFlipDuration + 60);
      timersRef.current.push(endWaveTimer);
    },
    [selectedCategory]
  );

  const selectedCategoryMeta = CATEGORY_DATA[selectedCategory];
  const total = 6;

  return (
    <section className="fan-showcase" ref={containerRef} id="cards-showcase">
      <div className="fan-showcase__header">
        <span className="fan-showcase__badge">
          <Sparkles size={14} /> КОЛОДА КОРОЛЕВСКОГО ДВОРА
        </span>
        <h2 className="fan-showcase__title">Оружие интриги в ваших руках</h2>
      </div>

      {/* Unified Top Category Panel with Animated Description */}
      <div className="fan-category-panel">
        <div className="fan-tabs">
          {CATEGORIES.map(cat => {
            const item = CATEGORY_DATA[cat];
            const isActive = selectedCategory === cat;
            const Icon = item.icon;
            return (
              <button
                key={cat}
                type="button"
                className={`fan-tab ${isActive ? 'fan-tab--active' : ''}`}
                onClick={() => handleSelectCategory(cat)}
              >
                <Icon className="fan-tab__icon" size={16} strokeWidth={2.1} />
                <span className="fan-tab__label">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="fan-category-desc" key={selectedCategory}>
          <p>{selectedCategoryMeta.description}</p>
        </div>
      </div>

      {/* The Wide 3D Fan Deck Container */}
      <div className="fan-stage">
        <div className="fan-deck fan-deck--open">
          {slotCards.map((card, index) => (
            <FanCard
              key={`slot-${index}`}
              card={card}
              index={index}
              total={total}
              animState={slotAnimStates[index]}
              hovered={hoveredCard?.id === card.id}
              onHoverChange={next => {
                if (isTransitioningRef.current) return;
                setHoveredCard(next);
              }}
              onToggle={next => {
                if (isTransitioningRef.current) return;
                setHoveredCard(prev => (prev?.id === next.id ? null : next));
              }}
            />
          ))}
        </div>

        {/* Hovered Card Inspector / Caption */}
        <div className="fan-inspector">
          {hoveredCard ? (
            <div className="fan-inspector__card">
              <strong className="fan-inspector__title gilded">{hoveredCard.name}</strong>
              <span className="fan-inspector__tagline">{hoveredCard.tagline}</span>
            </div>
          ) : (
            <div className="fan-inspector__hint">
              <span>Наведите курсор на любую карту, чтобы рассмотреть её вблизи</span>
            </div>
          )}
        </div>
      </div>

      {/* Final Closing Call To Action — a title and subtitle, not a boxed card */}
      <div className="fan-cta">
        <div className="fan-cta__content">
          <span className="fan-cta__rule" />
          <h3 className="fan-cta__title">
            Трон свободен.
            <br />
            Рискните занять его.
          </h3>
          <p className="fan-cta__sub">
            Собирайте друзей онлайн или проверьте свою смекалку против королевского двора ботов.
          </p>
          <Button tone="gold" size="lg" onClick={onOpenLogin}>
            Начать схватку за корону
          </Button>
        </div>
      </div>
    </section>
  );
}
