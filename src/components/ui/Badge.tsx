import React from 'react';

export type BadgeVariant = 
  | 'default'
  | 'gold'
  | 'emerald'
  | 'ruby'
  | 'sapphire'
  | 'purple'
  | 'amber'
  | 'outline'
  | 'secondary'
  | 'destructive'
  | 'ghost';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  pulse = false,
  className = '',
  style,
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'gold':
        return {
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.35) 100%)',
          border: '1px solid rgba(245, 158, 11, 0.6)',
          color: '#fef08a',
          boxShadow: '0 0 10px rgba(245, 158, 11, 0.2)'
        };
      case 'emerald':
        return {
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(21, 128, 61, 0.3) 100%)',
          border: '1px solid rgba(74, 222, 128, 0.5)',
          color: '#bbf7d0',
          boxShadow: '0 0 10px rgba(34, 197, 94, 0.2)'
        };
      case 'ruby':
      case 'destructive':
        return {
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.3) 100%)',
          border: '1px solid rgba(248, 113, 113, 0.5)',
          color: '#fecaca',
          boxShadow: '0 0 10px rgba(239, 68, 68, 0.2)'
        };
      case 'sapphire':
        return {
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(29, 78, 216, 0.3) 100%)',
          border: '1px solid rgba(96, 165, 250, 0.5)',
          color: '#bfdbfe',
          boxShadow: '0 0 10px rgba(59, 130, 246, 0.2)'
        };
      case 'purple':
        return {
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(126, 34, 206, 0.3) 100%)',
          border: '1px solid rgba(192, 132, 252, 0.5)',
          color: '#e9d5ff',
          boxShadow: '0 0 10px rgba(168, 85, 247, 0.2)'
        };
      case 'amber':
        return {
          background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.2) 0%, rgba(180, 83, 9, 0.3) 100%)',
          border: '1px solid rgba(251, 191, 36, 0.5)',
          color: '#fde68a'
        };
      case 'outline':
        return {
          background: 'transparent',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: '#cbd5e1'
        };
      case 'secondary':
        return {
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#e2e8f0'
        };
      case 'ghost':
        return {
          background: 'transparent',
          border: '1px solid transparent',
          color: '#94a3b8'
        };
      case 'default':
      default:
        return {
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#f8fafc'
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return {
          fontSize: '0.78rem',
          padding: '2px 8px',
          borderRadius: '9999px',
          gap: '4px'
        };
      case 'lg':
        return {
          fontSize: '1.02rem',
          padding: '6px 14px',
          borderRadius: '9999px',
          gap: '8px'
        };
      case 'md':
      default:
        return {
          fontSize: '0.88rem',
          padding: '3px 10px',
          borderRadius: '9999px',
          gap: '5px'
        };
    }
  };

  return (
    <span
      className={`shadcn-badge ${pulse ? 'badge-pulse' : ''} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        letterSpacing: '0.3px',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style
      }}
      {...props}
    >
      {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
      {children}
    </span>
  );
};
