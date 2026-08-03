import { type WorkOrder } from '@/services/apm.service';

interface WorkOrderTableProps {
  orders: WorkOrder[];
}

export const WorkOrderTable = ({ orders }: WorkOrderTableProps) => {
  return (
    <div className="rounded-md border border-overlay/[0.06] overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-ink-850/40 text-fg-dim border-b border-overlay/[0.06]">
          <tr>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">Order ID</th>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">Asset ID</th>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">Title</th>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">Status</th>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">Priority</th>
            <th className="px-4 py-3 font-semibold uppercase tracking-wider text-[10px]">Cost Estimate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-overlay/[0.04]">
          {orders.map((order) => (
            <tr key={order.order_id} className="row-hover">
              <td className="px-4 py-3 text-fg font-medium">{order.order_id}</td>
              <td className="px-4 py-3 text-fg-soft">{order.asset_id}</td>
              <td className="px-4 py-3 text-fg-soft">{order.title}</td>
              <td className="px-4 py-3 text-fg-soft">{order.status}</td>
              <td className="px-4 py-3 text-fg-soft">{order.priority}</td>
              <td className="px-4 py-3 text-fg-soft">${order.cost_estimate.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
