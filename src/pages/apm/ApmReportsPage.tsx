import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Share2, Table2 } from 'lucide-react';
import { SERIES } from '@/config/viz';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { SectionHeader } from '@/components/common';
import { useApmBacklog, useApmOeeInputs } from '@/hooks/useApm';
import { exportReport, type ReportFormat } from '@/utils/report';
import { useToast } from '@/hooks';
import { ApmPageShell } from './ApmPageShell';
import { ApmFilterControls, useApmScope } from './useApmScope';
import { APM_ASSET_COLUMNS, WORK_ORDER_COLUMNS, money, orDash } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * APM reports.
 *
 * One place to take the module's records out, and one place to see what APM
 * publishes downstream. The export column sets are the shared ones the
 * analytics pages use, so a file taken from here and a file taken from the
 * reliability page have identical headers and join on asset id.
 *
 * The downstream block is the seam OEE will be built against. It is shown as a
 * contract rather than as a dashboard, because nothing in this application
 * consumes it yet and pretending otherwise would be theatre.
 * ─────────────────────────────────────────────────────────────────────────── */

export const ApmReportsPage = () => {
  const scope = useApmScope();
  const backlog = useApmBacklog();
  const oee = useApmOeeInputs();
  const toast = useToast();

  const [format, setFormat] = useState<ReportFormat>('csv');

  const orders = useMemo(() => backlog.data?.work_orders ?? [], [backlog.data]);
  const published = oee.data?.assets?.length ?? 0;

  const run = (kind: 'assets' | 'workOrders') => {
    if (kind === 'assets') {
      if (scope.assets.length === 0) {
        toast.warning('Nothing to export', 'The current filters return no assets.');
        return;
      }
      void exportReport(format, scope.assets, APM_ASSET_COLUMNS, {
        filename: 'intelora_apm_asset_register',
        title: 'APM Asset Register',
        subtitle: `${scope.assets.length} assets`,
        notes: ['Full APM column set — health, reliability, criticality, risk and cost per asset.'],
      });
      toast.success('Export started', `${scope.assets.length} assets to ${format.toUpperCase()}.`);
      return;
    }

    if (orders.length === 0) {
      toast.warning('Nothing to export', 'The work order queue is currently empty.');
      return;
    }
    void exportReport(format, orders, WORK_ORDER_COLUMNS, {
      filename: 'intelora_apm_work_orders',
      title: 'APM Work Order Queue',
      subtitle: `${orders.length} work orders`,
    });
    toast.success('Export started', `${orders.length} work orders to ${format.toUpperCase()}.`);
  };

  const reports = [
    {
      key: 'assets',
      title: 'Asset register',
      description:
        'Every asset with its health index, reliability figures, criticality, risk tier, cost exposure and recommended action — the full APM record.',
      rows: scope.assets.length,
      columns: APM_ASSET_COLUMNS.length,
      icon: Table2,
      accent: SERIES[0],
      onRun: () => run('assets'),
    },
    {
      key: 'workOrders',
      title: 'Work order queue',
      description:
        'The open maintenance queue with origin, planned-or-reactive, priority, owner, due date and estimated cost.',
      rows: orders.length,
      columns: WORK_ORDER_COLUMNS.length,
      icon: FileText,
      accent: SERIES[2],
      onRun: () => run('workOrders'),
    },
  ];

  return (
    <ApmPageShell
      title="APM Reports"
      subtitle="Take the module's records out, and see what APM publishes to the modules downstream of it."
      crumb="Reports"
      loading={scope.loading}
      error={scope.error}
      activeFilterCount={scope.filterCount}
      onResetFilters={scope.reset}
      filters={<ApmFilterControls scope={scope} />}
      filterNote="Filters apply to the asset register export. The work order queue is the whole open queue and is not narrowed by asset filters."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader
          title="Available reports"
          subtitle="Shared column sets, so files from different pages join on asset id"
        />
        <Select
          size="sm"
          aria-label="Export format"
          options={[
            { value: 'csv', label: 'CSV' },
            { value: 'excel', label: 'Excel' },
            { value: 'pdf', label: 'PDF' },
          ]}
          value={format}
          onChange={(event) => setFormat(event.target.value as ReportFormat)}
          containerClassName="w-28"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.key} className="relative flex flex-col justify-between gap-4 pl-5" interactive>
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl"
              style={{ backgroundColor: report.accent }}
            />

            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-overlay/[0.07]"
                style={{ backgroundColor: `${report.accent}1A`, color: report.accent }}
              >
                <report.icon size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-semibold text-fg">{report.title}</h3>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-dim">{report.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-overlay/[0.06] pt-3">
              <dl className="flex gap-5">
                <div>
                  <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">Rows</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-fg">{report.rows}</dd>
                </div>
                <div>
                  <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">Columns</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold tabular-nums text-fg">{report.columns}</dd>
                </div>
              </dl>

              <Button variant="secondary" size="sm" icon={Download} onClick={report.onRun}>
                Export {format.toUpperCase()}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <SectionHeader
        title="Published downstream"
        subtitle="What APM exposes for the OEE module, as OEE will consume it"
      />

      <Card>
        <CardHeader
          title="OEE input contract"
          subtitle="Served from /api/apm/outputs/oee"
          eyebrow="Downstream"
          icon={Share2}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Assets published', value: String(published) },
            { label: 'Mean availability', value: orDash(scope.overview?.fleet_reliability?.availability_pct, 2, '%') },
            { label: 'Mean health index', value: orDash(scope.overview?.fleet_health?.mean_index, 1, '%') },
            { label: 'Cost exposure', value: money(scope.scope?.cost_exposure) },
          ].map((cell) => (
            <div key={cell.label} className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                {cell.label}
              </p>
              <p className="mt-1.5 text-[15px] font-semibold tabular-nums text-fg">{cell.value}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 border-t border-overlay/[0.06] pt-3.5 font-mono text-[11px] leading-relaxed text-fg-soft">
          asset_id · availability_pct · health_index · mtbf_hours · mttr_minutes · downtime_hours ·
          failure_rate_per_1000h · criticality_score · utilisation_pct
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-dim">
          OEE is not built, so nothing in this application renders these figures yet. The contract is typed and
          exposed anyway — a downstream module that has to discover its input shape by inspection is one that
          will disagree with its producer at integration.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Format notes"
          subtitle="What each export is for"
          eyebrow="Reference"
          icon={FileSpreadsheet}
        />
        <ul className="mt-4 space-y-2 text-[11.5px] leading-relaxed text-fg-dim">
          <li>
            <span className="font-semibold text-fg-soft">CSV</span> — the join-friendly form. No formatting, one
            header row, every numeric column unrounded.
          </li>
          <li>
            <span className="font-semibold text-fg-soft">Excel</span> — the same columns with types preserved, for
            a reliability review that will pivot them.
          </li>
          <li>
            <span className="font-semibold text-fg-soft">PDF</span> — the paginated form for circulation. Column
            count is high on the asset register, so landscape reads better.
          </li>
        </ul>
      </Card>
    </ApmPageShell>
  );
};
