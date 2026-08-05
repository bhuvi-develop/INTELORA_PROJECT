import { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Segmented';
import { FAULT_CLASSES, FAULT_RULES, faultClass, type CategorySelection } from './taxonomy';
import type { TaxonomyBreakdown } from './useAnomalyModule';

/* ───────────────────────────────────────────────────────────────────────────
 * The M01–M15 reference.
 *
 * The catalogue of failure modes with the condition each one is recognised by,
 * the dwell before it is raised and the margin it has to clear by. Selecting a
 * row takes the operator back to the table filtered to that signature, so the
 * reference is a way into the data rather than a page of documentation.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface TaxonomyReferenceProps {
  open: boolean;
  onClose: () => void;
  taxonomy: TaxonomyBreakdown;
  activeFailureTypeId: string | null;
  onSelectFailureType: (id: string) => void;
}

export const TaxonomyReference = ({
  open,
  onClose,
  taxonomy,
  activeFailureTypeId,
  onSelectFailureType,
}: TaxonomyReferenceProps) => {
  const [lens, setLens] = useState<CategorySelection>('ALL');

  /** Open events per rule, so the reference shows what is live against each. */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of taxonomy.classes) {
      for (const { rule, count } of entry.rules) map.set(rule.id, count);
    }
    return map;
  }, [taxonomy]);

  const rules = useMemo(
    () => (lens === 'ALL' ? FAULT_RULES : FAULT_RULES.filter((rule) => rule.classId === lens)),
    [lens],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Failure taxonomy · M01 – M15"
      subtitle="Every signature the classifier recognises, with the condition, the dwell before it is raised and the margin it clears by"
      footer={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="shrink-0 text-fg-faint" aria-hidden />
          <Segmented<CategorySelection>
            size="xs"
            layoutId="taxonomy-lens"
            ariaLabel="Filter the reference by fault class"
            value={lens}
            onChange={setLens}
            options={[
              { value: 'ALL', label: 'All' },
              ...FAULT_CLASSES.map((entry) => ({ value: entry.id, label: entry.short })),
            ]}
          />
        </div>

        <p className="text-[12px] leading-relaxed text-fg-muted">
          A channel rule decides whether an event is raised; these decide what it is called. The discriminator on
          each row reads only fields the platform publishes — breach magnitude against that device’s own limit, how
          long the event stayed open, and the serviceable part the detector attributed it to. Rules are evaluated in
          order and the first match owns the event, so the class counts always sum to the journal.
        </p>

        <div className="scroll-x">
          <table className="w-full border-collapse" style={{ minWidth: '54rem' }}>
            <thead>
              <tr className="border-b border-overlay/[0.07]">
                {['ID', 'Failure mode', 'Class', 'Condition', 'Dwell', 'Clear', 'Open'].map((heading, index) => (
                  <th
                    key={heading}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-dim',
                      index >= 4 ? 'text-right' : 'text-left',
                    )}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-overlay/[0.045]">
              {rules.map((rule) => {
                const def = faultClass(rule.classId);
                const count = counts.get(rule.id) ?? 0;
                const selected = activeFailureTypeId === rule.id;

                return (
                  <tr
                    key={rule.id}
                    onClick={() => {
                      onSelectFailureType(rule.id);
                      onClose();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onSelectFailureType(rule.id);
                      onClose();
                    }}
                    tabIndex={0}
                    role="button"
                    className={cn(
                      'cursor-pointer align-top transition-colors focus:outline-none',
                      selected ? 'bg-overlay/[0.06]' : 'hover:bg-overlay/[0.035] focus:bg-overlay/[0.05]',
                    )}
                  >
                    <td className="px-3 py-3">
                      <span className="rounded bg-overlay/[0.055] px-1.5 py-0.5 font-mono text-[11px] text-fg-soft">
                        {rule.id}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <p className="text-[12.5px] font-semibold text-fg">{rule.name}</p>
                      <p className="mt-0.5 text-[11px] text-fg-dim">{rule.signature}</p>
                      <p className="mt-1 max-w-[26rem] text-[11px] leading-relaxed text-fg-muted">{rule.detail}</p>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-soft">
                        <span
                          className="h-2 w-2 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: def.color }}
                          aria-hidden
                        />
                        {def.short}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      <code className="text-[11px] leading-relaxed text-fg-soft">{rule.expression}</code>
                      <p className="mt-1 text-[10.5px] text-fg-faint">channel · {rule.channel}</p>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-right text-[11.5px] tabular-nums text-fg-soft">
                      {formatNumber(rule.dwellSeconds, rule.dwellSeconds % 1 === 0 ? 0 : 1)} s
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-right text-[11.5px] tabular-nums text-fg-dim">
                      {formatNumber(rule.clearSeconds)} s
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <span
                        className={cn(
                          'text-[12.5px] font-semibold tabular-nums',
                          count > 0 ? 'text-fg' : 'text-fg-faint',
                        )}
                      >
                        {formatNumber(count)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="border-t border-overlay/[0.06] pt-3 text-[11px] leading-relaxed text-fg-dim">
          Dwell and clear windows are the detector’s published confirm and clear seconds for the underlying channel
          rule. A reading must sit back inside the limit with a 3% margin for the full clear window before an event
          is allowed to close, which is why the journal reads as a list of faults rather than a list of samples.
        </p>
      </div>
    </Modal>
  );
};
