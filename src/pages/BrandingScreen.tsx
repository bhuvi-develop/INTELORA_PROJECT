import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { APP } from '@/config/env';
import { PATHS } from '@/routes/paths';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { LogoMark } from '@/components/common/Logo';

/* ───────────────────────────────────────────────────────────────────────────
 * Branding screen.
 *
 * The mark and the wordmark, nothing else. No progress, no percentage, no
 * initialisation copy, no version footer — the application is already running by
 * the time this paints, so anything implying work in progress would be theatre.
 *
 * It holds for 1.2 s, fades, and hands off to the dashboard. Reduced-motion
 * users skip it entirely rather than watching a static hold for no reason.
 * ─────────────────────────────────────────────────────────────────────────── */

const HOLD_MS = 1_200;
const FADE_MS = 420;

export const BrandingScreen = () => {
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      navigate(PATHS.cockpit, { replace: true });
      return;
    }

    const fade = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const go = window.setTimeout(() => navigate(PATHS.cockpit, { replace: true }), HOLD_MS + FADE_MS);

    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(go);
    };
  }, [navigate, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950">
      {/* A single soft blue bloom behind the mark. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/[0.13] blur-[130px]" />
        <div className="absolute left-1/2 top-1/2 h-[16rem] w-[16rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/[0.09] blur-[70px]" />
      </div>

      <AnimatePresence>
        {!leaving ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(8px)', scale: 1.03 }}
            transition={{ duration: FADE_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center"
          >
            {/* ─── Mark ─────────────────────────────────────────────────────
             * Depth comes from three stacked layers rather than a filter: a
             * blurred colour bloom beneath, the mark itself, and a bevelled
             * glass plate above with a specular sweep.
             * ───────────────────────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.86, y: 10, rotateX: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 0.78, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
              style={{ perspective: 800 }}
            >
              {/* Bloom cast by the mark. */}
              <div
                className="absolute inset-0 -z-10 scale-125 rounded-[2rem] bg-brand-500/45 blur-3xl"
                aria-hidden
              />

              <div
                className="relative rounded-[1.65rem] p-[1.5px]"
                style={{
                  /* Bevel: a bright top-left edge falling to a dark bottom-right,
                   * which is what reads as a machined metal rim. */
                  background:
                    'linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 38%, rgba(0,0,0,0.5) 100%)',
                  boxShadow:
                    '0 28px 70px -20px rgba(61,142,240,0.55), 0 8px 24px -10px rgba(0,0,0,0.85), inset 0 1px 1px rgba(255,255,255,0.35)',
                }}
              >
                <div
                  className="relative overflow-hidden rounded-[1.55rem] p-7"
                  style={{
                    background:
                      'linear-gradient(160deg, #17233a 0%, #0d1524 46%, #070c16 100%)',
                  }}
                >
                  {/* Glass highlight across the upper third. */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[1.5rem]"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 60%, transparent 100%)',
                    }}
                    aria-hidden
                  />

                  {/* Specular sweep — one pass, then it is gone. */}
                  <div
                    className="animate-brand-sheen pointer-events-none absolute inset-y-0 -left-1/2 w-1/2"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    }}
                    aria-hidden
                  />

                  <LogoMark size={84} className="relative" />
                </div>
              </div>
            </motion.div>

            {/* ─── Wordmark ────────────────────────────────────────────────
             * Metallic by gradient fill rather than by texture: a bright core
             * between two darker stops gives the impression of a polished edge
             * catching light, and it stays crisp at any size.
             * ─────────────────────────────────────────────────────────── */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.66, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative mt-8 select-none text-[2.25rem] font-semibold leading-none tracking-[0.34em] sm:text-[2.75rem]"
              style={{
                backgroundImage:
                  'linear-gradient(180deg, #ffffff 0%, #cfe0f8 38%, #7fa9e0 62%, #dce9fb 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                /* A faint dark cast under the glyphs gives the metal a body. */
                filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.55)) drop-shadow(0 0 22px rgba(61,142,240,0.4))',
              }}
            >
              {APP.name}
            </motion.p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
