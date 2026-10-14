import { describe, it, expect } from 'vitest';
import { generateWeeklyReviewAnalysis } from '../lib/weeklyReviewEngine';
import type { StudySession } from '../types';

describe('Weekly Review Engine (Análise Semanal Determinística)', () => {
  const weekStartDate = new Date(2026, 9, 12); // Segunda-feira, 12 de Outubro de 2026

  it('calcula indicadores e taxa de cumprimento de meta corretamente', () => {
    const sessions: StudySession[] = [
      {
        id: 's1',
        subjectId: 'sub-aws',
        mode: 'pomodoro',
        plannedDurationMinutes: 25,
        actualDurationSeconds: 1500, // 25 min
        startedAt: new Date(2026, 9, 12, 10, 0).getTime(),
        status: 'completed',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 's2',
        subjectId: 'sub-sql',
        mode: 'deep_work',
        plannedDurationMinutes: 50,
        actualDurationSeconds: 3000, // 50 min
        startedAt: new Date(2026, 9, 13, 15, 0).getTime(),
        status: 'completed',
        createdAt: 2,
        updatedAt: 2,
      },
    ];

    const result = generateWeeklyReviewAnalysis({
      weekStartDate,
      sessions,
      weeklyGoalMinutes: 100,
      subjectNames: { 'sub-aws': 'AWS', 'sub-sql': 'PostgreSQL' },
      prioritySubjectIds: ['sub-aws', 'sub-sql'],
    });

    expect(result.totalStudiedMinutes).toBe(75);
    expect(result.goalCompletionRate).toBe(75);
    expect(result.sessionsCount).toBe(2);
    expect(result.daysStudiedCount).toBe(2);
    expect(result.subjectDistribution['sub-aws']).toBe(25);
    expect(result.subjectDistribution['sub-sql']).toBe(50);
  });

  it('detecta negligência em matérias prioritárias e concentração excessiva', () => {
    const sessions: StudySession[] = [
      {
        id: 's1',
        subjectId: 'sub-aws',
        mode: 'deep_work',
        plannedDurationMinutes: 120,
        actualDurationSeconds: 7200, // 120 min
        startedAt: new Date(2026, 9, 12, 10, 0).getTime(),
        status: 'completed',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const result = generateWeeklyReviewAnalysis({
      weekStartDate,
      sessions,
      weeklyGoalMinutes: 120,
      subjectNames: { 'sub-aws': 'AWS', 'sub-sql': 'PostgreSQL' },
      prioritySubjectIds: ['sub-aws', 'sub-sql'],
    });

    // Deve alertar que PostgreSQL não recebeu tempo
    const hasSqlAlert = result.observations.some((obs) => obs.includes('PostgreSQL'));
    expect(hasSqlAlert).toBe(true);

    // Deve sugerir PostgreSQL como foco para a próxima semana
    expect(result.proposedNextPlan?.recommendedFocusSubjectId).toBe('sub-sql');
  });
});
