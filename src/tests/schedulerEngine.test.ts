import { describe, it, expect } from 'vitest';
import { generateWeeklySchedule } from '../lib/schedulerEngine';
import type { Task, DayAvailability, Flashcard } from '../types';

describe('Scheduler Engine (Planejador Semanal Heurístico)', () => {
  const weekStartDate = new Date(2026, 9, 12); // Segunda-feira, 12 de Outubro de 2026

  const availability: DayAvailability[] = [
    { dayOfWeek: 1, minutesAvailable: 60 }, // Segunda: 60m
    { dayOfWeek: 2, minutesAvailable: 60 }, // Terça: 60m
    { dayOfWeek: 3, minutesAvailable: 0 },  // Quarta: Folga
    { dayOfWeek: 4, minutesAvailable: 60 }, // Quinta: 60m
    { dayOfWeek: 5, minutesAvailable: 60 }, // Sexta: 60m
    { dayOfWeek: 6, minutesAvailable: 0 },  // Sáb
    { dayOfWeek: 0, minutesAvailable: 0 },  // Dom
  ];

  it('aloca tarefas dentro dos limites de capacidade diária', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Estudar S3',
        subjectId: 'sub-aws',
        priority: 'high',
        estimatedMinutes: 40,
        actualStudiedMinutes: 0,
        status: 'pending',
        createdAt: 100,
        updatedAt: 100,
      },
      {
        id: 't2',
        title: 'Queries SQL',
        subjectId: 'sub-sql',
        priority: 'medium',
        estimatedMinutes: 50,
        actualStudiedMinutes: 0,
        status: 'pending',
        createdAt: 200,
        updatedAt: 200,
      },
    ];

    const result = generateWeeklySchedule({
      weekStartDate,
      availability,
      pendingTasks: tasks,
      dueFlashcards: [],
    });

    expect(result.plannedActivities.length).toBe(2);
    expect(result.unallocatedTasks.length).toBe(0);
    // t1 entra na Segunda (40 min de 60). t2 (50 min) não cabe nos 20 min restantes da Segunda, então pula para Terça
    expect(result.plannedActivities[0].taskId).toBe('t1');
    expect(result.plannedActivities[1].taskId).toBe('t2');
  });

  it('identifica sobrecarga e tarefas não alocadas quando o tempo estoura', () => {
    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Tarefa Pesada 1',
        subjectId: 'sub-aws',
        priority: 'high',
        estimatedMinutes: 120, // maior que os 60m disponíveis em qualquer dia individual
        actualStudiedMinutes: 0,
        status: 'pending',
        createdAt: 100,
        updatedAt: 100,
      },
    ];

    const result = generateWeeklySchedule({
      weekStartDate,
      availability,
      pendingTasks: tasks,
      dueFlashcards: [],
    });

    expect(result.unallocatedTasks.length).toBe(1);
    expect(result.totalOverloadMinutes).toBe(120);
    expect(result.unallocatedTasks[0].id).toBe('t1');
  });

  it('prioriza flashcards vencidos', () => {
    const flashcards: Flashcard[] = [
      {
        id: 'fc-1',
        front: 'O que é S3?',
        back: 'Storage',
        subjectId: 'sub-aws',
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        nextReviewDate: '2026-10-12',
        reviewsCount: 1,
        archived: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const result = generateWeeklySchedule({
      weekStartDate,
      availability,
      pendingTasks: [],
      dueFlashcards: flashcards,
    });

    expect(result.plannedActivities.length).toBe(1);
    expect(result.plannedActivities[0].flashcardReview).toBe(true);
    expect(result.plannedActivities[0].plannedMinutes).toBe(20);
  });
});
