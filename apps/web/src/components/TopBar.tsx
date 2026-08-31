import React from 'react';
import { BookOpen, Scale, LogOut, ScrollText } from 'lucide-react';
import { Brand } from './Brand';

interface TopBarProps {
  onOpenCodex: () => void;
  onOpenChronicle: () => void;
  onOpenRules: () => void;
  onExit: () => void;
  codexOpen: boolean;
  chronicleOpen: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenCodex,
  onOpenChronicle,
  onOpenRules,
  onExit,
  codexOpen,
  chronicleOpen
}) => (
  <header className="topbar">
    <div className="topbar__side">
      <button
        type="button"
        className={`iconbtn ${chronicleOpen ? 'iconbtn--on' : ''}`}
        onClick={onOpenChronicle}
        title="Летопись двора"
      >
        <ScrollText size={15} />
        Летопись
      </button>
    </div>

    <Brand size="bar" />

    <div className="topbar__side topbar__side--end">
      <button
        type="button"
        className={`iconbtn ${codexOpen ? 'iconbtn--on' : ''}`}
        onClick={onOpenCodex}
        title="Кодекс карт"
      >
        <BookOpen size={15} />
        Кодекс
      </button>
      <button type="button" className="iconbtn" onClick={onOpenRules} title="Свод правил">
        <Scale size={15} />
        Правила
      </button>
      <button type="button" className="iconbtn" onClick={onExit} title="Выйти в меню">
        <LogOut size={15} />
        Выйти
      </button>
    </div>
  </header>
);
