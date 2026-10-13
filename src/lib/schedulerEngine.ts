import type { DayAvailability, Task, Flashcard, PlannedActivity } from '../types';
import { formatDateToLocalYYYYMMDD, addDaysToDate } from './srsEngine';

export interface SchedulerInput {
  weekStartDate: Date; // Segunda-feira da semana
  availability: DayAvailability[]; // 0..6
  pendingTasks: Task[];
  dueFlashcards: Flashcard[];
}

export interface SchedulerOutput {
  plannedActivities: PlannedActivity[];
  totalPlannedMinutes: number;
  unallocatedTasks: Task[];
  totalOverloadMinutes: number;
  dailyLoads: {
    date: string;
    dayOfWeek: number;
    allocatedMinutes: number;
    capacityMinutes: number;
    activitiesCount: number;
  }[];
}

/**
 * Algoritmo Heurístico de Agendamento Semanal Determinístico
 * Regras:
 * 1. Aloca Flashcards vencidos no primeiro dia disponível (carga de 15 min por lote)
 * 2. Ordena Tarefas por: Prazo mais próximo > Prioridade Alta > Data de criação
 * 3. Encaixa nos dias da semana respeitando estritamente o limite de tempo de cada dia
 * 4. Reporta tarefas não alocadas e tempo excedente com total transparência
 */
export function generateWeeklySchedule(input: SchedulerInput): SchedulerOutput {
  const { weekStartDate, availability, pendingTasks, dueFlashcards } = input;
  const plannedActivities: PlannedActivity[] = [];
  const unallocatedTasks: Task[] = [];
  const planId = `plan-${Date.now()}`;

  // Mapa de capacidade e consumo diário para os 7 dias da semana
  const days = Array.from({ length: 7 }, (_, i) => {
    const dateObj = addDaysToDate(weekStartDate, i);
    const dayOfWeek = dateObj.getDay(); // 0 (Dom) a 6 (Sáb)
    const avail = availability.find((a) => a.dayOfWeek === dayOfWeek);
    const capacityMinutes = avail ? avail.minutesAvailable : 0;

    return {
      date: formatDateToLocalYYYYMMDD(dateObj),
      dayOfWeek,
      capacityMinutes,
      allocatedMinutes: 0,
    };
  });

  // 1. Alocar revisões de Flashcards no primeiro dia da semana com capacidade disponível
  if (dueFlashcards.length > 0) {
    const flashcardTime = 20; // 20 min reservados para bloco de revisões
    const targetDay = days.find((d) => d.capacityMinutes - d.allocatedMinutes >= flashcardTime);
    if (targetDay) {
      targetDay.allocatedMinutes += flashcardTime;
      plannedActivities.push({
        id: `act-flashcards-${targetDay.date}`,
        planId,
        date: targetDay.date,
        plannedMinutes: flashcardTime,
        flashcardReview: true,
        completed: false,
        createdAt: Date.now(),
      });
    }
  }

  // 2. Ordenar tarefas pendentes por urgência
  const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sortedTasks = [...pendingTasks].sort((a, b) => {
    // Prazo mais próximo primeiro
    if (a.dueDate && b.dueDate) {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    } else if (a.dueDate) {
      return -1;
    } else if (b.dueDate) {
      return 1;
    }
    // Maior prioridade
    const pDiff = (priorityWeight[b.priority] || 1) - (priorityWeight[a.priority] || 1);
    if (pDiff !== 0) return pDiff;
    // Mais antiga
    return a.createdAt - b.createdAt;
  });

  // 3. Alocar tarefas nos dias disponíveis
  for (const task of sortedTasks) {
    const duration = task.estimatedMinutes > 0 ? task.estimatedMinutes : 30; // fallback 30m
    let allocated = false;

    for (const day of days) {
      const remainingSpace = day.capacityMinutes - day.allocatedMinutes;
      if (remainingSpace >= duration) {
        day.allocatedMinutes += duration;
        plannedActivities.push({
          id: `act-task-${task.id}-${day.date}`,
          planId,
          date: day.date,
          plannedMinutes: duration,
          subjectId: task.subjectId,
          taskId: task.id,
          completed: false,
          createdAt: Date.now(),
        });
        allocated = true;
        break;
      }
    }

    if (!allocated) {
      unallocatedTasks.push(task);
    }
  }

  const totalPlannedMinutes = plannedActivities.reduce((acc, a) => acc + a.plannedMinutes, 0);
  const totalOverloadMinutes = unallocatedTasks.reduce((acc, t) => acc + (t.estimatedMinutes || 30), 0);

  const dailyLoads = days.map((d) => ({
    date: d.date,
    dayOfWeek: d.dayOfWeek,
    allocatedMinutes: d.allocatedMinutes,
    capacityMinutes: d.capacityMinutes,
    activitiesCount: plannedActivities.filter((a) => a.date === d.date).length,
  }));

  return {
    plannedActivities,
    totalPlannedMinutes,
    unallocatedTasks,
    totalOverloadMinutes,
    dailyLoads,
  };
}
