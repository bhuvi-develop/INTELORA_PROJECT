import { type CriticalityScore } from '@/services/apm.service';

interface CriticalityMatrixProps {
  scores: CriticalityScore[];
}

export const CriticalityMatrix = ({ scores }: CriticalityMatrixProps) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {scores.map((score) => (
        <div key={score.asset_id} className="p-4 border rounded-md">
          <div className="text-sm text-fg-dim">Asset: {score.asset_id}</div>
          <div className="text-lg font-bold">Rank: {score.criticality_rank}</div>
          <div className="text-sm">Impact: {score.business_impact}</div>
          <div className="text-sm text-red-500">Downtime Cost: ${score.downtime_cost_per_hour.toFixed(2)}/hr</div>
        </div>
      ))}
    </div>
  );
};
