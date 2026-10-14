import type {
  GymWorkout,
  GymWorkoutExerciseLog,
  ActiveWorkoutState,
} from '../types';
import { formatDateToLocalYYYYMMDD, addDaysToDate } from './srsEngine';

export interface GymWeeklyStats {
  workoutsThisWeekCount: number;
  weeklyGoalDays: number;
  progressPercent: number;
  totalMinutesThisWeek: number;
  lastWorkout: GymWorkout | null;
  weeklyStreak: number; // Semanas consecutivas atingindo a meta
}

export interface ExercisePRRecord {
  exerciseId: string;
  maxWeightKg: number;
  maxRepsAtMaxWeight: number;
  maxSetVolumeKg: number;
  totalSetsCompleted: number;
  totalTimesPerformed: number;
  history: Array<{
    dateStr: string;
    startedAt: number;
    weightKg: number;
    reps: number;
    setVolume: number;
  }>;
}

const ACTIVE_WORKOUT_KEY = 'focusup_active_workout_state';

/**
 * Retorna as datas de início (Segunda 00:00:00) e fim (Domingo 23:59:59) da semana para uma dada data.
 */
export function getMondaySundayWeekRange(referenceDate: Date = new Date()): { start: Date; end: Date } {
  const d = new Date(referenceDate);
  const day = d.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  // Ajuste para Segunda ser o dia 0 da semana
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday, 0, 0, 0, 0);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * Calcula as estatísticas semanais de academia (treinos realizados, progresso na meta e streak de semanas).
 */
export function calculateGymWeeklyStats(
  workouts: GymWorkout[],
  weeklyGoalDays: number = 4,
  referenceDate: Date = new Date()
): GymWeeklyStats {
  const completedWorkouts = workouts.filter((w) => w.status === 'completed');

  // Último treino realizado
  const sortedWorkouts = [...completedWorkouts].sort((a, b) => b.startedAt - a.startedAt);
  const lastWorkout = sortedWorkouts[0] || null;

  // Semana Atual (Segunda a Domingo)
  const { start: currentWeekMonday, end: currentWeekSunday } = getMondaySundayWeekRange(referenceDate);

  const workoutsThisWeek = completedWorkouts.filter((w) => {
    return w.startedAt >= currentWeekMonday.getTime() && w.startedAt <= currentWeekSunday.getTime();
  });

  const workoutsThisWeekCount = workoutsThisWeek.length;
  const totalMinutesThisWeek = workoutsThisWeek.reduce((acc, w) => acc + (w.durationMinutes || 0), 0);
  const progressPercent = weeklyGoalDays > 0 ? Math.min(100, Math.round((workoutsThisWeekCount / weeklyGoalDays) * 100)) : 0;

  // Cálculo da Sequência Semanal (Streak de Semanas que atingiram a meta)
  let weeklyStreak = 0;
  const isCurrentWeekMet = workoutsThisWeekCount >= weeklyGoalDays;

  // Verificamos semana a semana retroativamente
  let checkMonday = new Date(currentWeekMonday);
  if (isCurrentWeekMet) {
    weeklyStreak++;
    checkMonday = addDaysToDate(checkMonday, -7);
  } else {
    // Semana corrente ainda não bateu a meta: checar se semana passada bateu
    checkMonday = addDaysToDate(checkMonday, -7);
  }

  // Percorrer até 52 semanas no passado
  for (let i = 0; i < 52; i++) {
    const weekStart = checkMonday.getTime();
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000 - 1;

    const countInPastWeek = completedWorkouts.filter(
      (w) => w.startedAt >= weekStart && w.startedAt <= weekEnd
    ).length;

    if (countInPastWeek >= weeklyGoalDays) {
      weeklyStreak++;
      checkMonday = addDaysToDate(checkMonday, -7);
    } else {
      break;
    }
  }

  return {
    workoutsThisWeekCount,
    weeklyGoalDays,
    progressPercent,
    totalMinutesThisWeek,
    lastWorkout,
    weeklyStreak,
  };
}

/**
 * Calcula o volume total (kg levantados) e o número de séries completadas.
 */
export function calculateWorkoutVolume(exercises: GymWorkoutExerciseLog[]): {
  totalVolumeKg: number;
  totalSetsCompleted: number;
} {
  let totalVolumeKg = 0;
  let totalSetsCompleted = 0;

  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed) {
        totalSetsCompleted++;
        const weight = Math.max(0, set.weightKg || 0);
        const reps = Math.max(0, set.reps || 0);
        totalVolumeKg += weight * reps;
      }
    }
  }

  return { totalVolumeKg, totalSetsCompleted };
}

/**
 * Extrai os Recordes Pessoais (PR) e histórico de progressão para um exercício.
 */
export function calculateExercisePRs(workouts: GymWorkout[], exerciseId: string): ExercisePRRecord {
  let maxWeightKg = 0;
  let maxRepsAtMaxWeight = 0;
  let maxSetVolumeKg = 0;
  let totalSetsCompleted = 0;
  let totalTimesPerformed = 0;
  const history: ExercisePRRecord['history'] = [];

  const completedWorkouts = workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => a.startedAt - b.startedAt);

  for (const w of completedWorkouts) {
    const exLog = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!exLog) continue;

    let hasCompletedSet = false;
    for (const set of exLog.sets) {
      if (set.completed && set.reps > 0) {
        hasCompletedSet = true;
        totalSetsCompleted++;
        const weight = Math.max(0, set.weightKg || 0);
        const reps = Math.max(0, set.reps || 0);
        const setVolume = weight * reps;

        if (weight > maxWeightKg) {
          maxWeightKg = weight;
          maxRepsAtMaxWeight = reps;
        } else if (weight === maxWeightKg && reps > maxRepsAtMaxWeight) {
          maxRepsAtMaxWeight = reps;
        }

        if (setVolume > maxSetVolumeKg) {
          maxSetVolumeKg = setVolume;
        }

        history.push({
          dateStr: formatDateToLocalYYYYMMDD(new Date(w.startedAt)),
          startedAt: w.startedAt,
          weightKg: weight,
          reps,
          setVolume,
        });
      }
    }

    if (hasCompletedSet) {
      totalTimesPerformed++;
    }
  }

  return {
    exerciseId,
    maxWeightKg,
    maxRepsAtMaxWeight,
    maxSetVolumeKg,
    totalSetsCompleted,
    totalTimesPerformed,
    history,
  };
}

export interface PreviousSetPerformance {
  weightKg: number;
  reps: number;
  dateStr: string;
}

/**
 * Encontra a carga e repetições da série do treino anterior para o mesmo exercício.
 */
export function getPreviousPerformanceForSet(
  workouts: GymWorkout[],
  exerciseId: string,
  setIndex: number
): PreviousSetPerformance | null {
  const completed = workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => b.startedAt - a.startedAt);

  for (const w of completed) {
    const exLog = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!exLog) continue;

    const validSets = exLog.sets.filter((s) => s.completed && s.reps > 0);
    if (validSets.length === 0) continue;

    const targetSet = validSets[setIndex] || validSets[validSets.length - 1];
    return {
      weightKg: targetSet.weightKg,
      reps: targetSet.reps,
      dateStr: formatDateToLocalYYYYMMDD(new Date(w.startedAt)),
    };
  }

  return null;
}

/**
 * Emite bipe sonoro melódico via Web Audio API (sem dependência de arquivos externos)
 */
export function playGymRestSound(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Primeiro tom (Lá - 880 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Segundo tom mais agudo (Ré - 1174 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174, now + 0.15);
    gain2.gain.setValueAtTime(0.2, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.4);
  } catch {
    // Silencioso se áudio não permitido ou indisponível
  }
}

/**
 * Dispara vibração tátil no dispositivo móvel
 */
export function triggerGymVibration(pattern: number[] = [200, 100, 300]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silencioso
  }
}

/**
 * Calcula o tempo de descanso restante com base no timestamp de início e duração.
 * Resiliente a recarregamentos de página (100% determinístico).
 */
export function getRemainingRestSeconds(
  startedAt: number,
  durationSeconds: number,
  now: number = Date.now()
): number {
  const elapsedSeconds = Math.floor((now - startedAt) / 1000);
  const remaining = durationSeconds - elapsedSeconds;
  return Math.max(0, remaining);
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

/**
 * Persistência local do treino em andamento (resiliente a recarregamento).
 */
export function saveActiveWorkoutState(state: ActiveWorkoutState): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(state));
    }
  } catch (err) {
    console.warn('Falha ao salvar treino ativo no localStorage:', err);
  }
}

export function loadActiveWorkoutState(): ActiveWorkoutState | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(ACTIVE_WORKOUT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearActiveWorkoutState(): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.removeItem(ACTIVE_WORKOUT_KEY);
    }
  } catch {
    // Ignorar erro
  }
}
