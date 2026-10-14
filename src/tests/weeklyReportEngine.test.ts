import { describe, it, expect } from 'vitest';
import {
  getWeekDateRange,
  calculateWeeklyReport,
  compareWeeklyReports,
  generateWeeklyHighlights,
} from '../lib/weeklyReportEngine';
import type { StudySession, Task, Subject, GymWorkout, Habit, HabitLog } from '../types';

describe('weeklyReportEngine', () => {
  it('computes correct Monday-Sunday week ranges for current and past weeks', () => {
    // 2026-10-14 é Quarta-feira
    const range = getWeekDateRange('2026-10-14', 0);
    expect(range.weekStartStr).toBe('2026-10-12'); // Segunda
    expect(range.weekEndStr).toBe('2026-10-18');   // Domingo

    // Semana anterior (-1)
    const prevRange = getWeekDateRange('2026-10-14', -1);
    expect(prevRange.weekStartStr).toBe('2026-10-05');
    expect(prevRange.weekEndStr).toBe('2026-10-11');
  });

  it('aggregates study, gym, and habit metrics with complete separation', () => {
    const subjects: Subject[] = [
      { id: 'sub-react', name: 'React & TypeScript', color: '#6366f1', priority: 'high', targetMinutesPerWeek: 300, archived: false, createdAt: 1, updatedAt: 1 },
      { id: 'sub-sql', name: 'PostgreSQL', color: '#06b6d4', priority: 'medium', targetMinutesPerWeek: 180, archived: false, createdAt: 1, updatedAt: 1 },
    ];

    // Sessões na semana de 2026-10-12 a 2026-10-18
    const sessions: StudySession[] = [
      {
        id: 's-1',
        subjectId: 'sub-react',
        mode: 'pomodoro',
        plannedDurationMinutes: 50,
        actualDurationSeconds: 3600, // 60 min
        startedAt: new Date('2026-10-12T14:00:00').getTime(),
        status: 'completed',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 's-2',
        subjectId: 'sub-sql',
        mode: 'deep_work',
        plannedDurationMinutes: 60,
        actualDurationSeconds: 1800, // 30 min
        startedAt: new Date('2026-10-13T10:00:00').getTime(),
        status: 'completed',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const tasks: Task[] = [
      {
        id: 't-1',
        title: 'Praticar Custom Hooks',
        subjectId: 'sub-react',
        priority: 'high',
        estimatedMinutes: 30,
        actualStudiedMinutes: 30,
        status: 'completed',
        completedAt: new Date('2026-10-12T15:00:00').getTime(),
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const gymWorkouts: GymWorkout[] = [
      {
        id: 'gw-1',
        routineName: 'Treino A - Peito',
        startedAt: new Date('2026-10-12T18:00:00').getTime(),
        endedAt: new Date('2026-10-12T19:00:00').getTime(),
        durationMinutes: 60,
        exercises: [],
        totalVolumeKg: 3500,
        totalSetsCompleted: 15,
        status: 'completed',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const habits: Habit[] = [
      {
        id: 'h-1',
        name: 'Beber Água',
        icon: 'droplets',
        color: '#3b82f6',
        category: 'saude',
        frequencyType: 'daily',
        targetType: 'numeric',
        targetValue: 2000,
        startDate: '2026-10-01',
        isArchived: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const habitLogs: HabitLog[] = [
      { id: 'hl-1', habitId: 'h-1', date: '2026-10-12', completed: true, currentValue: 2000, createdAt: 1, updatedAt: 1 },
      { id: 'hl-2', habitId: 'h-1', date: '2026-10-13', completed: true, currentValue: 2000, createdAt: 1, updatedAt: 1 },
    ];

    const report = calculateWeeklyReport({
      weekStartStr: '2026-10-12',
      weekEndStr: '2026-10-18',
      sessions,
      tasks,
      subjects,
      gymWorkouts,
      habits,
      habitLogs,
      preferences: {
        id: 'p',
        dailyGoalMinutes: 60,
        primaryArea: 'software_engineering',
        breakIntervalMinutes: 5,
        theme: 'light',
        weeklyAvailability: [],
        updatedAt: 1,
      },
      gymPreferences: { id: 'gp', weeklyGoalDays: 3, preferredDays: [1, 3, 5], plannedRoutineMap: {}, defaultRestSeconds: 90, updatedAt: 1 },
    });

    // 1. Estudos: 60 + 30 = 90 minutos
    expect(report.study.totalStudiedMinutes).toBe(90);
    expect(report.study.completedSessionsCount).toBe(2);
    expect(report.study.completedTasksCount).toBe(1);
    expect(report.study.timeBySubject[0].subjectName).toBe('React & TypeScript');
    expect(report.study.timeBySubject[0].minutes).toBe(60);
    expect(report.study.timeBySubject[0].percentage).toBe(67);

    // 2. Academia: 1 treino, 60m, 3500kg
    expect(report.gym.completedWorkoutsCount).toBe(1);
    expect(report.gym.totalDurationMinutes).toBe(60);
    expect(report.gym.totalVolumeKg).toBe(3500);

    // 3. Hábitos
    expect(report.habits.completedCount).toBeGreaterThanOrEqual(2);
  });

  it('safely compares two weekly reports without division by zero', () => {
    const emptyReport = calculateWeeklyReport({
      weekStartStr: '2026-10-05',
      weekEndStr: '2026-10-11',
      sessions: [],
      tasks: [],
      subjects: [],
      gymWorkouts: [],
      habits: [],
      habitLogs: [],
    });

    const activeReport = calculateWeeklyReport({
      weekStartStr: '2026-10-12',
      weekEndStr: '2026-10-18',
      sessions: [
        {
          id: 's-1',
          actualDurationSeconds: 7200, // 120 min
          startedAt: new Date('2026-10-12T10:00:00').getTime(),
          status: 'completed',
          mode: 'pomodoro',
          plannedDurationMinutes: 120,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      tasks: [],
      subjects: [],
      gymWorkouts: [],
      habits: [],
      habitLogs: [],
    });

    const comparison = compareWeeklyReports(activeReport, emptyReport);
    expect(comparison.hasPreviousData).toBe(false);
    expect(comparison.studyMinutesDiff).toBe(120);
    // Quando anterior = 0, variação percentual segura é 100% (não NaN ou Infinity)
    expect(comparison.studyMinutesPercentChange).toBe(100);
  });

  it('generates rule-based deterministic highlights and suggestions', () => {
    const report = calculateWeeklyReport({
      weekStartStr: '2026-10-12',
      weekEndStr: '2026-10-18',
      sessions: [
        {
          id: 's-1',
          actualDurationSeconds: 3600, // 60 min
          startedAt: new Date('2026-10-12T10:00:00').getTime(),
          status: 'completed',
          mode: 'pomodoro',
          plannedDurationMinutes: 60,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      tasks: [],
      subjects: [{ id: 'sub-1', name: 'Java', color: '#f59e0b', priority: 'high', targetMinutesPerWeek: 120, archived: false, createdAt: 1, updatedAt: 1 }],
      gymWorkouts: [
        {
          id: 'gw-1',
          routineName: 'Treino A',
          startedAt: new Date('2026-10-12T18:00:00').getTime(),
          durationMinutes: 45,
          totalVolumeKg: 2000,
          totalSetsCompleted: 12,
          exercises: [],
          status: 'completed',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      habits: [],
      habitLogs: [],
      gymPreferences: { id: 'gp', weeklyGoalDays: 1, preferredDays: [1], plannedRoutineMap: {}, defaultRestSeconds: 90, updatedAt: 1 },
    });

    const comparison = compareWeeklyReports(report, report);
    const { highlights, suggestions } = generateWeeklyHighlights(report, comparison);

    expect(highlights.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeGreaterThan(0);
    // Verifica que destacou a meta de treinos atingida (1 de 1)
    expect(highlights.some((h) => h.includes('Meta de treinos conquistada'))).toBe(true);
  });
});
