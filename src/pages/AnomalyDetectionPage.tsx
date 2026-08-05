import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar, ShieldAlert, ShieldCheck, X, FileText } from 'lucide-react';
import { MODULE_TITLES } from '@/config/navigation';
import { env } from '@/config/env';
import { useAnomalyJournal, useSnapshot } from '@/engine/store';
import { formatNumber } from '@/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { GrafanaPanel } from '@/components/grafana';
import {
  MetaStat,
  PageHeader,
} from '@/components/common';
import {
  DetectionQualityGrid,
  FailureClassification,
  StreamNavGrid,
  TaxonomyReference,
  TaxonomyStatusBar,
  faultClass,
  faultRule,
  useAnomalyModule,
} from '@/components/anomaly';
import { PATHS } from '@/routes/paths';

/* ───────────────────────────────────────────────────────────────────────────
 * Anomaly detection.
 *
 * Every record here was raised by the engine when a live reading breached a
 * threshold held on the device's own profile and stayed there — a charger at
 * 19.8 V and a laptop at 20.5 V are each judged against their own tolerance.
 * Nothing on this page is generated for display.
 *
 * The view is three blocks over one shared selection:
 *
 *   1 · status bar        — is the stream trustworthy, and what is open on it
 *   2 · classification    — which failure modes those open events resolve to
 *   3 · detection quality — how well the detector is doing at the selection
 *
 * Selecting a class in block 2 narrows block 3, the traces and the table
 * together. The selection is held in `useAnomalyModule` and never leaves this
 * page, so no other module can be reached by a drill-down made here.
 * ─────────────────────────────────────────────────────────────────────────── */

export const AnomalyDetectionPage = () => {
  const navigate = useNavigate();
  const journal = useAnomalyJournal();
  const { mttrMinutes } = useSnapshot();
  const module = useAnomalyModule();
  const { state, taxonomy, status, quality, scoped } = module;

  const stats = useMemo(() => {
    const active = journal.filter((record) => record.status === 'Active');
    return {
      active: active.length,
      critical: active.filter((record) => record.severity === 'Critical').length,
      acknowledged: journal.filter((record) => record.status === 'Acknowledged').length,
      resolved: journal.filter((record) => record.status === 'Resolved').length,
      affected: new Set(active.map((record) => record.assetId)).size,
    };
  }, [journal]);

  /* ─── Drill-down chips ─────────────────────────────────────────────────── */

  const drilldown: Array<{ key: string; label: string; color?: string; onClear: () => void }> = [];
  if (state.selectedCategory !== 'ALL') {
    const def = faultClass(state.selectedCategory);
    drilldown.push({
      key: 'class',
      label: def.label,
      color: def.color,
      onClear: () => module.selectCategory('ALL'),
    });
  }
  if (state.activeFailureTypeId !== null) {
    const rule = faultRule(state.activeFailureTypeId);
    drilldown.push({
      key: 'signature',
      label: rule ? `${rule.id} · ${rule.signature}` : state.activeFailureTypeId,
      onClear: () => module.setFailureType(null),
    });
  }
  if (state.selectedSeverity !== 'ALL') {
    drilldown.push({
      key: 'severity',
      label: `${state.selectedSeverity.charAt(0)}${state.selectedSeverity.slice(1).toLowerCase()} severity`,
      onClear: () => module.selectSeverity('ALL'),
    });
  }
  if (state.classifiedOnly) {
    drilldown.push({
      key: 'classified',
      label: 'Classified only',
      onClear: module.toggleClassifiedOnly,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={MODULE_TITLES.anomaly.title}
        subtitle={MODULE_TITLES.anomaly.subtitle}
        eyebrow={
          <>
            <Badge tone="brand" size="sm" icon={Radar}>
              {journal.length} raised this session
            </Badge>
            {stats.active > 0 ? (
              <Badge tone="critical" size="sm" icon={ShieldAlert}>
                {stats.active} active
              </Badge>
            ) : (
              <Badge tone="good" size="sm" icon={ShieldCheck}>
                Nothing active
              </Badge>
            )}
            {stats.critical > 0 ? (
              <Badge tone="critical" size="sm">
                {stats.critical} critical
              </Badge>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaStat label="Devices affected" value={formatNumber(stats.affected)} />
            <MetaStat label="Acknowledged" value={formatNumber(stats.acknowledged)} />
            <MetaStat label="Self-cleared" value={formatNumber(stats.resolved)} />
            <MetaStat label="Mean time to clear" value={`${formatNumber(mttrMinutes, 1)} min`} />
          </>
        }
        actions={
          <Button 
            variant="secondary" 
            size="sm" 
            icon={FileText} 
            onClick={() => navigate(PATHS.anomalyAnalysisReport)}
          >
            Analysis Report
          </Button>
        }
      />

      {/* ─── 1 · Real-time taxonomy and status ──────────────────────────── */}
      <TaxonomyStatusBar
        status={status}
        taxonomy={taxonomy}
        selectedCategory={state.selectedCategory}
        onSelectCategory={module.toggleCategory}
        onOpenTaxonomy={() => module.setTaxonomyModal(true)}
      />

      {drilldown.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-overlay/[0.06] bg-ink-850/40 px-3.5 py-2.5">
          <span className="eyebrow shrink-0">Drill-down</span>
          {drilldown.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              className="inline-flex h-6 items-center gap-1.5 rounded-md bg-overlay/[0.06] px-2 text-[11.5px] font-medium text-fg-soft ring-1 ring-inset ring-overlay/10 transition-colors hover:bg-overlay/[0.1] hover:text-fg"
            >
              {chip.color ? (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: chip.color }}
                  aria-hidden
                />
              ) : null}
              {chip.label}
              <X size={11} aria-hidden />
            </button>
          ))}
          <span className="text-[11px] tabular-nums text-fg-dim">
            {formatNumber(scoped.length)} of {formatNumber(journal.length)} events in scope
          </span>
          <Button variant="ghost" size="xs" className="ml-auto" onClick={module.clearDrilldown}>
            Clear all
          </Button>
        </div>
      ) : null}

      {/* ─── 2 · Failure classification ─────────────────────────────────── */}
      <FailureClassification
        taxonomy={taxonomy}
        selectedCategory={state.selectedCategory}
        activeFailureTypeId={state.activeFailureTypeId}
        classifiedOnly={state.classifiedOnly}
        onSelectCategory={module.toggleCategory}
        onSelectFailureType={module.selectFailureType}
        onOpenTaxonomy={() => module.setTaxonomyModal(true)}
        onViewClassified={module.toggleClassifiedOnly}
      />

      {/* ─── 3 · Detection quality ──────────────────────────────────────── */}
      <DetectionQualityGrid
        quality={quality}
        selectedCategory={state.selectedCategory}
        scopedCount={scoped.length}
      />

      {/* ─── Streams ──────────────────────────────────────────────────── */}
      <StreamNavGrid />

      <GrafanaPanel
        dashboard={env.grafana.dashboards.anomaly}
        panelId={2}
        title="Detection engine analysis"
        subtitle="Residual distribution and score thresholds served from Grafana"
        height={320}
        refresh="30s"
        variables={{ severity: state.selectedSeverity, class: state.selectedCategory }}
      />

      {/* ─── Reference and detail ───────────────────────────────────────── */}
      <TaxonomyReference
        open={state.isTaxonomyModalOpen}
        onClose={() => module.setTaxonomyModal(false)}
        taxonomy={taxonomy}
        activeFailureTypeId={state.activeFailureTypeId}
        onSelectFailureType={(id) => {
          module.setFailureType(id);
        }}
      />
    </div>
  );
};
