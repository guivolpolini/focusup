import type { Habit, HabitLog } from '../types';
import { formatDateToLocalYYYYMMDD } from './srsEngine';

export interface HabitProgressItem {
  habit: Habit;
  log?: HabitLog;
  completed: boolean;
  currentValue: number;
  targetValue: number;
  percent: number;
}

export interface HabitsDailyProgress {
  dateStr: string;
  totalScheduled: number;
  totalCompleted: number;
  progressPercent: number;
  items: HabitProgressItem[];
}

export interface HabitStreakResult {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
}

/**
 * Modelos iniciais opcionais para criação rápida de hábitos
 */
export const PRESET_HABIT_TEMPLATES: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'startDate' | 'isArchived'>[] = [
  {
    name: 'Ler 15 minutos',
    description: 'Leitura diária de livros técnicos, ficção ou artigos.',
    icon: 'book',
    color: '#6366f1',
    category: 'estudos',
    frequencyType: 'daily',
    targetType: 'numeric',
    targetValue: 15,
    unit: 'min',
    reminderTime: '21:00',
  },
  {
    name: 'Estudar inglês',
    description: 'Prática de vocabulário, escuta ou conversação.',
    icon: 'globe',
    color: '#06b6d4',
    category: 'estudos',
    frequencyType: 'times_per_week',
    frequencyTimesPerWeek: 3,
    targetType: 'numeric',
    targetValue: 20,
    unit: 'min',
    reminderTime: '18:00',
  },
  {
    name: 'Beber água (2 Litros)',
    description: 'Hidratação constante para manter clareza mental e energia.',
    icon: 'droplets',
    color: '#3b82f6',
    category: 'saude',
    frequencyType: 'daily',
    targetType: 'numeric',
    targetValue: 2000,
    unit: 'ml',
  },
  {
    name: 'Dormir no horário planejado',
    description: 'Higiene do sono para acordar revigorado e focado.',
    icon: 'moon',
    color: '#8b5cf6',
    category: 'saude',
    frequencyType: 'daily',
    targetType: 'boolean',
    targetValue: 1,
    unit: 'vez',
    reminderTime: '22:30',
  },
  {
    name: 'Alongar 5 minutos',
    description: 'Alongamento rápido para aliviar coluna e postura de estudos.',
    icon: 'heart',
    color: '#10b981',
    category: 'saude',
    frequencyType: 'specific_days',
    frequencyDays: [1, 2, 3, 4, 5], // Seg a Sex
    targetType: 'numeric',
    targetValue: 5,
    unit: 'min',
  },
  {
    name: 'Praticar programação',
    description: 'Resolver desafios de código ou codificar em projetos reais.',
    icon: 'code',
    color: '#f59e0b',
    category: 'produtividade',
    frequencyType: 'times_per_week',
    frequencyTimesPerWeek: 4,
    targetType: 'numeric',
    targetValue: 30,
    unit: 'min',
  },
  {
    name: 'Revisão dos estudos',
    description: 'Revisar flashcards pendentes ou anotações das aulas.',
    icon: 'check-square',
    color: '#ec4899',
    category: 'estudos',
    frequencyType: 'specific_days',
    frequencyDays: [1, 2, 3, 4, 5],
    targetType: 'boolean',
    targetValue: 1,
    unit: 'sessão',
    reminderTime: '20:00',
  },
];

/**
 * Verifica se um hábito está programado para ser executado em uma data específica
 */
export function isHabitScheduledForDate(habit: Habit, dateStr: string): boolean {
  // Não pode ser antes do início cadastrado
  if (habit.startDate && dateStr < habit.startDate) {
    return false;
  }

  if (habit.frequencyType === 'daily') {
    return true;
  }

  if (habit.frequencyType === 'specific_days') {
    if (!habit.frequencyDays || habit.frequencyDays.length === 0) {
      return true;
    }
    // Usar meio-dia para evitar shifts de fuso horário
    const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();
    return habit.frequencyDays.includes(dayOfWeek);
  }

  if (habit.frequencyType === 'times_per_week') {
    // Para hábitos com frequência N vezes por semana, o hábito está disponível para ser feito em qualquer dia
    return true;
  }

  return true;
}

/**
 * Busca log de um hábito em uma data
 */
export function getHabitLogForDate(logs: HabitLog[], habitId: string, dateStr: string): HabitLog | undefined {
  return logs.find((l) => l.habitId === habitId && l.date === dateStr);
}

/**
 * Calcula o status de cumprimento de um hábito em uma data
 */
export function getHabitStatusForDate(habit: Habit, log?: HabitLog): {
  completed: boolean;
  currentValue: number;
  targetValue: number;
  percent: number;
} {
  const targetValue = Math.max(1, habit.targetValue || 1);

  if (habit.targetType === 'numeric') {
    const currentValue = log?.currentValue ?? (log?.completed ? targetValue : 0);
    const completed = !!log?.completed || currentValue >= targetValue;
    const percent = Math.min(100, Math.round((currentValue / targetValue) * 100));

    return {
      completed,
      currentValue,
      targetValue,
      percent,
    };
  }

  // Boolean
  const completed = !!log?.completed;
  return {
    completed,
    currentValue: completed ? 1 : 0,
    targetValue: 1,
    percent: completed ? 100 : 0,
  };
}

/**
 * Calcula o progresso diário de todos os hábitos ativos programados para a data
 */
export function calculateHabitsDailyProgress(
  habits: Habit[],
  logs: HabitLog[],
  dateStr = formatDateToLocalYYYYMMDD(new Date())
): HabitsDailyProgress {
  const activeHabits = habits.filter((h) => !h.isArchived && isHabitScheduledForDate(h, dateStr));

  const items: HabitProgressItem[] = activeHabits.map((habit) => {
    const log = getHabitLogForDate(logs, habit.id, dateStr);
    const status = getHabitStatusForDate(habit, log);

    return {
      habit,
      log,
      ...status,
    };
  });

  const totalScheduled = items.length;
  const totalCompleted = items.filter((i) => i.completed).length;
  const progressPercent = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

  return {
    dateStr,
    totalScheduled,
    totalCompleted,
    progressPercent,
    items,
  };
}

/**
 * Retorna lista de datas (YYYY-MM-DD) em ordem decrescente entre duas datas
 */
function getDatesInRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const curr = new Date(`${endStr}T12:00:00`);
  const start = new Date(`${startStr}T12:00:00`);

  while (curr >= start) {
    dates.push(formatDateToLocalYYYYMMDD(curr));
    curr.setDate(curr.getDate() - 1);
  }

  return dates;
}

/**
 * Calcula a sequência atual (streak) e maior sequência histórica de um hábito
 */
export function calculateHabitStreak(
  habit: Habit,
  logs: HabitLog[],
  referenceDateStr = formatDateToLocalYYYYMMDD(new Date())
): HabitStreakResult {
  const completedLogDates = new Set(
    logs
      .filter((l) => l.habitId === habit.id && (l.completed || (habit.targetValue && (l.currentValue || 0) >= habit.targetValue)))
      .map((l) => l.date)
  );

  const totalCompletions = completedLogDates.size;

  if (totalCompletions === 0) {
    return { currentStreak: 0, longestStreak: 0, totalCompletions: 0 };
  }

  // Para hábitos semanais (times_per_week)
  if (habit.frequencyType === 'times_per_week') {
    return calculateWeeklyHabitStreak(habit, logs, referenceDateStr);
  }

  // Para hábitos diários ou em dias específicos (daily / specific_days)
  const startDateStr = habit.startDate || Array.from(completedLogDates).sort()[0];
  if (startDateStr > referenceDateStr) {
    return { currentStreak: 0, longestStreak: 0, totalCompletions };
  }

  // Gerar dias programados cronologicamente
  const allDates = getDatesInRange(startDateStr, referenceDateStr).reverse(); // Da mais antiga para a mais recente
  const scheduledDates = allDates.filter((d) => isHabitScheduledForDate(habit, d));

  if (scheduledDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalCompletions };
  }

  // Maior sequência histórica
  let longestStreak = 0;
  let runningStreak = 0;

  for (const d of scheduledDates) {
    if (completedLogDates.has(d)) {
      runningStreak++;
      if (runningStreak > longestStreak) {
        longestStreak = runningStreak;
      }
    } else {
      runningStreak = 0;
    }
  }

  // Sequência atual (streak)
  // Regra: se hoje está programado mas ainda não foi feito, não penaliza o streak e preserva o acumulado até ontem
  let currentStreak = 0;
  const isTodayScheduled = isHabitScheduledForDate(habit, referenceDateStr);
  const isTodayCompleted = completedLogDates.has(referenceDateStr);

  const scheduledReversed = [...scheduledDates].reverse();
  let startIndex = 0;

  if (isTodayScheduled && !isTodayCompleted) {
    // Pula o dia de hoje, avalia a partir do dia programado imediatamente anterior
    startIndex = 1;
  }

  for (let i = startIndex; i < scheduledReversed.length; i++) {
    const d = scheduledReversed[i];
    if (completedLogDates.has(d)) {
      currentStreak++;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalCompletions,
  };
}

/**
 * Calcula sequência para hábitos baseados em meta de vezes na semana
 */
function calculateWeeklyHabitStreak(
  habit: Habit,
  logs: HabitLog[],
  referenceDateStr: string
): HabitStreakResult {
  const targetTimes = Math.max(1, habit.frequencyTimesPerWeek || 1);
  const completedLogDates = new Set(
    logs
      .filter((l) => l.habitId === habit.id && (l.completed || (habit.targetValue && (l.currentValue || 0) >= habit.targetValue)))
      .map((l) => l.date)
  );

  const totalCompletions = completedLogDates.size;
  if (totalCompletions === 0) {
    return { currentStreak: 0, longestStreak: 0, totalCompletions: 0 };
  }

  // Mapear conclusões por semana (identificada pela segunda-feira 'YYYY-MM-DD')
  const completionsByWeek = new Map<string, number>();

  for (const dateStr of completedLogDates) {
    const d = new Date(`${dateStr}T12:00:00`);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const mondayStr = formatDateToLocalYYYYMMDD(monday);

    completionsByWeek.set(mondayStr, (completionsByWeek.get(mondayStr) || 0) + 1);
  }

  // Calcular semana de referência atual
  const refDate = new Date(`${referenceDateStr}T12:00:00`);
  const refDay = refDate.getDay();
  const refDiff = refDate.getDate() - refDay + (refDay === 0 ? -6 : 1);
  const currentMonday = new Date(refDate.setDate(refDiff));

  // Iterar semanas para trás
  let currentStreak = 0;
  const currentWeekCompletions = completionsByWeek.get(formatDateToLocalYYYYMMDD(currentMonday)) || 0;
  const isCurrentWeekMet = currentWeekCompletions >= targetTimes;

  const testMonday = new Date(currentMonday);
  if (!isCurrentWeekMet) {
    // Se a semana atual ainda não atingiu a meta, avalia a partir da semana passada
    testMonday.setDate(testMonday.getDate() - 7);
  }

  while (true) {
    const mStr = formatDateToLocalYYYYMMDD(testMonday);
    const count = completionsByWeek.get(mStr) || 0;
    if (count >= targetTimes) {
      currentStreak++;
      testMonday.setDate(testMonday.getDate() - 7);
    } else {
      break;
    }
  }

  // Maior sequência histórica de semanas
  const sortedMondays = Array.from(completionsByWeek.keys()).sort();
  let longestStreak = 0;
  let run = 0;

  for (const m of sortedMondays) {
    if ((completionsByWeek.get(m) || 0) >= targetTimes) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    totalCompletions,
  };
}

/**
 * Calcula taxa de conclusão de um hábito nos últimos N dias
 */
export function calculateHabitCompletionRate(
  habit: Habit,
  logs: HabitLog[],
  daysCount = 30,
  referenceDateStr = formatDateToLocalYYYYMMDD(new Date())
): number {
  const refDate = new Date(`${referenceDateStr}T12:00:00`);
  const startDate = new Date(refDate);
  startDate.setDate(startDate.getDate() - (daysCount - 1));
  const startStr = formatDateToLocalYYYYMMDD(startDate);

  // Considerar início do hábito
  const effectiveStartStr = habit.startDate && habit.startDate > startStr ? habit.startDate : startStr;
  if (effectiveStartStr > referenceDateStr) return 0;

  const dates = getDatesInRange(effectiveStartStr, referenceDateStr);
  const scheduledDates = dates.filter((d) => isHabitScheduledForDate(habit, d));

  if (scheduledDates.length === 0) return 0;

  const completedCount = scheduledDates.filter((d) => {
    const l = getHabitLogForDate(logs, habit.id, d);
    return getHabitStatusForDate(habit, l).completed;
  }).length;

  return Math.round((completedCount / scheduledDates.length) * 100);
}
