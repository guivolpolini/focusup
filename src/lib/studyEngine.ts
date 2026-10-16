import type { Subject, StudySession } from '../types';

export interface StudySuggestion {
  name: string;
  color: string;
  icon: string;
}

export const DEFAULT_STUDY_SUGGESTIONS: StudySuggestion[] = [
  { name: 'AWS e Cloud', color: '#f59e0b', icon: 'cloud' },
  { name: 'Banco de Dados', color: '#0ea5e9', icon: 'database' },
  { name: 'Banco de Dados Não Relacional', color: '#06b6d4', icon: 'database' },
  { name: 'Java', color: '#ef4444', icon: 'code' },
  { name: 'Python', color: '#10b981', icon: 'code' },
];

export const STUDY_COLOR_PRESETS = [
  { hex: '#6366f1', label: 'Índigo' },
  { hex: '#3b82f6', label: 'Azul' },
  { hex: '#0ea5e9', label: 'Céu' },
  { hex: '#10b981', label: 'Esmeralda' },
  { hex: '#f59e0b', label: 'Âmbar' },
  { hex: '#ef4444', label: 'Vermelho' },
  { hex: '#8b5cf6', label: 'Roxo' },
  { hex: '#ec4899', label: 'Rosa' },
  { hex: '#64748b', label: 'Grafite' },
];

export const STUDY_ICON_PRESETS = [
  { id: 'book', label: 'Livro' },
  { id: 'code', label: 'Código' },
  { id: 'cloud', label: 'Nuvem' },
  { id: 'database', label: 'Banco de Dados' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'cpu', label: 'Chip / HW' },
  { id: 'brain', label: 'Cérebro' },
  { id: 'sparkles', label: 'Destaque' },
];

/**
 * Formata minutos para exibição amigável em português:
 * 0 -> "0 min"
 * 45 -> "45m"
 * 60 -> "1h"
 * 90 -> "1h 30m"
 * 125 -> "2h 05m"
 */
export function formatStudyDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 min';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

/**
 * Formata data YYYY-MM-DD para DD/MM/AAAA
 */
export function formatStudyDateBR(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr || '';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Formata data com contexto amigável (Hoje, Ontem ou DD/MM/AAAA)
 */
export function formatStudyRelativeDate(dateStr: string, referenceTodayStr?: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr || '';
  const todayStr = referenceTodayStr || new Date().toISOString().slice(0, 10);
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  const br = `${d}/${m}/${y}`;

  if (dateStr === todayStr) {
    return `Hoje (${d}/${m})`;
  }

  // Verifica se foi ontem
  const todayDate = new Date(todayStr + 'T12:00:00');
  todayDate.setDate(todayDate.getDate() - 1);
  const yesterdayStr = todayDate.toISOString().slice(0, 10);
  if (dateStr === yesterdayStr) {
    return `Ontem (${d}/${m})`;
  }

  return br;
}

export interface WeekBoundaries {
  startMs: number;
  endMs: number;
  weekStartStr: string; // YYYY-MM-DD
  weekEndStr: string; // YYYY-MM-DD
}

/**
 * Calcula início (Segunda 00:00:00) e fim (Domingo 23:59:59.999) da semana atual em horário local
 */
export function getWeekBoundaries(referenceDate: Date = new Date()): WeekBoundaries {
  const d = new Date(referenceDate);
  d.setHours(12, 0, 0, 0);

  const dayOfWeek = d.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  const diffToMonday = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

  const monday = new Date(d);
  monday.setDate(diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const pad = (n: number) => String(n).padStart(2, '0');
  const weekStartStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  const weekEndStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;

  return {
    startMs: monday.getTime(),
    endMs: sunday.getTime(),
    weekStartStr,
    weekEndStr,
  };
}

export interface WeeklyStudyStats {
  totalMinutesThisWeek: number;
  formattedTotalHours: string;
  subjectsStudiedCount: number;
  sessionsCountThisWeek: number;
  subjectWeeklyMinutesMap: Map<string, number>;
  subjectTotalMinutesMap: Map<string, number>;
}

/**
 * Calcula os totais e estatísticas de estudos da semana corrente
 */
export function calculateStudyWeeklyStats(
  sessions: StudySession[],
  _subjects: Subject[] = [],
  referenceDate: Date = new Date()
): WeeklyStudyStats {
  const { startMs, endMs } = getWeekBoundaries(referenceDate);

  let totalMinutesThisWeek = 0;
  let sessionsCountThisWeek = 0;
  const subjectWeeklyMinutesMap = new Map<string, number>();
  const subjectTotalMinutesMap = new Map<string, number>();

  for (const s of sessions) {
    if (s.status !== 'completed') continue;

    const minutes = Math.max(1, Math.round((s.actualDurationSeconds || 0) / 60));
    const subId = s.subjectId || 'sem_materia';

    // Total histórico da matéria
    subjectTotalMinutesMap.set(subId, (subjectTotalMinutesMap.get(subId) || 0) + minutes);

    // Se a sessão ocorreu na semana atual
    const sessionTime = s.startedAt || s.createdAt;
    if (sessionTime >= startMs && sessionTime <= endMs) {
      totalMinutesThisWeek += minutes;
      sessionsCountThisWeek++;
      subjectWeeklyMinutesMap.set(subId, (subjectWeeklyMinutesMap.get(subId) || 0) + minutes);
    }
  }

  // Quantidade de matérias distintas estudadas nesta semana (exclui sem_materia)
  const subjectsStudiedCount = Array.from(subjectWeeklyMinutesMap.keys()).filter(
    (id) => id !== 'sem_materia'
  ).length;

  return {
    totalMinutesThisWeek,
    formattedTotalHours: formatStudyDuration(totalMinutesThisWeek),
    subjectsStudiedCount,
    sessionsCountThisWeek,
    subjectWeeklyMinutesMap,
    subjectTotalMinutesMap,
  };
}

/**
 * Cria ou atualiza uma StudySession de forma consistente com a persistência do FocusUp
 */
export function buildStudySession(params: {
  subjectId: string;
  dateStr: string; // YYYY-MM-DD
  hours: number;
  minutes: number;
  notes?: string;
  existingSession?: StudySession;
}): StudySession {
  const { subjectId, dateStr, hours, minutes, notes, existingSession } = params;
  const totalMinutes = Math.max(1, hours * 60 + minutes);
  const now = Date.now();

  // Constrói timestamp a partir da data informada (meio-dia local para estabilidade de timezone)
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const sessionDate = new Date(y, m - 1, d, 12, 0, 0, 0);
  const startedAt = existingSession?.startedAt && existingSession.startedAt > 0
    ? new Date(y, m - 1, d, new Date(existingSession.startedAt).getHours(), new Date(existingSession.startedAt).getMinutes()).getTime()
    : sessionDate.getTime();

  return {
    id: existingSession?.id || `session_${now}_${Math.random().toString(36).substring(2, 7)}`,
    subjectId,
    mode: existingSession?.mode || 'custom',
    plannedDurationMinutes: totalMinutes,
    actualDurationSeconds: totalMinutes * 60,
    startedAt,
    endedAt: startedAt + totalMinutes * 60 * 1000,
    status: 'completed',
    notes: notes?.trim() ? notes.trim() : undefined,
    createdAt: existingSession?.createdAt || now,
    updatedAt: now,
  };
}
