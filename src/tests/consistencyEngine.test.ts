import { describe, it, expect } from 'vitest';
import {
  calculateIntensityLevel,
  groupActivityByDay,
  calculateStreaks,
  generateConsistencyCalendar,
} from '../lib/consistencyEngine';
import type { StudySession, Task } from '../types';

describe('consistencyEngine', () => {
  it('calculates intensity levels correctly based on studied minutes', () => {
    expect(calculateIntensityLevel(0)).toBe(0);
    expect(calculateIntensityLevel(-5)).toBe(0);
    expect(calculateIntensityLevel(15)).toBe(1);
    expect(calculateIntensityLevel(29)).toBe(1);
    expect(calculateIntensityLevel(30)).toBe(2);
    expect(calculateIntensityLevel(59)).toBe(2);
    expect(calculateIntensityLevel(60)).toBe(3);
    expect(calculateIntensityLevel(119)).toBe(3);
    expect(calculateIntensityLevel(120)).toBe(4);
    expect(calculateIntensityLevel(240)).toBe(4);
  });

  it('groups completed study sessions and completed tasks ignoring abandoned sessions and short sessions', () => {
    const baseDate = new Date(2026, 9, 14, 10, 0, 0); // 14 de Outubro de 2026
    const tToday = baseDate.getTime();
    const tYesterday = tToday - 24 * 60 * 60 * 1000;

    const sessions: StudySession[] = [
      {
        id: 's1',
        mode: 'pomodoro',
        plannedDurationMinutes: 25,
        actualDurationSeconds: 1500, // 25 min
        startedAt: tToday,
        status: 'completed',
        createdAt: tToday,
        updatedAt: tToday,
      },
      {
        id: 's2',
        mode: 'five_min',
        plannedDurationMinutes: 5,
        actualDurationSeconds: 40, // < 60s -> ignorada
        startedAt: tToday,
        status: 'completed',
        createdAt: tToday,
        updatedAt: tToday,
      },
      {
        id: 's3',
        mode: 'deep_work',
        plannedDurationMinutes: 50,
        actualDurationSeconds: 3000,
        startedAt: tToday,
        status: 'abandoned', // Abandonada -> ignorada
        createdAt: tToday,
        updatedAt: tToday,
      },
      {
        id: 's4',
        mode: 'deep_work',
        plannedDurationMinutes: 50,
        actualDurationSeconds: 3000, // 50 min
        startedAt: tYesterday,
        status: 'completed',
        createdAt: tYesterday,
        updatedAt: tYesterday,
      },
    ];

    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Modelar Banco NoSQL',
        subjectId: 'sub-1',
        priority: 'high',
        estimatedMinutes: 45,
        actualStudiedMinutes: 45,
        status: 'completed',
        completedAt: tToday,
        createdAt: tToday,
        updatedAt: tToday,
      },
      {
        id: 't2',
        title: 'Estudar Autômatos',
        subjectId: 'sub-2',
        priority: 'medium',
        estimatedMinutes: 30,
        actualStudiedMinutes: 0,
        status: 'pending', // Não concluída -> não entra em completedTasks
        createdAt: tToday,
        updatedAt: tToday,
      },
    ];

    const dayMap = groupActivityByDay(sessions, tasks, 60, baseDate);

    const todayStr = '2026-10-14';
    const yesterdayStr = '2026-10-13';

    expect(dayMap[todayStr]).toBeDefined();
    expect(dayMap[todayStr].completedSessionsCount).toBe(1);
    expect(dayMap[todayStr].totalStudiedMinutes).toBe(25);
    expect(dayMap[todayStr].completedTasks.length).toBe(1);
    expect(dayMap[todayStr].completedTasks[0].title).toBe('Modelar Banco NoSQL');
    expect(dayMap[todayStr].isActive).toBe(true);
    expect(dayMap[todayStr].isGoalMet).toBe(false); // 25m < 60m
    expect(dayMap[todayStr].intensityLevel).toBe(1);

    expect(dayMap[yesterdayStr]).toBeDefined();
    expect(dayMap[yesterdayStr].completedSessionsCount).toBe(1);
    expect(dayMap[yesterdayStr].totalStudiedMinutes).toBe(50);
    expect(dayMap[yesterdayStr].intensityLevel).toBe(2);
  });

  it('calculates current streak and preserves it when today is not yet active but yesterday was active', () => {
    const baseDate = new Date(2026, 9, 14, 12, 0, 0); // Quarta-feira, 14/10/2026
    const dayMs = 24 * 60 * 60 * 1000;

    // Sessões na terça (13/10) e segunda (12/10), nenhuma hoje (14/10)
    const sessions: StudySession[] = [
      {
        id: 's1',
        mode: 'pomodoro',
        plannedDurationMinutes: 25,
        actualDurationSeconds: 1500,
        startedAt: baseDate.getTime() - dayMs, // ontem (13/10)
        status: 'completed',
        createdAt: baseDate.getTime() - dayMs,
        updatedAt: baseDate.getTime() - dayMs,
      },
      {
        id: 's2',
        mode: 'pomodoro',
        plannedDurationMinutes: 25,
        actualDurationSeconds: 1500,
        startedAt: baseDate.getTime() - 2 * dayMs, // anteontem (12/10)
        status: 'completed',
        createdAt: baseDate.getTime() - 2 * dayMs,
        updatedAt: baseDate.getTime() - 2 * dayMs,
      },
    ];

    const dayMap = groupActivityByDay(sessions, [], 60, baseDate);
    const { currentStreak, longestStreak } = calculateStreaks(dayMap, baseDate);

    // Como ontem e anteontem foram ativos, a sequência atual é preservada em 2
    expect(currentStreak).toBe(2);
    expect(longestStreak).toBe(2);
  });

  it('updates current streak to include today when today is active', () => {
    const baseDate = new Date(2026, 9, 14, 12, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    const sessions: StudySession[] = [
      {
        id: 's0',
        mode: 'pomodoro',
        plannedDurationMinutes: 25,
        actualDurationSeconds: 1500,
        startedAt: baseDate.getTime(), // hoje (14/10)
        status: 'completed',
        createdAt: baseDate.getTime(),
        updatedAt: baseDate.getTime(),
      },
      {
        id: 's1',
        mode: 'pomodoro',
        plannedDurationMinutes: 25,
        actualDurationSeconds: 1500,
        startedAt: baseDate.getTime() - dayMs, // ontem (13/10)
        status: 'completed',
        createdAt: baseDate.getTime() - dayMs,
        updatedAt: baseDate.getTime() - dayMs,
      },
      {
        id: 's2',
        mode: 'pomodoro',
        plannedDurationMinutes: 25,
        actualDurationSeconds: 1500,
        startedAt: baseDate.getTime() - 2 * dayMs, // anteontem (12/10)
        status: 'completed',
        createdAt: baseDate.getTime() - 2 * dayMs,
        updatedAt: baseDate.getTime() - 2 * dayMs,
      },
    ];

    const dayMap = groupActivityByDay(sessions, [], 60, baseDate);
    const { currentStreak, longestStreak } = calculateStreaks(dayMap, baseDate);

    expect(currentStreak).toBe(3);
    expect(longestStreak).toBe(3);
  });

  it('resets current streak when yesterday had no activity', () => {
    const baseDate = new Date(2026, 9, 14, 12, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    // Sessão há 3 dias atrás (11/10), ontem (13/10) sem sessão, hoje sem sessão
    const sessions: StudySession[] = [
      {
        id: 's1',
        mode: 'pomodoro',
        plannedDurationMinutes: 25,
        actualDurationSeconds: 1500,
        startedAt: baseDate.getTime() - 3 * dayMs,
        status: 'completed',
        createdAt: baseDate.getTime() - 3 * dayMs,
        updatedAt: baseDate.getTime() - 3 * dayMs,
      },
    ];

    const dayMap = groupActivityByDay(sessions, [], 60, baseDate);
    const { currentStreak, longestStreak } = calculateStreaks(dayMap, baseDate);

    expect(currentStreak).toBe(0);
    expect(longestStreak).toBe(1);
  });

  it('correctly calculates longest streak across historical breaks and across months', () => {
    const baseDate = new Date(2026, 9, 14, 12, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    // Sequência antiga de 4 dias: há 10, 9, 8, 7 dias
    // Sequência recente de 2 dias: ontem e hoje
    const sessions: StudySession[] = [
      // Bloco antigo de 4 dias
      { id: 'a1', mode: 'pomodoro', plannedDurationMinutes: 25, actualDurationSeconds: 1500, startedAt: baseDate.getTime() - 10 * dayMs, status: 'completed', createdAt: 0, updatedAt: 0 },
      { id: 'a2', mode: 'pomodoro', plannedDurationMinutes: 25, actualDurationSeconds: 1500, startedAt: baseDate.getTime() - 9 * dayMs, status: 'completed', createdAt: 0, updatedAt: 0 },
      { id: 'a3', mode: 'pomodoro', plannedDurationMinutes: 25, actualDurationSeconds: 1500, startedAt: baseDate.getTime() - 8 * dayMs, status: 'completed', createdAt: 0, updatedAt: 0 },
      { id: 'a4', mode: 'pomodoro', plannedDurationMinutes: 25, actualDurationSeconds: 1500, startedAt: baseDate.getTime() - 7 * dayMs, status: 'completed', createdAt: 0, updatedAt: 0 },
      // Bloco recente de 2 dias
      { id: 'b1', mode: 'pomodoro', plannedDurationMinutes: 25, actualDurationSeconds: 1500, startedAt: baseDate.getTime() - 1 * dayMs, status: 'completed', createdAt: 0, updatedAt: 0 },
      { id: 'b2', mode: 'pomodoro', plannedDurationMinutes: 25, actualDurationSeconds: 1500, startedAt: baseDate.getTime(), status: 'completed', createdAt: 0, updatedAt: 0 },
    ];

    const dayMap = groupActivityByDay(sessions, [], 60, baseDate);
    const { currentStreak, longestStreak } = calculateStreaks(dayMap, baseDate);

    expect(currentStreak).toBe(2);
    expect(longestStreak).toBe(4);
  });

  it('generates calendar grid, consistency rate and monthly stats for different periods', () => {
    const baseDate = new Date(2026, 9, 14, 12, 0, 0); // Outubro/2026

    const sessions: StudySession[] = [
      {
        id: 's1',
        mode: 'deep_work',
        plannedDurationMinutes: 50,
        actualDurationSeconds: 3600, // 60 min
        startedAt: baseDate.getTime(),
        status: 'completed',
        createdAt: baseDate.getTime(),
        updatedAt: baseDate.getTime(),
      },
    ];

    // Testar período 30d
    const cal30 = generateConsistencyCalendar(sessions, [], 60, '30d', baseDate);
    expect(cal30.period).toBe('30d');
    expect(cal30.weeks.length).toBe(5);
    expect(cal30.stats.activeDaysCount).toBe(1);
    expect(cal30.stats.monthStudiedMinutes).toBe(60);
    expect(cal30.stats.periodStudiedMinutes).toBe(60);
    expect(cal30.stats.consistencyRate).toBeGreaterThan(0);

    // Testar período 90d
    const cal90 = generateConsistencyCalendar(sessions, [], 60, '90d', baseDate);
    expect(cal90.period).toBe('90d');
    expect(cal90.weeks.length).toBe(14);

    // Testar período 12m
    const cal12m = generateConsistencyCalendar(sessions, [], 60, '12m', baseDate);
    expect(cal12m.period).toBe('12m');
    expect(cal12m.weeks.length).toBe(53);
    expect(cal12m.months.length).toBeGreaterThanOrEqual(11);
  });
});
