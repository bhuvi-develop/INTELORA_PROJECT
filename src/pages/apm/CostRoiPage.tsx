import { PageHeader } from '@/components/common';

export const CostRoiPage = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="Cost & ROI Ledger" subtitle="Financial exposure and return on investment" />
      <div className="p-4 border rounded-md bg-card text-card-foreground">
        Cost tracking modules go here.
      </div>
    </div>
  );
};
