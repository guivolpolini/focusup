import type { StudySession, WeeklyReview } from '../types';
import { formatDateToLocalYYYYMMDD, addDaysToDate } from './srsEngine';

export interface WeeklyAnalysisInput {
  weekStartDate: Date; // Segunda-feira
  sessions: StudySession[];
  weeklyGoalMinutes: number; // ex: 120 * 7 = 840 min
  subjectNames: Record<string, string>; // subjectId -> nome
  prioritySubjectIds: string[];
}

/**
 * Motor determinístico de análise semanal sem IA.
 * Regras explícitas baseadas em fatos e números reais.
 */
export function generateWeeklyReviewAnalysis(input: WeeklyAnalysisInput): WeeklyReview {
  const { weekStartDate, sessions, weeklyGoalMinutes, subjectNames, prioritySubjectIds } = input;
  const weekEndDateObj = addDaysToDate(weekStartDate, 6);
  const weekStartDateStr = formatDateToLocalYYYYMMDD(weekStartDate);
  const weekEndDateStr = formatDateToLocalYYYYMMDD(weekEndDateObj);

  // Filtrar sessões que pertencem a esta semana
  const weekSessions = sessions.filter((s) => {
    const sDate = formatDateToLocalYYYYMMDD(new Date(s.startedAt));
    return sDate >= weekStartDateStr && sDate <= weekEndDateStr && s.status === 'completed';
  });

  const totalStudiedSeconds = weekSessions.reduce((acc, s) => acc + s.actualDurationSeconds, 0);
  const totalStudiedMinutes = Math.floor(totalStudiedSeconds / 60);
  const sessionsCount = weekSessions.length;

  const daysStudiedSet = new Set(
    weekSessions.map((s) => formatDateToLocalYYYYMMDD(new Date(s.startedAt)))
  );
  const daysStudiedCount = daysStudiedSet.size;

  // Distribuição por matéria
  const subjectDistribution: Record<string, number> = {};
  for (const s of weekSessions) {
    if (s.subjectId) {
      subjectDistribution[s.subjectId] =
        (subjectDistribution[s.subjectId] || 0) + Math.floor(s.actualDurationSeconds / 60);
    }
  }

  const goalCompletionRate = Math.min(
    100,
    weeklyGoalMinutes > 0 ? Math.round((totalStudiedMinutes / weeklyGoalMinutes) * 100) : 0
  );

  // Geração de observações baseadas em regras booleanas claras
  const observations: string[] = [];

  if (sessionsCount === 0) {
    observations.push('Nenhuma sessão de estudo foi registrada nesta semana.');
  } else {
    if (goalCompletionRate >= 100) {
      observations.push('Parabéns! Você atingiu 100% da sua meta de estudo planejada.');
    } else if (goalCompletionRate >= 70) {
      observations.push(`Bom ritmo! Você completou ${goalCompletionRate}% da meta semanal.`);
    } else {
      observations.push(`O tempo estudado (${totalStudiedMinutes}m) ficou abaixo de 70% da sua meta semanal.`);
    }

    if (daysStudiedCount >= 5) {
      observations.push(`Excelente consistência! Você esteve presente em ${daysStudiedCount} dias da semana.`);
    } else if (daysStudiedCount <= 2) {
      observations.push(`Consistência baixa: o estudo concentrou-se em apenas ${daysStudiedCount} dias.`);
    }

    // Verificar se matérias prioritárias foram negligenciadas
    for (const pId of prioritySubjectIds) {
      const studied = subjectDistribution[pId] || 0;
      if (studied === 0) {
        const name = subjectNames[pId] || 'Matéria Prioritária';
        observations.push(`Alerta: A matéria prioritária "${name}" não recebeu nenhuma sessão de foco nesta semana.`);
      }
    }

    // Verificar concentração excessiva em uma única matéria
    if (totalStudiedMinutes > 60) {
      for (const [subId, minutes] of Object.entries(subjectDistribution)) {
        if (minutes / totalStudiedMinutes >= 0.8) {
          const name = subjectNames[subId] || 'uma matéria';
          observations.push(`Atenção ao equilíbrio: ${Math.round((minutes / totalStudiedMinutes) * 100)}% do seu tempo foi dedicado exclusivamente a "${name}".`);
        }
      }
    }
  }

  // Encontrar matéria mais estudada para recomendação equilibrada
  let lowestStudiedPriorityId: string | undefined;
  if (prioritySubjectIds.length > 0) {
    lowestStudiedPriorityId = [...prioritySubjectIds].sort(
      (a, b) => (subjectDistribution[a] || 0) - (subjectDistribution[b] || 0)
    )[0];
  }

  const recommendedFocusSubjectName = lowestStudiedPriorityId ? subjectNames[lowestStudiedPriorityId] : undefined;

  return {
    id: `rev-${weekStartDateStr}`,
    weekStartDate: weekStartDateStr,
    weekEndDate: weekEndDateStr,
    totalStudiedMinutes,
    totalPlannedMinutes: weeklyGoalMinutes,
    goalCompletionRate,
    sessionsCount,
    daysStudiedCount,
    subjectDistribution,
    observations,
    proposedNextPlan: {
      recommendedFocusSubjectId: lowestStudiedPriorityId,
      suggestedDailyGoalMinutes: 120,
      notes: recommendedFocusSubjectName
        ? `Sugerido aumentar a dedicação em "${recommendedFocusSubjectName}" para equilibrar o aprendizado na próxima semana.`
        : 'Manter a cadência de estudos distribuída entre as trilhas.',
    },
    accepted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
