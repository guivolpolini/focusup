import { useEffect, useState } from 'react';
import { CheckCircle2, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import {
  type ActiveTimerState,
  calculateTimerProgress,
} from '../lib/timerEngine';
import { sendLocalNotification } from '../lib/notificationEngine';
import type { SessionMode, Subject } from '../types';

function useTimerNow(isRunning: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  return isRunning ? now : Date.now();
}

/**
 * Componente invisível que monitora término de sessão ativa sem re-renderizar App.tsx.
 * Só executa intervalo de 1s quando o cronômetro está rodando.
 */
export function TimerCompletionWatcher({ timerState }: { timerState: ActiveTimerState }) {
  const isRunning = timerState.status === 'running';
  const now = useTimerNow(isRunning);
  const [notifiedSessionStart, setNotifiedSessionStart] = useState<number | null>(null);

  const progress = calculateTimerProgress(timerState, now);

  useEffect(() => {
    if (
      isRunning &&
      progress.isFinished &&
      notifiedSessionStart !== timerState.startedAt
    ) {
      setNotifiedSessionStart(timerState.startedAt);
      void sendLocalNotification('Tempo Esgotado! FocusUp', {
        body: `Sua sessão de ${timerState.plannedMinutes} min foi concluída! Registre seu progresso.`,
        tag: 'focusup-timer-done',
      });
    }
  }, [
    isRunning,
    progress.isFinished,
    timerState.startedAt,
    timerState.plannedMinutes,
    notifiedSessionStart,
  ]);

  return null;
}

/**
 * Banner compacto no Dashboard quando há sessão em andamento ou pausada.
 * Isola o tick de 1s para não re-renderizar o resto do Dashboard.
 */
export function ActiveTimerBanner({
  timerState,
  onOpenFocus,
}: {
  timerState: ActiveTimerState;
  onOpenFocus: () => void;
}) {
  const now = useTimerNow(timerState.status === 'running');
  if (timerState.status === 'idle') return null;

  const progress = calculateTimerProgress(timerState, now);

  return (
    <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-5 rounded-3xl shadow-md flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[11px] uppercase tracking-widest font-extrabold text-indigo-200">
            Sessão de Foco {timerState.status === 'paused' ? 'Pausada' : 'Ativa'} ({timerState.mode})
          </span>
        </div>
        <div className="text-4xl font-mono font-black tracking-tight tabular-nums mt-1">
          {Math.floor(progress.remainingSeconds / 60)}:
          {String(progress.remainingSeconds % 60).padStart(2, '0')}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenFocus}
        className="bg-white text-indigo-700 font-black px-5 py-2.5 rounded-xl shadow-xs text-sm hover:bg-indigo-50 transition active:scale-95 cursor-pointer shrink-0"
      >
        Abrir Foco
      </button>
    </div>
  );
}

interface FocusTimerSectionProps {
  timerState: ActiveTimerState;
  subjects: Subject[];
  onPrepareTimer: (mode: SessionMode, customMinutes?: number, subjectId?: string) => void;
  onStartTimer: (mode?: SessionMode, customMinutes?: number) => void;
  onPauseTimer: () => void;
  onResumeTimer: () => void;
  onRestartTimer: () => void;
  onFinishSession: () => Promise<void>;
  onCancelSession: () => Promise<void>;
  onSelectSubject: (subjectId: string | undefined) => void;
}

export function FocusTimerSection({
  timerState,
  subjects,
  onPrepareTimer,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  onRestartTimer,
  onFinishSession,
  onCancelSession,
  onSelectSubject,
}: FocusTimerSectionProps) {
  const now = useTimerNow(timerState.status === 'running');
  const timerProgress = calculateTimerProgress(timerState, now);

  const minutesDisplay = Math.floor(timerProgress.remainingSeconds / 60);
  const secondsDisplay = String(timerProgress.remainingSeconds % 60).padStart(2, '0');

  return (
    <div className="max-w-xl mx-auto space-y-6 text-center">
      <header>
        <h2 className="text-2xl font-black text-slate-900">Timer de Foco</h2>
        <p className="text-xs text-slate-500 mt-1">
          Conclua a sessão para receber +XP e avançar seu nível de maestria.
        </p>
      </header>

      <div className="inline-flex p-1 bg-slate-200/80 rounded-2xl gap-1">
        <button
          type="button"
          onClick={() => onPrepareTimer('pomodoro', 25)}
          disabled={timerState.status === 'running'}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
            timerState.mode === 'pomodoro' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Pomodoro (25m)
        </button>
        <button
          type="button"
          onClick={() => onPrepareTimer('deep_work', 50)}
          disabled={timerState.status === 'running'}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
            timerState.mode === 'deep_work' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          Deep Work (50m)
        </button>
        <button
          type="button"
          onClick={() => onPrepareTimer('five_min', 5)}
          disabled={timerState.status === 'running'}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
            timerState.mode === 'five_min' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
          }`}
        >
          5 Minutos
        </button>
      </div>

      {/* Seletor de Matéria opcional */}
      {subjects.length > 0 && (
        <div className="max-w-xs mx-auto">
          <label htmlFor="focus-subject-select" className="sr-only">
            Matéria da sessão
          </label>
          <select
            id="focus-subject-select"
            value={timerState.subjectId || ''}
            disabled={timerState.status === 'running'}
            onChange={(e) => onSelectSubject(e.target.value || undefined)}
            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
          >
            <option value="">Sessão livre (sem matéria)</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Mostrador Principal */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex justify-center">
          <div className="relative w-64 h-64 rounded-full border-8 border-slate-100 flex flex-col items-center justify-center bg-slate-50/50">
            <div className="text-5xl font-mono font-black tracking-tight tabular-nums text-slate-900">
              {minutesDisplay}:{secondsDisplay}
            </div>
            <div className="text-xs font-bold text-indigo-600 mt-2 uppercase tracking-widest flex items-center gap-1.5">
              {timerState.status === 'running' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Em Foco
                </>
              ) : timerState.status === 'paused' ? (
                'Pausado'
              ) : (
                'Pronto para o Estudo'
              )}
            </div>
            {timerState.status !== 'idle' && (
              <div className="text-[11px] font-semibold text-slate-400 tabular-nums mt-1">
                {timerProgress.progressPercentage}% concluído
              </div>
            )}
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {timerState.status === 'idle' ? (
            <>
              <button
                type="button"
                onClick={() => onStartTimer(timerState.mode, timerState.plannedMinutes)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-2xl font-black shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-white" />
                Iniciar
              </button>
              <button
                type="button"
                onClick={onRestartTimer}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3.5 rounded-2xl font-bold transition active:scale-95 cursor-pointer"
                title="Recomeçar do início"
              >
                <RotateCcw className="w-4 h-4 text-indigo-600" />
                Recomeçar
              </button>
            </>
          ) : timerState.status === 'running' ? (
            <>
              <button
                type="button"
                onClick={onPauseTimer}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl font-bold transition active:scale-95 cursor-pointer"
                title="Pausar"
              >
                <Pause className="w-5 h-5 fill-current" />
                Pausar
              </button>
              <button
                type="button"
                onClick={onRestartTimer}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl font-bold transition active:scale-95 cursor-pointer"
                title="Recomeçar do início"
              >
                <RotateCcw className="w-4 h-4 text-indigo-600" />
                Recomeçar
              </button>
              <button
                type="button"
                onClick={() => void onFinishSession()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-2xl font-black shadow-sm transition active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                Concluir (+XP)
              </button>
              <button
                type="button"
                onClick={() => void onCancelSession()}
                aria-label="Cancelar sessão"
                className="p-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-95 cursor-pointer"
                title="Cancelar"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onResumeTimer}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl font-black shadow-sm transition active:scale-95 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-white" />
                Retomar
              </button>
              <button
                type="button"
                onClick={onRestartTimer}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl font-bold transition active:scale-95 cursor-pointer"
                title="Recomeçar do início"
              >
                <RotateCcw className="w-4 h-4 text-indigo-600" />
                Recomeçar
              </button>
              <button
                type="button"
                onClick={() => void onFinishSession()}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-2xl font-black shadow-sm transition active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                Concluir (+XP)
              </button>
              <button
                type="button"
                onClick={() => void onCancelSession()}
                aria-label="Cancelar sessão"
                className="p-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-95 cursor-pointer"
                title="Cancelar"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
