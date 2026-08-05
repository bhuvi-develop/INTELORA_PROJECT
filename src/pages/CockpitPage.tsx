import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock3,
  Gauge,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
  Zap,
} from 'lucide-react';
import { OEE_TARGET } from '@/engine/derive';
import { useSnapshot } from '@/engine/store';
import { formatNumber } from '@/utils/format';
import {
  CockpitHeader,
  ExecutiveKpiCard,
  TotalAssetsWorkspace,
  HealthyAssetsWorkspace,
  WarningAssetsWorkspace,
  CriticalAssetsWorkspace,
  OfflineAssetsWorkspace,
  EnergyWorkspace,
  AlertSummaryWorkspace,
  EfficiencyWorkspace,
} from '@/components/cockpit';


export const CockpitPage = () => {
  const [activeWorkspace, setActiveWorkspace] = useState<string>('landing');
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(false);
  const snapshot = useSnapshot();
  const { kpis, oee, assets, energy, yesterday, fleetTrail } = snapshot;

  const trails = useMemo(() => {
    const healthTrail = fleetTrail.map((point) => point.health);
    const powerTrail = fleetTrail.map((point) => point.power);
    const oeeTrail = fleetTrail.map((point) => point.oee);
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


  const onBack = () => setActiveWorkspace('landing');

  if (activeWorkspace !== 'landing') {
    return (
      <div className="space-y-6">
        <CockpitHeader />
        {activeWorkspace === 'TotalAssets' && <TotalAssetsWorkspace onBack={onBack} />}
        {activeWorkspace === 'HealthyAssets' && <HealthyAssetsWorkspace onBack={onBack} />}
        {activeWorkspace === 'WarningAssets' && <WarningAssetsWorkspace onBack={onBack} />}
        {activeWorkspace === 'CriticalAssets' && <CriticalAssetsWorkspace onBack={onBack} />}
        {activeWorkspace === 'OfflineAssets' && <OfflineAssetsWorkspace onBack={onBack} />}
        {activeWorkspace === 'Energy' && <EnergyWorkspace onBack={onBack} />}
        {activeWorkspace === 'AlertSummary' && <AlertSummaryWorkspace onBack={onBack} />}
        {activeWorkspace === 'Efficiency' && <EfficiencyWorkspace onBack={onBack} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CockpitHeader />

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
        />
      </div>
    </div>
  );
};
