import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { Toast } from '../hooks/useToast';

const appearances = {
  success: { Icon: CheckCircle2, tone: 'text-risk-low' },
  error: { Icon: AlertTriangle, tone: 'text-risk-critical' },
  info: { Icon: Info, tone: 'text-accent-brand' },
};

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const { Icon, tone } = appearances[toast.type];
        return (
          <div key={toast.id} className="sheet animate-fade-in pointer-events-auto flex items-center gap-3 p-3 shadow-floating">
            <Icon className={`size-5 shrink-0 ${tone}`} aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm">{toast.message}</p>
            <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification" className="icon-control">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
