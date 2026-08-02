import { useMemo } from 'react';
import { Activity, BadgeCheck, Layers, TrendingDown, Zap } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { AreaTrend, BarTrend } from '@/components/charts';
import { SectionHeader } from '@/components/common';
import { ApmAssetTable, ApmKpiGrid, type ApmKpiCardProps } from '@/components/apm';
import { ApmPageShell } from './ApmPageShell';
import { ApmFilterControls, useApmScope } from './useApmScope';
import { histogram, meanBy, orDash, rankBy } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Availability analytics.
 *
 * Two availability figures, kept apart on purpose. Operational availability is
 * uptime over the window and is what the business experiences. Inherent
 * availability removes logistics and waiting delay, so it is what the hardware
 * would deliver with a perfect maintenance organisation behind it.
 *
 * The gap between them is the organisation, and it is the only number on this
 * page a maintenance manager can actually move this quarter.
 * ─────────────────────────────────────────────────────────────────────────── */

const AVAILABILITY_EDGES = [90, 92, 94, 96, 98, 100];

export const ApmAvailabilityPage = () => {
  const scope = useApmScope();
  const { assets } = scope;
  const fleet = scope.overview?.fleet_reliability;

  const kpis = useMemo<ApmKpiCardProps[]>(() => {
    const gap =
      fleet?.inherent_availability_pct !== undefined && fleet?.availability_pct !== undefined
        ? fleet.inherent_availability_pct - fleet.availability_pct
        : undefined;

    return [
      {
        label: 'Operational availability',
        value: fleet?.availability_pct === undefined ? null : orDash(fleet.availability_pct, 2),
        unit: '%',
        accent: STATUS_COLOR.good,
        icon: BadgeCheck,
        meter: fleet?.availability_pct === undefined ? undefined : { value: fleet.availability_pct },
        caption: 'Uptime over the observed window — what the business experiences',
        loading: scope.loading,
      },
      {
        label: 'Inherent availability',
        value:
          fleet?.inherent_availability_pct === undefined
            ? null
            : orDash(fleet.inherent_availability_pct, 2),
        unit: '%',
        accent: SERIES[0],
        icon: Zap,
        meter:
          fleet?.inherent_availability_pct === undefined
            ? undefined
            : { value: fleet.inherent_availability_pct },
        caption: 'What the hardware would deliver without logistics or waiting delay',
        loading: scope.loading,
      },
      {
        label: 'Organisational gap',
        value: gap === undefined ? null : orDash(gap, 2),
        unit: 'pts',
        accent: STATUS_COLOR.warning,
        tone: (gap ?? 0) > 1 ? 'bad' : 'good',
        icon: Activity,
        caption: 'Inherent minus operational — waiting and logistics delay',
        explainer:
          'The only availability figure a maintenance organisation can move directly. Closing it needs scheduling and spares, not better hardware.',
        loading: scope.loading,
      },
      {
        label: 'Total downtime',
        value:
          fleet?.total_downtime_hours === undefined ? null : orDash(fleet.total_downtime_hours, 1),
        unit: 'h',
        accent: STATUS_COLOR.critical,
        icon: TrendingDown,
        caption: `${fleet?.assets_below_target ?? 0} asset(s) below the availability target`,
        loading: scope.loading,
      },
    ];
  }, [fleet, scope.loading]);

  const distribution = useMemo(
    () =>
      histogram(
        assets.map((asset) => asset.availability_pct).filter((value) => Number.isFinite(value)),
        AVAILABILITY_EDGES,
        '%',
      ),
    [assets],
  );

  const byClass = useMemo(
    () => meanBy(assets, (a) => a.category, (a) => a.availability_pct),
    [assets],
  );

  const worstDowntime = useMemo(() => rankBy(assets, (a) => a.downtime_hours, 12, 'desc'), [assets]);

  return (
    <ApmPageShell
      title="Availability Analytics"
      subtitle="Operational against inherent availability, and the downtime that separates them."
      crumb="Availability"
      loading={scope.loading}
      error={scope.error}
      activeFilterCount={scope.filterCount}
      onResetFilters={scope.reset}
      filters={<ApmFilterControls scope={scope} />}
      filterNote="The KPI row reads the engine's fleet rollup and is not narrowed by these filters. The charts and table below are."
    >
      <ApmKpiGrid items={kpis} />

      <SectionHeader
        title="Distribution"
        subtitle="Where the estate sits, and which classes carry the loss"
      />

      <AreaTrend
        title="Availability distribution"
        subtitle="Assets per two-point band of operational availability"
        eyebrow="Distribution"
        icon={BadgeCheck}
        data={distribution}
        series={[{ key: 'count', name: 'Assets', color: STATUS_COLOR.good, decimals: 0 }]}
        height={280}
        footnote="Edges start at 90% rather than zero: an estate that spends its life between 94% and 100% is unreadable on a full-range axis, and nothing here has ever sat below the floor."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend
          title="Mean availability by device class"
          subtitle="Which classes are delivering, and which are not"
          eyebrow="Comparison"
          icon={Layers}
          data={byClass}
          series={[{ key: 'value', name: 'Availability', color: SERIES[0], unit: '%', decimals: 2 }]}
          layout="horizontal"
          height={Math.max(200, byClass.length * 46)}
          categoryWidth={148}
          footnote="Mean rather than total, so a class with many assets is not flattered by its own size."
        />

        <BarTrend
          title="Downtime by asset"
          subtitle="The assets contributing most unavailable hours"
          eyebrow="Attribution"
          icon={TrendingDown}
          data={worstDowntime.map((asset) => ({
            label: asset.asset_id,
            value: asset.downtime_hours,
          }))}
          series={[{ key: 'value', name: 'Downtime', color: STATUS_COLOR.critical, unit: 'h', decimals: 1 }]}
          layout="horizontal"
          height={Math.max(220, worstDowntime.length * 30)}
          categoryWidth={104}
          footnote="Hours rather than events: ten short stoppages and one long one are very different problems, and only the hours tell them apart."
        />
      </div>

      <SectionHeader title="Asset register" subtitle="Availability record per asset" />

      <ApmAssetTable
        assets={assets}
        columns={['asset', 'category', 'status', 'availability', 'inherent', 'downtime', 'downtimeCost', 'utilisation', 'workOrders']}
        title="Availability register"
        subtitle="Operational against inherent availability, with the downtime behind the gap"
        exportName="intelora_apm_availability"
        minWidth="96rem"
      />
    </ApmPageShell>
  );
};
