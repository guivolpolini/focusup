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

      totalAdded =
        subRes.addedCount +
        taskRes.addedCount +
        pathRes.addedCount +
        sessRes.addedCount +
        cardRes.addedCount +
        prefRes.addedCount +
        planRes.addedCount +
        revRes.addedCount +
        projRes.addedCount;

      totalUpdated =
        subRes.updatedCount +
        taskRes.updatedCount +
        pathRes.updatedCount +
        sessRes.updatedCount +
        cardRes.updatedCount +
        prefRes.updatedCount +
        planRes.updatedCount +
        revRes.updatedCount +
        projRes.updatedCount;

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
      ]);
    }
  );

  return { added: totalAdded, updated: totalUpdated };
}
