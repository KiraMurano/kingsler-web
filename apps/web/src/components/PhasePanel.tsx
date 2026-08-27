/**
 * Правая колонка: что происходит прямо сейчас. Ни одной кнопки.
 *
 * Всё содержимое — из `TableView`, поэтому колонка не может разойтись с
 * панелью над картами: они читают одно значение. `AnimatePresence` ключуется
 * на `view.phase`, а не на `view.id`, — смена фазы это смена вида, а смена,
 * скажем, состава ожидающих должна анимироваться внутри вида, а не
 * пересоздавать его.
 *
 * `mode="wait"`, а не `popLayout`. `popLayout` кладёт уходящий вид в
 * `position: absolute` и печатает его поверх приходящего: два разных текста
 * накладываются друг на друга на всё время кроссфейда, и это читается как
 * грязь, а не как переход. Замер на живой партии показал до семи таких слоёв
 * одновременно. `wait` даёт уходящему уйти целиком, и только потом приводит
 * следующий; высоту ведёт `layout` на рамке, поэтому рывка всё равно нет.
 */
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CARD_DESCRIPTIONS } from '@kinglier/engine/data/cardDescriptions';
import { dur } from '../motion/tokens.ts';
import { renderWithIcons, UiIcon } from './ui/Icon';
import { Portrait } from './Portrait';
import type { PhaseKind, TableView } from '../lib/tableView.ts';

const EASE = [0.4, 0, 0.2, 1] as const;
const SLIDE = 8;

/** Фазы, в которых колонка горит тревожным цветом. */
const ALERT: PhaseKind[] = [
  'doubt',
  'reveal',
  'under-attack',
  'duel-answer',
  'veto',
  'coronation'
];

export const PhasePanel: React.FC<{ view: TableView }> = ({ view }) => {
  const reduce = !!useReducedMotion();
  const fade = reduce ? 0.12 : dur.panel;
  const travel = reduce ? 0 : SLIDE;
  const alert = ALERT.includes(view.phase);
  const info = view.claim ? CARD_DESCRIPTIONS[view.claim.card] : null;

  return (
    <motion.aside
      className={`phase ${alert ? 'phase--alert' : ''}`}
      /* Рамка переживает любую смену вида, поэтому её высоту можно
         интерполировать, а не переключать скачком. */
      layout={reduce ? false : 'size'}
      transition={{ layout: { duration: fade, ease: EASE } }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view.phase}
          className="phase__view"
          initial={{ opacity: 0, y: -travel }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: travel }}
          transition={{ duration: fade, ease: EASE }}
        >
          <div className="phase__title">{view.title}</div>

          {view.actor && (
            <div className="phase__actor">
              <Portrait
                src={view.actor.avatar ?? ''}
                name={view.actor.name}
                className="phase__portrait"
              />
              <span className="phase__actorname">{view.actor.name}</span>
            </div>
          )}

          {view.claim && info && (
            <div className="phase__claim">
              <div className={`phase__art cardframe cardframe--${info.category}`}>
                <img src={info.artImage} alt={info.name} />
              </div>
              <div className="phase__claimbody">
                <div className="phase__claimname">{info.name}</div>
                <div className="phase__claimrule">{renderWithIcons(view.claim.rule)}</div>
              </div>
            </div>
          )}

          {view.awaiting.length > 0 && (
            <div className="phase__awaiting">
              <span className="eyebrow">Ждут ответа</span>
              <div className="phase__faces">
                {view.awaiting.map(p => (
                  <Portrait
                    key={p.id}
                    src={p.avatar ?? ''}
                    name={p.name}
                    className="phase__face"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="phase__spent">
            <span className="phase__tokens" title="Жетоны действия">
              {[0, 1].map(i => (
                <span key={i} className={view.tokens > i ? 'bolt' : 'bolt bolt--off'}>
                  <UiIcon kind="move" size="sm" />
                </span>
              ))}
            </span>
            <span className={`phase__spent-i ${view.spent.court ? 'is-spent' : ''}`}>двор</span>
            <span className={`phase__spent-i ${view.spent.plot ? 'is-spent' : ''}`}>интрига</span>
            <span className={`phase__spent-i ${view.spent.role ? 'is-spent' : ''}`}>роль</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
};
