import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * Куда портировать оверлей — или `null`, если портировать некуда.
 *
 * `null` бывает не только в теории: проверки в `*.check.ts` рендерят диалоги
 * в строку под Node, где `document` не существует вовсе. Там оверлей рисуется
 * на своём месте в дереве — разметка та же, а портал в разметке и не виден.
 */
function portalTarget(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.body;
}

/** Портал, если есть куда, иначе узел как есть. */
function portal(node: React.ReactElement): React.ReactElement {
  const target = portalTarget();
  return target ? createPortal(node, target) : node;
}

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

  /*
   * Порталом в `body`, а не на своём месте в дереве.
   *
   * У `.scrim` есть `backdrop-filter`, а он в Chromium размывает не «всё, что
   * позади», а содержимое ближайшего предка, который завёл свой слой —
   * `filter`, `opacity` меньше единицы, `will-change`, `transform`. Стол ими
   * усыпан (места, карты, слой карт), и оверлей, живущий внутри стола, мог
   * получить в подложку пустоту: размытие как бы есть, а размывать нечего.
   * Из `body` подложка — вся страница, и от чужих слоёв это больше не зависит.
   *
   * Заодно уходит вторая зависимость того же рода: `position: fixed` внутри
   * трансформированного предка считается от него, а не от окна.
   */
  return portal(
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

  /* Порталом по той же причине, что и `Sheet` выше. */
  return portal(
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
