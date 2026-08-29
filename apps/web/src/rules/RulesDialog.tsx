/**
 * Настройки партии в модалке.
 *
 * Раньше это был отдельный экран, и три десятка ползунков висели перед глазами
 * до самого старта. Модалка честнее: настройки — это шаг, а не место, где
 * живут. Меню остаётся под ней, и закрыть её можно, ничего не начав.
 *
 * Здесь же — загрузка сохранённых наборов, тем же `PresetPicker`, что и в
 * лобби. Сохраняют их из партии, когда баланс уже опробован, а не вслепую до
 * неё.
 */
import React, { useState } from 'react';
import { Swords } from 'lucide-react';
import type { GameRules } from '@kinglier/engine/rules';
import { rulesProblems } from '@kinglier/engine/rules';
import { Dialog } from '../components/ui/Overlay';
import { Button } from '../components/ui/Button';
import { RulesEditor } from './RulesEditor';
import { PresetPicker } from './PresetPicker';
import { loadRules, saveRules } from './rulesStorage';

interface RulesDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (rules: GameRules) => void;
}

export const RulesDialog: React.FC<RulesDialogProps> = ({ open, onClose, onStart }) => {
  const [rules, setRules] = useState<GameRules>(() => loadRules());

  const blocked = rulesProblems(rules).length > 0;

  const update = (next: GameRules) => {
    setRules(next);
    saveRules(next);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={560}
      title="Правила партии"
      description="Настройки применятся к этой партии и запомнятся до следующей"
    >
      <div className="ruleswrap">
        <div className="ruleswrap__scroll">
          <RulesEditor rules={rules} onChange={update} />
        </div>

        <div className="ruleswrap__foot">
          <PresetPicker onPick={update} />

          <Button tone="gold" size="lg" block disabled={blocked} onClick={() => onStart(rules)}>
            <Swords size={18} /> Начать игру
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
