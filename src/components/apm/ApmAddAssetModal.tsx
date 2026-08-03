import { useState } from 'react';
import { Cpu, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks';
import { useCreateAssetMutation } from '@/hooks/useApm';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';

export interface ApmAddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'Mobile Charger', label: 'Mobile Charger' },
  { value: 'Laptop', label: 'Laptop' },
  { value: 'Air Conditioner', label: 'Air Conditioner' },
] as const;

const CRITICALITY_OPTIONS = [
  { value: 'Low', label: 'Low (Non-critical)' },
  { value: 'Medium', label: 'Medium (Standard)' },
  { value: 'High', label: 'High (Essential)' },
  { value: 'Critical', label: 'Critical (Mission-Critical)' },
] as const;

const DUTY_OPTIONS = [
  { value: '0.8', label: '0.8 (Light Load)' },
  { value: '1.0', label: '1.0 (Standard Load)' },
  { value: '1.2', label: '1.2 (Heavy Duty)' },
] as const;

export const ApmAddAssetModal = ({ isOpen, onClose }: ApmAddAssetModalProps) => {
  const toast = useToast();
  const createMutation = useCreateAssetMutation();

  const [category, setCategory] = useState<string>('Mobile Charger');
  const [assetId, setAssetId] = useState<string>('');
  const [assetName, setAssetName] = useState<string>('');
  const [brand, setBrand] = useState<string>('Anker');
  const [model, setModel] = useState<string>('');
  const [criticality, setCriticality] = useState<string>('Medium');
  const [ratedPower, setRatedPower] = useState<string>('65');
  const [nominalVoltage, setNominalVoltage] = useState<string>('230');
  const [dutyFactor, setDutyFactor] = useState<string>('1.0');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!assetName.trim()) {
      toast.push({ title: 'Validation Error', description: 'Asset Name is required', variant: 'warning' });
      return;
    }
    if (!brand.trim()) {
      toast.push({ title: 'Validation Error', description: 'Brand is required', variant: 'warning' });
      return;
    }
    if (!model.trim()) {
      toast.push({ title: 'Validation Error', description: 'Model / Series is required', variant: 'warning' });
      return;
    }

    try {
      const res = await createMutation.mutateAsync({
        asset_id: assetId.trim() || undefined,
        asset_name: assetName.trim(),
        category,
        brand: brand.trim(),
        model: model.trim(),
        criticality,
        rated_power_w: ratedPower ? parseFloat(ratedPower) : undefined,
        nominal_voltage_v: nominalVoltage ? parseFloat(nominalVoltage) : undefined,
        duty_factor: dutyFactor ? parseFloat(dutyFactor) : 1.0,
      });

      const newId = (res as { asset_id?: string }).asset_id || assetId;
      toast.push({
        title: 'Asset Commissioned',
        description: `Successfully registered asset ${newId} (${assetName}) into APM estate monitoring.`,
        variant: 'success',
      });

      setAssetId('');
      setAssetName('');
      setModel('');
      onClose();
    } catch (err) {
      toast.push({
        title: 'Commissioning Failed',
        description: err instanceof Error ? err.message : 'Unable to register asset',
        variant: 'error',
      });
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Commission New Enterprise Asset" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5 py-2">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs">
          <Cpu className="w-5 h-5 shrink-0 text-brand-400" />
          <span>
            Commissioning registers this device into live 1 Hz MIKOS telemetry, PostgreSQL persistence, and APM predictive models.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Device Category / Class *"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(e) => {
              const newCat = e.target.value;
              setCategory(newCat);
              if (newCat === 'Mobile Charger') {
                setRatedPower('65');
                setNominalVoltage('230');
              } else if (newCat === 'Laptop') {
                setRatedPower('90');
                setNominalVoltage('19.5');
              } else {
                setRatedPower('1500');
                setNominalVoltage('230');
              }
            }}
          />

          <Input
            label="Asset ID (Auto-generated if empty)"
            type="text"
            placeholder={category === 'Mobile Charger' ? 'e.g. CHR-011' : category === 'Laptop' ? 'e.g. LAP-015' : 'e.g. AIR-001'}
            value={assetId}
            onChange={(e) => setAssetId(e.target.value.toUpperCase())}
          />
        </div>

        <Input
          label="Asset Name *"
          type="text"
          placeholder="e.g. 65W GaN Fast Charger or Latitude 5430"
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Brand / Manufacturer *"
            type="text"
            placeholder="e.g. Anker, Samsung, Dell, Daikin"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            required
          />

          <Input
            label="Model / Series *"
            type="text"
            placeholder="e.g. GaNPrime 65W, Latitude 5430"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Criticality Tier"
            options={CRITICALITY_OPTIONS}
            value={criticality}
            onChange={(e) => setCriticality(e.target.value)}
          />

          <Input
            label="Rated Power (W)"
            type="number"
            step="any"
            placeholder="65"
            value={ratedPower}
            onChange={(e) => setRatedPower(e.target.value)}
          />

          <Select
            label="Duty Factor"
            options={DUTY_OPTIONS}
            value={dutyFactor}
            onChange={(e) => setDutyFactor(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-overlay/10">
          <Button type="button" variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            variant="primary"
            icon={PlusCircle}
          >
            {createMutation.isPending ? 'Commissioning...' : 'Commission Asset'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
