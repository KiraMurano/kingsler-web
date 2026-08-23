import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface OverlayHeadProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
}

const OverlayHead: React.FC<OverlayHeadProps> = ({ title, description, onClose }) => (
  <div className="overlay__head">
    <div>
      {title && <div className="overlay__title">{title}</div>}
      {description && <div className="overlay__desc">{description}</div>}
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
  side?: 'left' | 'right';
  width?: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
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
        <OverlayHead title={title} description={description} onClose={onClose} />
        {children}
      </div>
    </div>
  );
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  width?: number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
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
        onClick={e => e.stopPropagation()}
      >
        <OverlayHead title={title} description={description} onClose={onClose} />
        <div className="overlay__body">{children}</div>
      </div>
    </div>
  );
};
