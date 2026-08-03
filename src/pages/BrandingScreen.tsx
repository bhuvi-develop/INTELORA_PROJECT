import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { APP } from '@/config/env';
import { PATHS } from '@/routes/paths';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';

const HOLD_MS = 2_600;
const FADE_MS = 520;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** A single-brand opening sequence: no progress copy, subtitle, or metadata. */
export const BrandingScreen = () => {
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      navigate(PATHS.workspace, { replace: true });
      return;
    }

    const fade = window.setTimeout(() => setLeaving(true), HOLD_MS);
    const go = window.setTimeout(() => navigate(PATHS.workspace, { replace: true }), HOLD_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(go);
    };
  }, [navigate, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <AnimatePresence>
      {!leaving ? (
        <motion.div
          key="branding"
          exit={{ opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: FADE_MS / 1000, ease: EASE_OUT }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink-950"
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 2, ease: EASE_OUT }}
              className="absolute left-1/2 top-1/2 h-[50rem] w-[50rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/[0.25] blur-[160px]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-950/40 to-ink-950/90 backdrop-blur-[2px]" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9, filter: 'blur(12px)' }}
            animate={{ opacity: 1, y: 0, scale: 1.05, filter: 'blur(0px)' }}
            transition={{ duration: HOLD_MS / 1000, ease: 'easeOut' }}
            className="relative z-10 glass px-20 py-14 rounded-[3rem] shadow-[0_20px_80px_-15px_rgba(0,110,230,0.4)] border border-white/10 overflow-hidden backdrop-blur-3xl"
          >
            {/* Shimmer / Light Reflection */}
            <motion.div
              initial={{ x: '-150%' }}
              animate={{ x: '250%' }}
              transition={{ duration: 1.8, delay: 0.6, ease: 'easeInOut' }}
              className="absolute inset-0 z-20 w-[150%] -skew-x-[30deg] bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none"
              aria-hidden
            />

            <h1
              className="relative z-10 bg-gradient-to-b from-[#ffffff] via-[#cde3ff] to-[#005ac8] bg-clip-text text-[3rem] font-black uppercase leading-none tracking-[0.45em] text-transparent sm:text-[4.5rem]"
              style={{
                paddingLeft: '0.45em',
                textShadow: '0px 1px 1px rgba(255,255,255,0.7), 0px 2px 0px #004499, 0px 3px 0px #003377, 0px 4px 0px #002255, 0px 5px 0px #001133, 0px 12px 30px rgba(0,110,230,0.7), 0px 24px 48px rgba(0,0,0,0.9)'
              }}
            >
              {APP.name}
            </h1>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
