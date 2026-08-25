import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption<T extends string = string> {
  value: T;
  label?: ReactNode;
}

interface SelectProps<T extends string> {
  value: T;
  options: readonly T[] | readonly SelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  className?: string;
  placeholder?: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  className = '',
  placeholder
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedMenuHeight = Math.min(options.length * 40 + 16, 240);
    const openUpwards = spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      transform: openUpwards ? 'translateY(-100%)' : 'none',
      zIndex: 1100
    });
  };

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const normalizedOptions: SelectOption<T>[] = options.map(opt =>
    typeof opt === 'string' ? { value: opt as T, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find(opt => opt.value === value);

  return (
    <div className={`custom-select ${open ? 'custom-select--open' : ''} ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="custom-select__trigger"
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="custom-select__value">
          {selectedOption ? selectedOption.label ?? selectedOption.value : placeholder ?? 'Выберите значение'}
        </span>
        <ChevronDown size={16} className="custom-select__arrow" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div ref={menuRef} style={menuStyle} className="custom-select__menu" role="listbox">
            {normalizedOptions.map(option => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`custom-select__option ${isSelected ? 'custom-select__option--selected' : ''}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label ?? option.value}</span>
                  {isSelected && <Check size={14} className="custom-select__check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
