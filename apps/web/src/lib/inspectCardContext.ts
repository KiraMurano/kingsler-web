import { createContext } from 'react';
import type { InspectableItem } from '@kinglier/engine/data/cardDescriptions';

export const InspectCardContext = createContext<((item: InspectableItem) => void) | null>(null);
