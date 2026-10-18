import { describe, it, expect } from 'vitest';
import {
  calculateReminderTimestamp,
  getReminderMinutes,
  getEventOccurrencesForRange,
  getMonthCalendarGrid,
  getWeekDates,
  formatAgendaTime,
  formatAgendaDateBR,
  getUpcomingEvents,
  getAgendaCategoryMeta,
} from '../lib/agendaEngine';
import type { AgendaEvent } from '../types';

describe('agendaEngine', () => {
  describe('Metadados e Lembretes', () => {
    it('retorna metadados válidos para cada categoria', () => {
      const cat = getAgendaCategoryMeta('studies');
      expect(cat.label).toBe('Estudos');
      expect(cat.color).toBeDefined();

      const fallback = getAgendaCategoryMeta('other');
      expect(fallback.label).toBe('Outros');
    });

    it('calcula minutos de offset corretamente', () => {
      expect(getReminderMinutes('none')).toBeNull();
      expect(getReminderMinutes('at_time')).toBe(0);
      expect(getReminderMinutes('5m')).toBe(5);
      expect(getReminderMinutes('15m')).toBe(15);
      expect(getReminderMinutes('30m')).toBe(30);
      expect(getReminderMinutes('1h')).toBe(60);
      expect(getReminderMinutes('1d')).toBe(1440);
    });

    it('calcula timestamp de lembrete com offset exato', () => {
      // 2026-10-20 às 10:00, lembrete de 15m antes -> 09:45
      const ts = calculateReminderTimestamp('2026-10-20', '10:00', '15m');
      expect(ts).toBeDefined();
      const reminderDate = new Date(ts!);
      expect(reminderDate.getFullYear()).toBe(2026);
      expect(reminderDate.getMonth()).toBe(9); // Outubro
      expect(reminderDate.getDate()).toBe(20);
      expect(reminderDate.getHours()).toBe(9);
      expect(reminderDate.getMinutes()).toBe(45);
    });

    it('retorna null se lembrete estiver desativado', () => {
      expect(calculateReminderTimestamp('2026-10-20', '10:00', 'none')).toBeNull();
    });
  });

  describe('Cálculo de Ocorrências e Recorrência sem Inchaço no Banco', () => {
    it('projeta evento não recorrente dentro do intervalo', () => {
      const events: AgendaEvent[] = [
        {
          id: 'evt-1',
          title: 'Reunião de Trabalho',
          date: '2026-10-15',
          startTime: '14:00',
          category: 'work',
          reminder: '15m',
          recurrence: 'never',
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const occs = getEventOccurrencesForRange(events, '2026-10-01', '2026-10-31');
      expect(occs).toHaveLength(1);
      expect(occs[0].title).toBe('Reunião de Trabalho');
      expect(occs[0].date).toBe('2026-10-15');
      expect(occs[0].isRecurringInstance).toBe(false);
    });

    it('ignora evento não recorrente fora do intervalo', () => {
      const events: AgendaEvent[] = [
        {
          id: 'evt-1',
          title: 'Evento Futuro',
          date: '2026-11-05',
          category: 'personal',
          reminder: 'none',
          recurrence: 'never',
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const occs = getEventOccurrencesForRange(events, '2026-10-01', '2026-10-31');
      expect(occs).toHaveLength(0);
    });

    it('projeta evento diário para cada dia do intervalo sem duplicar linhas no banco', () => {
      const events: AgendaEvent[] = [
        {
          id: 'evt-daily',
          title: 'Leitura Noturna',
          date: '2026-10-10',
          startTime: '21:00',
          category: 'studies',
          reminder: 'none',
          recurrence: 'daily',
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      // De 2026-10-10 a 2026-10-14 = 5 dias
      const occs = getEventOccurrencesForRange(events, '2026-10-10', '2026-10-14');
      expect(occs).toHaveLength(5);
      expect(occs[0].date).toBe('2026-10-10');
      expect(occs[4].date).toBe('2026-10-14');
      expect(occs[1].isRecurringInstance).toBe(true);
    });

    it('projeta evento semanal apenas nos dias correspondentes da semana', () => {
      // 2026-10-12 é uma Segunda-feira
      const events: AgendaEvent[] = [
        {
          id: 'evt-weekly',
          title: 'Treino de Pernas',
          date: '2026-10-12',
          startTime: '07:00',
          category: 'gym',
          reminder: '30m',
          recurrence: 'weekly',
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      // No mês de Outubro 2026, as segundas após dia 12 são: 12, 19, 26
      const occs = getEventOccurrencesForRange(events, '2026-10-01', '2026-10-31');
      expect(occs).toHaveLength(3);
      expect(occs.map((o) => o.date)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
    });

    it('projeta evento mensal no mesmo dia do mês', () => {
      const events: AgendaEvent[] = [
        {
          id: 'evt-monthly',
          title: 'Revisão Financeira',
          date: '2026-08-10',
          startTime: '20:00',
          category: 'finance',
          reminder: '1d',
          recurrence: 'monthly',
          completed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      const occs = getEventOccurrencesForRange(events, '2026-10-01', '2026-12-31');
      expect(occs).toHaveLength(3);
      expect(occs.map((o) => o.date)).toEqual(['2026-10-10', '2026-11-10', '2026-12-10']);
    });
  });

  describe('Visualizações e Helpers de Calendário', () => {
    it('gera grade mensal com dias corretos em múltiplos de 7', () => {
      // Outubro 2026 tem 31 dias
      const grid = getMonthCalendarGrid(2026, 10);
      expect(grid.length % 7).toBe(0);
      const currentMonthDays = grid.filter((c) => c.isCurrentMonth);
      expect(currentMonthDays).toHaveLength(31);
    });

    it('retorna os 7 dias da semana corrente (Segunda a Domingo)', () => {
      // 2026-10-14 (quarta-feira)
      const weekDates = getWeekDates(new Date(2026, 9, 14));
      expect(weekDates).toHaveLength(7);
      expect(weekDates[0]).toBe('2026-10-12'); // Segunda
      expect(weekDates[6]).toBe('2026-10-18'); // Domingo
    });

    it('formata horário e datas adequadamente', () => {
      expect(formatAgendaTime('08:30', '10:00')).toBe('08:30 – 10:00');
      expect(formatAgendaTime('14:00')).toBe('14:00');
      expect(formatAgendaTime()).toBe('Dia inteiro');

      expect(formatAgendaDateBR('2026-10-25')).toBe('25/10/2026');
    });

    it('filtra próximos eventos ordenados sem concluídos', () => {
      const occs = [
        {
          id: '1',
          masterEventId: '1',
          title: 'Passado',
          date: '2026-10-01',
          category: 'personal' as const,
          reminder: 'none' as const,
          recurrence: 'never' as const,
          completed: false,
          isRecurringInstance: false,
        },
        {
          id: '2',
          masterEventId: '2',
          title: 'Hoje',
          date: '2026-10-18',
          startTime: '10:00',
          category: 'work' as const,
          reminder: 'none' as const,
          recurrence: 'never' as const,
          completed: false,
          isRecurringInstance: false,
        },
        {
          id: '3',
          masterEventId: '3',
          title: 'Amanhã',
          date: '2026-10-19',
          category: 'studies' as const,
          reminder: 'none' as const,
          recurrence: 'never' as const,
          completed: false,
          isRecurringInstance: false,
        },
      ];

      const upcoming = getUpcomingEvents(occs, '2026-10-18', 2);
      expect(upcoming).toHaveLength(2);
      expect(upcoming[0].title).toBe('Hoje');
      expect(upcoming[1].title).toBe('Amanhã');
    });
  });
});
