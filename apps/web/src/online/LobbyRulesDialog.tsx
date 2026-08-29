/**
 * Настройки партии в лобби — модалкой, как и перед игрой с ботами.
 *
 * Раньше редактор стоял прямо в карточке комнаты, между списком мест и кнопкой
 * старта, и карточка отвечала сразу за две несвязанные вещи: кто сел за стол и
 * по каким числам играем. Настройки — это шаг в сторону, а не часть комнаты.
 *
 * Открыть их может только хост: он один их и задаёт, а остальным они не
 * показываются вовсе.
 *
 * Правила живут не здесь: их держит снимок лобби на сервере, а этот диалог
 * только показывает их и отправляет изменения. Своего состояния у него нет
 * намеренно — иначе у хоста и у сервера оказались бы две правды, и разошлись
 * бы они на первом же чужом подключении. Загруженный набор уходит туда же, что
 * и любое движение ползунка.
 */
import React from 'react';
import { Check } from 'lucide-react';
import type { GameRules } from '@kinglier/engine/rules';
import { Dialog } from '../components/ui/Overlay';
import { Button } from '../components/ui/Button';
import { RulesEditor } from '../rules/RulesEditor';
import { PresetPicker } from '../rules/PresetPicker';

export const LobbyRulesDialog: React.FC<{
  open: boolean;
  rules: GameRules;
  onChange: (rules: GameRules) => void;
  onClose: () => void;
}> = ({ open, rules, onChange, onClose }) => (
  <Dialog
    open={open}
    onClose={onClose}
    width={560}
    title="Настройки игры"
    description="Применятся к этой партии. Их задаёт хост — остальным за столом они не видны"
  >
    <div className="ruleswrap">
      <div className="ruleswrap__scroll">
        <RulesEditor rules={rules} onChange={onChange} />
      </div>

      <div className="ruleswrap__foot">
        {/* Тот же выбор наборов, что и перед игрой с ботами: сохранённый баланс
            нужен там же, где настройки вообще правят. */}
        <PresetPicker onPick={onChange} />

        {/* Кнопка закрывает, а не сохраняет: каждое движение ползунка уже
            ушло на сервер, и «сохранить» здесь обещало бы шаг, которого нет. */}
        <Button tone="gold" size="lg" block onClick={onClose}>
          <Check size={18} /> Готово
        </Button>
      </div>
    </div>
  </Dialog>
);
