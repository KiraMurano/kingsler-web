/**
 * Ввод кода из письма — шесть квадратиков.
 *
 * Внутри это ОДНО настоящее поле ввода, растянутое поверх квадратиков и
 * невидимое, а квадратики только рисуют его содержимое. Соблазн сделать шесть
 * отдельных `input` велик, но тогда вручную переизобретается всё то, что
 * браузер уже умеет: вставка кода из буфера, автозаполнение из письма
 * (`autocomplete="one-time-code"`), Backspace, стрелки, выделение, отмена
 * ввода, экранный диктор. Каждое из этих поведений в реализации «на шести
 * полях» приходится подпирать обработчиком, и каждый подпорке есть что
 * сломать — особенно вставка и автозаполнение, которые приходят одной строкой
 * сразу в первое поле.
 *
 * Поле именно прозрачное, а не `opacity: 0` и не спрятанное за экран: для
 * браузера оно должно остаться обычным видимым полем на своём месте, иначе
 * подсказка автозаполнения появляется не там или не появляется вовсе.
 *
 * Каретки у поля нет — вместо неё мигает та рамка, в которой сейчас стоит
 * курсор. Позиция берётся из `selectionStart`, поэтому подсветка не врёт и
 * при правке середины кода, а не только при наборе слева направо.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface CodeInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Зовётся, когда набрана последняя цифра. Обычно — отправить форму. */
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
  /** Код не подошёл: рамки краснеют. Текст ошибки — забота вызывающего. */
  invalid?: boolean;
  autoFocus?: boolean;
  label?: string;
}

export const CodeInput: React.FC<CodeInputProps> = ({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  invalid = false,
  autoFocus = false,
  label = 'Код из письма'
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);

  const syncCaret = useCallback(() => {
    const node = ref.current;
    if (node) setCaret(node.selectionStart ?? node.value.length);
  }, []);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    /* Чистим ввод, а не полагаемся на `type="number"`: тот пропускает `e`,
       плюс и минус, а вставленный из письма код нередко приходит с пробелом
       или дефисом посередине. */
    const next = event.target.value.replace(/\D/g, '').slice(0, length);
    onChange(next);
    syncCaret();
    if (next.length === length) onComplete?.(next);
  };

  /* Пустые места — это места, а не пустая строка: массив всегда длиной
     `length`, иначе квадратики схлопнутся по мере стирания. */
  const slots = Array.from({ length }, (_, i) => value[i] ?? '');
  const active = Math.min(caret, length - 1);

  return (
    <div
      className={[
        'codeinput',
        focused ? 'is-focused' : '',
        invalid ? 'is-invalid' : '',
        disabled ? 'is-disabled' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        ref={ref}
        className="codeinput__field"
        value={value}
        onChange={handleChange}
        onFocus={() => {
          setFocused(true);
          syncCaret();
        }}
        onBlur={() => setFocused(false)}
        /* Курсор двигают и клавиши, и мышь, и выделение — слушаем всё, иначе
           подсветка отстаёт от каретки на одно действие. */
        onSelect={syncCaret}
        onKeyUp={syncCaret}
        onPointerUp={syncCaret}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        /* Подсказка мобильной клавиатуре: цифры и только цифры. */
        pattern="\d*"
        maxLength={length}
        aria-label={`${label}, ${length} цифр`}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        autoCorrect="off"
      />

      {/* Рисованная часть. Для диктора её нет: он читает поле выше. */}
      <div className="codeinput__slots" aria-hidden="true">
        {slots.map((digit, index) => (
          <div
            key={index}
            className={[
              'codeinput__slot',
              digit ? 'is-filled' : '',
              focused && index === active ? 'is-active' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {digit || <span className="codeinput__placeholder" />}
            {focused && index === active && !digit && <span className="codeinput__caret" />}
          </div>
        ))}
      </div>
    </div>
  );
};
