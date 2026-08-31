/**
 * Редактор правил партии — один на два режима.
 *
 * Оффлайн его показывает модалка перед игрой с ботами, онлайн — модалка лобби.
 * Компонент один намеренно: два списка правил разъехались бы при первой же
 * новой настройке, и хост в лобби крутил бы не то, что игрок с ботами.
 *
 * Правит настройки всегда ровно тот, кто их видит: оффлайн — сам игрок, онлайн
 * — хост, и больше никто. Поэтому режима «только смотреть» здесь нет.
 */
import React, { useState } from 'react';
import type { GameCard } from '@kinglier/engine/types';
import type { GameRules } from '@kinglier/engine/rules';
import {
  BLACKMAIL_PRICE_ON,
  DECK_COPIES_LIMIT,
  DEFAULT_RULES,
  RULE_LIMITS,
  deckSize,
  rulesProblems
} from '@kinglier/engine/rules';
import { ALL_ROLES, ALL_PLOTS, ALL_INSTANTS } from '@kinglier/engine/data/cardDescriptions';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';

type NumericRule = keyof typeof RULE_LIMITS;
type BoolRule =
  | 'duelCostsToken'
  | 'paidDuelEnabled'
  | 'vetoOnVeto'
  | 'unmaskEnabled'
  | 'paidDoubtEnabled'
  | 'paidPlayEnabled';

function Slider({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className={`rulerow${disabled ? ' rulerow--off' : ''}`}>
      <span className="rulerow__head">
        <span className="rulerow__label">{label}</span>
        <span className="rulerow__value">{value}</span>
      </span>
      <input
        type="range"
        className="rulerow__range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
      />
      {hint && <span className="rulerow__hint">{hint}</span>}
    </label>
  );
}

function Toggle({
  label,
  hint,
  value,
  disabled,
  onChange
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`rulerow rulerow--toggle${disabled ? ' rulerow--off' : ''}`}>
      <span className="rulerow__head">
        <span className="rulerow__label">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          className={`switch${value ? ' switch--on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(!value)}
        >
          <span className="switch__knob" />
        </button>
      </span>
      {hint && <span className="rulerow__hint">{hint}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rulesec">
      <h3 className="rulesec__title">{title}</h3>
      <div className="rulesec__body">{children}</div>
    </section>
  );
}

export function RulesEditor({
  rules,
  onChange
}: {
  rules: GameRules;
  onChange: (next: GameRules) => void;
}) {
  const [deckOpen, setDeckOpen] = useState(false);

  /* «Платную дуэль» есть смысл включать только когда дуэль вообще стоит жетона:
     выкупать нечего, если жетон и так не нужен. То же правило стоит в
     `normalizeRules` — здесь оно объясняет, а там защищает: правила приходят от
     клиента-хоста, и верить им нельзя. */
  const duelCanBePaid = rules.duelCostsToken;

  const num = (key: NumericRule) => (value: number) => onChange({ ...rules, [key]: value });
  const flag = (key: BoolRule) => (value: boolean) => {
    /* Взаимоисключение решается здесь же, а не молча в движке: игрок должен
       видеть, как один тумблер гасит другой, иначе он решит, что настройка
       сломана. */
    if (key === 'paidDoubtEnabled' && value) {
      onChange({ ...rules, paidDoubtEnabled: true, unmaskEnabled: false });
      return;
    }
    if (key === 'unmaskEnabled' && value) {
      onChange({ ...rules, unmaskEnabled: true, paidDoubtEnabled: false });
      return;
    }
    /* «Платная дуэль» держится на соседе: выключили требование жетона — гаснет
       и она. Иначе в правилах осталась бы включённая настройка, которая ничего
       не значит, и игрок бы этого не увидел. */
    const dropsPaidDuel = !value && key === 'duelCostsToken';
    onChange({
      ...rules,
      [key]: value,
      ...(dropsPaidDuel ? { paidDuelEnabled: false } : null)
    });
  };
  const copies = (card: GameCard) => (value: number) =>
    onChange({ ...rules, deck: { ...rules.deck, [card]: value } });

  /*
   * «Платный шантаж» — это и есть `blackmailCost > 0`: отдельного флага в
   * правилах нет, и заводить его значило бы держать два состояния у одного
   * факта. Цена, с которой правило выключали, помнится на время открытого
   * экрана — иначе передумавший игрок каждый раз получал бы обратно не своё
   * число, а умолчание.
   */
  const blackmailPaid = rules.blackmailCost > 0;
  const [rememberedBlackmailPrice, rememberBlackmailPrice] = useState(
    () => rules.blackmailCost || BLACKMAIL_PRICE_ON
  );
  const setBlackmailPaid = (on: boolean) => {
    /* Цену запоминаем в момент выключения — другого момента нет: в
       выключенном состоянии в правилах лежит ноль, и вспоминать будет нечего. */
    if (!on) rememberBlackmailPrice(rules.blackmailCost || BLACKMAIL_PRICE_ON);
    onChange({ ...rules, blackmailCost: on ? rememberedBlackmailPrice : 0 });
  };

  const size = deckSize(rules);
  const problems = rulesProblems(rules);
  const feastCap = rules.crownsToWin - 1;

  const cardGroup = (title: string, cards: readonly GameCard[]) => (
    <div className="deckgroup">
      <div className="deckgroup__title">{title}</div>
      {cards.map(card => (
        <Slider
          key={card}
          label={card}
          value={rules.deck[card] ?? 0}
          min={DECK_COPIES_LIMIT[0]}
          max={DECK_COPIES_LIMIT[1]}
          onChange={copies(card)}
        />
      ))}
    </div>
  );

  return (
    <div className="ruleseditor">
      <Section title="Партия">
        <Slider
          label="Корон для победы"
          hint={
            feastCap >= 1
              ? `Пиром можно дойти только до ${feastCap} 👑 — победную корону покупать нельзя.`
              : 'При одной короне пир бесполезен: он не может дать победную корону.'
          }
          value={rules.crownsToWin}
          min={RULE_LIMITS.crownsToWin[0]}
          max={RULE_LIMITS.crownsToWin[1]}
          onChange={num('crownsToWin')}
        />
        <Slider
          label="Жетонов хода"
          hint="Восполняются в начале своего хода. Из них же платят за проверки на чужих ходах."
          value={rules.actionTokens}
          min={RULE_LIMITS.actionTokens[0]}
          max={RULE_LIMITS.actionTokens[1]}
          onChange={num('actionTokens')}
        />
      </Section>

      <Section title="Экономика двора">
        <Slider
          label="Стоимость короны (пир)"
          value={rules.feastCost}
          min={RULE_LIMITS.feastCost[0]}
          max={RULE_LIMITS.feastCost[1]}
          onChange={num('feastCost')}
        />
        <Slider
          label="Стоимость роспуска слуха"
          value={rules.rumorCost}
          min={RULE_LIMITS.rumorCost[0]}
          max={RULE_LIMITS.rumorCost[1]}
          onChange={num('rumorCost')}
        />
        <Toggle
          label="Платный шантаж"
          hint="Заявление «Шантажиста» стоит золота — и при блефе тоже. Выключено — заявление бесплатно."
          value={blackmailPaid}
          onChange={setBlackmailPaid}
        />
        {blackmailPaid && (
          <Slider
            label="Цена шантажа"
            value={rules.blackmailCost}
            /* Ползунок начинается с единицы: ноль — это не цена, а выключенное
               правило, и распоряжается им тумблер выше. */
            min={1}
            max={RULE_LIMITS.blackmailCost[1]}
            onChange={num('blackmailCost')}
          />
        )}
      </Section>

      <Section title="Дуэль и вето">
        <Toggle
          label="Дуэль тратит жетон хода"
          hint="Выключено — щит на дуэли жетона не стоит."
          value={rules.duelCostsToken}
          onChange={flag('duelCostsToken')}
        />
        <Slider
          label="Стоимость дуэли"
          hint="Надбавка золотом за вызов. Платится сверх жетона, а без жетона — вместо него. 0 — надбавки нет."
          value={rules.duelCost}
          min={RULE_LIMITS.duelCost[0]}
          max={RULE_LIMITS.duelCost[1]}
          onChange={num('duelCost')}
        />
        <Toggle
          label="Вето на вето"
          hint="Встречное вето снимает предыдущее. Длина цепочки ничем не ограничена."
          value={rules.vetoOnVeto}
          onChange={flag('vetoOnVeto')}
        />
      </Section>

      {/* Один раздел на все правила вида «жетона нет — заплати золотом». Они
          читаются только друг против друга: что именно можно купить, почём и
          что чего не переживает. Разнесённые по трём разделам, они выглядели
          как три несвязанные настройки, хотя это один рычаг с четырьмя
          положениями. */}
      <Section title="Золото вместо жетона">
        <Toggle
          label="Платная проверка"
          hint="Любую проверку можно купить за золото, когда жетонов нет. Гасит «Срыв масок»."
          value={rules.paidDoubtEnabled}
          onChange={flag('paidDoubtEnabled')}
        />
        {rules.paidDoubtEnabled && (
          <Slider
            label="Цена платной проверки"
            value={rules.paidDoubtCost}
            min={RULE_LIMITS.paidDoubtCost[0]}
            max={RULE_LIMITS.paidDoubtCost[1]}
            onChange={num('paidDoubtCost')}
          />
        )}
        <Toggle
          label="Срыв масок"
          hint="То же, но только для жертвы атаки Вора или Шантажиста."
          value={rules.unmaskEnabled}
          disabled={rules.paidDoubtEnabled}
          onChange={flag('unmaskEnabled')}
        />
        {rules.unmaskEnabled && (
          <Slider
            label="Цена срыва масок"
            value={rules.unmaskCost}
            min={RULE_LIMITS.unmaskCost[0]}
            max={RULE_LIMITS.unmaskCost[1]}
            onChange={num('unmaskCost')}
          />
        )}
        {rules.paidDoubtEnabled && (
          <div className="rulenote">
            «Платная проверка» включает в себя «Срыв масок», поэтому второй тумблер погашен.
          </div>
        )}
        <Toggle
          label="Разыгрывать карты за монеты"
          hint="Кончились жетоны — карту можно доиграть за золото. Лимит «одна роль за ход» остаётся."
          value={rules.paidPlayEnabled}
          onChange={flag('paidPlayEnabled')}
        />
        {rules.paidPlayEnabled && (
          /* Цена своя, а не взятая у платной проверки: это разные ходы — свой
             против чужого, — и цениться они вправе по-разному. */
          <Slider
            label="Цена розыгрыша за монеты"
            value={rules.paidPlayCost}
            min={RULE_LIMITS.paidPlayCost[0]}
            max={RULE_LIMITS.paidPlayCost[1]}
            onChange={num('paidPlayCost')}
          />
        )}
        {/* Платная дуэль — это выкуп жетона золотом, поэтому ей нужен сосед,
            который жетон требует. Пока его нет, тумблер погашен и объясняет
            себя, а не прячется: спрятанная настройка выглядит как
            отсутствующая. */}
        <Toggle
          label="Платная дуэль"
          hint="Без жетона щит можно поднять за золото."
          value={rules.paidDuelEnabled}
          disabled={!duelCanBePaid}
          onChange={flag('paidDuelEnabled')}
        />
        {!duelCanBePaid && (
          <div className="rulenote">
            «Платная дуэль» выкупает жетон золотом, поэтому нужна настройка «Дуэль тратит
            жетон хода»: без неё выкупать нечего.
          </div>
        )}
        {rules.paidDuelEnabled && (
          /* Цена своя, а не взятая у платной проверки: щит и проверка — разные
             ходы, и заимствование заставляло включать платную проверку ради
             одной только дуэли. */
          <Slider
            label="Цена платной дуэли"
            value={rules.paidDuelCost}
            min={RULE_LIMITS.paidDuelCost[0]}
            max={RULE_LIMITS.paidDuelCost[1]}
            onChange={num('paidDuelCost')}
          />
        )}
        {rules.paidDuelEnabled && rules.duelCost > 0 && (
          <div className="rulenote">
            Вызов без жетона обойдётся в {rules.paidDuelCost + rules.duelCost} 🪙 — выкуп
            ({rules.paidDuelCost}) плюс надбавка за дуэль ({rules.duelCost}).
          </div>
        )}
      </Section>

      <section className="rulesec">
        <button
          type="button"
          className="rulesec__toggle"
          aria-expanded={deckOpen}
          onClick={() => setDeckOpen(v => !v)}
        >
          <span className="rulesec__title">Состав колоды</span>
          <Tag tone={problems.length > 0 ? 'danger' : 'gold'}>{size} карт</Tag>
          <span className="rulesec__chev">{deckOpen ? '−' : '+'}</span>
        </button>
        {deckOpen && (
          <div className="rulesec__body">
            {cardGroup('Роли', ALL_ROLES)}
            {cardGroup('Интриги', ALL_PLOTS)}
            {cardGroup('Инстанты', ALL_INSTANTS)}
          </div>
        )}
      </section>

      {problems.length > 0 && (
        <div className="ruleproblems">
          {problems.map(problem => (
            <div key={problem}>{problem}</div>
          ))}
        </div>
      )}

      <Button tone="plain" block onClick={() => onChange(DEFAULT_RULES)}>
        Сбросить к умолчаниям
      </Button>
    </div>
  );
}
