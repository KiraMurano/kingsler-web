/**
 * Сохранение понравившегося баланса из партии.
 *
 * Открывается из свода правил за столом — то есть тогда, когда настройки уже
 * опробованы в бою. Сохранять их вслепую до партии смысла нет: ровно поэтому
 * кнопка «Сохранить» живёт здесь, а «Загрузить» — в настройках перед стартом.
 */
import React, { useState } from 'react';
import { Check, Save } from 'lucide-react';
import type { GameRules } from '@kinglier/engine/rules';
import { Dialog } from '../components/ui/Overlay';
import { Button } from '../components/ui/Button';
import { listPresets, savePreset } from './rulesStorage';

interface SavePresetDialogProps {
  open: boolean;
  rules: GameRules;
  onClose: () => void;
}

export const SavePresetDialog: React.FC<SavePresetDialogProps> = ({ open, rules, onClose }) => {
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const trimmed = name.trim();
  /* Предупреждение вместо запрета: перезаписать свой же набор — обычное дело,
     а вот сделать это не заметив — неприятно. */
  const overwrites = listPresets().some(p => p.name.toLowerCase() === trimmed.toLowerCase());

  const submit = () => {
    if (!trimmed) return;
    const preset = savePreset(trimmed, rules);
    if (preset) setSaved(preset.name);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={440}
      title="Сохранить настройки"
      description="Набор появится в списке «Загрузить настройки» перед следующей партией"
    >
      {saved ? (
        <div className="savepreset">
          <div className="savepreset__done">
            <Check size={16} /> Набор «{saved}» сохранён
          </div>
          <Button tone="gold" size="lg" block onClick={onClose}>
            Готово
          </Button>
        </div>
      ) : (
        <div className="savepreset">
          <label className="savepreset__label" htmlFor="preset-name">
            Название набора
          </label>
          <input
            id="preset-name"
            className="field"
            value={name}
            maxLength={40}
            autoFocus
            placeholder="Например: Быстрая партия"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit();
            }}
          />
          <div className="savepreset__summary">
            {rules.crownsToWin} 👑 для победы · {rules.actionTokens} ⚡ жетонов · пир{' '}
            {rules.feastCost} 🪙 · слух {rules.rumorCost} 🪙
          </div>
          {overwrites && (
            <div className="rulenote">Набор с таким именем уже есть — он будет перезаписан.</div>
          )}
          <Button tone="gold" size="lg" block disabled={!trimmed} onClick={submit}>
            <Save size={16} /> Сохранить
          </Button>
        </div>
      )}
    </Dialog>
  );
};
