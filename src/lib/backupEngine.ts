import { z } from 'zod';
import { db } from './db';
import type {
  Subject,
  Task,
  LearningPath,
  StudySession,
  Flashcard,
  StudyPreferences,
  StudyPlan,
  WeeklyReview,
  PortfolioProject,
  CollegeClassSchedule,
  SubjectGradeConfig,
  GymExercise,
  GymRoutine,
  GymWorkout,
  GymMeasurement,
  GymPreferences,
  Habit,
  HabitLog,
} from '../types';

export const BackupSchema = z.object({
  version: z.number(),
  appName: z.literal('FocusUp'),
  exportedAt: z.string(),
  data: z.object({
    subjects: z.array(z.any()),
    tasks: z.array(z.any()),
    learningPaths: z.array(z.any()),
    studySessions: z.array(z.any()),
    flashcards: z.array(z.any()),
    preferences: z.array(z.any()),
    studyPlans: z.array(z.any()),
    weeklyReviews: z.array(z.any()),
    portfolioProjects: z.array(z.any()),
    collegeClasses: z.array(z.any()).optional(),
    subjectGrades: z.array(z.any()).optional(),
    gymExercises: z.array(z.any()).optional(),
    gymRoutines: z.array(z.any()).optional(),
    gymWorkouts: z.array(z.any()).optional(),
    gymMeasurements: z.array(z.any()).optional(),
    gymPreferences: z.array(z.any()).optional(),
    habits: z.array(z.any()).optional(),
    habitLogs: z.array(z.any()).optional(),
    financeTransactions: z.array(z.any()).optional(),
    financeCards: z.array(z.any()).optional(),
    financeCategories: z.array(z.any()).optional(),
    financeBudgets: z.array(z.any()).optional(),
  }),
});

export type BackupPayload = z.infer<typeof BackupSchema>;

/**
 * Exporta todos os dados do banco local para um objeto JSON estruturado
 */
export async function exportAllData(): Promise<string> {
  const [
    subjects,
    tasks,
    learningPaths,
    studySessions,
    flashcards,
    preferences,
    studyPlans,
    weeklyReviews,
    portfolioProjects,
    collegeClasses,
    subjectGrades,
    gymExercises,
    gymRoutines,
    gymWorkouts,
    gymMeasurements,
    gymPreferences,
    habits,
    habitLogs,
    financeTransactions,
    financeCards,
    financeCategories,
    financeBudgets,
  ] = await Promise.all([
    db.subjects.toArray(),
    db.tasks.toArray(),
    db.learningPaths.toArray(),
    db.studySessions.toArray(),
    db.flashcards.toArray(),
    db.preferences.toArray(),
    db.studyPlans.toArray(),
    db.weeklyReviews.toArray(),
    db.portfolioProjects.toArray(),
    db.collegeClasses.toArray(),
    db.subjectGrades.toArray(),
    db.gymExercises.toArray(),
    db.gymRoutines.toArray(),
    db.gymWorkouts.toArray(),
    db.gymMeasurements.toArray(),
    db.gymPreferences.toArray(),
    db.habits.toArray(),
    db.habitLogs.toArray(),
    db.financeTransactions.toArray(),
    db.financeCards.toArray(),
    db.financeCategories.toArray(),
    db.financeBudgets.toArray(),
  ]);

  const payload: BackupPayload = {
    version: 1,
    appName: 'FocusUp',
    exportedAt: new Date().toISOString(),
    data: {
      subjects,
      tasks,
      learningPaths,
      studySessions,
      flashcards,
      preferences,
      studyPlans,
      weeklyReviews,
      portfolioProjects,
      collegeClasses,
      subjectGrades,
      gymExercises,
      gymRoutines,
      gymWorkouts,
      gymMeasurements,
      gymPreferences,
      habits,
      habitLogs,
      financeTransactions,
      financeCards,
      financeCategories,
      financeBudgets,
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function validateBackupString(jsonStr: string): { success: true; payload: BackupPayload } | { success: false; error: string } {
  try {
    const raw = JSON.parse(jsonStr);
    const parsed = BackupSchema.safeParse(raw);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') };
    }
    return { success: true, payload: parsed.data };
  } catch {
    return { success: false, error: 'Arquivo JSON inválido ou corrompido.' };
  }
}

/**
 * Modo 1: Substituição total e atômica dos dados existentes
 */
export async function restoreByReplacement(payload: BackupPayload): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.subjects,
      db.tasks,
      db.learningPaths,
      db.studySessions,
      db.flashcards,
      db.preferences,
      db.studyPlans,
      db.weeklyReviews,
      db.portfolioProjects,
      db.collegeClasses,
      db.subjectGrades,
      db.gymExercises,
      db.gymRoutines,
      db.gymWorkouts,
      db.gymMeasurements,
      db.gymPreferences,
      db.habits,
      db.habitLogs,
      db.financeTransactions,
      db.financeCards,
      db.financeCategories,
      db.financeBudgets,
    ],
    async () => {
      await db.subjects.clear();
      await db.tasks.clear();
      await db.learningPaths.clear();
      await db.studySessions.clear();
      await db.flashcards.clear();
      await db.preferences.clear();
      await db.studyPlans.clear();
      await db.weeklyReviews.clear();
      await db.portfolioProjects.clear();
      await db.collegeClasses.clear();
      await db.subjectGrades.clear();
      await db.gymExercises.clear();
      await db.gymRoutines.clear();
      await db.gymWorkouts.clear();
      await db.gymMeasurements.clear();
      await db.gymPreferences.clear();
      await db.habits.clear();
      await db.habitLogs.clear();
      await db.financeTransactions.clear();
      await db.financeCards.clear();
      await db.financeCategories.clear();
      await db.financeBudgets.clear();

      const d = payload.data;
      if (d.subjects.length) await db.subjects.bulkAdd(d.subjects as Subject[]);
      if (d.tasks.length) await db.tasks.bulkAdd(d.tasks as Task[]);
      if (d.learningPaths.length) await db.learningPaths.bulkAdd(d.learningPaths as LearningPath[]);
      if (d.studySessions.length) await db.studySessions.bulkAdd(d.studySessions as StudySession[]);
      if (d.flashcards.length) await db.flashcards.bulkAdd(d.flashcards as Flashcard[]);
      if (d.preferences.length) await db.preferences.bulkAdd(d.preferences as StudyPreferences[]);
      if (d.studyPlans.length) await db.studyPlans.bulkAdd(d.studyPlans as StudyPlan[]);
      if (d.weeklyReviews.length) await db.weeklyReviews.bulkAdd(d.weeklyReviews as WeeklyReview[]);
      if (d.portfolioProjects.length) await db.portfolioProjects.bulkAdd(d.portfolioProjects as PortfolioProject[]);
      if (d.collegeClasses?.length) await db.collegeClasses.bulkAdd(d.collegeClasses as CollegeClassSchedule[]);
      if (d.subjectGrades?.length) await db.subjectGrades.bulkAdd(d.subjectGrades as SubjectGradeConfig[]);
      if (d.gymExercises?.length) await db.gymExercises.bulkAdd(d.gymExercises as GymExercise[]);
      if (d.gymRoutines?.length) await db.gymRoutines.bulkAdd(d.gymRoutines as GymRoutine[]);
      if (d.gymWorkouts?.length) await db.gymWorkouts.bulkAdd(d.gymWorkouts as GymWorkout[]);
      if (d.gymMeasurements?.length) await db.gymMeasurements.bulkAdd(d.gymMeasurements as GymMeasurement[]);
      if (d.gymPreferences?.length) await db.gymPreferences.bulkAdd(d.gymPreferences as GymPreferences[]);
      if (d.habits?.length) await db.habits.bulkAdd(d.habits as Habit[]);
      if (d.habitLogs?.length) await db.habitLogs.bulkAdd(d.habitLogs as HabitLog[]);
      if (d.financeTransactions?.length) await db.financeTransactions.bulkAdd(d.financeTransactions);
      if (d.financeCards?.length) await db.financeCards.bulkAdd(d.financeCards);
      if (d.financeCategories?.length) await db.financeCategories.bulkAdd(d.financeCategories);
      if (d.financeBudgets?.length) await db.financeBudgets.bulkAdd(d.financeBudgets);
    }
  );
}

/**
 * Função utilitária de merge determinístico Last-Write-Wins (LWW) para arrays
 */
export function mergeEntitiesLWW<T extends { id: string; updatedAt?: number }>(
  localEntities: T[],
  incomingEntities: T[]
): { merged: T[]; updatedCount: number; addedCount: number } {
  const map = new Map<string, T>();
  localEntities.forEach((item) => map.set(item.id, item));

  let updatedCount = 0;
  let addedCount = 0;

  for (const incoming of incomingEntities) {
    const existing = map.get(incoming.id);
    if (!existing) {
      map.set(incoming.id, incoming);
      addedCount++;
    } else {
      const incomingTime = incoming.updatedAt || 0;
      const existingTime = existing.updatedAt || 0;
      if (incomingTime > existingTime) {
        map.set(incoming.id, incoming);
        updatedCount++;
      }
    }
  }

  return {
    merged: Array.from(map.values()),
    updatedCount,
    addedCount,
  };
}

/**
 * Modo 2: Mesclagem determinística Last-Write-Wins (LWW) preservando integridade local
 */
export async function restoreByMerge(payload: BackupPayload): Promise<{ added: number; updated: number }> {
  let totalAdded = 0;
  let totalUpdated = 0;

  await db.transaction(
    'rw',
    [
      db.subjects,
      db.tasks,
      db.learningPaths,
      db.studySessions,
      db.flashcards,
      db.preferences,
      db.studyPlans,
      db.weeklyReviews,
      db.portfolioProjects,
      db.collegeClasses,
      db.subjectGrades,
      db.gymExercises,
      db.gymRoutines,
      db.gymWorkouts,
      db.gymMeasurements,
      db.gymPreferences,
      db.habits,
      db.habitLogs,
      db.financeTransactions,
      db.financeCards,
      db.financeCategories,
      db.financeBudgets,
    ],
    async () => {
      const [
        localSubjects,
        localTasks,
        localPaths,
        localSessions,
        localCards,
        localPreferences,
        localPlans,
        localReviews,
        localProjects,
        localClasses,
        localGrades,
        localGymExercises,
        localGymRoutines,
        localGymWorkouts,
        localGymMeasurements,
        localGymPreferences,
        localHabits,
        localHabitLogs,
        localFinanceTransactions,
        localFinanceCards,
        localFinanceCategories,
        localFinanceBudgets,
      ] = await Promise.all([
        db.subjects.toArray(),
        db.tasks.toArray(),
        db.learningPaths.toArray(),
        db.studySessions.toArray(),
        db.flashcards.toArray(),
        db.preferences.toArray(),
        db.studyPlans.toArray(),
        db.weeklyReviews.toArray(),
        db.portfolioProjects.toArray(),
        db.collegeClasses.toArray(),
        db.subjectGrades.toArray(),
        db.gymExercises.toArray(),
        db.gymRoutines.toArray(),
        db.gymWorkouts.toArray(),
        db.gymMeasurements.toArray(),
        db.gymPreferences.toArray(),
        db.habits.toArray(),
        db.habitLogs.toArray(),
        db.financeTransactions.toArray(),
        db.financeCards.toArray(),
        db.financeCategories.toArray(),
        db.financeBudgets.toArray(),
      ]);

      const d = payload.data;

      const subRes = mergeEntitiesLWW(localSubjects, d.subjects as Subject[]);
      const taskRes = mergeEntitiesLWW(localTasks, d.tasks as Task[]);
      const pathRes = mergeEntitiesLWW(localPaths, d.learningPaths as LearningPath[]);
      const sessRes = mergeEntitiesLWW(localSessions, d.studySessions as StudySession[]);
      const cardRes = mergeEntitiesLWW(localCards, d.flashcards as Flashcard[]);
      const prefRes = mergeEntitiesLWW(localPreferences, d.preferences as StudyPreferences[]);
      const planRes = mergeEntitiesLWW(localPlans, d.studyPlans as StudyPlan[]);
      const revRes = mergeEntitiesLWW(localReviews, d.weeklyReviews as WeeklyReview[]);
      const projRes = mergeEntitiesLWW(localProjects, d.portfolioProjects as PortfolioProject[]);
      const classRes = mergeEntitiesLWW(localClasses, (d.collegeClasses || []) as CollegeClassSchedule[]);
      const gradeRes = mergeEntitiesLWW(localGrades, (d.subjectGrades || []) as SubjectGradeConfig[]);
      const gymExRes = mergeEntitiesLWW(localGymExercises, (d.gymExercises || []) as GymExercise[]);
      const gymRoutineRes = mergeEntitiesLWW(localGymRoutines, (d.gymRoutines || []) as GymRoutine[]);
      const gymWorkoutRes = mergeEntitiesLWW(localGymWorkouts, (d.gymWorkouts || []) as GymWorkout[]);
      const gymMeasureRes = mergeEntitiesLWW(localGymMeasurements, (d.gymMeasurements || []) as GymMeasurement[]);
      const gymPrefRes = mergeEntitiesLWW(localGymPreferences, (d.gymPreferences || []) as GymPreferences[]);
      const habitRes = mergeEntitiesLWW(localHabits, (d.habits || []) as Habit[]);
      const habitLogRes = mergeEntitiesLWW(localHabitLogs, (d.habitLogs || []) as HabitLog[]);
      const finTxRes = mergeEntitiesLWW(localFinanceTransactions, d.financeTransactions || []);
      const finCardRes = mergeEntitiesLWW(localFinanceCards, d.financeCards || []);
      const finCatRes = mergeEntitiesLWW(localFinanceCategories, d.financeCategories || []);
      const finBudRes = mergeEntitiesLWW(localFinanceBudgets, d.financeBudgets || []);

      totalAdded =
        subRes.addedCount +
        taskRes.addedCount +
        pathRes.addedCount +
        sessRes.addedCount +
        cardRes.addedCount +
        prefRes.addedCount +
        planRes.addedCount +
        revRes.addedCount +
        projRes.addedCount +
        classRes.addedCount +
        gradeRes.addedCount +
        gymExRes.addedCount +
        gymRoutineRes.addedCount +
        gymWorkoutRes.addedCount +
        gymMeasureRes.addedCount +
        gymPrefRes.addedCount +
        habitRes.addedCount +
        habitLogRes.addedCount +
        finTxRes.addedCount +
        finCardRes.addedCount +
        finCatRes.addedCount +
        finBudRes.addedCount;

      totalUpdated =
        subRes.updatedCount +
        taskRes.updatedCount +
        pathRes.updatedCount +
        sessRes.updatedCount +
        cardRes.updatedCount +
        prefRes.updatedCount +
        planRes.updatedCount +
        revRes.updatedCount +
        projRes.updatedCount +
        classRes.updatedCount +
        gradeRes.updatedCount +
        gymExRes.updatedCount +
        gymRoutineRes.updatedCount +
        gymWorkoutRes.updatedCount +
        gymMeasureRes.updatedCount +
        gymPrefRes.updatedCount +
        habitRes.updatedCount +
        habitLogRes.updatedCount +
        finTxRes.updatedCount +
        finCardRes.updatedCount +
        finCatRes.updatedCount +
        finBudRes.updatedCount;

      await Promise.all([
        db.subjects.bulkPut(subRes.merged),
        db.tasks.bulkPut(taskRes.merged),
        db.learningPaths.bulkPut(pathRes.merged),
        db.studySessions.bulkPut(sessRes.merged),
        db.flashcards.bulkPut(cardRes.merged),
        db.preferences.bulkPut(prefRes.merged),
        db.studyPlans.bulkPut(planRes.merged),
        db.weeklyReviews.bulkPut(revRes.merged),
        db.portfolioProjects.bulkPut(projRes.merged),
        db.collegeClasses.bulkPut(classRes.merged),
        db.subjectGrades.bulkPut(gradeRes.merged),
        db.gymExercises.bulkPut(gymExRes.merged),
        db.gymRoutines.bulkPut(gymRoutineRes.merged),
        db.gymWorkouts.bulkPut(gymWorkoutRes.merged),
        db.gymMeasurements.bulkPut(gymMeasureRes.merged),
        db.gymPreferences.bulkPut(gymPrefRes.merged),
        db.habits.bulkPut(habitRes.merged),
        db.habitLogs.bulkPut(habitLogRes.merged),
        db.financeTransactions.bulkPut(finTxRes.merged),
        db.financeCards.bulkPut(finCardRes.merged),
        db.financeCategories.bulkPut(finCatRes.merged),
        db.financeBudgets.bulkPut(finBudRes.merged),
      ]);
    }
  );

  return { added: totalAdded, updated: totalUpdated };
}
