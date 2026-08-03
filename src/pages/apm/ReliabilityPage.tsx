import { PageHeader } from '@/components/common';

export const ReliabilityPage = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="Reliability & Maintenance" subtitle="MTBF, MTTR, and Strategy Optimizer" />
      <div className="p-4 border rounded-md bg-card text-card-foreground">
        Reliability metrics go here.
      </div>
    </div>
  );
};
