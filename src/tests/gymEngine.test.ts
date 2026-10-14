import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateGymWeeklyStats,
  calculateWorkoutVolume,
  calculateExercisePRs,
  getRemainingRestSeconds,
  saveActiveWorkoutState,
  loadActiveWorkoutState,
  clearActiveWorkoutState,
  getPreviousPerformanceForSet,
  isValidCompletedWorkout,
} from '../lib/gymEngine';
import type { GymWorkout, GymWorkoutExerciseLog, ActiveWorkoutState } from '../types';

describe('gymEngine', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = String(value);
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };
  });

  it('calculates workout volume and completed sets correctly', () => {
    const exercises: GymWorkoutExerciseLog[] = [
      {
        exerciseId: 'ex-supino',
        name: 'Supino Reto',
        muscleGroup: 'peito',
        sets: [
          { setNumber: 1, weightKg: 60, reps: 10, completed: true },
          { setNumber: 2, weightKg: 70, reps: 8, completed: true },
          { setNumber: 3, weightKg: 80, reps: 6, completed: false }, // Não concluída -> ignorada
        ],
      },
      {
        exerciseId: 'ex-barra-fixa',
        name: 'Barra Fixa',
        muscleGroup: 'costas',
        sets: [
          { setNumber: 1, weightKg: 0, reps: 12, completed: true }, // Peso corporal = 0kg
        ],
      },
    ];

    const { totalVolumeKg, totalSetsCompleted } = calculateWorkoutVolume(exercises);
    // (60*10 = 600) + (70*8 = 560) + (0*12 = 0) = 1160 kg
    expect(totalVolumeKg).toBe(1160);
    expect(totalSetsCompleted).toBe(3);
  });

  it('extracts exercise PRs (max weight, max set volume and history)', () => {
    const workouts: GymWorkout[] = [
      {
        id: 'w-1',
        routineName: 'Treino A',
        startedAt: new Date(2026, 9, 1, 10, 0).getTime(),
        durationMinutes: 50,
        status: 'completed',
        totalVolumeKg: 1000,
        totalSetsCompleted: 3,
        createdAt: 0,
        updatedAt: 0,
        exercises: [
          {
            exerciseId: 'ex-supino',
            name: 'Supino Reto',
            muscleGroup: 'peito',
            sets: [
              { setNumber: 1, weightKg: 50, reps: 10, completed: true },
              { setNumber: 2, weightKg: 60, reps: 8, completed: true },
            ],
          },
        ],
      },
      {
        id: 'w-2',
        routineName: 'Treino A',
        startedAt: new Date(2026, 9, 8, 10, 0).getTime(),
        durationMinutes: 55,
        status: 'completed',
        totalVolumeKg: 1200,
        totalSetsCompleted: 2,
        createdAt: 0,
        updatedAt: 0,
        exercises: [
          {
            exerciseId: 'ex-supino',
            name: 'Supino Reto',
            muscleGroup: 'peito',
            sets: [
              { setNumber: 1, weightKg: 70, reps: 6, completed: true }, // Novo PR de peso: 70kg
              { setNumber: 2, weightKg: 65, reps: 8, completed: true }, // Volume: 520kg
            ],
          },
        ],
      },
    ];

    const pr = calculateExercisePRs(workouts, 'ex-supino');
    expect(pr.maxWeightKg).toBe(70);
    expect(pr.maxRepsAtMaxWeight).toBe(6);
    expect(pr.totalTimesPerformed).toBe(2);
    expect(pr.totalSetsCompleted).toBe(4);
    expect(pr.history.length).toBe(4);
  });

  it('calculates weekly stats and weekly streak properly', () => {
    // Referência: Quarta-feira, 14 de Outubro de 2026
    const refDate = new Date(2026, 9, 14, 12, 0, 0);

    // Semana atual: 12/10 (Seg) a 18/10 (Dom)
    // Semana passada: 05/10 (Seg) a 11/10 (Dom)
    const tCurrentWeek1 = new Date(2026, 9, 12, 18, 0).getTime();
    const tCurrentWeek2 = new Date(2026, 9, 13, 18, 0).getTime();

    const tPastWeek1 = new Date(2026, 9, 5, 18, 0).getTime();
    const tPastWeek2 = new Date(2026, 9, 6, 18, 0).getTime();
    const tPastWeek3 = new Date(2026, 9, 8, 18, 0).getTime();

    const workouts: GymWorkout[] = [
      { id: 'w-1', routineName: 'A', startedAt: tCurrentWeek1, durationMinutes: 60, status: 'completed', totalVolumeKg: 1000, totalSetsCompleted: 10, createdAt: 0, updatedAt: 0, exercises: [] },
      { id: 'w-2', routineName: 'B', startedAt: tCurrentWeek2, durationMinutes: 45, status: 'completed', totalVolumeKg: 1000, totalSetsCompleted: 10, createdAt: 0, updatedAt: 0, exercises: [] },
      { id: 'w-3', routineName: 'A', startedAt: tPastWeek1, durationMinutes: 60, status: 'completed', totalVolumeKg: 1000, totalSetsCompleted: 10, createdAt: 0, updatedAt: 0, exercises: [] },
      { id: 'w-4', routineName: 'B', startedAt: tPastWeek2, durationMinutes: 60, status: 'completed', totalVolumeKg: 1000, totalSetsCompleted: 10, createdAt: 0, updatedAt: 0, exercises: [] },
      { id: 'w-5', routineName: 'C', startedAt: tPastWeek3, durationMinutes: 60, status: 'completed', totalVolumeKg: 1000, totalSetsCompleted: 10, createdAt: 0, updatedAt: 0, exercises: [] },
    ];

    // Meta semanal de 3 treinos
    const stats = calculateGymWeeklyStats(workouts, 3, refDate);
    expect(stats.workoutsThisWeekCount).toBe(2);
    expect(stats.totalMinutesThisWeek).toBe(105);
    expect(stats.lastWorkout?.id).toBe('w-2');
    // Semana passada bateu a meta (3 treinos >= 3); semana atual tem 2, preserva streak de 1
    expect(stats.weeklyStreak).toBe(1);
  });

  it('ignores accidental 0-set workouts when computing weekly stats', () => {
    const refDate = new Date(2026, 9, 14, 12, 0, 0); // Quarta-feira
    const tCurrentWeek1 = new Date(2026, 9, 14, 10, 0).getTime();

    // Treino iniciado e parado por engano: 0 séries concluídas, 1 minuto de duração
    const accidentalWorkout: GymWorkout = {
      id: 'w-accidental',
      routineName: 'Treino A',
      startedAt: tCurrentWeek1,
      durationMinutes: 1,
      status: 'completed',
      totalVolumeKg: 0,
      totalSetsCompleted: 0,
      createdAt: tCurrentWeek1,
      updatedAt: tCurrentWeek1,
      exercises: [],
    };

    expect(isValidCompletedWorkout(accidentalWorkout)).toBe(false);

    // Sem treinos válidos, deve retornar 0 de meta semanal
    const stats = calculateGymWeeklyStats([accidentalWorkout], 4, refDate);
    expect(stats.workoutsThisWeekCount).toBe(0);
    expect(stats.progressPercent).toBe(0);
    expect(stats.lastWorkout).toBeNull();
  });

  it('calculates remaining rest seconds accurately', () => {
    const startedAt = 100000;
    expect(getRemainingRestSeconds(startedAt, 60, 100000)).toBe(60);
    expect(getRemainingRestSeconds(startedAt, 60, 120000)).toBe(40);
    expect(getRemainingRestSeconds(startedAt, 60, 160000)).toBe(0);
    expect(getRemainingRestSeconds(startedAt, 60, 200000)).toBe(0);
  });

  it('persists and restores active workout state across page reloads', () => {
    const state: ActiveWorkoutState = {
      id: 'active-1',
      routineId: 'routine-abc-a',
      routineName: 'Treino A',
      startedAt: Date.now(),
      elapsedSeconds: 300,
      isPaused: false,
      exercises: [],
    };

    saveActiveWorkoutState(state);
    const loaded = loadActiveWorkoutState();
    expect(loaded).toBeDefined();
    expect(loaded?.routineName).toBe('Treino A');
    expect(loaded?.elapsedSeconds).toBe(300);

    clearActiveWorkoutState();
    expect(loadActiveWorkoutState()).toBeNull();
  });

  it('retrieves previous performance for exercise set accurately', () => {
    const workouts: GymWorkout[] = [
      {
        id: 'w-old',
        routineName: 'Treino A',
        startedAt: 1000000,
        durationMinutes: 45,
        status: 'completed',
        totalVolumeKg: 1000,
        totalSetsCompleted: 2,
        createdAt: 0,
        updatedAt: 0,
        exercises: [
          {
            exerciseId: 'ex-supino',
            name: 'Supino',
            muscleGroup: 'peito',
            sets: [
              { setNumber: 1, weightKg: 70, reps: 10, completed: true },
              { setNumber: 2, weightKg: 75, reps: 8, completed: true },
            ],
          },
        ],
      },
      {
        id: 'w-recent',
        routineName: 'Treino A',
        startedAt: 2000000,
        durationMinutes: 45,
        status: 'completed',
        totalVolumeKg: 1200,
        totalSetsCompleted: 2,
        createdAt: 0,
        updatedAt: 0,
        exercises: [
          {
            exerciseId: 'ex-supino',
            name: 'Supino',
            muscleGroup: 'peito',
            sets: [
              { setNumber: 1, weightKg: 72.5, reps: 10, completed: true },
              { setNumber: 2, weightKg: 77.5, reps: 8, completed: true },
            ],
          },
        ],
      },
    ];

    // Deve puxar do treino mais recente (w-recent)
    const prevSet1 = getPreviousPerformanceForSet(workouts, 'ex-supino', 0);
    expect(prevSet1).toBeDefined();
    expect(prevSet1?.weightKg).toBe(72.5);
    expect(prevSet1?.reps).toBe(10);

    const prevSet2 = getPreviousPerformanceForSet(workouts, 'ex-supino', 1);
    expect(prevSet2).toBeDefined();
    expect(prevSet2?.weightKg).toBe(77.5);
    expect(prevSet2?.reps).toBe(8);

    // Exercício inexistente
    expect(getPreviousPerformanceForSet(workouts, 'ex-inexistente', 0)).toBeNull();
  });
});
