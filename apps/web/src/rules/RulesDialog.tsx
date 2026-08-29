/**
 * Настройки партии в модалке.
 *
 * Раньше это был отдельный экран, и три десятка ползунков висели перед глазами
 * до самого старта. Модалка честнее: настройки — это шаг, а не место, где
 * живут. Меню остаётся под ней, и закрыть её можно, ничего не начав.
 *
 * Здесь же — загрузка сохранённых наборов. Сохраняют их из партии, когда
 * баланс уже опробован, а не вслепую до неё.
 */
import React, { useState } from 'react';
import { FolderOpen, Swords, Trash2 } from 'lucide-react';
import type { GameRules } from '@kinglier/engine/rules';
import { rulesProblems } from '@kinglier/engine/rules';
import { Dialog } from '../components/ui/Overlay';
import { Button } from '../components/ui/Button';
import { RulesEditor } from './RulesEditor';
import { deletePreset, listPresets, loadRules, saveRules, type RulesPreset } from './rulesStorage';

function PresetList({
  presets,
  onPick,
  onDelete
}: {
  presets: RulesPreset[];
  onPick: (preset: RulesPreset) => void;
  onDelete: (preset: RulesPreset) => void;
}) {
  if (presets.length === 0) {
    return (
      <div className="rulenote">
        Сохранённых наборов пока нет. Сохранить понравившийся баланс можно прямо из партии —
        кнопка «Правила» за столом.
      </div>
    );
  }

  return (
    <div className="presetlist">
      {presets.map(preset => (
        <div key={preset.id} className="presetrow">
          <button type="button" className="presetrow__pick" onClick={() => onPick(preset)}>
            <span className="presetrow__name">{preset.name}</span>
            <span className="presetrow__meta">
              {preset.rules.crownsToWin} 👑 · {preset.rules.actionTokens} ⚡ ·{' '}
              {new Date(preset.savedAt).toLocaleDateString('ru-RU')}
            </span>
          </button>
          <button
            type="button"
            className="presetrow__del"
            title={`Удалить «${preset.name}»`}
            aria-label={`Удалить «${preset.name}»`}
            onClick={() => onDelete(preset)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

interface RulesDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (rules: GameRules) => void;
}

export const RulesDialog: React.FC<RulesDialogProps> = ({ open, onClose, onStart }) => {
  const [rules, setRules] = useState<GameRules>(() => loadRules());
  const [presets, setPresets] = useState<RulesPreset[]>(() => listPresets());
  const [loadOpen, setLoadOpen] = useState(false);

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
          <Button
            tone="plain"
            block
            onClick={() => {
              // Список перечитывается на каждом открытии: набор мог быть
              // сохранён в другой вкладке.
              if (!loadOpen) setPresets(listPresets());
              setLoadOpen(v => !v);
            }}
          >
            <FolderOpen size={16} /> {loadOpen ? 'Скрыть наборы' : 'Загрузить настройки'}
          </Button>

          {loadOpen && (
            <PresetList
              presets={presets}
              onPick={preset => {
                update(preset.rules);
                setLoadOpen(false);
              }}
              onDelete={preset => {
                deletePreset(preset.id);
                setPresets(listPresets());
              }}
            />
          )}

          <Button tone="gold" size="lg" block disabled={blocked} onClick={() => onStart(rules)}>
            <Swords size={18} /> Начать игру
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
