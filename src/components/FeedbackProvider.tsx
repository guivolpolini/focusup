import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (accepted: boolean) => void;
}

interface FeedbackContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (type: ToastType, message: string) => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      const duration = type === 'error' ? 5000 : 3400;
      const timer = setTimeout(() => {
        dismissToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const normalized: ConfirmOptions =
      typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setPendingConfirm({ ...normalized, resolve });
    });
  }, []);

  const handleConfirmChoice = useCallback(
    (accepted: boolean) => {
      if (!pendingConfirm) return;
      const { resolve } = pendingConfirm;
      setPendingConfirm(null);
      resolve(accepted);
    },
    [pendingConfirm]
  );

  useEffect(() => {
    if (!pendingConfirm) return;
    cancelBtnRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleConfirmChoice(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingConfirm, handleConfirmChoice]);

  const value = useMemo<FeedbackContextValue>(
    () => ({
      toast: {
        success: (msg: string) => pushToast('success', msg),
        error: (msg: string) => pushToast('error', msg),
        info: (msg: string) => pushToast('info', msg),
      },
      confirm,
    }),
    [pushToast, confirm]
  );

  return (
    <FeedbackContext value={value}>
      {children}

      {/* Pilha de Toasts acessível */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-24 md:bottom-6 right-4 left-4 sm:left-auto sm:w-96 z-[90] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((item) => {
          const styles =
            item.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-50 border-emerald-700/60'
              : item.type === 'error'
                ? 'bg-rose-950/95 text-rose-50 border-rose-700/60'
                : 'bg-slate-900/95 text-slate-50 border-slate-700/60';
          const Icon =
            item.type === 'success'
              ? CheckCircle2
              : item.type === 'error'
                ? XCircle
                : Info;

          return (
            <div
              key={item.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-2xl border shadow-lg backdrop-blur-md text-xs sm:text-sm font-semibold animate-fade-in ${styles}`}
            >
              <Icon className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-line leading-snug">{item.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(item.id)}
                aria-label="Fechar aviso"
                className="p-0.5 rounded-lg opacity-70 hover:opacity-100 transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Diálogo de Confirmação Acessível (substitui window.confirm) */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => handleConfirmChoice(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="focusup-confirm-title"
            aria-describedby="focusup-confirm-desc"
            className="bg-white w-full max-w-md rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                  pendingConfirm.destructive
                    ? 'bg-rose-50 border-rose-200 text-rose-600'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-600'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3
                  id="focusup-confirm-title"
                  className="text-base font-extrabold text-slate-900"
                >
                  {pendingConfirm.title || 'Confirmar ação'}
                </h3>
                <p
                  id="focusup-confirm-desc"
                  className="text-sm text-slate-600 mt-1 whitespace-pre-line leading-relaxed"
                >
                  {pendingConfirm.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={() => handleConfirmChoice(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer"
              >
                {pendingConfirm.cancelLabel || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmChoice(true)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white transition cursor-pointer ${
                  pendingConfirm.destructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {pendingConfirm.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = use(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback deve ser usado dentro de <FeedbackProvider>');
  }
  return ctx;
}
