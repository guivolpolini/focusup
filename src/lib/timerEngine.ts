import type { SessionMode } from '../types';

export interface ActiveTimerState {
  status: 'idle' | 'running' | 'paused' | 'break';
  mode: SessionMode;
  plannedMinutes: number;
  startedAt: number; // UTC timestamp em milissegundos
  pausedAt?: number;
  accumulatedPausedMs: number;
  subjectId?: string;
  taskId?: string;
  learningPathId?: string;
  lessonId?: string;
  isBreak: boolean;
}

const TIMER_STORAGE_KEY = 'focusup_active_timer_v1';

/**
 * Calcula os segundos restantes e os segundos já estudados a partir do timestamp real
 * Protegido contra suspensão de abas ou recarregamento de página
 */
export function calculateTimerProgress(state: ActiveTimerState, now: number = Date.now()) {
  const totalPlannedMs = state.plannedMinutes * 60 * 1000;

  let elapsedMs = 0;

  if (state.status === 'running' || state.status === 'break') {
    elapsedMs = now - state.startedAt - state.accumulatedPausedMs;
  } else if (state.status === 'paused' && state.pausedAt) {
    elapsedMs = state.pausedAt - state.startedAt - state.accumulatedPausedMs;
  }

  // Não permitir tempo negativo
  elapsedMs = Math.max(0, elapsedMs);

  const remainingMs = Math.max(0, totalPlannedMs - elapsedMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const actualStudiedSeconds = Math.min(
    state.plannedMinutes * 60,
    Math.floor(elapsedMs / 1000)
  );
  const isFinished = elapsedMs >= totalPlannedMs;

  return {
    remainingSeconds,
    actualStudiedSeconds,
    isFinished,
    progressPercentage: Math.min(100, Math.round((elapsedMs / totalPlannedMs) * 100)),
  };
}

export function saveTimerState(state: ActiveTimerState) {
  try {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Falha ao salvar estado do cronômetro:', err);
  }
}

export function loadTimerState(): ActiveTimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveTimerState;
  } catch {
    return null;
  }
}

export function clearTimerState() {
  try {
    localStorage.removeItem(TIMER_STORAGE_KEY);
  } catch (err) {
    console.error('Falha ao limpar cronômetro:', err);
  }
}
