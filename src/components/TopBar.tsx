import React from 'react';
import { BookOpen, Scale, RotateCcw, ScrollText } from 'lucide-react';

interface TopBarProps {
  statusText: string;
  statusTone: 'idle' | 'mine' | 'alarm';
  hint?: string;
  onOpenCodex: () => void;
  onOpenChronicle: () => void;
  onOpenRules: () => void;
  onRestart: () => void;
  codexOpen: boolean;
  chronicleOpen: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  statusText,
  statusTone,
  hint,
  onOpenCodex,
  onOpenChronicle,
  onOpenRules,
  onRestart,
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
      <div
        className={`turnchip ${
          statusTone === 'mine' ? 'turnchip--mine' : statusTone === 'alarm' ? 'turnchip--alarm' : ''
        }`}
      >
        <span className="turnchip__dot" />
        <span>{statusText}</span>
        {hint && (
          <>
            <span className="turnchip__sep" />
            <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{hint}</span>
          </>
        )}
      </div>
    </div>

    <div className="brand">
      <div className="brand__title">
        <span className="brand__rule" />
        <span className="gilded">КИНГСЛЕР</span>
        <span className="brand__rule brand__rule--r" />
      </div>
      <div className="brand__sub">Битва за престол</div>
    </div>

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
      <button type="button" className="iconbtn" onClick={onRestart} title="Начать новую партию">
        <RotateCcw size={15} />
        Заново
      </button>
    </div>
  </header>
);
