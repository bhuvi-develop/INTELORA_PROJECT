import { PageHeader } from '@/components/common';

export const CriticalAssetsPage = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="Criticality Engine" subtitle="Risk classification and priority matrix" />
      <div className="p-4 border rounded-md bg-card text-card-foreground">
        Criticality engine data goes here.
      </div>
    </div>
  );
};
