export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}

export function Tabs<T extends string>({ items, active, onChange }: TabsProps<T>) {
  return (
    <div className="tabs">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className={`tab ${active === item.id ? 'tab--on' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && <span className="tab__count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
