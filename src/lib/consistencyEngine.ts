import type { StudySession, Task } from '../types';
import { formatDateToLocalYYYYMMDD, addDaysToDate } from './srsEngine';

export type ConsistencyPeriod = '30d' | '90d' | '12m';

export interface DayActivityData {
  dateStr: string; // 'YYYY-MM-DD'
  date: Date;
  dayOfWeek: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  totalStudiedSeconds: number;
  totalStudiedMinutes: number;
  completedSessionsCount: number;
  completedTasks: Array<{ id: string; title: string; completedAt?: number }>;
  isActive: boolean;
  isGoalMet: boolean;
  intensityLevel: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
  isFuture: boolean;
}

export interface ConsistencyStats {
  activeDaysCount: number;
  totalDaysInPeriod: number;
  currentStreak: number;
  longestStreak: number;
  consistencyRate: number; // 0 - 100%
  monthStudiedMinutes: number;
  periodStudiedMinutes: number;
}

export interface MonthHeaderLabel {
  name: string;
  weekIndex: number;
}

export interface ConsistencyCalendarResult {
  period: ConsistencyPeriod;
  weeks: (DayActivityData | null)[][]; // 7 linhas x N semanas (semanas[coluna][linha])
  months: MonthHeaderLabel[];
  dayMap: Record<string, DayActivityData>;
  stats: ConsistencyStats;
  todayStr: string;
}

const MONTH_NAMES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

/**
 * Calcula a intensidade da cor do dia com base no tempo de estudo.
 * 0: 0m (neutro)
 * 1: 1 a 29m (leve)
 * 2: 30 a 59m (moderado)
 * 3: 60 a 119m (intenso)
 * 4: 120m+ (máximo)
 */
export function calculateIntensityLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

/**
 * Agrupa sessões e tarefas por data local 'YYYY-MM-DD'
 */
export function groupActivityByDay(
  sessions: StudySession[],
  tasks: Task[],
  dailyGoalMinutes: number,
  referenceDate: Date = new Date()
): Record<string, DayActivityData> {
  const dayMap: Record<string, DayActivityData> = {};
  const todayStr = formatDateToLocalYYYYMMDD(referenceDate);

  // 1. Processar Sessões Concluídas Válidas (>= 60s)
  for (const s of sessions) {
    if (s.status !== 'completed' || s.actualDurationSeconds < 60) continue;
    const sessionDate = new Date(s.startedAt);
    const dateStr = formatDateToLocalYYYYMMDD(sessionDate);

    if (!dayMap[dateStr]) {
      const d = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
      dayMap[dateStr] = {
        dateStr,
        date: d,
        dayOfWeek: d.getDay(),
        totalStudiedSeconds: 0,
        totalStudiedMinutes: 0,
        completedSessionsCount: 0,
        completedTasks: [],
        isActive: false,
        isGoalMet: false,
        intensityLevel: 0,
        isToday: dateStr === todayStr,
        isFuture: dateStr > todayStr,
      };
    }

    dayMap[dateStr].totalStudiedSeconds += s.actualDurationSeconds;
    dayMap[dateStr].completedSessionsCount += 1;
  }

  // 2. Processar Tarefas Concluídas
  for (const t of tasks) {
    if (t.status !== 'completed' || !t.completedAt) continue;
    const taskDate = new Date(t.completedAt);
    const dateStr = formatDateToLocalYYYYMMDD(taskDate);

    if (!dayMap[dateStr]) {
      const d = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
      dayMap[dateStr] = {
        dateStr,
        date: d,
        dayOfWeek: d.getDay(),
        totalStudiedSeconds: 0,
        totalStudiedMinutes: 0,
        completedSessionsCount: 0,
        completedTasks: [],
        isActive: false,
        isGoalMet: false,
        intensityLevel: 0,
        isToday: dateStr === todayStr,
        isFuture: dateStr > todayStr,
      };
    }

    dayMap[dateStr].completedTasks.push({
      id: t.id,
      title: t.title,
      completedAt: t.completedAt,
    });
  }

  // 3. Consolidar minutos, metas e status ativo
  for (const dateStr of Object.keys(dayMap)) {
    const entry = dayMap[dateStr];
    entry.totalStudiedMinutes = Math.floor(entry.totalStudiedSeconds / 60);
    entry.isGoalMet = dailyGoalMinutes > 0 && entry.totalStudiedMinutes >= dailyGoalMinutes;
    // Ativo se completou pelo menos 1 sessão de estudo válida OU atingiu a meta diária configurada
    entry.isActive = entry.completedSessionsCount > 0 || entry.isGoalMet;
    entry.intensityLevel = calculateIntensityLevel(entry.totalStudiedMinutes);
  }

  return dayMap;
}

/**
 * Calcula a sequência atual e maior sequência histórica a partir do mapa de dias ativos.
 */
export function calculateStreaks(
  dayMap: Record<string, DayActivityData>,
  referenceDate: Date = new Date()
): { currentStreak: number; longestStreak: number } {
  const todayStr = formatDateToLocalYYYYMMDD(referenceDate);
  const yesterday = addDaysToDate(referenceDate, -1);
  const yesterdayStr = formatDateToLocalYYYYMMDD(yesterday);

  // 1. Sequência Atual
  let currentStreak = 0;
  const todayEntry = dayMap[todayStr];
  const yesterdayEntry = dayMap[yesterdayStr];

  let checkDate: Date;
  if (todayEntry && todayEntry.isActive) {
    // Hoje já é ativo: contar a partir de hoje
    checkDate = new Date(referenceDate);
    while (true) {
      const dStr = formatDateToLocalYYYYMMDD(checkDate);
      const entry = dayMap[dStr];
      if (entry && entry.isActive) {
        currentStreak++;
        checkDate = addDaysToDate(checkDate, -1);
      } else {
        break;
      }
    }
  } else if (yesterdayEntry && yesterdayEntry.isActive) {
    // Hoje ainda não é ativo, mas ontem foi: preserva sequência até ontem
    checkDate = new Date(yesterday);
    while (true) {
      const dStr = formatDateToLocalYYYYMMDD(checkDate);
      const entry = dayMap[dStr];
      if (entry && entry.isActive) {
        currentStreak++;
        checkDate = addDaysToDate(checkDate, -1);
      } else {
        break;
      }
    }
  } else {
    currentStreak = 0;
  }

  // 2. Maior Sequência Histórica (Longest Streak)
  // Obter todas as datas com atividade ordenadas cronologicamente
  const activeDates = Object.keys(dayMap)
    .filter((dStr) => dayMap[dStr].isActive)
    .sort();

  let longestStreak = 0;
  let currentRun = 0;
  let prevDate: Date | null = null;

  for (const dStr of activeDates) {
    const [y, m, d] = dStr.split('-').map(Number);
    const currentDate = new Date(y, m - 1, d);

    if (!prevDate) {
      currentRun = 1;
    } else {
      // Diferença em dias
      const diffMs = currentDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentRun++;
      } else if (diffDays === 0) {
        // Mesmo dia (não deve acontecer com Set/chaves únicas, mas salvaguarda)
      } else {
        currentRun = 1;
      }
    }

    if (currentRun > longestStreak) {
      longestStreak = currentRun;
    }
    prevDate = currentDate;
  }

  // Garantir que a maior sequência histórica seja pelo menos a atual
  longestStreak = Math.max(longestStreak, currentStreak);

  return { currentStreak, longestStreak };
}

/**
 * Gera os dados completos do Calendário de Consistência (Semanas x Dias e Estatísticas)
 */
export function generateConsistencyCalendar(
  sessions: StudySession[],
  tasks: Task[],
  dailyGoalMinutes: number = 120,
  period: ConsistencyPeriod = '12m',
  referenceDate: Date = new Date()
): ConsistencyCalendarResult {
  const dayMap = groupActivityByDay(sessions, tasks, dailyGoalMinutes, referenceDate);
  const todayStr = formatDateToLocalYYYYMMDD(referenceDate);
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  // Definir número de semanas e início do intervalo
  let totalWeeks = 53; // ~12 meses (365 dias)
  if (period === '30d') totalWeeks = 5; // ~35 dias
  else if (period === '90d') totalWeeks = 14; // ~98 dias

  // O último dia da grade é o sábado da semana atual (para completar a coluna) ou hoje
  // Alinhamos o início do grid no Domingo da primeira semana
  const dayOfWeekToday = today.getDay(); // 0 = Domingo ... 6 = Sábado
  const daysFromSunday = dayOfWeekToday;
  const currentWeekSunday = addDaysToDate(today, -daysFromSunday);

  // Data inicial (Domingo da primeira semana exibida)
  const startDate = addDaysToDate(currentWeekSunday, -(totalWeeks - 1) * 7);

  const weeks: (DayActivityData | null)[][] = [];
  const months: MonthHeaderLabel[] = [];
  let lastLabeledMonth = -1;

  let activeDaysCount = 0;
  let totalDaysInPeriod = 0;
  let periodStudiedMinutes = 0;
  let monthStudiedMinutes = 0;

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  for (let w = 0; w < totalWeeks; w++) {
    const weekDays: (DayActivityData | null)[] = [];
    const weekSunday = addDaysToDate(startDate, w * 7);

    // Identificar rótulo do mês no início da semana
    const firstDayOfWeekMonth = weekSunday.getMonth();
    if (firstDayOfWeekMonth !== lastLabeledMonth) {
      months.push({
        name: MONTH_NAMES_PT[firstDayOfWeekMonth],
        weekIndex: w,
      });
      lastLabeledMonth = firstDayOfWeekMonth;
    }

    for (let d = 0; d < 7; d++) {
      const curDate = addDaysToDate(weekSunday, d);
      const dStr = formatDateToLocalYYYYMMDD(curDate);
      const isFuture = curDate > today;
      const isToday = dStr === todayStr;

      let entry = dayMap[dStr];
      if (!entry) {
        entry = {
          dateStr: dStr,
          date: curDate,
          dayOfWeek: curDate.getDay(),
          totalStudiedSeconds: 0,
          totalStudiedMinutes: 0,
          completedSessionsCount: 0,
          completedTasks: [],
          isActive: false,
          isGoalMet: false,
          intensityLevel: 0,
          isToday,
          isFuture,
        };
        dayMap[dStr] = entry;
      } else {
        entry.isToday = isToday;
        entry.isFuture = isFuture;
      }

      weekDays.push(entry);

      // Contabilizar estatísticas do período (apenas dias até hoje)
      if (!isFuture) {
        totalDaysInPeriod++;
        if (entry.isActive) {
          activeDaysCount++;
        }
        periodStudiedMinutes += entry.totalStudiedMinutes;

        // Se for do mês corrente
        if (curDate.getFullYear() === currentYear && curDate.getMonth() === currentMonth) {
          monthStudiedMinutes += entry.totalStudiedMinutes;
        }
      }
    }

    weeks.push(weekDays);
  }

  // Streaks globais (consideram todo o histórico disponível no banco)
  const { currentStreak, longestStreak } = calculateStreaks(dayMap, referenceDate);

  const consistencyRate =
    totalDaysInPeriod > 0
      ? Number(((activeDaysCount / totalDaysInPeriod) * 100).toFixed(1))
      : 0;

  return {
    period,
    weeks,
    months,
    dayMap,
    stats: {
      activeDaysCount,
      totalDaysInPeriod,
      currentStreak,
      longestStreak,
      consistencyRate,
      monthStudiedMinutes,
      periodStudiedMinutes,
    },
    todayStr,
  };
}
