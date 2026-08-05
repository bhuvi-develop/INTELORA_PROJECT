import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Clock3,
  Gauge,
  Grid3x3,
  Layers,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
  Zap,
} from 'lucide-react';
import { OEE_TARGET } from '@/engine/derive';
import { useSnapshot } from '@/engine/store';
import { PATHS } from '@/routes/paths';
import { formatNumber, formatPercent } from '@/utils/format';
import { AssetStatusMatrix, RiskDistributionBar, RiskHeatMap } from '@/components/charts';
import {
  ActivityFeed,
  AiExecutiveSummary,
  CockpitHeader,
  EnergyIntelligencePanel,
  ExecutiveKpiCard,
  LiveAssetGrid,
  LiveTelemetryStrip,
  PlatformHealthPanel,
  QuickNavGrid,
} from '@/components/cockpit';
import type { KpiStatus } from '@/components/cockpit';
import { SectionHeader } from '@/components/common';

/* ───────────────────────────────────────────────────────────────────────────
 * Enterprise Cockpit.
 *
 * The landing surface after sign-in and the hub for every module. It answers
 * executive questions — how healthy is the estate, where is risk concentrating,
 * how efficiently are we consuming energy, what does the platform recommend —
 * and hands off to the owning module for anything deeper.
 *
 * Deliberately absent, per the brief: anomaly investigation detail, predictive
 * reports, asset ranking tables, OEE analysis and configuration forms. Also
 * absent by design: pie, donut and gauge forms. Composition is carried by
 * matrix, heat-map and stacked-bar forms, which stay readable from ten devices
 * to ten thousand.
 * ─────────────────────────────────────────────────────────────────────────── */

export const CockpitPage = () => {
<<<<<<< Updated upstream
  const navigate = useNavigate();
=======
  const [activeWorkspace, setActiveWorkspace] = useState<string>('landing');
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(false);
>>>>>>> Stashed changes
  const snapshot = useSnapshot();
  const { kpis, oee, assets, anomalies, energy, operationalHealth, yesterday, fleetTrail } = snapshot;

  /* Active critical anomalies per device — feeds the risk tier calculation so
   * the matrix, heat map and distribution all agree on what "at risk" means. */
  const criticalByAsset = useMemo(
    () =>
      anomalies
        .filter((record) => record.status === 'Active' && record.severity === 'Critical')
        .reduce<Record<string, number>>((acc, record) => {
          acc[record.assetId] = (acc[record.assetId] ?? 0) + 1;
          return acc;
        }, {}),
    [anomalies],
  );

  /* Sparkline trails, taken from the streaming trail the engine appends. */
  const trails = useMemo(() => {
    const healthTrail = fleetTrail.map((point) => point.health);
    const powerTrail = fleetTrail.map((point) => point.power);
    const oeeTrail = fleetTrail.map((point) => point.oee);

    // The operational composite is not trailed per tick, so it is reconstructed
    // from the health trail, which is its dominant term.
    const compositeTrail = healthTrail.map(
      (health, index) => health * 0.62 + (oeeTrail[index] ?? oee.oee) * 0.2 + 16,
    );

    return { healthTrail, powerTrail, oeeTrail, compositeTrail };
  }, [fleetTrail, oee.oee]);

  const meanRulDays = useMemo(
    () =>
      assets.length === 0
        ? 0
        : assets.reduce((sum, asset) => sum + asset.prediction.primary.rulDays, 0) / assets.length,
    [assets],
  );

  const healthStatus = (value: number): KpiStatus =>
    value >= 95 ? 'good' : value >= 80 ? 'neutral' : value >= 65 ? 'warning' : 'critical';

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <CockpitHeader />

<<<<<<< Updated upstream
      {/* ─── Operational health summary ──────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader
          title="Operational health summary"
          subtitle="Executive indicators with comparison against the archived prior-day baseline"
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <ExecutiveKpiCard
            label="Operational health"
            value={formatNumber(operationalHealth, 1)}
            unit="%"
            icon={Activity}
            status={healthStatus(operationalHealth)}
            current={operationalHealth}
            yesterday={yesterday.operationalHealth}
            goodDirection="up"
            trail={trails.compositeTrail}
            tooltip="Composite of fleet condition, availability and open critical alerts. The single number for the estate; condition carries the largest weight."
            onClick={() => navigate(PATHS.apm)}
          />
          <ExecutiveKpiCard
            label="Total assets"
            value={formatNumber(kpis.totalAssets)}
            icon={MonitorSmartphone}
            status="neutral"
            current={kpis.totalAssets}
            yesterday={kpis.totalAssets}
            decimals={0}
            tooltip="Every device registered on the platform, across all categories. New categories appear here automatically."
            onClick={() => navigate(PATHS.devices)}
          />
          <ExecutiveKpiCard
            label="Healthy assets"
            value={formatNumber(kpis.healthyAssets)}
            icon={ShieldCheck}
            status="good"
            current={kpis.healthyAssets}
            yesterday={yesterday.healthyAssets}
            goodDirection="up"
            decimals={0}
            tooltip="Devices scoring 95 or above. A further set sits in the good band between 80 and 94."
            onClick={() => navigate(PATHS.apm)}
          />
          <ExecutiveKpiCard
            label="Warning assets"
            value={formatNumber(kpis.warningAssets)}
            icon={AlertTriangle}
            status={kpis.warningAssets > 0 ? 'warning' : 'good'}
            current={kpis.warningAssets}
            yesterday={yesterday.warningAssets}
            goodDirection="down"
            decimals={0}
            tooltip="Devices scoring between 65 and 79. Serviceable but trending down; the cheapest point to intervene."
            onClick={() => navigate(PATHS.prescriptive)}
          />
          <ExecutiveKpiCard
            label="Critical assets"
            value={formatNumber(kpis.criticalAssets)}
            icon={ShieldAlert}
            status={kpis.criticalAssets > 0 ? 'critical' : 'good'}
            current={kpis.criticalAssets}
            yesterday={yesterday.criticalAssets}
            goodDirection="down"
            decimals={0}
            tooltip="Devices scoring below 65. These carry the majority of the estate's downtime exposure."
            onClick={() => navigate(PATHS.prescriptive)}
          />
          <ExecutiveKpiCard
            label="Offline assets"
            value={formatNumber(kpis.offlineAssets)}
            icon={WifiOff}
            status={kpis.offlineAssets > 0 ? 'warning' : 'good'}
            current={kpis.offlineAssets}
            yesterday={yesterday.offlineAssets}
            goodDirection="down"
            decimals={0}
            tooltip="Devices not delivering telemetry. Their condition cannot be assessed, so any developing fault is invisible."
            onClick={() => navigate(PATHS.devices)}
          />
          <ExecutiveKpiCard
            label="Average remaining life"
            value={formatNumber(meanRulDays, 0)}
            unit="days"
            icon={Clock3}
            status={meanRulDays > 90 ? 'good' : meanRulDays > 30 ? 'warning' : 'critical'}
            current={meanRulDays}
            yesterday={yesterday.averageRulDays}
            goodDirection="up"
            decimals={0}
            tooltip="Mean projected life of each device's weakest component, from the sustained wear rate rather than the current instant."
            onClick={() => navigate(PATHS.predictive)}
          />
          <ExecutiveKpiCard
            label="Energy today"
            value={formatNumber(energy.todayKwh, 2)}
            unit="kWh"
            icon={Zap}
            status="neutral"
            current={energy.todayKwh}
            yesterday={energy.yesterdayKwh}
            goodDirection="down"
            decimals={2}
            trail={trails.powerTrail}
            tooltip="Live integral of measured power across the estate this session. Compared against yesterday's archived total."
          />
          <ExecutiveKpiCard
            label="Active alerts"
            value={formatNumber(kpis.activeAnomalies)}
            icon={AlertTriangle}
            status={kpis.criticalAnomalies > 0 ? 'critical' : kpis.activeAnomalies > 0 ? 'warning' : 'good'}
            current={kpis.activeAnomalies}
            yesterday={yesterday.activeAlerts}
            goodDirection="down"
            decimals={0}
            tooltip={`Open and acknowledged threshold breaches, ${kpis.criticalAnomalies} at critical severity. Raised only after a breach persists.`}
            onClick={() => navigate(PATHS.anomaly)}
          />
          <ExecutiveKpiCard
            label="Equipment effectiveness"
            value={formatNumber(oee.oee, 1)}
            unit="%"
            icon={Gauge}
            status={oee.oee >= OEE_TARGET ? 'good' : oee.oee >= 65 ? 'warning' : 'critical'}
            current={oee.oee}
            yesterday={yesterday.oee}
            goodDirection="up"
            trail={trails.oeeTrail}
            tooltip={`Availability × performance × quality against a ${OEE_TARGET}% target. Currently ${formatPercent(Math.abs(OEE_TARGET - oee.oee), 1)} ${oee.oee >= OEE_TARGET ? 'above' : 'below'} target.`}
            onClick={() => navigate(PATHS.oee)}
          />
        </div>
      </div>

      {/* ─── AI executive intelligence ───────────────────────────────────── */}
      <AiExecutiveSummary />

      {/* ─── Live telemetry ─────────────────────────────────────────────── */}
      <LiveTelemetryStrip />

      {/* ─── Operational health visualisation ───────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader
          title="Operational health visualisation"
          subtitle="Condition across the estate, grouped by category. Every cell links to its device."
        />

        <AssetStatusMatrix
          title="Asset status matrix"
          subtitle="One cell per device, coloured by condition band and ordered weakest-first within each category"
          eyebrow="Condition"
          icon={Grid3x3}
          assets={assets}
          footnote="Categories are ordered by mean condition, so the row that needs attention is always at the top. Hover any cell for its live figures; select it to open the device."
=======
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <ExecutiveKpiCard
          label="Total Assets"
          value={formatNumber(kpis.totalAssets)}
          icon={MonitorSmartphone}
          status="neutral"
          current={kpis.totalAssets}
          yesterday={kpis.totalAssets}
          decimals={0}
          tooltip={isAssetsExpanded ? "Click to collapse asset distribution" : "Every device registered on the platform. Click to view distribution."}
          onClick={() => setIsAssetsExpanded(!isAssetsExpanded)}
          className={isAssetsExpanded ? "border-brand-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : ""}
        />

        {isAssetsExpanded && (
          <>
            <ExecutiveKpiCard
              label="Healthy Assets"
              value={formatNumber(kpis.healthyAssets)}
              icon={ShieldCheck}
              status="good"
              current={kpis.healthyAssets}
              yesterday={yesterday.healthyAssets}
              goodDirection="up"
              decimals={0}
              tooltip="Devices scoring 95 or above."
              onClick={() => setActiveWorkspace('HealthyAssets')}
            />
            <ExecutiveKpiCard
              label="Good Assets"
              value={formatNumber(kpis.goodAssets)}
              icon={ShieldCheck}
              status="good"
              current={kpis.goodAssets}
              yesterday={kpis.goodAssets}
              goodDirection="up"
              decimals={0}
              tooltip="Devices scoring between 80 and 94."
              onClick={() => setActiveWorkspace('HealthyAssets')}
            />
            <ExecutiveKpiCard
              label="Warning Assets"
              value={formatNumber(kpis.warningAssets)}
              icon={AlertTriangle}
              status={kpis.warningAssets > 0 ? 'warning' : 'good'}
              current={kpis.warningAssets}
              yesterday={yesterday.warningAssets}
              goodDirection="down"
              decimals={0}
              tooltip="Devices scoring between 65 and 79."
              onClick={() => setActiveWorkspace('WarningAssets')}
            />
            <ExecutiveKpiCard
              label="Critical Assets"
              value={formatNumber(kpis.criticalAssets)}
              icon={ShieldAlert}
              status={kpis.criticalAssets > 0 ? 'critical' : 'good'}
              current={kpis.criticalAssets}
              yesterday={yesterday.criticalAssets}
              goodDirection="down"
              decimals={0}
              tooltip="Devices scoring below 65."
              onClick={() => setActiveWorkspace('CriticalAssets')}
            />
            <ExecutiveKpiCard
              label="Offline Assets"
              value={formatNumber(kpis.offlineAssets)}
              icon={WifiOff}
              status={kpis.offlineAssets > 0 ? 'warning' : 'good'}
              current={kpis.offlineAssets}
              yesterday={yesterday.offlineAssets}
              goodDirection="down"
              decimals={0}
              tooltip="Devices not delivering telemetry."
              onClick={() => setActiveWorkspace('OfflineAssets')}
            />
          </>
        )}
        <ExecutiveKpiCard
          label="Average Remaining Life"
          value={formatNumber(meanRulDays, 0)}
          unit="days"
          icon={Clock3}
          status={meanRulDays > 90 ? 'good' : meanRulDays > 30 ? 'warning' : 'critical'}
          current={meanRulDays}
          yesterday={yesterday.averageRulDays}
          goodDirection="up"
          decimals={0}
          tooltip="Mean projected life of each device's weakest component."
          onClick={() => setActiveWorkspace('TotalAssets')}
        />
        <ExecutiveKpiCard
          label="Today's Energy"
          value={formatNumber(energy.todayKwh, 2)}
          unit="kWh"
          icon={Zap}
          status="neutral"
          current={energy.todayKwh}
          yesterday={energy.yesterdayKwh}
          goodDirection="down"
          decimals={2}
          trail={trails.powerTrail}
          tooltip="Live integral of measured power across the estate this session."
          onClick={() => setActiveWorkspace('Energy')}
        />
        <ExecutiveKpiCard
          label="Active Alerts"
          value={formatNumber(kpis.activeAnomalies)}
          icon={AlertTriangle}
          status={kpis.criticalAnomalies > 0 ? 'critical' : kpis.activeAnomalies > 0 ? 'warning' : 'good'}
          current={kpis.activeAnomalies}
          yesterday={yesterday.activeAlerts}
          goodDirection="down"
          decimals={0}
          tooltip="Open and acknowledged threshold breaches."
          onClick={() => setActiveWorkspace('AlertSummary')}
        />
        <ExecutiveKpiCard
          label="Overall Equipment Efficiency"
          value={formatNumber(oee.oee, 1)}
          unit="%"
          icon={Gauge}
          status={oee.oee >= OEE_TARGET ? 'good' : oee.oee >= 65 ? 'warning' : 'critical'}
          current={oee.oee}
          yesterday={yesterday.oee}
          goodDirection="up"
          trail={trails.oeeTrail}
          tooltip={`Availability × performance × quality against a target.`}
          onClick={() => setActiveWorkspace('Efficiency')}
>>>>>>> Stashed changes
        />
      </div>

      {/* ─── Operational risk distribution ──────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader
          title="Operational risk distribution"
          subtitle="Where operational risk is increasing, and which categories carry it"
        />

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <RiskDistributionBar
            title="Risk composition"
            subtitle="Estate-wide distribution with the per-category breakdown beneath"
            eyebrow="Distribution"
            icon={Layers}
            assets={assets}
            criticalByAsset={criticalByAsset}
            footnote="Risk blends condition, projected failure probability and current alarm state. An unreachable device is never rated better than medium — unknown is not the same as good."
          />

          <RiskHeatMap
            title="Risk concentration"
            subtitle="Device category against risk tier, worst tier first"
            eyebrow="Heat map"
            icon={Grid3x3}
            assets={assets}
            criticalByAsset={criticalByAsset}
            footnote="Counts ride a single-hue sequential ramp and every cell states its exact number, so the reading holds in print and under colour-vision deficiency."
          />
        </div>
      </div>

      {/* ─── Energy intelligence ────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionHeader
          title="Energy intelligence"
          subtitle="How efficiently the estate is consuming energy, with historical analysis in Grafana"
        />
        <EnergyIntelligencePanel />
      </div>

      {/* ─── Live asset overview ────────────────────────────────────────── */}
      <LiveAssetGrid assets={assets} />

      {/* ─── Activity and platform health ───────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <ActivityFeed limit={9} />
        <PlatformHealthPanel />
      </div>

      {/* ─── Quick navigation ───────────────────────────────────────────── */}
      <QuickNavGrid />

      <p className="pt-1 text-[10.5px] leading-relaxed text-fg-dim">
        The cockpit reports summaries and hands off to the owning module for detail. Anomaly investigation, predictive
        reports, performance ranking, effectiveness analysis and configuration each live in their own module, reachable
        from the cards above or the navigation rail.
      </p>
    </div>
  );
};
