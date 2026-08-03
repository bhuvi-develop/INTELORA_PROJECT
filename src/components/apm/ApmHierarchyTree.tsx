import { useMemo, useState } from 'react';
import {
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Layers,
  MapPin,
  Radio,
  Search,
} from 'lucide-react';
import type { ApmHierarchyNode } from '@/services/apm.types';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { HealthMeter } from '@/components/common';

export interface ApmHierarchyTreeProps {
  root: ApmHierarchyNode | undefined;
  onSelectAsset?: (assetId: string) => void;
  loading?: boolean;
}

const levelIcon = (level: string) => {
  switch (level.toLowerCase()) {
    case 'enterprise':
      return Building2;
    case 'site':
    case 'portfolio':
      return MapPin;
    case 'floor':
    case 'zone':
      return Layers;
    case 'asset':
      return Boxes;
    case 'sensor':
      return Radio;
    default:
      return Cpu;
  }
};

const TreeNode = ({
  node,
  searchTerm,
  onSelectAsset,
}: {
  node: ApmHierarchyNode;
  searchTerm: string;
  onSelectAsset?: (assetId: string) => void;
}) => {
  const [expanded, setExpanded] = useState<boolean>(true);
  const Icon = levelIcon(node.level);
  const children = node.children || [];
  const hasChildren = children.length > 0;
  const metrics = node.metrics as { mean_health?: number; assets?: number } | undefined;

  const matchesSearch = useMemo(() => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const selfMatch =
      node.name.toLowerCase().includes(term) ||
      node.id.toLowerCase().includes(term) ||
      node.level.toLowerCase().includes(term);

    const childMatch = children.some(
      (c: ApmHierarchyNode) =>
        c.name.toLowerCase().includes(term) || c.id.toLowerCase().includes(term)
    );

    return selfMatch || childMatch;
  }, [node, searchTerm, children]);

  if (!matchesSearch) return null;

  const isClickableAsset = node.level === 'asset' || node.level === 'sensor';

  return (
    <div className="ml-3 my-1">
      <div
        className={cn(
          'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-ink-800/60',
          isClickableAsset && 'cursor-pointer hover:bg-brand-500/10'
        )}
        onClick={() => {
          if (isClickableAsset) {
            onSelectAsset?.(node.id);
          } else if (hasChildren) {
            setExpanded(!expanded);
          }
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              className="text-fg-dim hover:text-fg p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <Icon size={14} className="text-brand-400 shrink-0" />
          <span className="font-medium text-fg truncate">{node.name}</span>
          <span className="text-[10px] font-mono text-fg-dim">({node.level})</span>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-2">
          {metrics?.mean_health !== undefined && (
            <div className="flex items-center gap-1.5">
              <HealthMeter health={metrics.mean_health} width="w-12" />
            </div>
          )}
          {metrics?.assets !== undefined && (
            <Badge tone="neutral" size="xs">
              {metrics.assets} assets
            </Badge>
          )}
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="border-l border-overlay/[0.06] ml-2">
          {children.map((child: ApmHierarchyNode) => (
            <TreeNode
              key={child.id}
              node={child}
              searchTerm={searchTerm}
              onSelectAsset={onSelectAsset}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ApmHierarchyTree = ({
  root,
  onSelectAsset,
  loading,
}: ApmHierarchyTreeProps) => {
  const [search, setSearch] = useState('');

  if (loading || !root) {
    return (
      <Card className="p-6 text-center text-fg-dim text-xs">
        Loading Enterprise Hierarchy...
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-overlay/[0.06] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">Enterprise Asset Hierarchy</h3>
          <p className="text-xs text-fg-dim">
            Enterprise → Site → Zone → Asset → Sensor topological projection
          </p>
        </div>
        <div className="w-64">
          <Input
            placeholder="Search hierarchy..."
            icon={Search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto pr-1">
        <TreeNode node={root} searchTerm={search} onSelectAsset={onSelectAsset} />
      </div>
    </Card>
  );
};
