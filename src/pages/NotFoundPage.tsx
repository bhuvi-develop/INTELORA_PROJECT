import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Compass, LayoutDashboard } from 'lucide-react';
import { PATHS } from '@/routes/paths';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/common/Logo';

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-ink-950 px-6">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-x-0 top-0 h-[30rem] bg-radial-brand" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md text-center"
      >
        <Logo size="md" showTagline className="justify-center" />

        <span className="mx-auto mt-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-overlay/[0.04] text-fg-dim ring-1 ring-inset ring-overlay/[0.08]">
          <Compass size={22} aria-hidden />
        </span>

        <p className="mt-6 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-fg-faint">Error 404</p>
        <h1 className="mt-2 text-[1.5rem] font-semibold tracking-[-0.02em] text-fg">This route does not exist</h1>
        <p className="mx-auto mt-3 max-w-sm text-[12.5px] leading-relaxed text-fg-muted">
          The requested module or asset is not part of this deployment. It may have been decommissioned, or the link may
          be from an older build of the platform.
        </p>

        <div className="mt-7 flex items-center justify-center gap-2.5">
          <Button variant="secondary" size="md" icon={ArrowLeft} onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Link to={PATHS.cockpit}>
            <Button variant="primary" size="md" icon={LayoutDashboard}>
              Enterprise Cockpit
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};
