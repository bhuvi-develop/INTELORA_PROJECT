import { PageHeader } from '@/components/common';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download } from 'lucide-react';

export const OeeReportsPage = () => {
  return (
    <div className="space-y-6">
      <PageHeader title="OEE Reports" subtitle="Generate and export performance reports" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Daily Shift Report" subtitle="Past 24 hours of charger efficiency" />
          <div className="p-4 pt-0">
            <Button variant="secondary" icon={Download} className="w-full">Export PDF</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Weekly Rollup" subtitle="7-day operational view" />
          <div className="p-4 pt-0">
            <Button variant="secondary" icon={Download} className="w-full">Export Excel</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title="Monthly Executive Summary" subtitle="High level fleet comparison" />
          <div className="p-4 pt-0">
            <Button variant="secondary" icon={Download} className="w-full">Export PDF</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
