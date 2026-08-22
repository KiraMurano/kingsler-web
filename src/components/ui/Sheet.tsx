import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: 'left' | 'right';
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
  className?: string;
}

export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  side = 'right',
  title,
  description,
  children,
  width = '380px',
  className = ''
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isLeft = side === 'left';

  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 900,
        display: 'flex',
        justifyContent: isLeft ? 'flex-start' : 'flex-end',
        animation: 'dialog-fade-in 0.2s ease-out'
      }}
    >
      <div
        className={`sheet-content ${className}`}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: width,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.97) 0%, rgba(10, 15, 29, 0.99) 100%)',
          borderLeft: !isLeft ? '1.5px solid rgba(245, 158, 11, 0.35)' : 'none',
          borderRight: isLeft ? '1.5px solid rgba(245, 158, 11, 0.35)' : 'none',
          boxShadow: isLeft ? '10px 0 40px rgba(0,0,0,0.85)' : '-10px 0 40px rgba(0,0,0,0.85)',
          animation: isLeft ? 'sheet-slide-left 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'sheet-slide-right 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 18px 14px 18px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: 'rgba(0, 0, 0, 0.2)'
          }}
        >
          <div>
            {title && (
              <div
                className="cinzel-font"
                style={{
                  fontSize: '1.22rem',
                  fontWeight: 800,
                  color: '#fef08a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {title}
              </div>
            )}
            {description && (
              <div
                style={{
                  fontSize: '0.88rem',
                  color: '#94a3b8',
                  marginTop: '4px'
                }}
              >
                {description}
              </div>
            )}

          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
              e.currentTarget.style.borderColor = '#ef4444';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div
          style={{
            padding: '14px 16px',
            overflowY: 'auto',
            flex: 1
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
