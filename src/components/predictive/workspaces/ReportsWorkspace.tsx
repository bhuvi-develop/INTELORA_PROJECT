import { useMemo, useState } from 'react';
import { Check, Download, FileDown, FileSpreadsheet, FileText, Table2 } from 'lucide-react';
import { usePredictionRecords } from '@/engine/store';
import type { PredictionHistoryRecord } from '@/engine/types';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, formatPercent } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useToast } from '@/hooks';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePredictive } from '../context';
import { workspaceById } from '../navigation';
import { BoundedTable, MetricBar, WorkspaceFrame } from '../WorkspaceFrame';
import { HORIZON_DAYS, formatDays } from '../shared/selectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Historical Reports — "Give me the record set."
 *
 * An export centre: choose a period, choose a record set, choose a format, take
 * it away. No charts — a report is a file, and drawing a picture of it here
 * would only invite someone to screenshot the picture instead of exporting the
 * data.
 *
 * Scoped to prediction. Telemetry reporting belongs to the platform's own
 * Historical Reports module; this covers what the prediction service published.
 * ─────────────────────────────────────────────────────────────────────────── */

type Period = 'daily' | 'weekly' | 'monthly';
type RecordSet = 'position' | 'archive';

const PERIODS: Array<{ value: Period; label: string; days: number; note: string }> = [
  { value: 'daily', label: 'Daily', days: 1, note: 'Yesterday and today' },
  { value: 'weekly', label: 'Weekly', days: 7, note: 'The last seven days' },
  { value: 'monthly', label: 'Monthly', days: 30, note: 'The full stored month' },
];

const FORMATS: Array<{ value: ReportFormat; label: string; icon: typeof FileText; note: string }> = [
  { value: 'pdf', label: 'PDF', icon: FileText, note: 'Titled, filtered and timestamped' },
  { value: 'excel', label: 'Excel', icon: FileSpreadsheet, note: 'Frozen header with autofilter' },
  { value: 'csv', label: 'CSV', icon: Table2, note: 'UTF-8 with byte-order mark' },
];

export const ReportsWorkspace = ({ onBack }: { onBack: () => void }) => {
  const { components, assets } = usePredictive();
  const archive = usePredictionRecords();
  const toast = useToast();

  const [period, setPeriod] = useState<Period>('monthly');
  const [recordSet, setRecordSet] = useState<RecordSet>('position');
  const [format, setFormat] = useState<ReportFormat>('pdf');

  const periodDef = PERIODS.find((entry) => entry.value === period) ?? PERIODS[2];

  const archiveRows = useMemo(() => {
    const cutoff = Date.now() - periodDef.days * 86_400_000;
    return archive
      .filter((record) => record.date >= cutoff)
      .sort((a, b) => b.date - a.date || a.assetId.localeCompare(b.assetId));
  }, [archive, periodDef.days]);

  const isPosition = recordSet === 'position';
  const count = isPosition ? components.length : archiveRows.length;

  const metrics = useMemo(
    () => [
      {
        label: 'Records selected',
        value: formatNumber(count),
        caption: isPosition ? 'current component positions' : `${periodDef.label.toLowerCase()} archive rows`,
      },
      {
        label: 'Devices covered',
        value: formatNumber(
          new Set(isPosition ? components.map((r) => r.assetId) : archiveRows.map((r) => r.assetId)).size,
        ),
        caption: `of ${assets.length} commissioned`,
      },
      {
        label: 'Inside the horizon',
        value: formatNumber(components.filter((row) => row.rulDays <= HORIZON_DAYS).length),
        caption: `end of life within ${HORIZON_DAYS} days`,
      },
      {
        label: 'Archive depth',
        value: formatNumber(new Set(archive.map((record) => record.date)).size),
        caption: 'days of stored prediction history',
      },
      { label: 'Output', value: format.toUpperCase(), caption: 'ready to generate' },
    ],
    [count, isPosition, components, archiveRows, assets.length, archive, format, periodDef.label],
  );

  const positionColumns: Array<ReportColumn<(typeof components)[number]>> = [
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Category', value: (row) => row.category },
    { header: 'Component', value: (row) => row.component },
    { header: 'Wear %', value: (row) => Number((row.wear * 100).toFixed(2)), numeric: true },
    { header: 'Remaining Life (days)', value: (row) => row.rulDays, numeric: true },
    {
      header: 'Failure Probability %',
      value: (row) => Number((row.failureProbability * 100).toFixed(2)),
      numeric: true,
    },
    { header: 'Confidence %', value: (row) => Number((row.confidence * 100).toFixed(1)), numeric: true },
    { header: 'Maintenance Priority', value: (row) => row.maintenancePriority },
    { header: 'Predicted Failure', value: (row) => (row.predictedFailureAt ? formatDate(row.predictedFailureAt) : '') },
    { header: 'Estimator', value: (row) => row.modelVersion },
    { header: 'Recommendation', value: (row) => row.recommendation },
  ];

  const archiveColumns: Array<ReportColumn<PredictionHistoryRecord>> = [
    { header: 'Date', value: (row) => formatDate(row.date) },
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Component', value: (row) => row.component },
    { header: 'Remaining Life (days)', value: (row) => row.rulDays, numeric: true },
    {
      header: 'Failure Probability %',
      value: (row) => Number((row.failureProbability * 100).toFixed(2)),
      numeric: true,
    },
    { header: 'Confidence %', value: (row) => Number((row.confidence * 100).toFixed(1)), numeric: true },
  ];

  const generate = () => {
    if (count === 0) {
      toast.warning('Nothing to export', 'The current selection returns no records.');
      return;
    }

    const notes = [
      isPosition
        ? 'Current published position of every tracked component.'
        : `Prediction archive over ${periodDef.note.toLowerCase()}.`,
      'Remaining life and failure probability are ratcheted — published figures only tighten.',
      'Prediction records only; telemetry reporting is served by the Historical Reports module.',
    ];

    if (isPosition) {
      void exportReport(format, components, positionColumns, {
        filename: 'intelora_prediction_position',
        title: 'Predictive Maintenance — Current Position',
        subtitle: `${components.length} component${components.length === 1 ? '' : 's'}`,
        generatedAt: Date.now(),
        notes,
      });
    } else {
      void exportReport(format, archiveRows, archiveColumns, {
        filename: `intelora_prediction_${period}`,
        title: `Predictive Maintenance — ${periodDef.label} Archive`,
        subtitle: `${archiveRows.length} record${archiveRows.length === 1 ? '' : 's'}`,
        generatedAt: Date.now(),
        notes,
      });
    }

    toast.success('Report generated', `${count} record${count === 1 ? '' : 's'} to ${format.toUpperCase()}.`);
  };

  const Option = ({
    selected,
    onSelect,
    title,
    note,
    icon: Icon,
  }: {
    selected: boolean;
    onSelect: () => void;
    title: string;
    note: string;
    icon?: typeof FileText;
  }) => (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex flex-1 items-start gap-2.5 rounded-xl p-3 text-left ring-1 ring-inset transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
        selected
          ? 'bg-brand-500/[0.1] ring-brand-400/30'
          : 'bg-overlay/[0.025] ring-line/60 hover:bg-overlay/[0.05]',
      )}
    >
      {Icon ? (
        <Icon size={15} className={cn('mt-0.5 shrink-0', selected ? 'text-brand-300' : 'text-fg-faint')} aria-hidden />
      ) : (
        <span
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
            selected ? 'bg-brand-500 text-white ring-brand-400' : 'ring-overlay/20',
          )}
          aria-hidden
        >
          {selected ? <Check size={10} strokeWidth={3} /> : null}
        </span>
      )}
      <span className="min-w-0">
        <span className={cn('block text-[12.5px] font-semibold', selected ? 'text-fg' : 'text-fg-soft')}>{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-fg-dim">{note}</span>
      </span>
    </button>
  );

  return (
    <WorkspaceFrame
      workspace={workspaceById('reports')}
      onBack={onBack}
      actions={
        <Button variant="primary" size="sm" icon={Download} onClick={generate} disabled={count === 0}>
          Export {format.toUpperCase()}
        </Button>
      }
    >
      <MetricBar metrics={metrics} />

      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Period" subtitle="How far back the archive reaches" eyebrow="Step 1" icon={FileDown} />
          <div className="mt-4 flex flex-col gap-2">
            {PERIODS.map((entry) => (
              <Option
                key={entry.value}
                selected={period === entry.value}
                onSelect={() => setPeriod(entry.value)}
                title={entry.label}
                note={entry.note}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Record set" subtitle="What the file contains" eyebrow="Step 2" icon={Table2} />
          <div className="mt-4 flex flex-col gap-2">
            <Option
              selected={isPosition}
              onSelect={() => setRecordSet('position')}
              title="Current position"
              note="One row per tracked component, as published now"
            />
            <Option
              selected={!isPosition}
              onSelect={() => setRecordSet('archive')}
              title="Prediction archive"
              note="The position the platform published on each stored day"
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Format" subtitle="How the file is written" eyebrow="Step 3" icon={FileText} />
          <div className="mt-4 flex flex-col gap-2">
            {FORMATS.map((entry) => (
              <Option
                key={entry.value}
                selected={format === entry.value}
                onSelect={() => setFormat(entry.value)}
                title={entry.label}
                note={entry.note}
                icon={entry.icon}
              />
            ))}
          </div>
        </Card>
      </div>

      <BoundedTable
        title="Preview"
        subtitle={
          count === 0
            ? 'No records match the current selection'
            : `First ${Math.min(10, count)} of ${formatNumber(count)} record${count === 1 ? '' : 's'} — the preview is the export`
        }
        maxHeight="22rem"
      >
        {count === 0 ? (
          <EmptyState
            icon={FileDown}
            title="Nothing to preview"
            description="Widen the period, or switch to the current position, to bring records into the report."
          />
        ) : (
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-ink-900">
              <tr className="border-b border-line/60">
                {(isPosition
                  ? ['Component', 'Device', 'Wear', 'Remaining life', 'Probability', 'Confidence', 'Priority']
                  : ['Date', 'Component', 'Device', 'Remaining life', 'Probability', 'Confidence']
                ).map((head) => (
                  <th
                    key={head}
                    className="whitespace-nowrap px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-faint"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {isPosition
                ? components.slice(0, 10).map((row) => (
                    <tr key={`${row.assetId}-${row.component}`} className="hover:bg-overlay/[0.03]">
                      <td className="px-4 py-2.5 text-[12.5px] font-medium text-fg">{row.component}</td>
                      <td className="px-4 py-2.5 text-[12px] text-fg-soft">
                        {row.assetName}
                        <span className="ml-1.5 text-[11px] text-fg-faint">{row.assetId}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.wear * 100, 1)}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">{formatDays(row.rulDays)}</td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.failureProbability * 100, 1)}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.confidence * 100, 0)}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-fg-muted">{row.maintenancePriority}</td>
                    </tr>
                  ))
                : archiveRows.slice(0, 10).map((row, index) => (
                    <tr key={`${row.assetId}-${row.component}-${index}`} className="hover:bg-overlay/[0.03]">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] tabular-nums text-fg-soft">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-2.5 text-[12.5px] font-medium text-fg">{row.component}</td>
                      <td className="px-4 py-2.5 text-[12px] text-fg-soft">
                        {row.assetName}
                        <span className="ml-1.5 text-[11px] text-fg-faint">{row.assetId}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">{formatDays(row.rulDays)}</td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.failureProbability * 100, 1)}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tabular-nums text-fg-muted">
                        {formatPercent(row.confidence * 100, 0)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
      </BoundedTable>
    </WorkspaceFrame>
  );
};
