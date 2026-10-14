import type { SubjectGradeConfig, GradeSimulationResult } from '../types';

/**
 * Cria configuração padrão de avaliações para uma matéria (P1 e P2)
 */
export function createDefaultGradeConfig(
  subjectId: string,
  passingGrade: number = 6.0
): SubjectGradeConfig {
  return {
    id: `grade-${subjectId}`,
    subjectId,
    passingGrade,
    finalExamPassingGrade: 5.0,
    assessments: [
      { id: `ass-1-${Date.now()}`, name: 'P1 (Prova 1)', weight: 4 },
      { id: `ass-2-${Date.now()}`, name: 'P2 (Prova 2)', weight: 6 },
    ],
    updatedAt: Date.now(),
  };
}

/**
 * Calcula determinísticamente a média ponderada, status e nota necessária nas provas pendentes
 */
export function calculateGradeSimulation(config: SubjectGradeConfig): GradeSimulationResult {
  const { passingGrade, finalExamPassingGrade = 5.0, assessments } = config;

  if (!assessments || assessments.length === 0) {
    return {
      currentWeightedAverage: null,
      accumulatedPoints: 0,
      totalWeight: 0,
      completedWeight: 0,
      remainingWeight: 0,
      status: 'pending',
      neededRemainingAverage: null,
      message: 'Nenhuma avaliação cadastrada ainda.',
    };
  }

  const totalWeight = assessments.reduce((acc, a) => acc + (a.weight || 0), 0);
  if (totalWeight <= 0) {
    return {
      currentWeightedAverage: null,
      accumulatedPoints: 0,
      totalWeight: 0,
      completedWeight: 0,
      remainingWeight: 0,
      status: 'pending',
      neededRemainingAverage: null,
      message: 'A soma dos pesos deve ser maior que zero.',
    };
  }

  const completed = assessments.filter(
    (a) => typeof a.score === 'number' && !isNaN(a.score)
  );

  const accumulatedPoints = completed.reduce(
    (acc, a) => acc + (a.score as number) * a.weight,
    0
  );
  const completedWeight = completed.reduce((acc, a) => acc + a.weight, 0);
  const remainingWeight = totalWeight - completedWeight;

  const currentWeightedAverage =
    completedWeight > 0
      ? Math.round((accumulatedPoints / completedWeight) * 10) / 10
      : null;

  // Todas as avaliações foram realizadas
  if (remainingWeight <= 0) {
    const finalAverage =
      Math.round((accumulatedPoints / totalWeight) * 10) / 10;

    if (finalAverage >= passingGrade) {
      return {
        currentWeightedAverage: finalAverage,
        accumulatedPoints,
        totalWeight,
        completedWeight,
        remainingWeight: 0,
        status: 'passed',
        neededRemainingAverage: 0,
        message: `Aprovado com média final ${finalAverage.toFixed(1)}! 🎉`,
      };
    } else {
      // Exame Final / Prova de Recuperação
      // Regra padrão: (Média + Exame) / 2 >= finalExamPassingGrade => Exame = (finalExamPassingGrade * 2) - finalAverage
      const examNeeded = Math.max(
        0,
        Math.round((finalExamPassingGrade * 2 - finalAverage) * 10) / 10
      );

      if (examNeeded <= 10.0) {
        return {
          currentWeightedAverage: finalAverage,
          accumulatedPoints,
          totalWeight,
          completedWeight,
          remainingWeight: 0,
          status: 'danger_exam',
          neededRemainingAverage: null,
          finalExamNeeded: examNeeded,
          message: `Média ${finalAverage.toFixed(1)} abaixo de ${passingGrade}. Você precisa de nota ${examNeeded.toFixed(1)} no Exame Final para aprovação.`,
        };
      } else {
        return {
          currentWeightedAverage: finalAverage,
          accumulatedPoints,
          totalWeight,
          completedWeight,
          remainingWeight: 0,
          status: 'failed',
          neededRemainingAverage: null,
          finalExamNeeded: null,
          message: `Reprovado. Média final ${finalAverage.toFixed(1)} insuficiente mesmo com exame.`,
        };
      }
    }
  }

  // Ainda há avaliações pendentes
  const pointsNeeded = passingGrade * totalWeight - accumulatedPoints;
  const neededRemainingAverage =
    Math.round((pointsNeeded / remainingWeight) * 10) / 10;

  if (neededRemainingAverage <= 0) {
    return {
      currentWeightedAverage,
      accumulatedPoints,
      totalWeight,
      completedWeight,
      remainingWeight,
      status: 'passed',
      neededRemainingAverage: 0,
      message: `Matematicamente Aprovado! Seus pontos acumulados já garantem média mínima ${passingGrade}.`,
    };
  }

  if (neededRemainingAverage <= 10.0) {
    return {
      currentWeightedAverage,
      accumulatedPoints,
      totalWeight,
      completedWeight,
      remainingWeight,
      status: 'pending',
      neededRemainingAverage,
      message: `Você precisa de média ${neededRemainingAverage.toFixed(1)} nas provas pendentes para passar direto sem exame.`,
    };
  }

  // Se precisar de > 10.0 nas pendentes, já é matematicamente impossível passar direto
  // Estimar quanto precisa no Exame Final
  const maxPossiblePoints = accumulatedPoints + 10.0 * remainingWeight;
  const maxPossibleSemesterAvg = maxPossiblePoints / totalWeight;
  const examNeeded = Math.max(
    0,
    Math.round((finalExamPassingGrade * 2 - maxPossibleSemesterAvg) * 10) / 10
  );

  return {
    currentWeightedAverage,
    accumulatedPoints,
    totalWeight,
    completedWeight,
    remainingWeight,
    status: 'danger_exam',
    neededRemainingAverage,
    finalExamNeeded: examNeeded <= 10 ? examNeeded : null,
    message: `Atenção: Passar direto exigiria nota ${neededRemainingAverage.toFixed(1)}. Prepare-se para o Exame Final.`,
  };
}
