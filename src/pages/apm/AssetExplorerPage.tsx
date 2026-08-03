import { PageHeader } from '@/components/common';

export const AssetExplorerPage = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="Asset Explorer" subtitle="Asset registry and hierarchy" />
      <div className="p-4 border rounded-md bg-card text-card-foreground">
        Asset registry goes here.
      </div>
    </div>
  );
};
