import { createContext, useContext } from 'react';
import type { AnomalyRecord, AssetRuntime, PreventiveTask } from '@/engine/types';
import type { WorkspaceId } from './navigation';
import type { AssetPredictionRow, ComponentRow } from './shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Module context.
 *
 * The page subscribes to the platform store once and shares the derived view
 * models with the hub and with whichever workspace is open. Without this, each
 * of the nine surfaces would re-select the same records from the same snapshot
 * and a figure could differ between the launcher card and the workspace behind
 * it for no reason other than where it was computed.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface PredictiveContextValue {
  assets: AssetRuntime[];
  /** One row per device, carrying the weakest component the backend named. */
  rows: AssetPredictionRow[];
  /** Every serviceable part across the estate, soonest end of life first. */
  components: ComponentRow[];
  /** The full maintenance schedule. */
  tasks: PreventiveTask[];
  /** Anomalies attributed to a serviceable part — the signals that move wear. */
  signals: AnomalyRecord[];
  open: (id: WorkspaceId) => void;
  close: () => void;
}

export const PredictiveContext = createContext<PredictiveContextValue | null>(null);

export const usePredictive = (): PredictiveContextValue => {
  const value = useContext(PredictiveContext);
  if (value === null) {
    throw new Error('usePredictive must be used inside the Predictive Maintenance module');
  }
  return value;
};
