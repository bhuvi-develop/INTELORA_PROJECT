import { Menu } from 'lucide-react';
import { APP } from '@/config/env';
import { useClock } from '@/hooks/useClock';
import { useUI } from '@/hooks/useUI';
import { IconButton } from '@/components/ui/Button';

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** Global chrome is deliberately limited to organisation and local time. */
export const Topbar = () => {
  const { setMobileNavOpen } = useUI();
  const now = useClock(1_000);

  return (
    <header className="sticky top-0 z-30 flex h-[4.5rem] shrink-0 items-center gap-4 border-b border-line/[0.15] bg-ink-950/40 px-5 backdrop-blur-3xl shadow-[0_4px_30px_rgba(0,0,0,0.1)] lg:px-8">
      <IconButton
        icon={Menu}
        label="Open navigation"
        size="sm"
        className="lg:hidden"
        onClick={() => setMobileNavOpen(true)}
      />

      <div className="ml-auto flex shrink-0 items-center gap-4 text-right">
        <p className="hidden text-[12.5px] font-medium tracking-[-0.005em] text-fg-soft sm:block">{APP.organisation}</p>
        <span className="hidden h-6 w-px bg-line/70 sm:block" aria-hidden />
        <p className="text-[11.5px] tabular-nums text-fg-dim">
          {DATE_FMT.format(now)}
          <span className="mx-1.5 text-fg-faint" aria-hidden>·</span>
          {TIME_FMT.format(now).toUpperCase()}
        </p>
      </div>
    </header>
  );
};
