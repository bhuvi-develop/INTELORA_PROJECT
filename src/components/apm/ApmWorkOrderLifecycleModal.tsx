import { useState } from 'react';
import {
  CheckCircle2,
  UserCheck,
  UserPlus,
  Wrench,
} from 'lucide-react';
import type { ApmWorkOrder } from '@/services/apm.types';
import { useToast } from '@/hooks';
import { useApmWorkOrderMutations } from '@/hooks/useApm';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';

export interface ApmWorkOrderLifecycleModalProps {
  order: ApmWorkOrder | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ApmWorkOrderLifecycleModal = ({
  order,
  isOpen,
  onClose,
}: ApmWorkOrderLifecycleModalProps) => {
  const toast = useToast();
  const mutations = useApmWorkOrderMutations();

  // Form states for stage transitions
  const [approver, setApprover] = useState('Estate Operations Lead');
  const [approvalNote, setApprovalNote] = useState('');
  const [technician, setTechnician] = useState('Tech-Alpha (Elec)');
  const [assignedBy, setAssignedBy] = useState('Maintenance Planner');
  const [completedBy, setCompletedBy] = useState('Tech-Alpha (Elec)');
  const [actualHours, setActualHours] = useState('2.5');
  const [actualCost, setActualCost] = useState('350');
  const [failureCause, setFailureCause] = useState('Thermal wear on power connector');
  const [verifier, setVerifier] = useState('Quality Supervisor');
  const [verificationPassed] = useState(true);

  if (!order) return null;

  const handleApprove = async () => {
    try {
      await mutations.approve.mutateAsync({
        id: order.work_order_id,
        approver,
        note: approvalNote || 'Approved for dispatch',
      });
      toast.success('Work Order Approved', `${order.work_order_id} moved to Approved stage.`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Approval failed', msg);
    }
  };

  const handleAssign = async () => {
    try {
      await mutations.assign.mutateAsync({
        id: order.work_order_id,
        technician,
        assigned_by: assignedBy,
      });
      toast.success('Work Order Dispatched', `${order.work_order_id} assigned to ${technician}.`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Dispatch failed', msg);
    }
  };

  const handleComplete = async () => {
    try {
      await mutations.complete.mutateAsync({
        id: order.work_order_id,
        completed_by: completedBy,
        actual_hours: Number(actualHours) || 2,
        actual_cost: Number(actualCost) || 300,
        failure_cause: failureCause,
      });
      toast.success('Repair Completed', `${order.work_order_id} moved to Pending Verification.`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Completion failed', msg);
    }
  };

  const handleVerify = async () => {
    try {
      await mutations.verify.mutateAsync({
        id: order.work_order_id,
        verifier,
        passed: verificationPassed,
        notes: 'Verification inspection passed. Order closed.',
      });
      toast.success('Work Order Verified & Closed', `${order.work_order_id} lifecycle completed.`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Verification failed', msg);
    }
  };

  const stage = order.status;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={`Work Order Lifecycle — ${order.work_order_id}`}
      subtitle={`${order.asset_name} (${order.asset_id}) · ${order.title}`}
    >
      <div className="space-y-4 pt-2">
        {/* Lifecycle Step Tracker */}
        <div className="rounded-xl border border-overlay/[0.08] bg-ink-850/40 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-fg-dim mb-3">
            Lifecycle Transition Seam: Raise → Approve → Dispatch → Repair → Verify → Close
          </div>
          <div className="grid grid-cols-6 gap-2 text-center text-[10.5px]">
            {[
              { name: 'Raise', done: true },
              { name: 'Approve', done: ['Approved', 'Dispatched', 'In Progress', 'Completed', 'Verified', 'Closed'].includes(stage) },
              { name: 'Dispatch', done: ['Dispatched', 'In Progress', 'Completed', 'Verified', 'Closed'].includes(stage) },
              { name: 'Repair', done: ['Completed', 'Verified', 'Closed'].includes(stage) },
              { name: 'Verify', done: ['Verified', 'Closed'].includes(stage) },
              { name: 'Close', done: stage === 'Closed' },
            ].map((step, idx) => (
              <div
                key={step.name}
                className={`p-2 rounded-lg border ${
                  step.done
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold'
                    : 'border-overlay/[0.06] bg-ink-800/40 text-fg-dim'
                }`}
              >
                {idx + 1}. {step.name}
              </div>
            ))}
          </div>
        </div>

        {/* Action Form based on current status */}
        {stage === 'Raised' || stage === 'Pending Approval' ? (
          <div className="space-y-3 rounded-xl border border-overlay/[0.08] p-4 bg-ink-850/20">
            <h4 className="text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-2">
              <UserCheck size={16} className="text-brand-400" />
              Stage 2: Manager Approval
            </h4>
            <div className="space-y-2 text-xs">
              <div>
                <label className="text-fg-dim">Approver Name</label>
                <Input value={approver} onChange={(e) => setApprover(e.target.value)} />
              </div>
              <div>
                <label className="text-fg-dim">Approval Notes</label>
                <Input placeholder="Optional notes..." value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <Button variant="primary" size="sm" onClick={handleApprove} loading={mutations.approve.isPending}>
                Approve Order
              </Button>
            </div>
          </div>
        ) : stage === 'Approved' ? (
          <div className="space-y-3 rounded-xl border border-overlay/[0.08] p-4 bg-ink-850/20">
            <h4 className="text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-2">
              <UserPlus size={16} className="text-brand-400" />
              Stage 3: Dispatch & Assign Technician
            </h4>
            <div className="space-y-2 text-xs">
              <div>
                <label className="text-fg-dim">Assign Technician</label>
                <Select
                  size="sm"
                  options={[
                    { value: 'Tech-Alpha (Elec)', label: 'Tech-Alpha (Electrical)' },
                    { value: 'Tech-Beta (Mech)', label: 'Tech-Beta (Mechanical)' },
                    { value: 'Tech-Gamma (HVAC)', label: 'Tech-Gamma (HVAC)' },
                  ]}
                  value={technician}
                  onChange={(e) => setTechnician(e.target.value)}
                />
              </div>
              <div>
                <label className="text-fg-dim">Assigned By Planner</label>
                <Input value={assignedBy} onChange={(e) => setAssignedBy(e.target.value)} />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <Button variant="primary" size="sm" onClick={handleAssign} loading={mutations.assign.isPending}>
                Dispatch Technician
              </Button>
            </div>
          </div>
        ) : stage === 'Dispatched' || stage === 'In Progress' ? (
          <div className="space-y-3 rounded-xl border border-overlay/[0.08] p-4 bg-ink-850/20">
            <h4 className="text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-2">
              <Wrench size={16} className="text-brand-400" />
              Stage 4: Complete Repair Work
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <label className="text-fg-dim">Technician Sign-off</label>
                <Input value={completedBy} onChange={(e) => setCompletedBy(e.target.value)} />
              </div>
              <div>
                <label className="text-fg-dim">Actual Labor Hours</label>
                <Input type="number" value={actualHours} onChange={(e) => setActualHours(e.target.value)} />
              </div>
              <div>
                <label className="text-fg-dim">Actual Repair Cost ($)</label>
                <Input type="number" value={actualCost} onChange={(e) => setActualCost(e.target.value)} />
              </div>
              <div>
                <label className="text-fg-dim">Root Failure Cause</label>
                <Input value={failureCause} onChange={(e) => setFailureCause(e.target.value)} />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <Button variant="primary" size="sm" onClick={handleComplete} loading={mutations.complete.isPending}>
                Submit Completion
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-overlay/[0.08] p-4 bg-ink-850/20">
            <h4 className="text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 size={16} className="text-brand-400" />
              Stage 5 & 6: Quality Verification & Closure
            </h4>
            <div className="space-y-2 text-xs">
              <div>
                <label className="text-fg-dim">Inspector / Quality Verifier</label>
                <Input value={verifier} onChange={(e) => setVerifier(e.target.value)} />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <Button variant="primary" size="sm" onClick={handleVerify} loading={mutations.verify.isPending}>
                Verify & Close Order
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
