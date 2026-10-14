import { useState, useMemo } from 'react';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  CheckSquare,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Target,
  Lightbulb,
} from 'lucide-react';
import type {
  StudySession,
  Task,
  Subject,
  GymWorkout,
  Habit,
  HabitLog,
  StudyPreferences,
  GymPreferences,
} from '../types';
import {
  getWeekDateRange,
  calculateWeeklyReport,
  compareWeeklyReports,
  generateWeeklyHighlights,
} from '../lib/weeklyReportEngine';

interface WeeklyReportSectionProps {
  sessions: StudySession[];
  tasks: Task[];
  subjects: Subject[];
  gymWorkouts: GymWorkout[];
  habits: Habit[];
  habitLogs: HabitLog[];
  studyPreferences?: StudyPreferences;
  gymPreferences?: GymPreferences;
}

export function WeeklyReportSection({
  sessions,
  tasks,
  subjects,
  gymWorkouts,
  habits,
  habitLogs,
  studyPreferences,
  gymPreferences,
}: WeeklyReportSectionProps) {
  // Offset de semanas: 0 = semana atual, -1 = semana anterior, etc.
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Intervalo da Semana Atual Selecionada
  const currentRange = useMemo(() => getWeekDateRange(new Date(), weekOffset), [weekOffset]);

  // Intervalo da Semana Imediatamente Anterior para comparação
  const previousRange = useMemo(() => getWeekDateRange(new Date(), weekOffset - 1), [weekOffset]);

  // Relatórios
  const currentReport = useMemo(() => {
    return calculateWeeklyReport({
      weekStartStr: currentRange.weekStartStr,
      weekEndStr: currentRange.weekEndStr,
      sessions,
      tasks,
      subjects,
      gymWorkouts,
      habits,
      habitLogs,
      preferences: studyPreferences,
      gymPreferences,
    });
  }, [currentRange, sessions, tasks, subjects, gymWorkouts, habits, habitLogs, studyPreferences, gymPreferences]);

  const previousReport = useMemo(() => {
    return calculateWeeklyReport({
      weekStartStr: previousRange.weekStartStr,
      weekEndStr: previousRange.weekEndStr,
      sessions,
      tasks,
      subjects,
      gymWorkouts,
      habits,
      habitLogs,
      preferences: studyPreferences,
      gymPreferences,
    });
  }, [previousRange, sessions, tasks, subjects, gymWorkouts, habits, habitLogs, studyPreferences, gymPreferences]);

  // Comparação e Destaques
  const comparison = useMemo(() => compareWeeklyReports(currentReport, previousReport), [currentReport, previousReport]);
  const { highlights, suggestions } = useMemo(
    () => generateWeeklyHighlights(currentReport, comparison),
    [currentReport, comparison]
  );

  // Formatação de data
  const formatFriendlyDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const formatShortDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateStr;
  };

  const formattedWeekTitle = `${formatFriendlyDate(currentRange.weekStartStr)} até ${formatFriendlyDate(currentRange.weekEndStr)}`;

  // Formatação de minutos em H:M
  const formatHoursMins = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  // Cálculo da altura máxima para o gráfico de barras diárias
  const maxDailyMinutes = useMemo(() => {
    const mins = currentReport.study.timeByDay.map((d) => d.minutes);
    return Math.max(...mins, 60); // mínimo 60m para escala
  }, [currentReport.study.timeByDay]);

  return (
    <div className="space-y-6">
      {/* Topo: Título e Navegador de Semanas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">Relatório Semanal</h1>
              <p className="text-xs text-slate-500">
                Visão consolidada de estudos, treinos, hábitos e metas.
              </p>
            </div>
          </div>
        </div>

        {/* Navegador de Semanas */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 transition"
            title="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-xs font-black text-slate-900">{formattedWeekTitle}</div>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                  currentRange.isCurrentWeek
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {currentRange.isCurrentWeek ? 'Semana em andamento' : 'Semana encerrada'}
              </span>
            </div>
          </div>

          <button
            onClick={() => setWeekOffset((prev) => prev + 1)}
            disabled={currentRange.isCurrentWeek}
            className={`p-2 rounded-xl border transition ${
              currentRange.isCurrentWeek
                ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="Próxima semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-3 py-2 bg-indigo-50 rounded-xl transition"
            >
              Semana Atual
            </button>
          )}
        </div>
      </div>

      {/* Destaques e Sugestões da Semana */}
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-black tracking-tight text-white">Destaques da Semana</h2>
          </div>
          <span className="text-[10px] font-bold text-indigo-200/80 uppercase tracking-widest">
            {currentRange.isCurrentWeek ? 'Tempo Real' : 'Consolidado'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Conquistas / Fatos */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">
              Resultados Principais
            </span>
            <ul className="space-y-1.5">
              {highlights.map((item, idx) => (
                <li key={idx} className="text-xs text-slate-200 flex items-start gap-2 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Sugestões Práticas Determinísticas */}
          <div className="space-y-2 p-3.5 bg-white/5 rounded-2xl border border-white/10">
            <div className="flex items-center gap-1.5 text-amber-300">
              <Lightbulb className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Sugestões de Ajuste</span>
            </div>
            <ul className="space-y-1.5">
              {suggestions.map((sug, idx) => (
                <li key={idx} className="text-xs text-indigo-100/90 leading-relaxed">
                  {sug}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 4 Cards de Métricas com Comparativo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Tempo de Estudo */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tempo de Estudo</span>
              <Clock className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {formatHoursMins(currentReport.study.totalStudiedMinutes)}
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">
              {currentReport.study.completedSessionsCount} sessões concluídas
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold">
            <span className="text-slate-400">vs semana anterior:</span>
            {comparison.hasPreviousData ? (
              <span
                className={`flex items-center gap-0.5 ${
                  comparison.studyMinutesPercentChange >= 0 ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {comparison.studyMinutesPercentChange >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {comparison.studyMinutesPercentChange >= 0 ? '+' : ''}
                {comparison.studyMinutesPercentChange}%
              </span>
            ) : (
              <span className="text-slate-400">Sem histórico</span>
            )}
          </div>
        </div>

        {/* Treinos de Academia */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Treinos de Academia</span>
              <Dumbbell className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {currentReport.gym.completedWorkoutsCount}
              <span className="text-xs text-slate-400 font-bold">/{currentReport.gym.weeklyGoalDays}</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">
              {currentReport.gym.totalVolumeKg.toLocaleString()} kg levantados
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold">
            <span className="text-slate-400">vs semana anterior:</span>
            {comparison.hasPreviousData ? (
              <span
                className={`flex items-center gap-0.5 ${
                  comparison.gymWorkoutsDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {comparison.gymWorkoutsDiff >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {comparison.gymWorkoutsDiff >= 0 ? '+' : ''}
                {comparison.gymWorkoutsDiff} treinos
              </span>
            ) : (
              <span className="text-slate-400">Sem histórico</span>
            )}
          </div>
        </div>

        {/* Hábitos Cumpridos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Consistência Hábitos</span>
              <CheckSquare className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {currentReport.habits.overallCompletionRate}%
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">
              {currentReport.habits.completedCount} de {currentReport.habits.scheduledCount} cumpridos
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold">
            <span className="text-slate-400">vs semana anterior:</span>
            {comparison.hasPreviousData ? (
              <span
                className={`flex items-center gap-0.5 ${
                  comparison.habitsCompletionRateDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {comparison.habitsCompletionRateDiff >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {comparison.habitsCompletionRateDiff >= 0 ? '+' : ''}
                {comparison.habitsCompletionRateDiff}%
              </span>
            ) : (
              <span className="text-slate-400">Sem histórico</span>
            )}
          </div>
        </div>

        {/* Tarefas Concluídas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tarefas Concluídas</span>
              <Target className="w-4 h-4 text-purple-500" />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">
              {currentReport.study.completedTasksCount}
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">
              Missões finalizadas
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold">
            <span className="text-slate-400">vs semana anterior:</span>
            {comparison.hasPreviousData ? (
              <span
                className={`flex items-center gap-0.5 ${
                  comparison.tasksCountDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {comparison.tasksCountDiff >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {comparison.tasksCountDiff >= 0 ? '+' : ''}
                {comparison.tasksCountDiff}
              </span>
            ) : (
              <span className="text-slate-400">Sem histórico</span>
            )}
          </div>
        </div>
      </div>

      {/* Gráficos Visuais Principais: Distribuição Diária & Tempo por Matéria */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Diário de Barras de Estudo (2 colunas) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Distribuição Diária de Estudos</h3>
              <p className="text-[10px] text-slate-400">Tempo dedicado por dia da semana</p>
            </div>
            <span className="text-xs font-black text-indigo-600">
              Total: {formatHoursMins(currentReport.study.totalStudiedMinutes)}
            </span>
          </div>

          {/* Gráfico de Barras Responsivo */}
          <div className="pt-6 pb-2">
            <div className="h-48 flex items-end justify-between gap-2 sm:gap-4 px-2">
              {currentReport.study.timeByDay.map((day) => {
                const heightPercent = maxDailyMinutes > 0 ? Math.round((day.minutes / maxDailyMinutes) * 100) : 0;

                return (
                  <div key={day.dateStr} className="flex-1 flex flex-col items-center h-full justify-end group">
                    {/* Tooltip com valor em minutos */}
                    <div className="text-[10px] font-mono font-bold text-slate-500 mb-1 opacity-80 group-hover:opacity-100 group-hover:text-indigo-600 transition">
                      {day.minutes > 0 ? `${day.minutes}m` : '-'}
                    </div>

                    {/* Barra Vertical */}
                    <div className="w-full max-w-[42px] bg-slate-100 rounded-t-xl h-full flex items-end overflow-hidden p-0.5">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 ${
                          day.minutes > 0
                            ? 'bg-gradient-to-t from-indigo-600 to-indigo-400 group-hover:from-indigo-700 group-hover:to-indigo-500 shadow-xs'
                            : 'bg-transparent'
                        }`}
                        style={{ height: `${Math.max(heightPercent, 2)}%` }}
                      />
                    </div>

                    {/* Rótulo do Dia */}
                    <div className="text-center mt-2">
                      <span className="text-xs font-bold text-slate-800 block">{day.dayLabel}</span>
                      <span className="text-[9px] text-slate-400 font-mono block">{formatShortDate(day.dateStr)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tempo por Matéria */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-slate-900 text-sm">Tempo por Matéria</h3>
              <span className="text-[10px] text-slate-400 font-bold">
                {currentReport.study.subjectsStudiedCount} estudadas
              </span>
            </div>

            <div className="space-y-3 mt-4 max-h-56 overflow-y-auto pr-1">
              {currentReport.study.timeBySubject.length > 0 ? (
                currentReport.study.timeBySubject.map((sub) => (
                  <div key={sub.subjectId} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                        {sub.subjectName}
                      </span>
                      <span className="font-mono text-slate-500 text-[11px] shrink-0 font-bold">
                        {formatHoursMins(sub.minutes)} ({sub.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          backgroundColor: sub.color,
                          width: `${sub.percentage}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center space-y-1">
                  <Clock className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-400">Nenhum estudo registrado nesta semana.</p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between items-center">
            <span>Meta semanal: {formatHoursMins(currentReport.study.weeklyGoalMinutes)}</span>
            <span className="font-bold text-indigo-600">{currentReport.study.goalProgressPercent}% atingido</span>
          </div>
        </div>
      </div>

      {/* Seção Inferior: Atividade de Treinos & Consistência de Hábitos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Atividade de Treinos da Semana */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Dumbbell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Treinos da Semana</h3>
                <span className="text-[10px] text-slate-400">
                  {currentReport.gym.completedWorkoutsCount} de {currentReport.gym.weeklyGoalDays} treinos realizados
                </span>
              </div>
            </div>

            <span className="text-xs font-black text-amber-600">
              {currentReport.gym.goalProgressPercent}% meta
            </span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {currentReport.gym.workoutsByDay.length > 0 ? (
              currentReport.gym.workoutsByDay.map((w, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-100/70 text-amber-800 flex items-center justify-center font-black text-xs">
                      {w.dayLabel}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{w.workoutName}</div>
                      <div className="text-[10px] text-slate-400">
                        {formatFriendlyDate(w.dateStr)} • {w.durationMinutes} minutos
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black font-mono text-slate-800">
                      {w.totalVolumeKg.toLocaleString()} kg
                    </span>
                    <span className="text-[9px] text-slate-400 block font-medium">volume levantado</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center space-y-1">
                <Dumbbell className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-400">Nenhum treino realizado nesta semana.</p>
              </div>
            )}
          </div>
        </div>

        {/* Consistência de Hábitos por Hábito */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Adesão aos Hábitos</h3>
                <span className="text-[10px] text-slate-400">Taxa individual na semana</span>
              </div>
            </div>

            <span className="text-xs font-black text-emerald-600">
              Média {currentReport.habits.overallCompletionRate}%
            </span>
          </div>

          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {currentReport.habits.habitSummaries.length > 0 ? (
              currentReport.habits.habitSummaries.map((h) => (
                <div key={h.habitId} className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color }} />
                      {h.habitName}
                    </span>
                    <span className="font-bold text-slate-600 text-[11px]">
                      {h.completedDays}/{h.scheduledDays} ({h.completionRate}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        backgroundColor: h.color || '#10b981',
                        width: `${h.completionRate}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center space-y-1">
                <CheckSquare className="w-6 h-6 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-400">Nenhum hábito programado para esta semana.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Painel de Metas da Semana */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            <h3 className="font-extrabold text-slate-900 text-sm">Metas da Semana</h3>
          </div>
          <span className="text-xs font-black text-slate-700">
            {currentReport.goals.metGoalsCount} de {currentReport.goals.totalGoalsCount} atingidas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Meta Estudo */}
          <div
            className={`p-4 rounded-2xl border transition ${
              currentReport.goals.studyMet
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Estudo</span>
              {currentReport.goals.studyMet ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <span className="text-[10px] text-slate-400 font-bold">Em andamento</span>
              )}
            </div>
            <div className="text-lg font-black mt-1">
              {formatHoursMins(currentReport.study.totalStudiedMinutes)}
              <span className="text-xs font-bold opacity-60">
                {' '}
                / {formatHoursMins(currentReport.study.weeklyGoalMinutes)}
              </span>
            </div>
            <div className="w-full bg-slate-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full"
                style={{ width: `${Math.min(currentReport.study.goalProgressPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Meta Treino */}
          <div
            className={`p-4 rounded-2xl border transition ${
              currentReport.goals.gymMet
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Treinos</span>
              {currentReport.goals.gymMet ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <span className="text-[10px] text-slate-400 font-bold">Em andamento</span>
              )}
            </div>
            <div className="text-lg font-black mt-1">
              {currentReport.gym.completedWorkoutsCount}
              <span className="text-xs font-bold opacity-60"> / {currentReport.gym.weeklyGoalDays} treinos</span>
            </div>
            <div className="w-full bg-slate-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full"
                style={{ width: `${Math.min(currentReport.gym.goalProgressPercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Meta Hábitos */}
          <div
            className={`p-4 rounded-2xl border transition ${
              currentReport.goals.habitsMet
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Hábitos (Meta 80%)</span>
              {currentReport.goals.habitsMet ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <span className="text-[10px] text-slate-400 font-bold">Em andamento</span>
              )}
            </div>
            <div className="text-lg font-black mt-1">
              {currentReport.habits.overallCompletionRate}%
              <span className="text-xs font-bold opacity-60"> de conclusão</span>
            </div>
            <div className="w-full bg-slate-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{ width: `${Math.min(currentReport.habits.overallCompletionRate, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
