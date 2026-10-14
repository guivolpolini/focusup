import { describe, it, expect } from 'vitest';
import {
  isHabitScheduledForDate,
  getHabitStatusForDate,
  calculateHabitsDailyProgress,
  calculateHabitStreak,
  calculateHabitCompletionRate,
} from '../lib/habitEngine';
import type { Habit, HabitLog } from '../types';

describe('habitEngine', () => {
  const baseDailyHabit: Habit = {
    id: 'habit-read',
    name: 'Ler 15 minutos',
    icon: 'book',
    color: '#6366f1',
    category: 'estudos',
    frequencyType: 'daily',
    targetType: 'numeric',
    targetValue: 15,
    unit: 'min',
    startDate: '2026-10-01',
    isArchived: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const specificDaysHabit: Habit = {
    id: 'habit-stretch',
    name: 'Alongamento',
    icon: 'heart',
    color: '#10b981',
    category: 'saude',
    frequencyType: 'specific_days',
    frequencyDays: [1, 3, 5], // Seg (1), Qua (3), Sex (5)
    targetType: 'boolean',
    startDate: '2026-10-01',
    isArchived: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const weeklyHabit: Habit = {
    id: 'habit-code',
    name: 'Praticar Programação',
    icon: 'code',
    color: '#f59e0b',
    category: 'produtividade',
    frequencyType: 'times_per_week',
    frequencyTimesPerWeek: 3,
    targetType: 'numeric',
    targetValue: 30,
    unit: 'min',
    startDate: '2026-10-01',
    isArchived: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  it('correctly verifies if habit is scheduled for date', () => {
    // Antes da data de início
    expect(isHabitScheduledForDate(baseDailyHabit, '2026-09-30')).toBe(false);
    // Após data de início
    expect(isHabitScheduledForDate(baseDailyHabit, '2026-10-01')).toBe(true);

    // Hábito de dias específicos: 2026-10-12 foi Segunda (1), 2026-10-13 foi Terça (2)
    expect(isHabitScheduledForDate(specificDaysHabit, '2026-10-12')).toBe(true); // Segunda
    expect(isHabitScheduledForDate(specificDaysHabit, '2026-10-13')).toBe(false); // Terça
    expect(isHabitScheduledForDate(specificDaysHabit, '2026-10-14')).toBe(true); // Quarta

    // Hábito semanal (disponível qualquer dia)
    expect(isHabitScheduledForDate(weeklyHabit, '2026-10-13')).toBe(true);
  });

  it('evaluates boolean and numeric habit completion status including partial progress', () => {
    // Boolean desmarcado
    expect(getHabitStatusForDate(specificDaysHabit, undefined)).toEqual({
      completed: false,
      currentValue: 0,
      targetValue: 1,
      percent: 0,
    });

    // Boolean marcado
    const boolLog: HabitLog = {
      id: 'log-1',
      habitId: specificDaysHabit.id,
      date: '2026-10-12',
      completed: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(getHabitStatusForDate(specificDaysHabit, boolLog)).toEqual({
      completed: true,
      currentValue: 1,
      targetValue: 1,
      percent: 100,
    });

    // Numérico parcial: 10 de 15 minutos (não completado ainda)
    const partialLog: HabitLog = {
      id: 'log-2',
      habitId: baseDailyHabit.id,
      date: '2026-10-12',
      completed: false,
      currentValue: 10,
      targetValue: 15,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const partialStatus = getHabitStatusForDate(baseDailyHabit, partialLog);
    expect(partialStatus.completed).toBe(false);
    expect(partialStatus.currentValue).toBe(10);
    expect(partialStatus.targetValue).toBe(15);
    expect(partialStatus.percent).toBe(67);

    // Numérico atingido: 15 de 15 minutos
    const fullLog: HabitLog = {
      id: 'log-3',
      habitId: baseDailyHabit.id,
      date: '2026-10-12',
      completed: true,
      currentValue: 15,
      targetValue: 15,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const fullStatus = getHabitStatusForDate(baseDailyHabit, fullLog);
    expect(fullStatus.completed).toBe(true);
    expect(fullStatus.percent).toBe(100);
  });

  it('calculates daily progress accurately for scheduled habits', () => {
    const habits = [baseDailyHabit, specificDaysHabit, weeklyHabit];
    // 2026-10-12 é Segunda (todos os 3 programados)
    const logs: HabitLog[] = [
      { id: '1', habitId: baseDailyHabit.id, date: '2026-10-12', completed: true, currentValue: 15, createdAt: 1, updatedAt: 1 },
      { id: '2', habitId: specificDaysHabit.id, date: '2026-10-12', completed: false, createdAt: 1, updatedAt: 1 },
    ];

    const progressMonday = calculateHabitsDailyProgress(habits, logs, '2026-10-12');
    expect(progressMonday.totalScheduled).toBe(3);
    expect(progressMonday.totalCompleted).toBe(1);
    expect(progressMonday.progressPercent).toBe(33);

    // 2026-10-13 é Terça (specificDaysHabit NÃO está programado)
    const progressTuesday = calculateHabitsDailyProgress(habits, logs, '2026-10-13');
    expect(progressTuesday.totalScheduled).toBe(2);
    expect(progressTuesday.totalCompleted).toBe(0);
  });

  it('calculates consecutive streaks without penalizing pending today or non-scheduled days', () => {
    const logs: HabitLog[] = [
      { id: '1', habitId: specificDaysHabit.id, date: '2026-10-05', completed: true, createdAt: 1, updatedAt: 1 }, // Seg
      { id: '2', habitId: specificDaysHabit.id, date: '2026-10-07', completed: true, createdAt: 1, updatedAt: 1 }, // Qua
      { id: '3', habitId: specificDaysHabit.id, date: '2026-10-09', completed: true, createdAt: 1, updatedAt: 1 }, // Sex
      { id: '4', habitId: specificDaysHabit.id, date: '2026-10-12', completed: true, createdAt: 1, updatedAt: 1 }, // Seg seguinte
    ];

    // Se hoje for Terça (2026-10-13) onde o hábito NÃO está programado:
    // O streak deve ser 4 (Seg, Qua, Sex, Seg anterior) sem ser quebrado por Terça ou Quinta!
    const streakResult = calculateHabitStreak(specificDaysHabit, logs, '2026-10-13');
    expect(streakResult.currentStreak).toBe(4);
    expect(streakResult.longestStreak).toBe(4);
    expect(streakResult.totalCompletions).toBe(4);

    // Se hoje for Quarta (2026-10-14) programado mas ainda não concluído:
    // Preserva o streak acumulado (4) sem zerar!
    const streakPendingToday = calculateHabitStreak(specificDaysHabit, logs, '2026-10-14');
    expect(streakPendingToday.currentStreak).toBe(4);

    // Se concluiu hoje: streak vira 5
    logs.push({ id: '5', habitId: specificDaysHabit.id, date: '2026-10-14', completed: true, createdAt: 1, updatedAt: 1 });
    const streakCompletedToday = calculateHabitStreak(specificDaysHabit, logs, '2026-10-14');
    expect(streakCompletedToday.currentStreak).toBe(5);
  });

  it('calculates completion rate over a 30-day window', () => {
    const logs: HabitLog[] = [
      { id: '1', habitId: baseDailyHabit.id, date: '2026-10-10', completed: true, currentValue: 15, createdAt: 1, updatedAt: 1 },
      { id: '2', habitId: baseDailyHabit.id, date: '2026-10-11', completed: true, currentValue: 15, createdAt: 1, updatedAt: 1 },
    ];

    // 2 conclusões em 10 dias (de 2026-10-01 a 2026-10-10)
    const rate = calculateHabitCompletionRate(baseDailyHabit, logs, 10, '2026-10-10');
    expect(rate).toBe(10); // 1 de 10 dias = 10%
  });
});
