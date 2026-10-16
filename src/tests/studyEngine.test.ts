import { describe, it, expect } from 'vitest';
import {
  formatStudyDuration,
  formatStudyDateBR,
  formatStudyRelativeDate,
  getWeekBoundaries,
  calculateStudyWeeklyStats,
  buildStudySession,
  DEFAULT_STUDY_SUGGESTIONS,
} from '../lib/studyEngine';
import type { Subject, StudySession } from '../types';

describe('studyEngine', () => {
  describe('Formatação de duração de estudos', () => {
    it('formata minutos em horas e minutos amigáveis', () => {
      expect(formatStudyDuration(0)).toBe('0 min');
      expect(formatStudyDuration(45)).toBe('45m');
      expect(formatStudyDuration(60)).toBe('1h');
      expect(formatStudyDuration(90)).toBe('1h 30m');
      expect(formatStudyDuration(125)).toBe('2h 05m');
      expect(formatStudyDuration(180)).toBe('3h');
    });
  });

  describe('Formatação de datas de estudo', () => {
    it('converte YYYY-MM-DD para DD/MM/AAAA', () => {
      expect(formatStudyDateBR('2026-10-16')).toBe('16/10/2026');
      expect(formatStudyDateBR('2026-05-04')).toBe('04/05/2026');
    });

    it('identifica Hoje e Ontem para datas relativas', () => {
      expect(formatStudyRelativeDate('2026-10-16', '2026-10-16')).toContain('Hoje');
      expect(formatStudyRelativeDate('2026-10-15', '2026-10-16')).toContain('Ontem');
      expect(formatStudyRelativeDate('2026-10-10', '2026-10-16')).toBe('10/10/2026');
    });
  });

  describe('Cálculo de semana e estatísticas semanais', () => {
    it('determina corretamente os limites da semana (segunda a domingo)', () => {
      // 2026-10-16 é uma sexta-feira
      const ref = new Date('2026-10-16T14:00:00');
      const { weekStartStr, weekEndStr, startMs, endMs } = getWeekBoundaries(ref);

      expect(weekStartStr).toBe('2026-10-12'); // Segunda-feira
      expect(weekEndStr).toBe('2026-10-18');   // Domingo
      expect(endMs).toBeGreaterThan(startMs);
    });

    it('calcula horas semanais, contagem de matérias e mapa de tempo por matéria', () => {
      const subjects: Subject[] = [
        {
          id: 'sub_aws',
          name: 'AWS e Cloud',
          color: '#f59e0b',
          priority: 'medium',
          targetMinutesPerWeek: 120,
          archived: false,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'sub_sql',
          name: 'Banco de Dados',
          color: '#0ea5e9',
          priority: 'medium',
          targetMinutesPerWeek: 120,
          archived: false,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'sub_java',
          name: 'Java',
          color: '#ef4444',
          priority: 'medium',
          targetMinutesPerWeek: 120,
          archived: false,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      // Sessões dentro da semana de 12/10/2026 a 18/10/2026
      const sessions: StudySession[] = [
        {
          id: 'sess_1',
          subjectId: 'sub_aws',
          mode: 'custom',
          plannedDurationMinutes: 60,
          actualDurationSeconds: 3600, // 60 min (1h)
          startedAt: new Date('2026-10-13T10:00:00').getTime(),
          status: 'completed',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'sess_2',
          subjectId: 'sub_aws',
          mode: 'custom',
          plannedDurationMinutes: 30,
          actualDurationSeconds: 1800, // 30 min
          startedAt: new Date('2026-10-14T15:00:00').getTime(),
          status: 'completed',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'sess_3',
          subjectId: 'sub_sql',
          mode: 'custom',
          plannedDurationMinutes: 45,
          actualDurationSeconds: 2700, // 45 min
          startedAt: new Date('2026-10-16T12:00:00').getTime(),
          status: 'completed',
          createdAt: 1000,
          updatedAt: 1000,
        },
        // Sessão de semana anterior (não deve contar na semana atual)
        {
          id: 'sess_past',
          subjectId: 'sub_java',
          mode: 'custom',
          plannedDurationMinutes: 120,
          actualDurationSeconds: 7200, // 2h
          startedAt: new Date('2026-10-05T10:00:00').getTime(),
          status: 'completed',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];

      const stats = calculateStudyWeeklyStats(sessions, subjects, new Date('2026-10-16T14:00:00'));

      // Total desta semana: 60 + 30 + 45 = 135 min (2h 15m)
      expect(stats.totalMinutesThisWeek).toBe(135);
      expect(stats.formattedTotalHours).toBe('2h 15m');

      // Quantidade de matérias estudadas na semana: AWS e SQL = 2 matérias
      expect(stats.subjectsStudiedCount).toBe(2);
      expect(stats.sessionsCountThisWeek).toBe(3);

      // Minutos individuais na semana
      expect(stats.subjectWeeklyMinutesMap.get('sub_aws')).toBe(90);
      expect(stats.subjectWeeklyMinutesMap.get('sub_sql')).toBe(45);
      expect(stats.subjectWeeklyMinutesMap.get('sub_java')).toBeUndefined();

      // Histórico total de Java preservado no total geral
      expect(stats.subjectTotalMinutesMap.get('sub_java')).toBe(120);
    });
  });

  describe('Criação e edição de sessões de estudo', () => {
    it('cria uma StudySession válida com duração em segundos e minutos compatível', () => {
      const session = buildStudySession({
        subjectId: 'sub_python',
        dateStr: '2026-10-16',
        hours: 1,
        minutes: 30,
        notes: 'Resolução de exercícios sobre POO e Decorators',
      });

      expect(session.subjectId).toBe('sub_python');
      expect(session.plannedDurationMinutes).toBe(90);
      expect(session.actualDurationSeconds).toBe(5400); // 90 * 60
      expect(session.status).toBe('completed');
      expect(session.mode).toBe('custom');
      expect(session.notes).toBe('Resolução de exercícios sobre POO e Decorators');
      expect(session.startedAt).toBeGreaterThan(0);
    });

    it('fornece sugestões padrão de matérias com cores e ícones', () => {
      expect(DEFAULT_STUDY_SUGGESTIONS).toHaveLength(5);
      const names = DEFAULT_STUDY_SUGGESTIONS.map((s) => s.name);
      expect(names).toContain('AWS e Cloud');
      expect(names).toContain('Banco de Dados');
      expect(names).toContain('Banco de Dados Não Relacional');
      expect(names).toContain('Java');
      expect(names).toContain('Python');
    });
  });
});
