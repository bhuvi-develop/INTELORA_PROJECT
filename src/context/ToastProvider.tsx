import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastContext, type Toast, type ToastContextValue, type ToastVariant } from '@/context/contexts';
import { cn } from '@/lib/cn';

const VARIANT_STYLE: Record<ToastVariant, { icon: typeof Info; ring: string; iconClass: string }> = {
  info: { icon: Info, ring: 'ring-brand-400/30', iconClass: 'text-brand-300' },
  success: { icon: CheckCircle2, ring: 'ring-emerald-400/30', iconClass: 'text-emerald-300' },
  warning: { icon: AlertTriangle, ring: 'ring-amber-400/30', iconClass: 'text-amber-300' },
  error: { icon: XCircle, ring: 'ring-rose-400/30', iconClass: 'text-rose-300' },
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastContextValue['push']>(
    (input) => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      const toast: Toast = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant,
        duration: input.duration ?? 5_000,
      };
      setToasts((prev) => [...prev.slice(-3), toast]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), toast.duration),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ title, description, variant: 'success' }),
      error: (title, description) => push({ title, description, variant: 'error' }),
      info: (title, description) => push({ title, description, variant: 'info' }),
      warning: (title, description) => push({ title, description, variant: 'warning' }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2.5"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const style = VARIANT_STYLE[toast.variant];
            const Icon = style.icon;
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  'pointer-events-auto flex items-start gap-3 rounded-xl border border-overlay/10 bg-ink-800/95 p-3.5 shadow-raised ring-1 backdrop-blur-xl',
                  style.ring,
                )}
                role="status"
              >
                <Icon className={cn('mt-0.5 h-4.5 w-4.5 shrink-0', style.iconClass)} size={18} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-fg">{toast.title}</p>
                  {toast.description ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{toast.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="-mr-1 -mt-1 rounded-md p-1 text-fg-dim transition-colors hover:bg-overlay/5 hover:text-fg"
                  aria-label="Dismiss notification"
                >
                  <X size={14} aria-hidden />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
