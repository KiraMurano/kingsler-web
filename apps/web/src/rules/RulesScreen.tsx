/**
 * Экран правил перед партией с ботами.
 *
 * Отдельный шаг, а не диалог поверх меню: правил три десятка, и их читают
 * сверху вниз перед стартом, а не подкручивают мимоходом. Кнопка старта здесь
 * же — иначе непонятно, применились настройки или нет.
 */
import { useState } from 'react';
import { ArrowLeft, Swords } from 'lucide-react';
import type { GameRules } from '@kinglier/engine/rules';
import { rulesProblems } from '@kinglier/engine/rules';
import { Button } from '../components/ui/Button';
import { RulesEditor } from './RulesEditor';
import { loadRules, saveRules } from './rulesStorage';
import '../styles/screen.css';
import '../styles/rules.css';

export function RulesScreen({
  onStart,
  onBack
}: {
  onStart: (rules: GameRules) => void;
  onBack: () => void;
}) {
  const [rules, setRules] = useState<GameRules>(() => loadRules());
  const blocked = rulesProblems(rules).length > 0;

  const update = (next: GameRules) => {
    setRules(next);
    saveRules(next);
  };

  return (
    <div className="screen">
      <button type="button" className="iconbtn screen__back" onClick={onBack}>
        <ArrowLeft size={15} /> Назад
      </button>
      <div className="screen__panel">
        <div className="brand brand--hero">
          <div className="brand__title">
            <span className="brand__rule" />
            <span className="gilded">КИНГСЛЕР</span>
            <span className="brand__rule brand__rule--r" />
          </div>
          <div className="brand__sub">Правила партии</div>
        </div>

        <div className="dialog__panel lobbycard">
          <RulesEditor rules={rules} onChange={update} />

          <Button
            tone="gold"
            size="lg"
            block
            disabled={blocked}
            onClick={() => onStart(rules)}
          >
            <Swords size={18} /> Начать партию
          </Button>
        </div>
      </div>
    </div>
  );
}
