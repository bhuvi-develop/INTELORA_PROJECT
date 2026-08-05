import { useCallback, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertOctagon,
  CheckCheck,
  Download,
  Gavel,
  Sigma,
  Target,
  Undo2,
} from 'lucide-react';
import type { AnomalyRecord } from '@/engine/types';
import { useAnomalyJournal, useSnapshot } from '@/engine/store';
import { STATUS_COLOR } from '@/config/viz';
import { formatDateTime, formatNumber, formatPercent, formatRelative } from '@/utils/format';
import { exportReport, type ReportColumn, type ReportFormat } from '@/utils/report';
import { useToast, useUI } from '@/hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { DataTable, Pagination } from '@/components/data';
import { DeviceIdentity, SeverityBadge } from '@/components/common';
import { breachRatio, classifyRecord, faultClass, useAnomalyModule } from '@/components/anomaly';
import { DetailShell, DetailStatStrip, type DetailStat } from '@/pages/anomaly-details';

/* ───────────────────────────────────────────────────────────────────────────
 * Feedback log report.
 *
 * The engineer-judgement surface for precision, moved off the false-positive
 * analytics page so that page stays a summary. Everything here is a judgement or
 * a candidate for one: events an engineer has marked as noise, and rule-only
 * events the model never corroborated and nobody has ruled on yet.
 *
 * This is the only place in the interface where a false alarm can be flagged, so
 * it carries the retune control rather than merely listing rows.
 *
 * One honest limitation: the flag is held in this page's own module state. Each
 * view mounts its own `useAnomalyModule`, so a verdict recorded here does not
 * reach the precision tile on the analytics page until this client posts to the
 * platform's feedback endpoint — which exists server-side and is not yet wired.
 * ─────────────────────────────────────────────────────────────────────────── */

const PAGE_SIZES = [25, 50, 100, 200];

export const FeedbackLogReportPage = () => {
  const toast = useToast();
  const { density } = useUI();
  const journal = useAnomalyJournal();
  const snapshot = useSnapshot();
  const { quality, falseAlarms, toggleFalseAlarm } = useAnomalyModule();

  const now = snapshot.at;
  const fp = quality.falsePositive;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [format, setFormat] = useState<ReportFormat>('csv');

  const ruleFor = useCallback((record: AnomalyRecord) => classifyRecord(record, now), [now]);

  /* Verdicts first, then the rule-only candidates awaiting one. */
  const rows = useMemo(
    () =>
      journal
        .filter((record) => falseAlarms.has(record.id) || record.detectionMethod === 'rule')
        .sort((a, b) => {
          const aFlagged = falseAlarms.has(a.id) ? 1 : 0;
          const bFlagged = falseAlarms.has(b.id) ? 1 : 0;
          return bFlagged - aFlagged || b.timestamp - a.timestamp;
        }),
    [journal, falseAlarms],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );

  const judgedPct = rows.length === 0 ? null : (fp.flagged / rows.length) * 100;

  const stats: DetailStat[] = [
    {
      key: 'rows',
      label: 'Rows in log',
      value: formatNumber(rows.length),
      caption: `Out of ${formatNumber(journal.length)} events raised this session`,
      icon: Gavel,
      accent: '#F43F5E',
    },
    {
      key: 'judged',
      label: 'Judged',
      value: formatNumber(fp.flagged),
      caption:
        judgedPct === null
          ? 'Nothing to judge'
          : `${formatPercent(judgedPct, 1)} of the log has an engineer verdict`,
      icon: CheckCheck,
      accent: '#22C55E',
      tone: fp.flagged > 0 ? 'good' : 'neutral',
    },
    {
      key: 'unjudged',
      label: 'Awaiting a verdict',
      value: formatNumber(Math.max(0, rows.length - fp.flagged)),
      caption: 'Rule-only events the model never corroborated and nobody has ruled on',
      icon: AlertOctagon,
      accent: STATUS_COLOR.warning,
      tone: rows.length - fp.flagged > 0 ? 'bad' : 'good',
    },
    {
      key: 'precision',
      label: 'Resulting precision',
      value:
        fp.precisionPct === null || fp.truePositives + fp.falsePositives === 0
          ? '—'
          : formatPercent(fp.precisionPct, 1),
      caption: `TP ${formatNumber(fp.truePositives)} · FP ${formatNumber(fp.falsePositives)}`,
      icon: Target,
      accent: '#38BDF8',
      tone: (fp.precisionPct ?? 0) >= 80 ? 'good' : 'bad',
    },
  ];

  const columns = useMemo<Array<ColumnDef<AnomalyRecord, unknown>>>(
    () => [
      {
        id: 'verdict',
        header: 'Verdict',
        accessorFn: (row) => (falseAlarms.has(row.id) ? 'flagged' : 'pending'),
        enableSorting: true,
        cell: ({ row }) =>
          falseAlarms.has(row.original.id) ? (
            <Badge tone="warning" size="xs" icon={AlertOctagon}>
              False alarm
            </Badge>
          ) : (
            <Badge tone="neutral" size="xs">
              Unjudged
            </Badge>
          ),
      },
      {
        id: 'signature',
        header: 'Failure mode',
        accessorFn: (row) => ruleFor(row)?.id ?? '',
        enableSorting: true,
        meta: { width: '14rem' },
        cell: ({ row }) => {
          const rule = ruleFor(row.original);
          if (!rule) return <span className="text-[12.5px] text-fg-dim">Unclassified</span>;
          const def = faultClass(rule.classId);
          return (
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-[3px]"
                style={{ backgroundColor: def.color }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-fg">{rule.signature}</span>
                <span className="block truncate font-mono text-[10.5px] text-fg-faint">{rule.id}</span>
              </span>
            </span>
          );
        },
      },
      {
        id: 'device',
        header: 'Device',
        accessorFn: (row) => row.assetId,
        enableSorting: true,
        meta: { width: '15rem' },
        cell: ({ row }) => (
          <DeviceIdentity
            assetId={row.original.assetId}
            assetName={row.original.assetName}
            meta={row.original.category}
            idOnly
          />
        ),
      },
      {
        id: 'method',
        header: 'Corroboration',
        accessorFn: (row) => row.detectionMethod,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[12px] text-fg-soft">
            {row.original.detectionMethod === 'rule' ? (
              <span className="text-rose-300">rule only</span>
            ) : (
              row.original.detectionMethod
            )}
            <span className="ml-1.5 text-[10.5px] tabular-nums text-fg-faint">
              score {formatNumber(row.original.anomalyScore, 2)}
            </span>
          </span>
        ),
      },
      {
        id: 'severity',
        header: 'Severity',
        accessorFn: (row) => row.severity,
        enableSorting: true,
        cell: ({ row }) => <SeverityBadge severity={row.original.severity} size="xs" />,
      },
      {
        id: 'breach',
        header: 'Breach',
        accessorFn: (row) => breachRatio(row),
        enableSorting: true,
        meta: { numeric: true, align: 'right' },
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-fg-soft">
            {formatPercent(breachRatio(row.original) * 100, 1)}
          </span>
        ),
      },
      {
        id: 'raised',
        header: 'Raised',
        accessorFn: (row) => row.timestamp,
        enableSorting: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="text-[11.5px] text-fg-dim" title={formatDateTime(row.original.timestamp)}>
            {formatRelative(row.original.timestamp)}
          </span>
        ),
      },
      {
        id: 'action',
        header: '',
        enableSorting: false,
        meta: { align: 'right', width: '11rem' },
        cell: ({ row }) => {
          const flagged = falseAlarms.has(row.original.id);
          return (
            <Button
              variant={flagged ? 'subtle' : 'ghost'}
              size="xs"
              icon={flagged ? Undo2 : AlertOctagon}
              onClick={(event) => {
                event.stopPropagation();
                toggleFalseAlarm(row.original.id);
                toast.info(
                  flagged ? 'False alarm withdrawn' : 'Logged as a false alarm',
                  `${row.original.code} — precision recomputes for the session.`,
                );
              }}
            >
              {flagged ? 'Withdraw' : 'Retune'}
            </Button>
          );
        },
      },
    ],
    [falseAlarms, toggleFalseAlarm, toast, ruleFor],
  );

  const exportColumns: Array<ReportColumn<AnomalyRecord>> = [
    { header: 'Verdict', value: (row) => (falseAlarms.has(row.id) ? 'FALSE_ALARM' : 'UNJUDGED') },
    { header: 'Error Code', value: (row) => row.code },
    { header: 'Rule', value: (row) => ruleFor(row)?.id ?? '' },
    { header: 'Failure Mode', value: (row) => ruleFor(row)?.signature ?? 'Unclassified' },
    {
      header: 'Fault Class',
      value: (row) => {
        const rule = ruleFor(row);
        return rule ? faultClass(rule.classId).label : '';
      },
    },
    { header: 'Asset ID', value: (row) => row.assetId },
    { header: 'Asset Name', value: (row) => row.assetName },
    { header: 'Corroboration', value: (row) => row.detectionMethod },
    { header: 'Model Score', value: (row) => row.anomalyScore, numeric: true },
    { header: 'Severity', value: (row) => row.severity },
    {
      header: 'Breach %',
      value: (row) => Math.round(breachRatio(row) * 10000) / 100,
      numeric: true,
    },
    { header: 'Raised', value: (row) => formatDateTime(row.timestamp) },
  ];

  const runExport = () => {
    if (rows.length === 0) {
      toast.warning('Nothing to export', 'The feedback log is empty.');
      return;
    }
    void exportReport(format, rows, exportColumns, {
      filename: 'intelora_feedback_log',
      title: 'Feedback Log Report',
      subtitle: `${rows.length} rows · ${fp.flagged} judged`,
      generatedAt: now,
      notes: [
        `Precision ${fp.precisionPct === null ? 'unknown' : formatPercent(fp.precisionPct, 1)} over ${formatNumber(fp.truePositives + fp.falsePositives)} events`,
        'A row appears here when the rule fired without model corroboration, or an engineer marked it noise.',
        'Verdicts are held for this session only — the platform feedback endpoint is not yet wired to this client.',
      ],
    });
    toast.success('Export started', `${rows.length} rows to ${format.toUpperCase()}.`);
  };

  return (
    <DetailShell
      title="Feedback Log Report"
      subtitle="Engineer verdicts on raised events, and the rule-only detections still awaiting one. This is where a false alarm is flagged and a threshold envelope gets retuned."
      eyebrow={
        <>
          <Badge tone="brand" size="sm" icon={Gavel}>
            {formatNumber(rows.length)} row{rows.length === 1 ? '' : 's'}
          </Badge>
          {fp.flagged > 0 ? (
            <Badge tone="warning" size="sm" icon={AlertOctagon}>
              {formatNumber(fp.flagged)} judged
            </Badge>
          ) : (
            <Badge tone="neutral" size="sm">
              Nothing judged yet
            </Badge>
          )}
        </>
      }
      actions={
        <>
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
            containerClassName="w-24"
          />
          <Button variant="primary" size="sm" icon={Download} onClick={runExport}>
            Export log
          </Button>
        </>
      }
    >
      <DetailStatStrip stats={stats} />

      <DataTable<AnomalyRecord>
        data={paged}
        columns={columns}
        rowKey={(row) => row.id}
        density={density}
        minWidth="88rem"
        emptyIcon={Sigma}
        emptyTitle="Nothing awaiting judgement"
        emptyDescription="Every event in the journal was corroborated by the model, and none has been flagged as noise."
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-fg">Verdicts and candidates</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-fg-dim">
                Judged rows first, then rule-only events newest first. Marking one retunes the noise envelope
                for its device and channel, and precision above recomputes immediately.
              </p>
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-fg-dim">
              {formatNumber(rows.length)} row{rows.length === 1 ? '' : 's'} ·{' '}
              {judgedPct === null ? '0' : formatNumber(judgedPct, 0)}% judged
            </span>
          </div>
        }
        footer={
          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={rows.length}
            noun="rows"
            pageSizeOptions={PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        }
      />
    </DetailShell>
  );
};
