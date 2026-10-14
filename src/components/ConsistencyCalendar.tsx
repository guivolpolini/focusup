import { useState, useMemo } from 'react';
import {
  Flame,
  Trophy,
  Zap,
  Clock,
  CheckCircle2,
  Calendar,
  X,
  Sparkles,
  Info,
} from 'lucide-react';
import type { StudySession, Task } from '../types';
import {
  generateConsistencyCalendar,
  type ConsistencyPeriod,
  type DayActivityData,
} from '../lib/consistencyEngine';

interface ConsistencyCalendarProps {
  sessions: StudySession[];
  tasks: Task[];
  dailyGoalMinutes: number;
  onStartFocusToday?: () => void;
}

export function ConsistencyCalendar({
  sessions,
  tasks,
  dailyGoalMinutes,
  onStartFocusToday,
}: ConsistencyCalendarProps) {
  const [period, setPeriod] = useState<ConsistencyPeriod>('12m');
  const [selectedDay, setSelectedDay] = useState<DayActivityData | null>(null);

  // Recalcular calendário de consistência de forma determinística e reativa
  const calendarData = useMemo(() => {
    return generateConsistencyCalendar(sessions, tasks, dailyGoalMinutes, period);
  }, [sessions, tasks, dailyGoalMinutes, period]);

  const { weeks, months, stats, todayStr } = calendarData;

  // Formatação de minutos para horas e minutos
  const formatMinutesToHours = (mins: number) => {
    if (mins <= 0) return '0 min';
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hours === 0) return `${remainingMins} min`;
    if (remainingMins === 0) return `${hours}h`;
    return `${hours}h ${remainingMins}m`;
  };

  // Formatar data por extenso em pt-BR
  const formatFullDatePt = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  // Rótulos dos dias da semana (índices 1=Seg, 3=Qua, 5=Sex)
  const dayRowLabels = ['', 'Seg', '', 'Qua', '', 'Sex', ''];

  // Determinar cor e estilo do quadrado de cada dia
  const getDaySquareStyles = (day: DayActivityData | null) => {
    if (!day || day.isFuture) {
      return 'bg-transparent border-transparent cursor-default pointer-events-none opacity-20';
    }

    const isSelected = selectedDay?.dateStr === day.dateStr;
    let baseBg = 'bg-slate-100/90 border-slate-200/70 hover:border-slate-300';

    if (day.intensityLevel === 1) {
      baseBg = 'bg-indigo-100 border-indigo-200/90 hover:border-indigo-400';
    } else if (day.intensityLevel === 2) {
      baseBg = 'bg-indigo-300 border-indigo-400 hover:border-indigo-500';
    } else if (day.intensityLevel === 3) {
      baseBg = 'bg-indigo-500 border-indigo-600 hover:border-indigo-700';
    } else if (day.intensityLevel === 4) {
      baseBg = 'bg-indigo-700 border-indigo-800 hover:border-indigo-900';
    }

    const ringEffect = isSelected
      ? 'ring-2 ring-indigo-600 ring-offset-2 z-10 scale-110 shadow-xs'
      : day.isToday
      ? 'ring-2 ring-amber-400 ring-offset-1 z-5 font-bold'
      : '';

    return `${baseBg} ${ringEffect} border transition-all duration-150 cursor-pointer rounded-[4px]`;
  };

  return (
    <section className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
      {/* Cabeçalho do Componente */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              Calendário de Consistência
              <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
                Atividade Real
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Histórico diário de foco e sessões concluídas no FocusUp.
            </p>
          </div>
        </div>

        {/* Filtros de Período */}
        <div className="flex items-center p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60 self-start sm:self-auto">
          {[
            { id: '30d' as ConsistencyPeriod, label: '30 dias' },
            { id: '90d' as ConsistencyPeriod, label: '90 dias' },
            { id: '12m' as ConsistencyPeriod, label: '12 meses' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setPeriod(item.id);
                setSelectedDay(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                period === item.id
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Indicadores Compactos de Consistência (Estatísticas Reais) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Dias Ativos */}
        <div className="bg-slate-50/70 border border-slate-100 p-3.5 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-indigo-500" /> Dias Ativos
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">{stats.activeDaysCount}</span>
            <span className="text-xs text-slate-400 font-semibold">/ {stats.totalDaysInPeriod}d</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 font-medium">no período selecionado</span>
        </div>

        {/* Sequência Atual */}
        <div className="bg-amber-50/60 border border-amber-100 p-3.5 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-500" /> Sequência Atual
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-900">{stats.currentStreak}</span>
            <span className="text-xs text-amber-700 font-semibold">{stats.currentStreak === 1 ? 'dia' : 'dias'}</span>
          </div>
          <span className="text-[10px] text-amber-600 mt-1 font-medium">
            {stats.currentStreak > 0 ? 'Hábito em andamento 🔥' : 'Comece sua streak hoje'}
          </span>
        </div>

        {/* Maior Sequência */}
        <div className="bg-indigo-50/60 border border-indigo-100 p-3.5 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
            <Trophy className="w-3 h-3 text-indigo-500" /> Maior Sequência
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-indigo-900">{stats.longestStreak}</span>
            <span className="text-xs text-indigo-700 font-semibold">{stats.longestStreak === 1 ? 'dia' : 'dias'}</span>
          </div>
          <span className="text-[10px] text-indigo-600 mt-1 font-medium">recorde histórico</span>
        </div>

        {/* Taxa de Consistência */}
        <div className="bg-emerald-50/60 border border-emerald-100 p-3.5 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3 text-emerald-500" /> Consistência
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-900">{stats.consistencyRate}%</span>
          </div>
          <span className="text-[10px] text-emerald-600 mt-1 font-medium">dias com estudo</span>
        </div>

        {/* Estudo no Mês */}
        <div className="bg-slate-50/70 border border-slate-100 p-3.5 rounded-2xl flex flex-col justify-between col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" /> Estudo no Mês
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900">
              {formatMinutesToHours(stats.monthStudiedMinutes)}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 font-medium">soma no mês corrente</span>
        </div>
      </div>

      {/* Grid do Calendário Estilo GitHub */}
      <div className="space-y-2">
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div className="min-w-fit pr-4">
            {/* Linha dos Meses no Topo */}
            <div className="flex text-[10px] font-bold text-slate-400 mb-1 pl-8">
              {weeks.map((_, weekIndex) => {
                const monthObj = months.find((m) => m.weekIndex === weekIndex);
                return (
                  <div
                    key={`m-${weekIndex}`}
                    className="w-[14px] sm:w-[15px] shrink-0 text-left overflow-visible pr-0.5"
                  >
                    {monthObj ? monthObj.name : ''}
                  </div>
                );
              })}
            </div>

            {/* Grid 7 Linhas (Dias) x N Colunas (Semanas) */}
            <div className="flex gap-1.5 items-start">
              {/* Rótulos dos Dias da Semana na Esquerda */}
              <div className="flex flex-col gap-[3px] sm:gap-[4px] pr-2 shrink-0 pt-0.5">
                {dayRowLabels.map((lbl, rIdx) => (
                  <div
                    key={`lbl-${rIdx}`}
                    className="h-[12px] sm:h-[13px] text-[9px] font-bold text-slate-400 flex items-center justify-end leading-none"
                  >
                    {lbl}
                  </div>
                ))}
              </div>

              {/* Colunas de Semanas */}
              <div className="flex gap-[3px] sm:gap-[4px]">
                {weeks.map((week, wIdx) => (
                  <div key={`w-${wIdx}`} className="flex flex-col gap-[3px] sm:gap-[4px]">
                    {week.map((day, dIdx) => {
                      return (
                        <button
                          key={`d-${wIdx}-${dIdx}`}
                          type="button"
                          onClick={() => day && !day.isFuture && setSelectedDay(day)}
                          title={
                            day && !day.isFuture
                              ? `${day.dateStr}: ${day.totalStudiedMinutes} min (${day.completedSessionsCount} sessões)`
                              : undefined
                          }
                          aria-label={day ? `Dia ${day.dateStr}, ${day.totalStudiedMinutes} minutos de estudo` : undefined}
                          className={`w-[12px] h-[12px] sm:w-[13px] sm:h-[13px] ${getDaySquareStyles(day)}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé: Legenda de Intensidade */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 text-[11px] text-slate-500 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />
            <span className="text-slate-600 font-semibold">Hoje ({todayStr})</span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
            <span>Menos</span>
            <span
              className="w-3 h-3 rounded-[3px] bg-slate-100 border border-slate-200"
              title="0 min (sem atividade)"
            />
            <span
              className="w-3 h-3 rounded-[3px] bg-indigo-100 border border-indigo-200"
              title="1 - 29 min"
            />
            <span
              className="w-3 h-3 rounded-[3px] bg-indigo-300 border border-indigo-400"
              title="30 - 59 min"
            />
            <span
              className="w-3 h-3 rounded-[3px] bg-indigo-500 border border-indigo-600"
              title="60 - 119 min (1h a 2h)"
            />
            <span
              className="w-3 h-3 rounded-[3px] bg-indigo-700 border border-indigo-800"
              title="120+ min (2h+)"
            />
            <span>Mais</span>
          </div>
        </div>
      </div>

      {/* Painel de Detalhes do Dia Selecionado */}
      {selectedDay && (
        <div className="bg-gradient-to-br from-indigo-50/60 via-slate-50 to-white p-5 rounded-2xl border border-indigo-100 shadow-xs space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase font-black tracking-wider text-indigo-600">
                Detalhamento do Dia
              </div>
              <h4 className="text-sm sm:text-base font-extrabold text-slate-900 capitalize mt-0.5">
                {formatFullDatePt(selectedDay.dateStr)}
              </h4>
            </div>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200/60 transition"
              title="Fechar detalhes"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Tempo de Estudo */}
            <div className="bg-white p-3 rounded-xl border border-slate-200/70 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Tempo Estudado</span>
              <div className="text-lg font-black text-slate-900 mt-1">
                {formatMinutesToHours(selectedDay.totalStudiedMinutes)}
              </div>
              <span className="text-[10px] text-slate-400">
                {selectedDay.totalStudiedSeconds} segundos registrados
              </span>
            </div>

            {/* Sessões Concluídas */}
            <div className="bg-white p-3 rounded-xl border border-slate-200/70 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Sessões Finalizadas</span>
              <div className="text-lg font-black text-indigo-700 mt-1">
                {selectedDay.completedSessionsCount}
              </div>
              <span className="text-[10px] text-slate-400">
                {selectedDay.completedSessionsCount === 1 ? 'sessão de foco válida' : 'sessões de foco válidas'}
              </span>
            </div>

            {/* Meta Diária */}
            <div className="bg-white p-3 rounded-xl border border-slate-200/70 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Meta Diária</span>
              <div className="mt-1 flex items-center gap-1.5">
                {selectedDay.isGoalMet ? (
                  <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Meta Atingida
                  </span>
                ) : selectedDay.totalStudiedMinutes > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    {selectedDay.totalStudiedMinutes}m / {dailyGoalMinutes}m
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">Meta: {dailyGoalMinutes}m</span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">
                {selectedDay.isGoalMet
                  ? 'Objetivo de foco superado com sucesso'
                  : selectedDay.totalStudiedMinutes > 0
                  ? `Faltaram ${Math.max(0, dailyGoalMinutes - selectedDay.totalStudiedMinutes)} min`
                  : 'Nenhum tempo computado'}
              </span>
            </div>
          </div>

          {/* Tarefas Concluídas no Dia */}
          {selectedDay.completedTasks.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Tarefas Concluídas Neste Dia ({selectedDay.completedTasks.length}):
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {selectedDay.completedTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-2 bg-white rounded-xl border border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between"
                  >
                    <span className="truncate pr-2">{t.title}</span>
                    <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                      Concluída
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 bg-white/70 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Nenhuma tarefa técnica foi marcada como concluída nesta data.</span>
            </div>
          )}

          {/* Mensagem quando sem atividade */}
          {!selectedDay.isActive && (
            <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-amber-900 text-xs flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Nenhum estudo registrado neste dia.</span>
              </div>
              {selectedDay.isToday && onStartFocusToday && (
                <button
                  onClick={onStartFocusToday}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg shadow-xs transition active:scale-95"
                >
                  ⚡ Iniciar Foco Agora
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
