import { useMemo, useState } from 'react';
import { Crosshair, Layers, Radar as RadarIcon, ShieldAlert } from 'lucide-react';
import { SERIES, STATUS_COLOR } from '@/config/viz';
import { BarTrend, RadarProfile, ScatterRisk, type RadarAxis, type ScatterPoint } from '@/components/charts';
import { Select } from '@/components/ui/Select';
import { SectionHeader } from '@/components/common';
import { ApmAssetTable, ApmKpiGrid, type ApmKpiCardProps } from '@/components/apm';
import { ApmPageShell } from './ApmPageShell';
import { ApmFilterControls, useApmScope } from './useApmScope';
import { countBy, orDash, rankBy, riskColor } from './apmSelectors';

/* ───────────────────────────────────────────────────────────────────────────
 * Criticality analytics.
 *
 * Criticality is a property of the asset, not of its condition. Safety,
 * production impact, replacement cost, lead time and redundancy do not move
 * when a device degrades — which is precisely why two assets at identical
 * health rank differently for work.
 *
 * The radar is the right form for it: several factors on one shared 0–100
 * scale, read as a shape rather than as five separate magnitudes. The risk
 * matrix beside it is the pairing that actually decides the queue — criticality
 * against condition, which is what APM ranks on.
 * ─────────────────────────────────────────────────────────────────────────── */

interface Factor {
  key: string;
  label: string;
  score: number;
}

/** The engine nests the six factors under each asset; this reads them safely. */
const factorsOf = (raw: Array<Record<string, unknown>> | undefined): Factor[] =>
  (raw ?? [])
    .map((entry) => ({
      key: String(entry.key ?? ''),
      label: String(entry.label ?? entry.key ?? ''),
      score: Number(entry.score ?? 0),
    }))
    .filter((factor) => factor.key.length > 0 && Number.isFinite(factor.score));

export const ApmCriticalityPage = () => {
  const scope = useApmScope();
  const { assets } = scope;
  const [focusId, setFocusId] = useState<string>('');

  const focus = useMemo(
    () => assets.find((asset) => asset.asset_id === focusId) ?? assets[0],
    [assets, focusId],
  );

  /** Mean score per factor across the selection, and the focused asset beside it. */
  const radar = useMemo<RadarAxis[]>(() => {
    const buckets = new Map<string, { label: string; total: number; count: number }>();

    for (const asset of assets) {
      for (const factor of factorsOf(asset.criticality_factors)) {
        const bucket = buckets.get(factor.key) ?? { label: factor.label, total: 0, count: 0 };
        bucket.total += factor.score;
        bucket.count += 1;
        buckets.set(factor.key, bucket);
      }
    }

    const focusFactors = new Map(factorsOf(focus?.criticality_factors).map((f) => [f.key, f.score]));

    return [...buckets.entries()].map(([key, bucket]) => ({
      axis: bucket.label,
      fleet: Math.round((bucket.total / Math.max(1, bucket.count)) * 10) / 10,
      focus: Math.round((focusFactors.get(key) ?? 0) * 10) / 10,
    }));
  }, [assets, focus]);

  const kpis = useMemo<ApmKpiCardProps[]>(() => {
    const scores = assets.map((a) => a.criticality_score).filter(Number.isFinite);
    const mean = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : undefined;
    const highest = assets.filter(
      (a) => a.criticality_code === 'A' || String(a.criticality_label).toLowerCase().includes('critical'),
    ).length;
    const noRedundancy = assets.filter((asset) =>
      factorsOf(asset.criticality_factors).some(
        (factor) => factor.key.includes('redundan') && factor.score >= 80,
      ),
    ).length;

    return [
      {
        label: 'Mean criticality',
        value: mean === undefined ? null : orDash(mean, 1),
        accent: SERIES[4],
        icon: Crosshair,
        meter: mean === undefined ? undefined : { value: mean },
        caption: `Across ${assets.length} asset${assets.length === 1 ? '' : 's'} in scope`,
        explainer:
          'A 0–100 composite of safety, production impact, replacement cost, lead time and redundancy. A property of the asset, not of its condition.',
        loading: scope.loading,
      },
      {
        label: 'Highest class',
        value: String(highest),
        accent: STATUS_COLOR.critical,
        tone: highest > 0 ? 'bad' : 'good',
        icon: ShieldAlert,
        caption: 'Assets in the top criticality class',
        loading: scope.loading,
      },
      {
        label: 'No redundancy',
        value: String(noRedundancy),
        accent: STATUS_COLOR.warning,
        icon: Layers,
        caption: 'Assets scoring high on the redundancy factor — nothing covers them',
        explainer: 'A high redundancy score means no standby exists, so a failure is felt immediately.',
        loading: scope.loading,
      },
      {
        label: 'Factors modelled',
        value: String(radar.length),
        accent: SERIES[0],
        icon: RadarIcon,
        caption: 'Components the criticality score is composed from',
        loading: scope.loading,
      },
    ];
  }, [assets, radar.length, scope.loading]);

  const distribution = useMemo(
    () => countBy(assets, (a) => a.criticality_label, () => SERIES[4]),
    [assets],
  );

  const matrix = useMemo<ScatterPoint[]>(
    () =>
      assets.map((asset) => ({
        id: asset.asset_id,
        label: asset.asset_id,
        x: Math.round((asset.criticality_score ?? 0) * 10) / 10,
        y: Math.round((asset.health_index ?? 0) * 10) / 10,
        z: Math.max(1, asset.open_work_orders ?? 1),
        group: asset.risk_tier ?? 'unranked',
        meta: `${asset.category} · risk ${orDash(asset.risk_score, 0)} · ${asset.lifecycle_decision}`,
      })),
    [assets],
  );

  const ranked = useMemo(() => rankBy(assets, (a) => a.criticality_score, 12, 'desc'), [assets]);

  return (
    <ApmPageShell
      title="Criticality Analytics"
      subtitle="What makes an asset matter — safety, production impact, replacement cost, lead time and redundancy — and how that meets condition."
      crumb="Criticality"
      loading={scope.loading}
      error={scope.error}
      activeFilterCount={scope.filterCount}
      onResetFilters={scope.reset}
      filters={<ApmFilterControls scope={scope} />}
      filterNote="Criticality does not move with condition. Filtering by health band narrows which assets are shown, not what any of them scores."
    >
      <ApmKpiGrid items={kpis} />

      <SectionHeader
        title="The criticality profile"
        subtitle="Factor scores on one shared scale, fleet mean against a single asset"
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        {radar.length >= 3 ? (
          <RadarProfile
            title="Criticality factors"
            subtitle="Fleet mean against the selected asset"
            eyebrow="Profile"
            icon={RadarIcon}
            data={radar}
            series={[
              { key: 'fleet', name: 'Fleet mean', color: SERIES[0], decimals: 1 },
              { key: 'focus', name: focus?.asset_id ?? 'Selected', color: SERIES[4], decimals: 1 },
            ]}
            height={320}
            actions={
              <Select
                size="sm"
                aria-label="Focused asset"
                options={assets.map((asset) => ({ value: asset.asset_id, label: asset.asset_id }))}
                value={focus?.asset_id ?? ''}
                onChange={(event) => setFocusId(event.target.value)}
                containerClassName="w-36"
              />
            }
            footnote="All factors share a 0–100 scale, which is what makes the shape readable. An asset that bulges toward lead time and redundancy is one nothing can cover and nothing can replace quickly — the case for holding a spare rather than for maintaining harder."
          />
        ) : null}

        <BarTrend
          title="Criticality distribution"
          subtitle="Assets per criticality class"
          eyebrow="Distribution"
          icon={Layers}
          data={distribution}
          series={[{ key: 'count', name: 'Assets', color: SERIES[4], decimals: 0 }]}
          layout="horizontal"
          height={Math.max(220, distribution.length * 46)}
          categoryWidth={148}
          footnote="Class is assigned from the composite score. An estate where most assets sit in the top class has either a genuinely critical estate or a criticality model that is not discriminating."
        />
      </div>

      <ScatterRisk
        title="Risk matrix"
        subtitle="Criticality against condition — the pairing APM ranks work on"
        eyebrow="Matrix"
        icon={Crosshair}
        points={matrix}
        xLabel="Criticality score"
        yLabel="Health index (%)"
        height={360}
        quadrant={{ x: 60, y: 60 }}
        quadrantLabels={[
          'Low criticality, healthy',
          'Critical and healthy — protect',
          'Low criticality, degraded',
          'Critical and degraded — act first',
        ]}
        footnote="The bottom-right quadrant is the queue. A degraded asset that nothing depends on is a scheduling item; a degraded asset with no redundancy and a long lead time is the one that stops the line. Bubble size is open work orders."
      />

      <SectionHeader title="Ranking" subtitle="Assets by criticality, highest first" />

      <BarTrend
        title="Most critical assets"
        subtitle="Composite criticality score per asset"
        eyebrow="Ranking"
        icon={ShieldAlert}
        data={ranked.map((asset) => ({
          label: asset.asset_id,
          value: asset.criticality_score,
          color: riskColor(asset.risk_tier),
        }))}
        series={[{ key: 'value', name: 'Criticality score', color: SERIES[4], decimals: 0 }]}
        layout="horizontal"
        height={Math.max(220, ranked.length * 30)}
        categoryWidth={104}
        colorFor={(point) => String(point.color)}
        footnote="Bars carry the asset's risk tier rather than its criticality, so a highly critical asset in good condition reads differently from one that is also degrading."
      />

      <ApmAssetTable
        assets={assets}
        columns={['asset', 'category', 'criticality', 'risk', 'health', 'availability', 'priority', 'lifecycle']}
        title="Criticality register"
        subtitle="Score, class and the risk tier that follows from it against condition"
        exportName="intelora_apm_criticality"
        minWidth="92rem"
      />
    </ApmPageShell>
  );
};
