import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAnomalyJournal, useAssetList, usePreventiveTasks } from '@/engine/store';
import { PredictiveContext, type PredictiveContextValue } from '@/components/predictive/context';
import { PredictiveHub } from '@/components/predictive/PredictiveHub';
import { type WorkspaceId } from '@/components/predictive/navigation';
import { assetRows, componentRows, predictiveSignals } from '@/components/predictive/shared/selectors';
import { usePredictiveAlerts } from '@/components/predictive/shared/usePredictiveAlerts';
import { RulWorkspace } from '@/components/predictive/workspaces/RulWorkspace';
import { FailureProbabilityWorkspace } from '@/components/predictive/workspaces/FailureProbabilityWorkspace';
import { ComponentHealthWorkspace } from '@/components/predictive/workspaces/ComponentHealthWorkspace';
import { PreventiveWorkspace } from '@/components/predictive/workspaces/PreventiveWorkspace';
import { PrescriptiveWorkspace } from '@/components/predictive/workspaces/PrescriptiveWorkspace';
import { QueueWorkspace } from '@/components/predictive/workspaces/QueueWorkspace';
import { AnalyticsWorkspace } from '@/components/predictive/workspaces/AnalyticsWorkspace';
import { ReportsWorkspace } from '@/components/predictive/workspaces/ReportsWorkspace';

/* ───────────────────────────────────────────────────────────────────────────
 * Predictive Maintenance.
 *
 * The module has exactly two states: the launcher hub, and one isolated
 * workspace. There is no tab strip and no accordion — entering a workspace
 * replaces the screen, and the breadcrumb is the only way back, so a single
 * context is on screen at any moment.
 *
 * View state is held here rather than in the router, so the module's internal
 * navigation costs no route and the platform's routing configuration is
 * untouched.
 *
 * The page subscribes to the platform store once and shares the derived view
 * models through context. Every figure in every workspace is published by the
 * FastAPI prediction service; this layer selects, groups and renders, and
 * computes no domain value of its own.
 * ─────────────────────────────────────────────────────────────────────────── */

export const PredictiveMaintenancePage = () => {
  const [workspace, setWorkspace] = useState<WorkspaceId | null>(null);

  const assets = useAssetList();
  const journal = useAnomalyJournal();
  const tasks = usePreventiveTasks();

  const rows = useMemo(() => assetRows(assets), [assets]);
  const components = useMemo(() => componentRows(assets), [assets]);
  const signals = useMemo(() => predictiveSignals(journal, assets), [journal, assets]);

  // Live notification when a signal that will move a prediction arrives. The
  // surfaces themselves need no refresh — they re-render when the store
  // publishes a new snapshot.
  usePredictiveAlerts(signals);

  const open = useCallback((id: WorkspaceId) => setWorkspace(id), []);
  const close = useCallback(() => setWorkspace(null), []);

  const context = useMemo<PredictiveContextValue>(
    () => ({ assets, rows, components, tasks, signals, open, close }),
    [assets, rows, components, tasks, signals, open, close],
  );

  return (
    <PredictiveContext.Provider value={context}>
      <AnimatePresence mode="wait">
        {workspace === null ? <PredictiveHub key="hub" /> : null}
        {workspace === 'rul' ? <RulWorkspace key="rul" onBack={close} /> : null}
        {workspace === 'probability' ? <FailureProbabilityWorkspace key="probability" onBack={close} /> : null}
        {workspace === 'components' ? <ComponentHealthWorkspace key="components" onBack={close} /> : null}
        {workspace === 'preventive' ? <PreventiveWorkspace key="preventive" onBack={close} /> : null}
        {workspace === 'prescriptive' ? <PrescriptiveWorkspace key="prescriptive" onBack={close} /> : null}
        {workspace === 'queue' ? <QueueWorkspace key="queue" onBack={close} onOpen={open} /> : null}
        {workspace === 'analytics' ? <AnalyticsWorkspace key="analytics" onBack={close} /> : null}
        {workspace === 'reports' ? <ReportsWorkspace key="reports" onBack={close} /> : null}
      </AnimatePresence>
    </PredictiveContext.Provider>
  );
};
