import { motion } from 'framer-motion';
import { APP } from '@/config/env';
import { LogoMark } from '@/components/common/Logo';

/* ───────────────────────────────────────────────────────────────────────────
 * The empty workspace.
 *
 * What the operator sees when the application opens: the identity, and an
 * instruction. No dashboard is loaded, no figures are fetched for a screen
 * nobody asked for, and no module claims to be the default.
 *
 * Deliberately quiet. This is the one surface in the product with nothing to
 * report, and filling it with summary tiles would make the choice of module
 * feel like a detour rather than the first decision.
 * ─────────────────────────────────────────────────────────────────────────── */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const WelcomeScreen = () => (
  <div className="relative flex min-h-[calc(100vh-var(--chrome-h,4.5rem))] items-center justify-center px-6 py-16">
    {/* A single wash behind the mark, matching the opening sequence. */}
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/[0.07] blur-[140px]" />
    </div>

    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className="relative flex max-w-xl flex-col items-center text-center"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.88, rotateX: 16 }}
        animate={{ opacity: 1, scale: 1, rotateX: 0 }}
        transition={{ duration: 0.9, ease: EASE_OUT }}
        style={{ perspective: 700 }}
      >
        <LogoMark size={76} animated />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: EASE_OUT }}
        className="mt-9 text-[2rem] font-semibold leading-none tracking-[0.26em] text-fg sm:text-[2.4rem]"
        style={{ paddingLeft: '0.26em' }}
      >
        {APP.name}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.26, ease: EASE_OUT }}
        className="mt-4 text-[12px] font-medium uppercase tracking-[0.36em] text-fg-faint"
        style={{ paddingLeft: '0.36em' }}
      >
        {APP.tagline}
      </motion.p>

      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4, ease: EASE_OUT }}
        className="mt-10 h-px w-40 bg-gradient-to-r from-transparent via-line to-transparent"
        aria-hidden
      />

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5, ease: EASE_OUT }}
        className="mt-10 text-[13.5px] leading-relaxed text-fg-muted"
      >
        Select a module from the left navigation to begin.
      </motion.p>
    </motion.div>
  </div>
);
