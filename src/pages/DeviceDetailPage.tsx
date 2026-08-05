import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  CalendarCheck,
  ClipboardList,
  Gauge,
  Radio,
  ShieldAlert,
  Thermometer,
  Waypoints,
  Zap,
} from 'lucide-react';
import type { TelemetryChannel } from '@/engine/types';
import { CHANNELS, channelMeta } from '@/engine/catalog';
import { PREDICTION_HORIZON_DAYS, URGENCY_TONE, bandDef } from '@/engine/derive';
import { CHANNEL_COLOR, SERIES, STATUS_COLOR } from '@/config/viz';
import { env } from '@/config/env';
import { useAnomalyJournal, useAssetRuntime, useEngineControl, usePreventiveTasks } from '@/engine/store';
import { formatDate, formatNumber, formatPercent } from '@/utils/format';
import { useToast } from '@/hooks';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Progress } from '@/components/ui/Progress';
import { Segmented } from '@/components/ui/Segmented';
import { Tabs } from '@/components/ui/Tabs';
import { AreaTrend, LineTrend, RadialGauge } from '@/components/charts';
import type { SeriesDef } from '@/components/charts';
import { GrafanaPanel } from '@/components/grafana';
import {
  AnomalyStatusBadge,
  EventTimeline,
  HealthBandBadge,
  HealthMeter,
  PageHeader,
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
  TaskStatusBadge,
  UrgencyBadge,
} from '@/components/common';
import { NotFoundPage } from './NotFoundPage';

type DetailTab = 'telemetry' | 'anomalies' | 'predictive' | 'preventive' | 'prescriptive' | 'performance';

const WINDOW_OPTIONS = [
  { value: '60', label: '5m' },
  { value: '180', label: '15m' },
  { value: '360', label: '30m' },
] as const;

const PRIMARY_CHANNELS: TelemetryChannel[] = ['voltage', 'current', 'power', 'temperature'];

/**
 * Device detail.
 *
 * The header carries only the six identity fields. Condition, telemetry,
 * anomalies, predictions and maintenance live in their own tabs, because mixing
 * identity with condition is what makes a header stale the moment a value moves.
 */
export const DeviceDetailPage = () => {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { acknowledge, completeTask } = useEngineControl();

  const asset = useAssetRuntime(assetId);
  const journal = useAnomalyJournal();
  const tasks = usePreventiveTasks();

  const [tab, setTab] = useState<DetailTab>('telemetry');
  const [windowTicks, setWindowTicks] = useState<'60' | '180' | '360'>('180');
  const [channel, setChannel] = useState<TelemetryChannel>('power');

  const deviceAnomalies = useMemo(
    () => journal.filter((record) => record.assetId === assetId),
    [journal, assetId],
  );
  const deviceTasks = useMemo(() => tasks.filter((task) => task.assetId === assetId), [tasks, assetId]);

  const history = useMemo(() => {
    if (!asset) return [];
    const count = Number(windowTicks);
    return asset.history.slice(-count);
  }, [asset, windowTicks]);

  const anomalyEvents = useMemo(
    () =>
      deviceAnomalies.map((record) => ({
        id: record.id,
        title: record.title,
        description: record.detail,
        severity: record.severity,
        at: record.timestamp,
        tag: record.code,
        meta: record.status,
      })),
    [deviceAnomalies],
  );

  if (!asset) return <NotFoundPage />;

  const { device, prediction, performance, prescriptive } = asset;
  const band = bandDef(asset.band);
  const selectedMeta = channelMeta(channel);

  const channelSeries: SeriesDef[] = [
    {
      key: channel,
      name: selectedMeta.label,
      color: CHANNEL_COLOR[channel] ?? SERIES[0],
      unit: selectedMeta.unit,
      decimals: selectedMeta.decimals,
    },
  ];

  const healthSeries: SeriesDef[] = [
    { key: 'health', name: 'Health score', color: CHANNEL_COLOR.health, unit: '%', decimals: 1 },
  ];

  return (
    <div className="space-y-6">
      {/* Header — identity only. */}
      <PageHeader
        title={device.assetName}
        subtitle={`${device.brand} ${device.model}`}
        eyebrow={
          <>
            <Badge tone="neutral" size="sm">
              {device.assetId}
            </Badge>
            <Badge tone="neutral" size="sm">
              {device.category}
            </Badge>
            <StatusBadge status={device.status} size="sm" />
          </>
        }
        meta={
          <>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">Asset ID</p>
              <p className="mt-1 font-mono text-[12.5px] font-semibold text-fg">{device.assetId}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">Category</p>
              <p className="mt-1 text-[12.5px] font-semibold text-fg">{device.category}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">Brand</p>
              <p className="mt-1 text-[12.5px] font-semibold text-fg">{device.brand}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">Model</p>
              <p className="mt-1 font-mono text-[12px] font-semibold text-fg">{device.model}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">Status</p>
              <p className="mt-1 text-[12.5px] font-semibold text-fg">{device.status}</p>
            </div>
          </>
        }
        actions={
          <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate(-1)}>
            Back to register
          </Button>
        }
      />

      <Card flush>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <Tabs
            layoutId="device-detail-tabs"
            value={tab}
            onChange={setTab}
            className="border-b-0"
            items={[
              { value: 'telemetry', label: 'Live Telemetry', icon: Radio },
              { value: 'anomalies', label: 'Anomalies', icon: ShieldAlert, count: deviceAnomalies.length },
              { value: 'predictive', label: 'Predictive', icon: Waypoints },
              { value: 'preventive', label: 'Preventive', icon: CalendarCheck, count: deviceTasks.length },
              { value: 'prescriptive', label: 'Prescriptive', icon: ClipboardList },
              { value: 'performance', label: 'Performance', icon: Gauge },
            ]}
          />
          {tab === 'telemetry' ? (
            <Segmented
              ariaLabel="Telemetry window"
              layoutId="device-detail-window"
              size="xs"
              options={WINDOW_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={windowTicks}
              onChange={(value) => setWindowTicks(value as '60' | '180' | '360')}
            />
          ) : null}
        </div>
      </Card>

      {/* ─── Live telemetry ─────────────────────────────────────────────── */}
      {tab === 'telemetry' ? (
        <div className="space-y-4">
          {device.status === 'Offline' ? (
            <Card>
              <EmptyState
                icon={Radio}
                title="Device is not reporting"
                description="Communication with this device has been lost, so no telemetry is being received. Channel values hold at zero until the link is restored."
              />
            </Card>
          ) : null}

          {/* Channel readouts */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
            {CHANNELS.map((meta) => {
              const value = asset.live[meta.key];
              const active = channel === meta.key;
              const isMqtt = asset.live.source?.includes('MQTT');
              const presentList = (asset.live as any).present_parameters ?? [];
              const mappedKey = meta.key === 'power' ? 'active_power' : meta.key;
              const isPresentInPayload = !isMqtt || presentList.length === 0 || presentList.includes(mappedKey);

              return (
                <button
                  key={meta.key}
                  type="button"
                  onClick={() => setChannel(meta.key)}
                  aria-pressed={active}
                  className={[
                    'rounded-xl border p-3 text-left transition-colors relative overflow-hidden',
                    active
                      ? 'border-brand-400/30 bg-brand-500/[0.08]'
                      : 'border-overlay/[0.06] bg-ink-850/50 hover:border-overlay/[0.12]',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1.5" style={{ color: CHANNEL_COLOR[meta.key] }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{meta.label}</span>
                    </span>
                    {isMqtt ? (
                      <span
                        className={cn(
                          'text-[9px] font-mono font-medium px-1.5 py-0.2 rounded border',
                          isPresentInPayload
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                        )}
                        title={isPresentInPayload ? 'Live Sensor Parameter' : 'Derived / Not in Payload'}
                      >
                        {isPresentInPayload ? 'Live' : 'Derived'}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="text-[1.0625rem] font-semibold leading-none tabular-nums text-fg">
                      {formatNumber(value, meta.decimals)}
                    </span>
                    {meta.unit ? <span className="text-[11px] font-medium text-fg-muted">{meta.unit}</span> : null}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <AreaTrend
              title={`${selectedMeta.label} stream`}
              subtitle={`Live channel at five-second resolution · ${WINDOW_OPTIONS.find((o) => o.value === windowTicks)?.label} window`}
              eyebrow="Selected channel"
              icon={Zap}
              data={history}
              series={channelSeries}
              height={280}
              domain={['auto', 'auto']}
              footnote="Each channel is a mean-reverting process, so consecutive samples differ by fractions of a percent. Power is always the product of voltage, current and power factor."
            />

            <LineTrend
              title="Health score"
              subtitle="Condition over the same window, driven by wear plus current stress"
              eyebrow="Condition"
              icon={Activity}
              data={history}
              series={healthSeries}
              height={280}
              domain={[Math.max(0, asset.health - 12), Math.min(100, asset.health + 6)]}
              endLabels
              references={[
                { value: 95, label: 'Healthy 95' },
                { value: 65, label: 'Critical 65' },
              ]}
            />
          </div>

          <LineTrend
            title="Primary channel comparison"
            subtitle="Voltage, current, power and temperature on a shared window"
            eyebrow="Multi-channel"
            icon={Thermometer}
            data={history}
            series={PRIMARY_CHANNELS.map((key) => {
              const meta = channelMeta(key);
              return {
                key,
                name: meta.label,
                color: CHANNEL_COLOR[key] ?? SERIES[0],
                unit: meta.unit,
                decimals: meta.decimals,
              };
            })}
            height={280}
            domain={['auto', 'auto']}
            endLabels
            footnote="Channels share one axis for shape comparison; read absolute values from the readouts above, which carry their own units."
          />

          <GrafanaPanel
            dashboard={env.grafana.dashboards.telemetry}
            panelId={4}
            title={`${device.assetId} raw channels`}
            subtitle="High-resolution view served from Grafana"
            height={300}
            refresh="10s"
            variables={{ asset: device.assetId, category: device.category }}
          />
        </div>
      ) : null}

      {/* ─── Anomalies ──────────────────────────────────────────────────── */}
      {tab === 'anomalies' ? (
        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <EventTimeline
            title="Anomaly history"
            subtitle="Every threshold breach raised against this device"
            eyebrow="Detection"
            icon={ShieldAlert}
            events={anomalyEvents}
            limit={12}
            emptyTitle="No anomalies recorded"
            emptyDescription="No reading on this device has breached a threshold for long enough to raise an event."
          />

          <Card className="flex flex-col">
            <CardHeader
              title="Active events"
              subtitle="Open and acknowledged breaches awaiting disposition"
              eyebrow="Disposition"
              icon={Activity}
            />
            <div className="mt-4 flex-1">
              {deviceAnomalies.filter((record) => record.status !== 'Resolved').length === 0 ? (
                <EmptyState icon={ShieldAlert} compact title="Nothing open" description="All events have cleared." />
              ) : (
                <ul className="space-y-2">
                  {deviceAnomalies
                    .filter((record) => record.status !== 'Resolved')
                    .map((record) => (
                      <li key={record.id} className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-fg">{record.title}</p>
                            <p className="mt-0.5 font-mono text-[10.5px] text-fg-muted">{record.code}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <SeverityBadge severity={record.severity} size="xs" />
                            <AnomalyStatusBadge status={record.status} size="xs" />
                          </div>
                        </div>

                        <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-overlay/[0.05] pt-2.5">
                          <div>
                            <dt className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Observed</dt>
                            <dd className="mt-0.5 text-[12px] font-semibold tabular-nums text-fg">
                              {formatNumber(record.observed, 2)} {record.unit}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Threshold</dt>
                            <dd className="mt-0.5 text-[12px] font-semibold tabular-nums text-fg-muted">
                              {formatNumber(record.threshold, 2)} {record.unit}
                            </dd>
                          </div>
                        </dl>

                        {record.status === 'Active' ? (
                          <Button
                            variant="subtle"
                            size="xs"
                            className="mt-3"
                            onClick={() => {
                              acknowledge(record.id);
                              toast.success('Anomaly acknowledged', `${record.code} on ${record.assetId}.`);
                            }}
                          >
                            Acknowledge
                          </Button>
                        ) : null}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {/* ─── Predictive ─────────────────────────────────────────────────── */}
      {tab === 'predictive' ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
            <Card className="flex flex-col items-center justify-center">
              <RadialGauge
                value={prediction.primary.failureProbability * 100}
                unit="%"
                label="Failure probability"
                caption={`${prediction.primary.component} · ${PREDICTION_HORIZON_DAYS}-day horizon`}
                color={
                  prediction.primary.failureProbability > 0.6
                    ? STATUS_COLOR.critical
                    : prediction.primary.failureProbability > 0.3
                      ? STATUS_COLOR.warning
                      : STATUS_COLOR.good
                }
                size={158}
                decimals={1}
              />
              <div className="mt-4 grid w-full grid-cols-2 gap-3 border-t border-overlay/[0.06] pt-4 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Remaining life</p>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-fg">
                    {formatNumber(prediction.primary.rulDays, prediction.primary.rulDays < 10 ? 1 : 0)} d
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Confidence</p>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-fg">
                    {formatPercent(prediction.primary.confidence * 100, 0)}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Component predictions"
                subtitle="Failure probability, remaining useful life and confidence per serviceable part"
                eyebrow="Per component"
                icon={Waypoints}
              />
              <ul className="mt-4 space-y-2.5">
                {prediction.components.map((component) => {
                  const isPrimary = component.component === prediction.primary.component;
                  return (
                    <li
                      key={component.component}
                      className={[
                        'rounded-xl border p-3.5',
                        isPrimary ? 'border-brand-400/25 bg-brand-500/[0.06]' : 'border-overlay/[0.06] bg-ink-850/50',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-fg">
                            {isPrimary ? '● ' : ''}
                            {component.component}
                          </p>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">{component.recommendation}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[13px] font-semibold tabular-nums text-fg">
                            {formatPercent(component.failureProbability * 100, 1)}
                          </p>
                          <p className="mt-0.5 text-[10.5px] tabular-nums text-fg-dim">
                            {formatNumber(component.rulDays, component.rulDays < 10 ? 1 : 0)} d remaining
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-3 border-t border-overlay/[0.05] pt-2.5">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Wear</p>
                          <Progress
                            value={component.wear * 100}
                            size="xs"
                            color={component.wear > 0.7 ? STATUS_COLOR.critical : component.wear > 0.45 ? STATUS_COLOR.warning : SERIES[0]}
                            className="mt-1.5"
                            label={`${component.component} wear`}
                          />
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">Confidence</p>
                          <p className="mt-1 text-[12px] font-semibold tabular-nums text-fg-soft">
                            {formatPercent(component.confidence * 100, 0)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <GrafanaPanel
            dashboard={env.grafana.dashboards.predictive}
            panelId={3}
            title={`${device.assetId} degradation trend`}
            subtitle="Wear trajectory served from Grafana"
            height={280}
            refresh="1m"
            variables={{ asset: device.assetId }}
          />
        </div>
      ) : null}

      {/* ─── Preventive ─────────────────────────────────────────────────── */}
      {tab === 'preventive' ? (
        <Card flush>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Scheduled maintenance"
              subtitle="Planned tasks for this device with due date, priority and completion state"
              eyebrow="Preventive"
              icon={CalendarCheck}
            />
          </div>

          {deviceTasks.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No scheduled tasks" description="This device has no preventive schedule." />
          ) : (
            <div className="scroll-x">
              <table className="w-full border-collapse" style={{ minWidth: '44rem' }}>
                <thead>
                  <tr className="border-y border-overlay/[0.06] bg-ink-850/40">
                    {['Task name', 'Due date', 'Priority', 'Status', 'Completed', ''].map((label, index) => (
                      <th
                        key={label || index}
                        scope="col"
                        className={`whitespace-nowrap px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-dim ${
                          index === 0 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-overlay/[0.04]">
                  {deviceTasks.map((task) => (
                    <tr key={task.id} className="row-hover">
                      <td className="px-4 py-3 text-[12.5px] font-medium text-fg">{task.taskName}</td>
                      <td className="px-4 py-3 text-right text-[12px] tabular-nums text-fg-soft">
                        {formatDate(task.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end">
                          <PriorityBadge priority={task.priority} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end">
                          <TaskStatusBadge status={task.status} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[11.5px] text-fg-dim">
                        {task.completedAt ? formatDate(task.completedAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {task.completed ? null : (
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => {
                              completeTask(task.id);
                              toast.success('Task completed', `${task.taskName} recorded and rescheduled.`);
                            }}
                          >
                            Complete
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {/* ─── Prescriptive ───────────────────────────────────────────────── */}
      {tab === 'prescriptive' ? (
        <Card>
          <CardHeader
            title="Recommended action"
            subtitle="The business action indicated by this device's current condition"
            eyebrow="Prescriptive"
            icon={ClipboardList}
          />

          <div
            className="mt-4 rounded-2xl border p-5"
            style={{
              borderColor: `${URGENCY_TONE[prescriptive.urgency].color}40`,
              backgroundColor: `${URGENCY_TONE[prescriptive.urgency].color}0F`,
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <UrgencyBadge urgency={prescriptive.urgency} />
              <HealthBandBadge band={asset.band} size="sm" />
            </div>

            <p className="mt-3.5 text-[1.0625rem] font-semibold leading-snug text-fg">{prescriptive.action}</p>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-fg-muted">{prescriptive.rationale}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">Condition band</p>
              <p className="mt-1.5 text-[13px] font-semibold" style={{ color: band.color }}>
                {band.label}
              </p>
            </div>
            <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">Limiting component</p>
              <p className="mt-1.5 text-[13px] font-semibold text-fg">{prediction.primary.component}</p>
            </div>
            <div className="rounded-xl border border-overlay/[0.06] bg-ink-850/50 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">Connectivity</p>
              <p className="mt-1.5 text-[13px] font-semibold text-fg">{device.status}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ─── Performance ────────────────────────────────────────────────── */}
      {tab === 'performance' ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card className="flex flex-col items-center justify-center">
            <RadialGauge
              value={performance.oee}
              target={85}
              unit="%"
              label="Overall equipment effectiveness"
              caption={`A ${formatPercent(performance.availability, 0)} · P ${formatPercent(performance.performance, 0)} · Q ${formatPercent(performance.quality, 0)}`}
              color={performance.oee >= 85 ? STATUS_COLOR.good : performance.oee >= 65 ? STATUS_COLOR.warning : STATUS_COLOR.critical}
              size={158}
            />
            <div className="mt-4 grid w-full grid-cols-3 gap-2 border-t border-overlay/[0.06] pt-4 text-center">
              {[
                { label: 'Availability', value: performance.availability },
                { label: 'Performance', value: performance.performance },
                { label: 'Quality', value: performance.quality },
              ].map((entry) => (
                <div key={entry.label}>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-fg-faint">{entry.label}</p>
                  <p className="mt-1 text-[13px] font-semibold tabular-nums text-fg">{formatPercent(entry.value, 1)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Condition and performance detail"
              subtitle="How this device compares against its own nominal capability"
              eyebrow="Detail"
              icon={Gauge}
            />
            <dl className="mt-4 divide-y divide-overlay/[0.045]">
              {[
                {
                  label: 'Health score',
                  value: `${formatNumber(asset.health, 1)}%`,
                  caption: `${band.label} band`,
                  meter: <HealthMeter health={asset.health} showValue={false} width="w-full" size="sm" />,
                },
                {
                  label: 'Uptime this session',
                  value: formatPercent(performance.uptimeRatio * 100, 2),
                  caption: 'Ticks reporting over ticks observed',
                },
                {
                  label: 'Anomalies (24 h)',
                  value: formatNumber(performance.anomalies24h),
                  caption: 'Feeds directly into the quality factor',
                },
                {
                  label: 'Limiting component',
                  value: prediction.primary.component,
                  caption: `${formatNumber(prediction.primary.rulDays, 0)} days remaining useful life`,
                },
                {
                  label: 'Recommended action',
                  value: prescriptive.urgency === 'None' ? 'No action' : prescriptive.urgency,
                  caption: prescriptive.action,
                },
              ].map((row) => (
                <div key={row.label} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[12px] text-fg-muted">{row.label}</dt>
                    <dd className="shrink-0 text-[13px] font-semibold tabular-nums text-fg">{row.value}</dd>
                  </div>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-fg-dim">{row.caption}</p>
                  {row.meter ? <div className="mt-2">{row.meter}</div> : null}
                </div>
              ))}
            </dl>
          </Card>
        </div>
      ) : null}
    </div>
  );
};
