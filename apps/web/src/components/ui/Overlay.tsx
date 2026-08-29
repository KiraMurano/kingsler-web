import React, { useEffect } from 'react';
import { X, ArrowLeft } from 'lucide-react';

interface OverlayHeadProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  onBack?: () => void;
}

const OverlayHead: React.FC<OverlayHeadProps> = ({ title, description, onClose, onBack }) => (
  <div className="overlay__head">
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
      {onBack && (
        <button
          type="button"
          className="overlay__back"
          onClick={onBack}
          title="Назад"
        >
          <ArrowLeft size={16} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div className="overlay__title" role="heading" aria-level={2}>{title}</div>}
        {description && <div className="overlay__desc">{description}</div>}
      </div>
    </div>
    <button type="button" className="overlay__close" onClick={onClose} title="Закрыть (Esc)">
      <X size={15} />
    </button>
  </div>
);

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  side?: 'left' | 'right';
  width?: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  onBack,
  side = 'right',
  width = 420,
  title,
  description,
  children
}) => {
  useEscape(open, onClose);
  if (!open) return null;

  return (
    <div className={`scrim sheet sheet--${side}`} onClick={onClose}>
      <div
        className="sheet__panel"
        style={{ maxWidth: width }}
        onClick={e => e.stopPropagation()}
      >
        <OverlayHead title={title} description={description} onClose={onClose} onBack={onBack} />
        {children}
      </div>
    </div>
  );
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  width?: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  onBack,
  width = 560,
  title,
  description,
  className,
  children
}) => {
  useEscape(open, onClose);
  if (!open) return null;

  return (
    <div className="scrim dialog" onClick={onClose}>
      <div
        className={['dialog__panel', className].filter(Boolean).join(' ')}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <OverlayHead title={title} description={description} onClose={onClose} onBack={onBack} />
        <div className="overlay__body">{children}</div>
      </div>
    </div>
  );
};
