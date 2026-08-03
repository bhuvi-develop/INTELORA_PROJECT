import { useMemo } from 'react';
import { AlertTriangle, Clock3, Flame, Gauge, Timer, TrendingDown } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { BarTrend, Heatmap, type HeatmapCell } from '@/components/charts';
import { SectionHeader } from '@/components/common';
import { ApmAssetTable, ApmKpiGrid, type ApmKpiCardProps } from '@/components/apm';
import { ApmPageShell } from './ApmPageShell';
import { ApmFilterControls, useApmScope } from './useApmScope';
import { meanBy, orDash, rankBy } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Reliability analytics.
 *
 * MTBF and MTTR are censored figures. An asset still running its first interval
 * has not yet produced a time-between-failures, and an open repair has not yet
 * produced a time-to-restore — counting either as a short one would report a
 * healthy estate as a failing one. The engine flags both, and every ranking
 * here drops the censored records rather than plotting them at zero.
 *
 * MTBF and MTTR are never drawn on one axis: hours and minutes are different
 * units and one of them is three orders of magnitude larger.
 * ─────────────────────────────────────────────────────────────────────────── */

export const ApmReliabilityPage = () => {
  const scope = useApmScope();
  const { assets } = scope;
  const fleet = scope.overview?.fleet_reliability;

  const kpis = useMemo<ApmKpiCardProps[]>(
    () => [
      {
        label: 'Availability',
        value: fleet?.availability_pct === undefined ? null : orDash(fleet.availability_pct, 2),
        unit: '%',
        accent: STATUS_COLOR.good,
        icon: Gauge,
        meter: fleet?.availability_pct === undefined ? undefined : { value: fleet.availability_pct },
        caption: `Inherent ${orDash(fleet?.inherent_availability_pct, 2, '%')} — excludes waiting time`,
        explainer:
          'Operational availability over the observed window. The gap to inherent availability is logistics and waiting delay: the maintenance organisation rather than the hardware.',
        loading: scope.loading,
      },
      {
        label: 'Average MTBF',
        value: fleet?.mtbf_sample ? orDash(fleet.mtbf_hours, 1) : null,
        unit: 'h',
        accent: SERIES[2],
        icon: Timer,
        caption: fleet?.mtbf_sample
          ? `Across ${fleet.mtbf_sample} closed interval${fleet.mtbf_sample === 1 ? '' : 's'}`
          : 'No closed failure interval to measure from yet',
        explainer:
          'Mean time between failures across intervals that actually closed. Assets still running their first interval are censored out.',
        loading: scope.loading,
      },
      {
        label: 'Average MTTR',
        value: fleet?.mttr_sample ? orDash(fleet.mttr_minutes, 1) : null,
        unit: 'min',
        accent: SERIES[3],
        icon: Clock3,
        caption: fleet?.mttr_sample
          ? `Across ${fleet.mttr_sample} restored event${fleet.mttr_sample === 1 ? '' : 's'}`
          : 'Nothing has been restored yet in this window',
        explainer: 'Mean time to restore across closed corrective work. Open repairs are excluded.',
        loading: scope.loading,
      },
      {
        label: 'Failure rate',
        value:
          fleet?.failure_rate_per_1000h === undefined ? null : orDash(fleet.failure_rate_per_1000h, 2),
        unit: '/1000h',
        accent: STATUS_COLOR.critical,
        tone: fleet?.rate_credible === false ? 'neutral' : 'bad',
        icon: AlertTriangle,
        caption:
          fleet?.rate_credible === false
            ? 'Sample too small to quote a credible rate'
            : `${fleet?.total_failures ?? 0} failure event(s) · ${orDash(fleet?.total_downtime_hours, 1, ' h')} downtime`,
        explainer:
          'Failures per thousand operating hours. The engine flags when the sample cannot support the figure, and the card says so rather than printing a precise-looking number.',
        loading: scope.loading,
      },
    ],
    [fleet, scope.loading],
  );

  /* Censored records are dropped rather than plotted at zero — see the note at
   * the top of this file. */
  const mtbf = useMemo(
    () => rankBy(assets.filter((a) => !a.mtbf_censored), (a) => a.mtbf_hours, 12, 'asc'),
    [assets],
  );

  const mttr = useMemo(
    () => rankBy(assets.filter((a) => !a.mttr_censored), (a) => a.mttr_minutes, 12, 'desc'),
    [assets],
  );

  const byClass = useMemo(
    () => meanBy(assets, (a) => a.category, (a) => a.failure_rate_per_1000h),
    [assets],
  );

  /** Failure rate as a class-against-band grid — where unreliability concentrates. */
  const heat = useMemo(() => {
    const classes = [...new Set(assets.map((a) => a.category))].sort();
    const bands = ['healthy', 'good', 'warning', 'critical'];
    const cells: HeatmapCell[] = [];

    classes.forEach((category) => {
      bands.forEach((band, index) => {
        const members = assets.filter(
          (asset) => asset.category === category && asset.health_index_band === band,
        );
        const rate = members.length
          ? members.reduce((sum, asset) => sum + (asset.failure_rate_per_1000h ?? 0), 0) / members.length
          : 0;
        cells.push({ row: category, col: index, value: Math.round(rate * 100) / 100 });
      });
    });

    return { cells, rows: classes, cols: bands.map((_, index) => index), bands };
  }, [assets]);

  return (
    <ApmPageShell
      title="Reliability Analytics"
      subtitle="Availability, MTBF, MTTR and failure rate across the estate — with censored records excluded rather than counted as zero."
      crumb="Reliability"
      loading={scope.loading}
      error={scope.error}
      activeFilterCount={scope.filterCount}
      onResetFilters={scope.reset}
      filters={<ApmFilterControls scope={scope} />}
      filterNote="The fleet KPI row reads the engine's own rollup and is not narrowed by these filters — a fleet MTBF recomputed over a subset would not be the fleet's MTBF. The charts and table below are."
    >
      <ApmKpiGrid items={kpis} />

      <SectionHeader
        title="Where reliability is lost"
        subtitle="MTBF and MTTR ranked separately — hours and minutes never share an axis"
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <BarTrend
          title="Shortest MTBF"
          subtitle="Assets failing most often, censored records excluded"
          eyebrow="MTBF"
          icon={Timer}
          data={mtbf.map((asset) => ({ label: asset.asset_id, value: asset.mtbf_hours }))}
          series={[{ key: 'value', name: 'MTBF', color: SERIES[2], unit: 'h', decimals: 1 }]}
          layout="horizontal"
          height={Math.max(220, mtbf.length * 30)}
          categoryWidth={104}
          footnote="Only assets that have closed at least one failure interval appear. An asset still running its first interval has no MTBF, and plotting it at zero would make the estate look worse than it is."
        />

        <BarTrend
          title="Longest MTTR"
          subtitle="Assets slowest to restore, open repairs excluded"
          eyebrow="MTTR"
          icon={Clock3}
          data={mttr.map((asset) => ({ label: asset.asset_id, value: asset.mttr_minutes }))}
          series={[{ key: 'value', name: 'MTTR', color: SERIES[3], unit: 'min', decimals: 1 }]}
          layout="horizontal"
          height={Math.max(220, mttr.length * 30)}
          categoryWidth={104}
          footnote="A long MTTR on a low-criticality asset is a scheduling choice; on a critical one it is the figure that drives the availability gap."
        />
      </div>

      <BarTrend
        title="Failure rate by device class"
        subtitle="Mean failures per thousand operating hours, per class"
        eyebrow="Comparison"
        icon={TrendingDown}
        data={byClass}
        series={[{ key: 'value', name: 'Failure rate', color: STATUS_COLOR.critical, unit: '/1000h', decimals: 2 }]}
        layout="horizontal"
        height={Math.max(200, byClass.length * 46)}
        categoryWidth={148}
        footnote="Rate rather than count, so a class with many assets is not penalised for having many assets."
      />

      {heat.rows.length > 0 ? (
        <Heatmap
          title="Failure rate heatmap"
          subtitle="Mean failure rate where device class meets condition band"
          eyebrow="Density"
          icon={Flame}
          cells={heat.cells}
          rows={heat.rows}
          cols={heat.cols}
          colLabel={(col) => heat.bands[col].charAt(0).toUpperCase() + heat.bands[col].slice(1)}
          valueLabel={(value) => `${orDash(value, 2)} /1000h`}
          footnote="Reads left to right as condition degrades. A class whose rate climbs sharply across the bands is degrading predictably; one that is high in every band has a design or duty problem rather than a wear problem."
        />
      ) : null}

      <SectionHeader title="Asset register" subtitle="Reliability record per asset" />

      <ApmAssetTable
        assets={assets}
        columns={['asset', 'category', 'availability', 'inherent', 'mtbf', 'mttr', 'failureRate', 'failures', 'downtime']}
        title="Reliability register"
        subtitle="Censored MTBF and MTTR values are marked rather than hidden"
        exportName="intelora_apm_reliability"
        minWidth="98rem"
      />
    </ApmPageShell>
  );
};
