import type {
  StudySession,
  Task,
  Subject,
  GymWorkout,
  Habit,
  HabitLog,
  StudyPreferences,
  GymPreferences,
  WeeklyReportData,
  WeeklyComparison,
} from '../types';
import { formatDateToLocalYYYYMMDD } from './srsEngine';
import { isHabitScheduledForDate, getHabitLogForDate, getHabitStatusForDate } from './habitEngine';
import { isValidCompletedWorkout } from './gymEngine';

export interface WeekRange {
  weekStartStr: string; // 'YYYY-MM-DD' (Segunda-feira)
  weekEndStr: string; // 'YYYY-MM-DD' (Domingo)
  startDate: Date;
  endDate: Date;
  isCurrentWeek: boolean;
  isPastWeek: boolean;
}

/**
 * Retorna o intervalo de datas (Segunda a Domingo) para uma semana com offset relativo
 */
export function getWeekDateRange(referenceDate: Date | string = new Date(), offsetWeeks = 0): WeekRange {
  const d = typeof referenceDate === 'string' ? new Date(`${referenceDate}T12:00:00`) : new Date(referenceDate);

  // Ajustar para meio-dia para evitar shifts
  d.setHours(12, 0, 0, 0);

  // Encontrar a segunda-feira da semana (0 = Domingo, 1 = Segunda .. 6 = Sábado)
  const day = d.getDay();
  const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1) + offsetWeeks * 7;
  const monday = new Date(d);
  monday.setDate(diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const weekStartStr = formatDateToLocalYYYYMMDD(monday);
  const weekEndStr = formatDateToLocalYYYYMMDD(sunday);

  const todayStr = formatDateToLocalYYYYMMDD(new Date());
  const isCurrentWeek = todayStr >= weekStartStr && todayStr <= weekEndStr;
  const isPastWeek = weekEndStr < todayStr;

  return {
    weekStartStr,
    weekEndStr,
    startDate: monday,
    endDate: sunday,
    isCurrentWeek,
    isPastWeek,
  };
}

/**
 * Calcula o relatório semanal consolidado
 */
export function calculateWeeklyReport(params: {
  weekStartStr: string;
  weekEndStr: string;
  sessions: StudySession[];
  tasks: Task[];
  subjects: Subject[];
  gymWorkouts: GymWorkout[];
  habits: Habit[];
  habitLogs: HabitLog[];
  preferences?: StudyPreferences;
  gymPreferences?: GymPreferences;
}): WeeklyReportData {
  const {
    weekStartStr,
    weekEndStr,
    sessions,
    tasks,
    subjects,
    gymWorkouts,
    habits,
    habitLogs,
    preferences,
    gymPreferences,
  } = params;

  const todayStr = formatDateToLocalYYYYMMDD(new Date());
  const isCurrentWeek = todayStr >= weekStartStr && todayStr <= weekEndStr;

  // Timestamps de início e fim da semana (UTC local)
  const startTimeMs = new Date(`${weekStartStr}T00:00:00`).getTime();
  const endTimeMs = new Date(`${weekEndStr}T23:59:59.999`).getTime();

  // --------------------------------------------------------------------------
  // 1. DIMENSÃO ESTUDOS
  // --------------------------------------------------------------------------
  const weekSessions = sessions.filter((s) => {
    return s.startedAt >= startTimeMs && s.startedAt <= endTimeMs && s.status === 'completed';
  });

  const totalStudiedMinutes = Math.round(
    weekSessions.reduce((acc, s) => acc + (s.actualDurationSeconds || 0), 0) / 60
  );

  const completedSessionsCount = weekSessions.length;

  const weekTasks = tasks.filter((t) => {
    const time = t.completedAt || t.updatedAt;
    return t.status === 'completed' && time >= startTimeMs && time <= endTimeMs;
  });

  const completedTasksCount = weekTasks.length;

  // Distribuição por matéria
  const subjectMinutesMap = new Map<string, number>();
  for (const s of weekSessions) {
    const subId = s.subjectId || 'sem_materia';
    const mins = Math.round((s.actualDurationSeconds || 0) / 60);
    subjectMinutesMap.set(subId, (subjectMinutesMap.get(subId) || 0) + mins);
  }

  const subjectsStudiedCount = Array.from(subjectMinutesMap.keys()).filter((id) => id !== 'sem_materia').length;

  const timeBySubject = Array.from(subjectMinutesMap.entries())
    .map(([subId, minutes]) => {
      const subject = subjects.find((sub) => sub.id === subId);
      const subjectName = subject ? subject.name : subId === 'sem_materia' ? 'Estudo Geral' : 'Outra';
      const color = subject ? subject.color : '#94a3b8';
      const percentage = totalStudiedMinutes > 0 ? Math.round((minutes / totalStudiedMinutes) * 100) : 0;

      return {
        subjectId: subId,
        subjectName,
        color,
        minutes,
        percentage,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  // Distribuição por dia da semana (Segunda a Domingo)
  const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const timeByDay: WeeklyReportData['study']['timeByDay'] = [];

  for (let i = 0; i < 7; i++) {
    const curDate = new Date(`${weekStartStr}T12:00:00`);
    curDate.setDate(curDate.getDate() + i);
    const dateStr = formatDateToLocalYYYYMMDD(curDate);
    const dayOfWeek = curDate.getDay();

    const curStart = new Date(`${dateStr}T00:00:00`).getTime();
    const curEnd = new Date(`${dateStr}T23:59:59.999`).getTime();

    const daySessions = weekSessions.filter((s) => s.startedAt >= curStart && s.startedAt <= curEnd);
    const minutes = Math.round(daySessions.reduce((acc, s) => acc + (s.actualDurationSeconds || 0), 0) / 60);

    timeByDay.push({
      dayOfWeek,
      dayLabel: dayNames[i],
      dateStr,
      minutes,
      sessionsCount: daySessions.length,
    });
  }

  // Meta semanal de estudos: soma da disponibilidade ou diária * 7
  let weeklyGoalMinutes = (preferences?.dailyGoalMinutes || 120) * 7;
  if (preferences?.weeklyAvailability && preferences.weeklyAvailability.length > 0) {
    const availSum = preferences.weeklyAvailability.reduce((acc, d) => acc + (d.minutesAvailable || 0), 0);
    if (availSum > 0) weeklyGoalMinutes = availSum;
  }

  const studyGoalProgressPercent =
    weeklyGoalMinutes > 0 ? Math.min(100, Math.round((totalStudiedMinutes / weeklyGoalMinutes) * 100)) : 0;

  // --------------------------------------------------------------------------
  // 2. DIMENSÃO ACADEMIA
  // --------------------------------------------------------------------------
  const weekWorkouts = gymWorkouts.filter((w) => {
    return w.startedAt >= startTimeMs && w.startedAt <= endTimeMs && isValidCompletedWorkout(w);
  });

  const completedWorkoutsCount = weekWorkouts.length;
  const totalGymDurationMinutes = weekWorkouts.reduce((acc, w) => acc + (w.durationMinutes || 0), 0);
  const totalGymVolumeKg = weekWorkouts.reduce((acc, w) => acc + (w.totalVolumeKg || 0), 0);
  const weeklyGoalGymDays = gymPreferences?.weeklyGoalDays || 4;
  const gymGoalProgressPercent =
    weeklyGoalGymDays > 0 ? Math.min(100, Math.round((completedWorkoutsCount / weeklyGoalGymDays) * 100)) : 0;

  const workoutsByDay = weekWorkouts.map((w) => {
    const d = new Date(w.startedAt);
    const dayIdx = (d.getDay() + 6) % 7; // Ajustar para 0=Seg..6=Dom
    return {
      dateStr: formatDateToLocalYYYYMMDD(d),
      dayLabel: dayNames[dayIdx] || 'Dia',
      workoutName: w.routineName,
      durationMinutes: w.durationMinutes,
      totalVolumeKg: w.totalVolumeKg,
    };
  });

  // --------------------------------------------------------------------------
  // 3. DIMENSÃO HÁBITOS
  // --------------------------------------------------------------------------
  const activeHabits = habits.filter((h) => !h.isArchived);
  let totalScheduledHabits = 0;
  let totalCompletedHabits = 0;

  // Determinar limite de dias para a semana (se for a semana atual, vai até hoje para não penalizar dias futuros)
  const maxEvalDateStr = isCurrentWeek ? (todayStr < weekEndStr ? todayStr : weekEndStr) : weekEndStr;

  const habitSummaries: WeeklyReportData['habits']['habitSummaries'] = [];

  for (const habit of activeHabits) {
    let scheduledDays = 0;
    let completedDays = 0;

    for (let i = 0; i < 7; i++) {
      const curDate = new Date(`${weekStartStr}T12:00:00`);
      curDate.setDate(curDate.getDate() + i);
      const dateStr = formatDateToLocalYYYYMMDD(curDate);

      // Não contar dias futuros na semana em andamento
      if (dateStr > maxEvalDateStr) continue;

      if (isHabitScheduledForDate(habit, dateStr)) {
        scheduledDays++;
        const log = getHabitLogForDate(habitLogs, habit.id, dateStr);
        if (getHabitStatusForDate(habit, log).completed) {
          completedDays++;
        }
      }
    }

    const rate = scheduledDays > 0 ? Math.round((completedDays / scheduledDays) * 100) : 0;

    totalScheduledHabits += scheduledDays;
    totalCompletedHabits += completedDays;

    habitSummaries.push({
      habitId: habit.id,
      habitName: habit.name,
      category: habit.category,
      color: habit.color,
      scheduledDays,
      completedDays,
      completionRate: rate,
    });
  }

  const overallHabitCompletionRate =
    totalScheduledHabits > 0 ? Math.round((totalCompletedHabits / totalScheduledHabits) * 100) : 0;

  const bestConsistencyHabits = habitSummaries
    .filter((h) => h.scheduledDays > 0 && h.completionRate >= 80)
    .sort((a, b) => b.completionRate - a.completionRate)
    .map((h) => h.habitName);

  const needsAttentionHabits = habitSummaries
    .filter((h) => h.scheduledDays > 0 && h.completionRate < 50)
    .sort((a, b) => a.completionRate - b.completionRate)
    .map((h) => h.habitName);

  // --------------------------------------------------------------------------
  // 4. METAS GERAIS
  // --------------------------------------------------------------------------
  const studyMet = totalStudiedMinutes >= weeklyGoalMinutes;
  const gymMet = completedWorkoutsCount >= weeklyGoalGymDays;
  const habitsMet = totalScheduledHabits > 0 && overallHabitCompletionRate >= 80;

  let metGoalsCount = 0;
  if (studyMet) metGoalsCount++;
  if (gymMet) metGoalsCount++;
  if (habitsMet) metGoalsCount++;

  return {
    weekStartStr,
    weekEndStr,
    isCurrentWeek,
    study: {
      totalStudiedMinutes,
      completedSessionsCount,
      completedTasksCount,
      subjectsStudiedCount,
      weeklyGoalMinutes,
      goalProgressPercent: studyGoalProgressPercent,
      timeBySubject,
      timeByDay,
    },
    gym: {
      completedWorkoutsCount,
      totalDurationMinutes: totalGymDurationMinutes,
      totalVolumeKg: totalGymVolumeKg,
      weeklyGoalDays: weeklyGoalGymDays,
      goalProgressPercent: gymGoalProgressPercent,
      workoutsByDay,
    },
    habits: {
      scheduledCount: totalScheduledHabits,
      completedCount: totalCompletedHabits,
      overallCompletionRate: overallHabitCompletionRate,
      habitSummaries,
      bestConsistencyHabits,
      needsAttentionHabits,
    },
    goals: {
      studyMet,
      gymMet,
      habitsMet,
      totalGoalsCount: 3,
      metGoalsCount,
    },
  };
}

/**
 * Compara a semana atual com a semana anterior de forma segura e transparente
 */
export function compareWeeklyReports(current: WeeklyReportData, previous: WeeklyReportData): WeeklyComparison {
  const hasPreviousData =
    previous.study.totalStudiedMinutes > 0 ||
    previous.gym.completedWorkoutsCount > 0 ||
    previous.habits.completedCount > 0;

  const studyMinutesDiff = current.study.totalStudiedMinutes - previous.study.totalStudiedMinutes;

  let studyMinutesPercentChange = 0;
  if (previous.study.totalStudiedMinutes === 0) {
    studyMinutesPercentChange = current.study.totalStudiedMinutes > 0 ? 100 : 0;
  } else {
    studyMinutesPercentChange = Math.round(
      ((current.study.totalStudiedMinutes - previous.study.totalStudiedMinutes) /
        previous.study.totalStudiedMinutes) *
        100
    );
  }

  const sessionsCountDiff = current.study.completedSessionsCount - previous.study.completedSessionsCount;
  const tasksCountDiff = current.study.completedTasksCount - previous.study.completedTasksCount;
  const gymWorkoutsDiff = current.gym.completedWorkoutsCount - previous.gym.completedWorkoutsCount;
  const habitsCompletionRateDiff = current.habits.overallCompletionRate - previous.habits.overallCompletionRate;

  return {
    hasPreviousData,
    isPartialWeek: current.isCurrentWeek,
    studyMinutesDiff,
    studyMinutesPercentChange,
    sessionsCountDiff,
    tasksCountDiff,
    gymWorkoutsDiff,
    habitsCompletionRateDiff,
  };
}

/**
 * Gera Destaques da Semana e Sugestões Práticas baseadas em regras determinísticas
 */
export function generateWeeklyHighlights(
  current: WeeklyReportData,
  comparison: WeeklyComparison
): { highlights: string[]; suggestions: string[] } {
  const highlights: string[] = [];
  const suggestions: string[] = [];

  // 1. Destaques de Estudo
  if (current.study.totalStudiedMinutes > 0) {
    const hours = Math.floor(current.study.totalStudiedMinutes / 60);
    const mins = current.study.totalStudiedMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h${mins > 0 ? `${mins}m` : ''}` : `${mins} min`;

    if (comparison.hasPreviousData && comparison.studyMinutesPercentChange > 0) {
      highlights.push(
        `Você dedicou ${timeStr} aos estudos nesta semana, um aumento de ${comparison.studyMinutesPercentChange}% em relação à semana anterior.`
      );
    } else if (comparison.hasPreviousData && comparison.studyMinutesPercentChange < 0 && !current.isCurrentWeek) {
      highlights.push(
        `Tempo de estudo registrado foi de ${timeStr} (${comparison.studyMinutesPercentChange}% em relação à semana anterior).`
      );
    } else {
      highlights.push(`Você acumulou ${timeStr} de estudo focado distribuídos em ${current.study.completedSessionsCount} sessões.`);
    }

    if (current.study.timeBySubject.length > 0) {
      const topSubject = current.study.timeBySubject[0];
      highlights.push(
        `"${topSubject.subjectName}" foi a matéria mais estudada, somando ${topSubject.minutes}m (${topSubject.percentage}% do seu tempo total).`
      );
    }
  } else if (!current.isCurrentWeek) {
    highlights.push('Nenhuma sessão de estudo válida foi registrada nesta semana.');
  }

  // 2. Destaques de Academia
  if (current.gym.completedWorkoutsCount > 0) {
    if (current.gym.completedWorkoutsCount >= current.gym.weeklyGoalDays) {
      highlights.push(
        `Meta de treinos conquistada! Você realizou ${current.gym.completedWorkoutsCount} treinos (meta de ${current.gym.weeklyGoalDays}).`
      );
    } else {
      if (current.gym.totalVolumeKg > 0) {
        highlights.push(
          `Você completou ${current.gym.completedWorkoutsCount} treino${current.gym.completedWorkoutsCount === 1 ? '' : 's'} com um volume total de ${current.gym.totalVolumeKg.toLocaleString()} kg levantados.`
        );
      } else {
        highlights.push(
          `Você completou ${current.gym.completedWorkoutsCount} treino${current.gym.completedWorkoutsCount === 1 ? '' : 's'} nesta semana (meta de ${current.gym.weeklyGoalDays}).`
        );
      }
    }
  }

  // 3. Destaques de Hábitos
  if (current.habits.scheduledCount > 0) {
    highlights.push(
      `Taxa de conclusão de hábitos em ${current.habits.overallCompletionRate}% (${current.habits.completedCount} de ${current.habits.scheduledCount} hábitos concluídos).`
    );

    if (current.habits.bestConsistencyHabits.length > 0) {
      const best = current.habits.bestConsistencyHabits.slice(0, 2).join(' e ');
      highlights.push(`Hábitos com consistência exemplar: ${best}.`);
    }
  }

  // 4. Sugestões Práticas Opcionais
  if (current.isCurrentWeek) {
    if (current.study.goalProgressPercent < 70) {
      suggestions.push(
        'A semana ainda está em andamento. Considere agendar blocos de Pomodoro de 25 minutos nos próximos dias para alcançar sua meta.'
      );
    }
    if (current.gym.completedWorkoutsCount < current.gym.weeklyGoalDays) {
      const remaining = current.gym.weeklyGoalDays - current.gym.completedWorkoutsCount;
      suggestions.push(`Faltam ${remaining} treino(s) para bater sua meta semanal de academia.`);
    }
  }

  if (current.habits.needsAttentionHabits.length > 0) {
    const needAttention = current.habits.needsAttentionHabits.slice(0, 2).join(', ');
    suggestions.push(
      `Hábitos como "${needAttention}" tiveram menor adesão no período. Avalie diminuir a meta ou definir um lembrete em horário estratégico.`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push('Sua consistência semanal está equilibrada. Mantenha os horários regulares de estudo e descanso.');
  }

  return {
    highlights,
    suggestions,
  };
}
