import type {
  AgendaCategory,
  AgendaReminderOffset,
  AgendaRecurrence,
  AgendaEvent,
  AgendaOccurrence,
} from '../types';

export const AGENDA_CATEGORIES: Record<
  AgendaCategory,
  {
    label: string;
    color: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    dotClass: string;
  }
> = {
  studies: {
    label: 'Estudos',
    color: '#0284c7', // sky-600
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200',
    dotClass: 'bg-sky-500',
  },
  work: {
    label: 'Trabalho',
    color: '#4f46e5', // indigo-600
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
    dotClass: 'bg-indigo-500',
  },
  gym: {
    label: 'Academia',
    color: '#e11d48', // rose-600
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-200',
    dotClass: 'bg-rose-500',
  },
  finance: {
    label: 'Finanças',
    color: '#059669', // emerald-600
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  personal: {
    label: 'Pessoal',
    color: '#d97706', // amber-600
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200',
    dotClass: 'bg-amber-500',
  },
  other: {
    label: 'Outros',
    color: '#475569', // slate-600
    bgClass: 'bg-slate-50',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-200',
    dotClass: 'bg-slate-500',
  },
};

export const REMINDER_OPTIONS: { value: AgendaReminderOffset; label: string }[] = [
  { value: 'none', label: 'Desativado' },
  { value: 'at_time', label: 'No horário' },
  { value: '5m', label: '5 minutos antes' },
  { value: '15m', label: '15 minutos antes' },
  { value: '30m', label: '30 minutos antes' },
  { value: '1h', label: '1 hora antes' },
  { value: '1d', label: '1 dia antes' },
];

export const RECURRENCE_OPTIONS: { value: AgendaRecurrence; label: string }[] = [
  { value: 'never', label: 'Nunca' },
  { value: 'daily', label: 'Diariamente' },
  { value: 'weekly', label: 'Semanalmente' },
  { value: 'monthly', label: 'Mensalmente' },
  { value: 'yearly', label: 'Anualmente' },
];

export function getAgendaCategoryMeta(category: AgendaCategory) {
  return AGENDA_CATEGORIES[category] || AGENDA_CATEGORIES.other;
}

export function getReminderMinutes(offset: AgendaReminderOffset): number | null {
  switch (offset) {
    case 'at_time':
      return 0;
    case '5m':
      return 5;
    case '15m':
      return 15;
    case '30m':
      return 30;
    case '1h':
      return 60;
    case '1d':
      return 1440;
    default:
      return null;
  }
}

/**
 * Calcula o timestamp de disparo do lembrete com base na data, horário e offset
 */
export function calculateReminderTimestamp(
  dateStr: string,
  startTime?: string,
  offset?: AgendaReminderOffset
): number | null {
  if (!offset || offset === 'none') return null;
  const mins = getReminderMinutes(offset);
  if (mins === null) return null;

  const [year, month, day] = dateStr.split('-').map(Number);
  let hours = 9;
  let minutes = 0;
  if (startTime) {
    const [h, m] = startTime.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) {
      hours = h;
      minutes = m;
    }
  }

  const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return targetDate.getTime() - mins * 60 * 1000;
}

/**
 * Calcula ocorrências de eventos para um intervalo de datas (mês/semana)
 * Mantém o princípio da Antifragilidade: armazena apenas a regra no banco e projeta ocorrências em memória
 */
export function getEventOccurrencesForRange(
  events: AgendaEvent[],
  rangeStartStr: string,
  rangeEndStr: string
): AgendaOccurrence[] {
  const occurrences: AgendaOccurrence[] = [];
  const rangeStartDate = new Date(rangeStartStr + 'T00:00:00');
  const rangeEndDate = new Date(rangeEndStr + 'T23:59:59');

  for (const evt of events) {
    const evtStartDate = new Date(evt.date + 'T00:00:00');

    // Se o evento foi criado com data futura após o fim da janela solicitada
    if (evt.date > rangeEndStr) continue;

    if (evt.recurrence === 'never') {
      if (evt.date >= rangeStartStr && evt.date <= rangeEndStr) {
        occurrences.push({
          id: evt.id,
          masterEventId: evt.id,
          title: evt.title,
          description: evt.description,
          date: evt.date,
          startTime: evt.startTime,
          endTime: evt.endTime,
          category: evt.category,
          subjectId: evt.subjectId,
          reminder: evt.reminder,
          recurrence: evt.recurrence,
          completed: evt.completed,
          completedAt: evt.completedAt,
          isRecurringInstance: false,
        });
      }
      continue;
    }

    if (evt.recurrence === 'daily') {
      const cur = new Date(Math.max(evtStartDate.getTime(), rangeStartDate.getTime()));
      cur.setHours(0, 0, 0, 0);
      const limit = new Date(rangeEndDate.getTime());
      limit.setHours(0, 0, 0, 0);

      while (cur <= limit) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const curStr = `${y}-${m}-${d}`;

        occurrences.push({
          id: `${evt.id}_${curStr}`,
          masterEventId: evt.id,
          title: evt.title,
          description: evt.description,
          date: curStr,
          startTime: evt.startTime,
          endTime: evt.endTime,
          category: evt.category,
          subjectId: evt.subjectId,
          reminder: evt.reminder,
          recurrence: evt.recurrence,
          completed: curStr === evt.date ? evt.completed : false,
          completedAt: curStr === evt.date ? evt.completedAt : undefined,
          isRecurringInstance: curStr !== evt.date,
        });
        cur.setDate(cur.getDate() + 1);
      }
      continue;
    }

    if (evt.recurrence === 'weekly') {
      const targetDayOfWeek = evtStartDate.getDay();
      const cur = new Date(Math.max(evtStartDate.getTime(), rangeStartDate.getTime()));
      cur.setHours(0, 0, 0, 0);

      // Avançar até o dia da semana desejado
      while (cur.getDay() !== targetDayOfWeek) {
        cur.setDate(cur.getDate() + 1);
      }
      const limit = new Date(rangeEndDate.getTime());
      limit.setHours(0, 0, 0, 0);

      while (cur <= limit) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const curStr = `${y}-${m}-${d}`;

        occurrences.push({
          id: `${evt.id}_${curStr}`,
          masterEventId: evt.id,
          title: evt.title,
          description: evt.description,
          date: curStr,
          startTime: evt.startTime,
          endTime: evt.endTime,
          category: evt.category,
          subjectId: evt.subjectId,
          reminder: evt.reminder,
          recurrence: evt.recurrence,
          completed: curStr === evt.date ? evt.completed : false,
          completedAt: curStr === evt.date ? evt.completedAt : undefined,
          isRecurringInstance: curStr !== evt.date,
        });
        cur.setDate(cur.getDate() + 7);
      }
      continue;
    }

    if (evt.recurrence === 'monthly') {
      const targetDay = evtStartDate.getDate();
      const [startYear, startMonth] = rangeStartStr.split('-').map(Number);
      const [endYear, endMonth] = rangeEndStr.split('-').map(Number);

      let y = startYear;
      let m = startMonth;

      while (y < endYear || (y === endYear && m <= endMonth)) {
        const lastDayOfMonth = new Date(y, m, 0).getDate();
        const actualDay = Math.min(targetDay, lastDayOfMonth);
        const curStr = `${y}-${String(m).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;

        if (curStr >= evt.date && curStr >= rangeStartStr && curStr <= rangeEndStr) {
          occurrences.push({
            id: `${evt.id}_${curStr}`,
            masterEventId: evt.id,
            title: evt.title,
            description: evt.description,
            date: curStr,
            startTime: evt.startTime,
            endTime: evt.endTime,
            category: evt.category,
            subjectId: evt.subjectId,
            reminder: evt.reminder,
            recurrence: evt.recurrence,
            completed: curStr === evt.date ? evt.completed : false,
            completedAt: curStr === evt.date ? evt.completedAt : undefined,
            isRecurringInstance: curStr !== evt.date,
          });
        }

        m++;
        if (m > 12) {
          m = 1;
          y++;
        }
      }
      continue;
    }

    if (evt.recurrence === 'yearly') {
      const targetMonth = evtStartDate.getMonth(); // 0-11
      const targetDay = evtStartDate.getDate();
      const [startYear] = rangeStartStr.split('-').map(Number);
      const [endYear] = rangeEndStr.split('-').map(Number);

      for (let y = startYear; y <= endYear; y++) {
        const lastDayOfMonth = new Date(y, targetMonth + 1, 0).getDate();
        const actualDay = Math.min(targetDay, lastDayOfMonth);
        const curStr = `${y}-${String(targetMonth + 1).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;

        if (curStr >= evt.date && curStr >= rangeStartStr && curStr <= rangeEndStr) {
          occurrences.push({
            id: `${evt.id}_${curStr}`,
            masterEventId: evt.id,
            title: evt.title,
            description: evt.description,
            date: curStr,
            startTime: evt.startTime,
            endTime: evt.endTime,
            category: evt.category,
            subjectId: evt.subjectId,
            reminder: evt.reminder,
            recurrence: evt.recurrence,
            completed: curStr === evt.date ? evt.completed : false,
            completedAt: curStr === evt.date ? evt.completedAt : undefined,
            isRecurringInstance: curStr !== evt.date,
          });
        }
      }
    }
  }

  // Ordenação: data ASC, depois startTime ASC, depois title
  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const timeA = a.startTime || '99:99';
    const timeB = b.startTime || '99:99';
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return a.title.localeCompare(b.title);
  });

  return occurrences;
}

export interface CalendarDayCell {
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Gera células do calendário mensal (Segunda-feira como primeiro dia)
 */
export function getMonthCalendarGrid(year: number, month: number): CalendarDayCell[] {
  const cells: CalendarDayCell[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  // Primeiro dia do mês (0 = domingo, 1 = segunda, etc.)
  const firstDayOfMonth = new Date(year, month - 1, 1);
  const firstDayWeekday = firstDayOfMonth.getDay(); // 0 domingo .. 6 sábado
  // Ajuste para segunda-feira ser o dia 0
  const leadingOffset = (firstDayWeekday + 6) % 7;

  // Dias no mês anterior
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
  for (let i = leadingOffset - 1; i >= 0; i--) {
    const dayNumber = daysInPrevMonth - i;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNumber,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  // Dias no mês atual
  const daysInCurrentMonth = new Date(year, month, 0).getDate();
  for (let dayNumber = 1; dayNumber <= daysInCurrentMonth; dayNumber++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNumber,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }

  // Dias no mês seguinte para fechar múltiplo de 7 (geralmente 35 ou 42 células)
  const remainingCells = (7 - (cells.length % 7)) % 7;
  for (let dayNumber = 1; dayNumber <= remainingCells; dayNumber++) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNumber,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  return cells;
}

/**
 * Retorna os 7 dias da semana (Segunda a Domingo) em formato YYYY-MM-DD
 */
export function getWeekDates(referenceDate: Date = new Date()): string[] {
  const d = new Date(referenceDate);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + i);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const dayStr = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dayStr}`);
  }
  return dates;
}

/**
 * Formata horário com clareza
 */
export function formatAgendaTime(startTime?: string, endTime?: string): string {
  if (startTime && endTime) {
    return `${startTime} – ${endTime}`;
  }
  if (startTime) {
    return startTime;
  }
  return 'Dia inteiro';
}

/**
 * Formata data no formato brasileiro amigável
 */
export function formatAgendaDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatAgendaDateFullBR(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return `${weekdays[date.getDay()]}, ${day} de ${months[month - 1]}`;
}

/**
 * Retorna os próximos eventos a partir de uma data de referência
 */
export function getUpcomingEvents(
  occurrences: AgendaOccurrence[],
  referenceDateStr: string = new Date().toISOString().slice(0, 10),
  limit: number = 5
): AgendaOccurrence[] {
  return occurrences
    .filter((occ) => occ.date >= referenceDateStr && !occ.completed)
    .slice(0, limit);
}
