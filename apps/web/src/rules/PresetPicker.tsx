/**
 * Загрузка сохранённых наборов правил.
 *
 * Один компонент на обе модалки — перед игрой с ботами и в лобби. Наборы
 * сохраняют из партии, когда баланс уже опробован, а грузят где угодно, где
 * настройки вообще правят; два списка в двух файлах разошлись бы на первой же
 * правке, и половина мест перестала бы видеть половину наборов.
 *
 * Список перечитывается на каждом раскрытии: набор мог быть сохранён в другой
 * вкладке или в прошлой партии этой же.
 */
import React, { useState } from 'react';
import { FolderOpen, Trash2 } from 'lucide-react';
import type { GameRules } from '@kinglier/engine/rules';
import { Button } from '../components/ui/Button';
import { deletePreset, listPresets, type RulesPreset } from './rulesStorage';

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

export const PresetPicker: React.FC<{ onPick: (rules: GameRules) => void }> = ({ onPick }) => {
  const [presets, setPresets] = useState<RulesPreset[]>(() => listPresets());
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        tone="plain"
        block
        onClick={() => {
          if (!open) setPresets(listPresets());
          setOpen(v => !v);
        }}
      >
        <FolderOpen size={16} /> {open ? 'Скрыть наборы' : 'Загрузить настройки'}
      </Button>

      {open && (
        <PresetList
          presets={presets}
          onPick={preset => {
            onPick(preset.rules);
            setOpen(false);
          }}
          onDelete={preset => {
            deletePreset(preset.id);
            setPresets(listPresets());
          }}
        />
      )}
    </>
  );
};
