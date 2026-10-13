import type { SRSGrade } from '../types';

export interface SRSCalculationResult {
  nextReviewDate: string; // YYYY-MM-DD
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
}

export function formatDateToLocalYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDate(baseDate: Date, days: number): Date {
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Algoritmo determinístico de Repetição Espaçada inspirado no SM-2 Simplificado
 * Mantém alta retenção adaptando o intervalo ao Ease Factor e às respostas do estudante
 */
export function calculateNextSRSReview(
  grade: SRSGrade,
  currentRepetitions: number,
  currentIntervalDays: number,
  currentEaseFactor: number = 2.5,
  currentDate: Date = new Date()
): SRSCalculationResult {
  let newRepetitions = currentRepetitions;
  let newIntervalDays = currentIntervalDays;
  let newEaseFactor = currentEaseFactor;

  if (grade === 'hard') {
    // Difícil: reinicia ciclo de repetição e reduz o fator de facilidade
    newRepetitions = 0;
    newIntervalDays = 1;
    newEaseFactor = Math.max(1.3, Number((currentEaseFactor - 0.2).toFixed(2)));
  } else if (grade === 'medium') {
    // Médio: avança suavemente sem penalizar o ease factor
    if (currentRepetitions === 0) {
      newIntervalDays = 1;
      newRepetitions = 1;
    } else if (currentRepetitions === 1) {
      newIntervalDays = 3;
      newRepetitions = 2;
    } else {
      newIntervalDays = Math.max(newIntervalDays + 1, Math.round(currentIntervalDays * 1.2));
      newRepetitions = currentRepetitions + 1;
    }
  } else if (grade === 'easy') {
    // Fácil: avança agressivamente multiplicando pelo Ease Factor
    if (currentRepetitions === 0) {
      newIntervalDays = 1;
      newRepetitions = 1;
    } else if (currentRepetitions === 1) {
      newIntervalDays = 4;
      newRepetitions = 2;
    } else {
      newIntervalDays = Math.max(newIntervalDays + 2, Math.round(currentIntervalDays * currentEaseFactor));
      newRepetitions = currentRepetitions + 1;
    }
    newEaseFactor = Number((currentEaseFactor + 0.15).toFixed(2));
  }

  const nextDateObj = addDaysToDate(currentDate, newIntervalDays);
  const nextReviewDate = formatDateToLocalYYYYMMDD(nextDateObj);

  return {
    nextReviewDate,
    intervalDays: newIntervalDays,
    easeFactor: newEaseFactor,
    repetitions: newRepetitions,
  };
}
