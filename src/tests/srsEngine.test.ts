import { describe, it, expect } from 'vitest';
import { calculateNextSRSReview } from '../lib/srsEngine';

describe('SRS Engine (Repetição Espaçada com Ease Factor)', () => {
  const baseDate = new Date(2026, 9, 13); // 13 de Outubro de 2026

  it('reinicia repetições e reduz ease factor quando nota é hard (Difícil)', () => {
    const result = calculateNextSRSReview('hard', 3, 10, 2.5, baseDate);
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.easeFactor).toBe(2.3);
    expect(result.nextReviewDate).toBe('2026-10-14');
  });

  it('respeita piso mínimo de easeFactor em 1.3', () => {
    const result = calculateNextSRSReview('hard', 0, 1, 1.35, baseDate);
    expect(result.easeFactor).toBe(1.3);
  });

  it('avança intervalos moderadamente com medium (Médio)', () => {
    // Primeira vez
    const step1 = calculateNextSRSReview('medium', 0, 1, 2.5, baseDate);
    expect(step1.repetitions).toBe(1);
    expect(step1.intervalDays).toBe(1);

    // Segunda vez
    const step2 = calculateNextSRSReview('medium', 1, 1, 2.5, baseDate);
    expect(step2.repetitions).toBe(2);
    expect(step2.intervalDays).toBe(3);

    // Terceira vez (1.2x)
    const step3 = calculateNextSRSReview('medium', 2, 3, 2.5, baseDate);
    expect(step3.repetitions).toBe(3);
    expect(step3.intervalDays).toBe(4);
    expect(step3.easeFactor).toBe(2.5);
  });

  it('escala intervalos exponencialmente e sobe o easeFactor com easy (Fácil)', () => {
    // Primeira vez
    const step1 = calculateNextSRSReview('easy', 0, 1, 2.5, baseDate);
    expect(step1.repetitions).toBe(1);
    expect(step1.intervalDays).toBe(1);
    expect(step1.easeFactor).toBe(2.65);

    // Segunda vez
    const step2 = calculateNextSRSReview('easy', 1, 1, 2.65, baseDate);
    expect(step2.repetitions).toBe(2);
    expect(step2.intervalDays).toBe(4);

    // Terceira vez (4 * 2.8 = 11.2 -> 11 dias)
    const step3 = calculateNextSRSReview('easy', 2, 4, 2.8, baseDate);
    expect(step3.repetitions).toBe(3);
    expect(step3.intervalDays).toBe(11);
    expect(step3.nextReviewDate).toBe('2026-10-24');
  });
});
