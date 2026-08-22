import React from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
  badgeVariant?: 'gold' | 'emerald' | 'ruby' | 'sapphire' | 'purple' | 'amber';
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Tabs<T extends string = string>({
  items,
  activeTab,
  onChange,
  className = '',
  size = 'md'
}: TabsProps<T>) {
  return (
    <div
      className={`shadcn-tabs ${className}`}
      style={{
        display: 'flex',
        background: 'rgba(10, 15, 29, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '10px',
        padding: '3px',
        gap: '3px',
        userSelect: 'none'
      }}
    >
      {items.map(item => {
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: size === 'sm' ? '6px 10px' : '8px 14px',
              fontSize: size === 'sm' ? '0.84rem' : '0.92rem',
              fontWeight: isActive ? 800 : 600,
              color: isActive ? '#fef08a' : '#94a3b8',
              background: isActive 
                ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.25) 0%, rgba(180, 83, 9, 0.35) 100%)' 
                : 'transparent',
              border: isActive ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid transparent',
              borderRadius: '7px',
              cursor: 'pointer',
              transition: 'all 0.16s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)' : 'none'
            }}
          >
            {item.icon && <span style={{ display: 'inline-flex' }}>{item.icon}</span>}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: isActive ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#fff' : '#cbd5e1',
                  border: isActive ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                {item.count}
              </span>
            )}

          </button>
        );
      })}
    </div>
  );
}
