import { describe, it, expect } from 'vitest';
import {
  calculateGradeSimulation,
  createDefaultGradeConfig,
} from '../lib/gradeCalculator';
import type { SubjectGradeConfig } from '../types';

describe('gradeCalculator', () => {
  it('cria configuração padrão com P1 peso 4 e P2 peso 6', () => {
    const config = createDefaultGradeConfig('sub-1', 6.0);
    expect(config.subjectId).toBe('sub-1');
    expect(config.passingGrade).toBe(6.0);
    expect(config.assessments).toHaveLength(2);
    expect(config.assessments[0].weight).toBe(4);
    expect(config.assessments[1].weight).toBe(6);
  });

  it('calcula nota necessária para passar direto quando P1 foi realizada e P2 está pendente', () => {
    // P1 = 5.0 (peso 4) -> 20 pontos
    // Meta: média 6.0 com peso total 10 -> precisa de 60 pontos no total
    // Faltam: 40 pontos no peso 6 -> 40 / 6 = 6.67 -> arredondado 6.7
    const config: SubjectGradeConfig = {
      id: 'grade-1',
      subjectId: 'sub-1',
      passingGrade: 6.0,
      finalExamPassingGrade: 5.0,
      assessments: [
        { id: '1', name: 'P1', weight: 4, score: 5.0 },
        { id: '2', name: 'P2', weight: 6 },
      ],
      updatedAt: Date.now(),
    };

    const result = calculateGradeSimulation(config);
    expect(result.status).toBe('pending');
    expect(result.currentWeightedAverage).toBe(5.0);
    expect(result.accumulatedPoints).toBe(20);
    expect(result.remainingWeight).toBe(6);
    expect(result.neededRemainingAverage).toBe(6.7);
    expect(result.message).toContain('6.7');
  });

  it('identifica aprovação direta antecipada quando pontos acumulados já superam a meta', () => {
    // P1 = 10.0 (peso 8), P2 peso 2 pendente
    // Meta: média 6.0 com peso 10 -> 60 pontos
    // P1 já rendeu 80 pontos!
    const config: SubjectGradeConfig = {
      id: 'grade-2',
      subjectId: 'sub-1',
      passingGrade: 6.0,
      assessments: [
        { id: '1', name: 'P1', weight: 8, score: 10.0 },
        { id: '2', name: 'P2', weight: 2 },
      ],
      updatedAt: Date.now(),
    };

    const result = calculateGradeSimulation(config);
    expect(result.status).toBe('passed');
    expect(result.neededRemainingAverage).toBe(0);
    expect(result.message).toContain('Matematicamente Aprovado');
  });

  it('detecta quando nota necessária nas restantes é > 10 e orienta para o exame final', () => {
    // P1 = 1.0 (peso 7) -> 7 pontos
    // Meta: média 7.0 peso 10 -> precisa de 70 pontos
    // Faltam 63 pontos no peso 3 -> precisaria de 21.0 na P2!
    const config: SubjectGradeConfig = {
      id: 'grade-3',
      subjectId: 'sub-1',
      passingGrade: 7.0,
      finalExamPassingGrade: 5.0,
      assessments: [
        { id: '1', name: 'P1', weight: 7, score: 1.0 },
        { id: '2', name: 'P2', weight: 3 },
      ],
      updatedAt: Date.now(),
    };

    const result = calculateGradeSimulation(config);
    expect(result.status).toBe('danger_exam');
    expect(result.neededRemainingAverage).toBe(21.0);
    expect(result.message).toContain('Exame Final');
  });

  it('calcula exame final quando todas as provas foram feitas e a média ficou abaixo da nota de corte', () => {
    // P1 = 4.0 (peso 5) -> 20 pts
    // P2 = 4.0 (peso 5) -> 20 pts
    // Média = 4.0 (corte 6.0)
    // Exame necessário: (5.0 * 2) - 4.0 = 6.0
    const config: SubjectGradeConfig = {
      id: 'grade-4',
      subjectId: 'sub-1',
      passingGrade: 6.0,
      finalExamPassingGrade: 5.0,
      assessments: [
        { id: '1', name: 'P1', weight: 5, score: 4.0 },
        { id: '2', name: 'P2', weight: 5, score: 4.0 },
      ],
      updatedAt: Date.now(),
    };

    const result = calculateGradeSimulation(config);
    expect(result.status).toBe('danger_exam');
    expect(result.currentWeightedAverage).toBe(4.0);
    expect(result.finalExamNeeded).toBe(6.0);
  });
});
