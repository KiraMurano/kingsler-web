import type { Role, PlotType, InstantType } from '../engine/types';

/** An action that has been chosen but still needs a victim picked at the table. */
export interface PendingTargetAction {
  type: 'normal' | 'role' | 'plot' | 'instant';
  name: string;
  cost: number;
  description?: string;
  roleClaim?: Role;
  plotType?: PlotType;
  instantType?: InstantType;
  isPlotDirect?: boolean;
  isInstantDirect?: boolean;
  stakedCardIndex?: number;
  withVaBanque?: boolean;
}

/** Opens the table-wide target picker. Set once by App on mount. */
export function startTargeting(action: PendingTargetAction) {
  (window as unknown as { __startTargeting?: (a: PendingTargetAction) => void }).__startTargeting?.(
    action
  );
}
