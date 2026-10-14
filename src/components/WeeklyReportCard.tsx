import { useMemo } from 'react';
import {
  FileText,
  Clock,
  Dumbbell,
  CheckSquare,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Target,
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
} from '../lib/weeklyReportEngine';

interface WeeklyReportCardProps {
  sessions: StudySession[];
  tasks: Task[];
  subjects: Subject[];
  gymWorkouts: GymWorkout[];
  habits: Habit[];
  habitLogs: HabitLog[];
  studyPreferences?: StudyPreferences;
  gymPreferences?: GymPreferences;
  onOpenReportPage: () => void;
}

export function WeeklyReportCard({
  sessions,
  tasks,
  subjects,
  gymWorkouts,
  habits,
  habitLogs,
  studyPreferences,
  gymPreferences,
  onOpenReportPage,
}: WeeklyReportCardProps) {
  // Semana Atual e Semana Anterior
  const currentRange = useMemo(() => getWeekDateRange(new Date(), 0), []);
  const previousRange = useMemo(() => getWeekDateRange(new Date(), -1), []);

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

  const comparison = useMemo(() => {
    return compareWeeklyReports(currentReport, previousReport);
  }, [currentReport, previousReport]);

  // Formatação de datas em formato DD/MM
  const formatShortDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateStr;
  };

  const formattedRange = `${formatShortDate(currentRange.weekStartStr)} a ${formatShortDate(currentRange.weekEndStr)}`;

  // Formatação do tempo de estudo
  const hours = Math.floor(currentReport.study.totalStudiedMinutes / 60);
  const mins = currentReport.study.totalStudiedMinutes % 60;
  const timeFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
      {/* Topo do Card */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Resumo da Semana</h3>
              <span className="text-[10px] text-slate-400 font-medium">{formattedRange}</span>
            </div>
          </div>

          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
            Em andamento
          </span>
        </div>

        {/* 3 Métricas Principais da Semana */}
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          {/* Estudo */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Estudo</span>
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="mt-1">
              <div className="text-base font-black text-slate-900 leading-tight">{timeFormatted}</div>
              {comparison.hasPreviousData && (
                <div className="flex items-center gap-0.5 mt-0.5 text-[9px] font-bold">
                  {comparison.studyMinutesPercentChange >= 0 ? (
                    <span className="text-emerald-600 flex items-center">
                      <TrendingUp className="w-2.5 h-2.5 mr-0.5" />+{comparison.studyMinutesPercentChange}%
                    </span>
                  ) : (
                    <span className="text-rose-500 flex items-center">
                      <TrendingDown className="w-2.5 h-2.5 mr-0.5" />{comparison.studyMinutesPercentChange}%
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Academia */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Treinos</span>
              <Dumbbell className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="mt-1">
              <div className="text-base font-black text-slate-900 leading-tight">
                {currentReport.gym.completedWorkoutsCount}
                <span className="text-[10px] text-slate-400 font-medium">/{currentReport.gym.weeklyGoalDays}</span>
              </div>
              <span className="text-[9px] text-slate-400 font-medium">
                {currentReport.gym.goalProgressPercent}% meta
              </span>
            </div>
          </div>

          {/* Hábitos */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Hábitos</span>
              <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="mt-1">
              <div className="text-base font-black text-slate-900 leading-tight">
                {currentReport.habits.overallCompletionRate}%
              </div>
              <span className="text-[9px] text-slate-400 font-medium">
                {currentReport.habits.completedCount}/{currentReport.habits.scheduledCount} feitos
              </span>
            </div>
          </div>
        </div>

        {/* Metas da Semana Integradas */}
        <div className="mt-3 p-3 bg-indigo-50/40 rounded-2xl border border-indigo-100/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <div className="text-xs font-bold text-indigo-950">
                {currentReport.goals.metGoalsCount} de {currentReport.goals.totalGoalsCount} metas conquistadas
              </div>
              <div className="text-[10px] text-indigo-600/90 font-medium">
                {currentReport.goals.studyMet ? '✓ Estudo ' : ''}
                {currentReport.goals.gymMet ? '✓ Treino ' : ''}
                {currentReport.goals.habitsMet ? '✓ Hábitos' : ''}
                {!currentReport.goals.studyMet && !currentReport.goals.gymMet && !currentReport.goals.habitsMet
                  ? 'Metas em andamento'
                  : ''}
              </div>
            </div>
          </div>

          <div className="w-12 bg-white/80 h-2 rounded-full overflow-hidden border border-indigo-200/50">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all"
              style={{
                width: `${
                  currentReport.goals.totalGoalsCount > 0
                    ? Math.round((currentReport.goals.metGoalsCount / currentReport.goals.totalGoalsCount) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Rodapé: Link para a Página Completa */}
      <button
        onClick={onOpenReportPage}
        className="w-full pt-3 border-t border-slate-100 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 transition"
      >
        Abrir Relatório Completo <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
