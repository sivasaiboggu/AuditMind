import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { Toast } from '../hooks/useToast';

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info } as const;

const tones = {
  success: 'text-risk-low',
  error: 'text-risk-critical',
  info: 'text-accent-cyan',
} as const;

/** Renders toasts produced by `useToast` as a fixed bottom-right stack. */
export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="glass-panel pointer-events-auto flex items-start gap-3 rounded-lg border border-overlay/10 p-3.5 shadow-xl"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tones[toast.type]}`} />
              <p className="min-w-0 flex-1 text-sm leading-snug text-text-primary">
                {toast.message}
              </p>
              <button
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
