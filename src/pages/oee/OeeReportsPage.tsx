import { useState } from 'react';
import { PageHeader } from '@/components/common';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FileText, Download, Calendar, Mail, FileOutput } from 'lucide-react';

export const OeeReportsPage = () => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 1500);
  };

  const reports = [
    { title: 'Daily Operations Report', description: "Comprehensive summary of yesterday's fleet performance, OEE metrics, and critical incidents.", type: 'PDF' },
    { title: 'Weekly Executive Summary', description: 'High-level aggregation of fleet efficiency trends, target achievements, and AI insights.', type: 'PDF' },
    { title: 'Monthly Fleet Analytics', description: 'Detailed breakdown of product category performance and cost indicators.', type: 'Excel' },
    { title: 'Custom Analytics Export', description: 'Raw telemetry data and derived OEE metrics for custom timeframes.', type: 'Excel' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="OEE Reports"
        subtitle="Generate and export operational intelligence reports"
      />

      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-fg-soft" />
          <h2 className="text-lg font-semibold text-fg tracking-tight">Available Reports</h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {reports.map((report, idx) => (
            <Card key={idx} className="p-5 flex items-center justify-between hover:bg-surface-alt/10 transition-colors">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-surface-alt/50 rounded-lg">
                  {report.type === 'PDF' ? <FileOutput className="h-6 w-6 text-rose-500" /> : <FileOutput className="h-6 w-6 text-emerald-500" />}
                </div>
                <div>
                  <h3 className="font-semibold text-fg flex items-center gap-2">
                    {report.title}
                    <Badge tone="neutral" className="text-[10px] uppercase">{report.type}</Badge>
                  </h3>
                  <p className="text-sm text-fg-soft mt-1">{report.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExport} disabled={isGenerating}>
                  <Mail className="h-4 w-4 mr-2" /> Email
                </Button>
                <Button variant="primary" size="sm" onClick={handleExport} disabled={isGenerating}>
                  <Download className="h-4 w-4 mr-2" /> Download
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-4">
          <Calendar className="h-5 w-5 text-fg-soft" />
          <h2 className="text-lg font-semibold text-fg tracking-tight">Automated Schedules</h2>
        </div>
        <Card className="p-6 text-center text-fg-soft">
          <div className="flex flex-col items-center justify-center py-8">
            <Calendar className="h-12 w-12 text-fg-muted mb-4" />
            <h3 className="text-lg font-medium text-fg mb-2">No active schedules</h3>
            <p className="text-sm mb-6 max-w-md">Configure automated report generation to have operational intelligence delivered straight to your inbox.</p>
            <Button variant="outline">Create Schedule</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
