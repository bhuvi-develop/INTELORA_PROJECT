import { cn } from '@/lib/cn';
import { GrafanaPanel, type GrafanaPanelProps } from './GrafanaPanel';

export interface GrafanaPanelGridProps {
  panels: Array<GrafanaPanelProps & { id: string }>;
  columns?: 1 | 2 | 3;
  className?: string;
}

export const GrafanaPanelGrid = ({ panels, columns = 2, className }: GrafanaPanelGridProps) => (
  <div
    className={cn(
      'grid gap-4',
      columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
      className,
    )}
  >
    {panels.map(({ id, ...panel }) => (
      <GrafanaPanel key={id} {...panel} />
    ))}
  </div>
);
