import React from 'react';

export type ButtonVariant = 
  | 'default'
  | 'gold'
  | 'blue'
  | 'red'
  | 'green'
  | 'purple'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'glass';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  hotkey?: string;
  subtext?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'default',
  size = 'md',
  hotkey,
  subtext,
  icon,
  loading = false,
  disabled,
  className = '',
  style,
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'gold':
        return {
          background: 'linear-gradient(180deg, rgba(217, 119, 6, 0.9) 0%, rgba(180, 83, 9, 0.95) 100%)',
          borderColor: 'rgba(251, 191, 36, 0.6)',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        };
      case 'blue':
        return {
          background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.9) 0%, rgba(29, 78, 216, 0.95) 100%)',
          borderColor: 'rgba(96, 165, 250, 0.5)',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        };
      case 'red':
        return {
          background: 'linear-gradient(180deg, rgba(220, 38, 38, 0.9) 0%, rgba(185, 28, 28, 0.95) 100%)',
          borderColor: 'rgba(248, 113, 113, 0.5)',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        };
      case 'green':
        return {
          background: 'linear-gradient(180deg, rgba(22, 163, 74, 0.9) 0%, rgba(21, 128, 61, 0.95) 100%)',
          borderColor: 'rgba(74, 222, 128, 0.5)',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        };
      case 'purple':
        return {
          background: 'linear-gradient(180deg, rgba(147, 51, 234, 0.9) 0%, rgba(126, 34, 206, 0.95) 100%)',
          borderColor: 'rgba(192, 132, 252, 0.5)',
          color: '#ffffff',
          boxShadow: '0 4px 14px rgba(147, 51, 234, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        };
      case 'glass':
        return {
          background: 'rgba(15, 23, 42, 0.75)',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          color: '#f8fafc',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
        };
      case 'secondary':
        return {
          background: 'rgba(255, 255, 255, 0.08)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          color: '#f1f5f9'
        };
      case 'outline':
        return {
          background: 'transparent',
          borderColor: 'rgba(245, 158, 11, 0.4)',
          color: '#fbbf24'
        };
      case 'ghost':
        return {
          background: 'transparent',
          borderColor: 'transparent',
          color: '#cbd5e1',
          boxShadow: 'none'
        };
      case 'default':
      default:
        return {
          background: 'rgba(30, 41, 59, 0.9)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          color: '#f8fafc',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)'
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return {
          padding: '6px 12px',
          fontSize: '0.86rem',
          borderRadius: '8px',
          gap: '6px'
        };
      case 'lg':
        return {
          padding: '14px 22px',
          fontSize: '1.08rem',
          borderRadius: '12px',
          gap: '8px'
        };
      case 'icon':
        return {
          width: '38px',
          height: '38px',
          padding: '0',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        };
      case 'md':
      default:
        return {
          padding: '9px 16px',
          fontSize: '0.94rem',
          borderRadius: '10px',
          gap: '6px'
        };
    }
  };

  return (
    <button
      className={`shadcn-btn ${className}`}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        flexDirection: subtext ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        letterSpacing: '0.3px',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
        borderWidth: '1px',
        borderStyle: 'solid',
        userSelect: 'none',
        position: 'relative',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style
      }}
      {...props}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
        <span>{children}</span>
        {hotkey && (
          <span 
            style={{ 
              fontSize: '0.72rem', 
              background: 'rgba(0, 0, 0, 0.45)', 
              border: '1px solid rgba(255, 255, 255, 0.18)', 
              borderRadius: '4px', 
              padding: '1px 6px',
              color: '#fef08a',
              fontWeight: 800,
              marginLeft: '4px'
            }}
          >
            {hotkey}
          </span>
        )}
      </div>

      {subtext && (
        <span 
          style={{ 
            fontSize: '0.76rem', 
            fontWeight: 500, 
            opacity: 0.85, 
            marginTop: '3px',
            lineHeight: 1.2
          }}
        >
          {subtext}
        </span>
      )}
    </button>
  );
};
