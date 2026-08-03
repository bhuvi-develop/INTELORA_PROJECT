import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';

/* ───────────────────────────────────────────────────────────────────────────
 * Theme switch.
 *
 * A two-position control rather than a single toggle button: an operator can
 * see which mode is active without having to reason about what the icon is
 * offering to do. The knob is a shared layout element, so switching slides it
 * across instead of cutting.
 *
 * Both modes are designed surfaces, not inversions — dark is a deep slate
 * chassis lit from above, light is a cool-grey instrument panel carrying
 * true-white cards.
 * ─────────────────────────────────────────────────────────────────────────── */

const OPTIONS = [
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
  { value: 'light' as const, icon: Sun, label: 'Light' },
];

export const ThemeSwitch = ({ className }: { className?: string }) => {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-ink-850/80 p-0.5',
        'border border-line/[0.09] shadow-inset',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${option.label} theme`}
            title={`${option.label} theme`}
            onClick={() => setTheme(option.value)}
            className={cn(
              'relative flex h-7 w-8 items-center justify-center rounded-[0.5rem]',
              'transition-colors duration-200 ease-enterprise',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
              active ? 'text-brand-200' : 'text-fg-faint hover:text-fg-dim',
            )}
          >
            {active ? (
              <motion.span
                layoutId="theme-knob"
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 rounded-[0.5rem] border border-line/[0.1] bg-ink-750 bg-surface-raised shadow-elev-1"
                aria-hidden
              />
            ) : null}
            <option.icon size={13.5} strokeWidth={2} className="relative" aria-hidden />
          </button>
        );
      })}
    </div>
  );
};
