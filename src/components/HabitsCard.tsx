import {
  CheckSquare,
  CheckCircle2,
  Circle,
  Plus,
  Flame,
  ChevronRight,
  Book,
  Droplets,
  Code,
  Dumbbell,
  Moon,
  Heart,
  Globe,
  Sparkles,
  Target,
} from 'lucide-react';
import type { Habit, HabitLog } from '../types';
import {
  calculateHabitsDailyProgress,
  calculateHabitStreak,
} from '../lib/habitEngine';
import { formatDateToLocalYYYYMMDD } from '../lib/srsEngine';

interface HabitsCardProps {
  habits: Habit[];
  habitLogs: HabitLog[];
  onOpenHabitsPage: () => void;
  onToggleHabit: (habit: Habit) => Promise<void>;
  onOpenNewHabitModal: () => void;
}

// Mapeamento dinâmico de ícones
export function renderHabitIcon(iconName: string, className = 'w-4 h-4') {
  switch (iconName) {
    case 'book':
      return <Book className={className} />;
    case 'droplets':
      return <Droplets className={className} />;
    case 'code':
      return <Code className={className} />;
    case 'dumbbell':
      return <Dumbbell className={className} />;
    case 'moon':
      return <Moon className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'globe':
      return <Globe className={className} />;
    case 'target':
      return <Target className={className} />;
    default:
      return <CheckSquare className={className} />;
  }
}

export function HabitsCard({
  habits,
  habitLogs,
  onOpenHabitsPage,
  onToggleHabit,
  onOpenNewHabitModal,
}: HabitsCardProps) {
  const todayStr = formatDateToLocalYYYYMMDD(new Date());
  const dailyProgress = calculateHabitsDailyProgress(habits, habitLogs, todayStr);

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
      {/* Topo do Card */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Meus Hábitos</h3>
              <span className="text-[10px] text-slate-400 font-medium">Rotina de hoje</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800">
              {dailyProgress.totalCompleted} / {dailyProgress.totalScheduled}
            </span>
            <button
              onClick={onOpenNewHabitModal}
              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition"
              title="Novo hábito"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra de Progresso do Dia */}
        <div className="space-y-1 mt-3">
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${dailyProgress.progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
            <span>{dailyProgress.progressPercent}% concluído</span>
            <span>
              {dailyProgress.totalScheduled > 0 && dailyProgress.totalCompleted === dailyProgress.totalScheduled
                ? 'Todos os hábitos cumpridos! 🏆'
                : `${dailyProgress.totalScheduled - dailyProgress.totalCompleted} pendentes`}
            </span>
          </div>
        </div>

        {/* Lista de Hábitos de Hoje */}
        <div className="space-y-2 mt-4 max-h-56 overflow-y-auto pr-1">
          {dailyProgress.items.length > 0 ? (
            dailyProgress.items.map((item) => {
              const streak = calculateHabitStreak(item.habit, habitLogs, todayStr);

              return (
                <div
                  key={item.habit.id}
                  onClick={() => onToggleHabit(item.habit)}
                  className={`p-2.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
                    item.completed
                      ? 'bg-emerald-50/60 border-emerald-200/90 text-slate-800'
                      : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/80 text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition ${
                        item.completed ? 'bg-emerald-500 text-white shadow-2xs' : 'text-slate-300'
                      }`}
                    >
                      {item.completed ? (
                        <CheckCircle2 className="w-5 h-5 fill-emerald-500 text-white stroke-2" />
                      ) : (
                        <Circle className="w-5 h-5 stroke-[1.8]" />
                      )}
                    </div>
                    <div className="truncate">
                      <span
                        className={`text-xs font-bold block truncate ${
                          item.completed ? 'line-through text-slate-400 font-medium' : 'text-slate-800'
                        }`}
                      >
                        {item.habit.name}
                      </span>
                    </div>
                  </div>

                  {streak.currentStreak > 0 && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                        item.completed
                          ? 'text-emerald-700 bg-emerald-100/60 border-emerald-200'
                          : 'text-amber-600 bg-amber-50 border-amber-200/60'
                      }`}
                    >
                      <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
                      {streak.currentStreak}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center space-y-2">
              <Sparkles className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-400">Nenhum hábito programado para hoje.</p>
              <button
                onClick={onOpenNewHabitModal}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
              >
                + Criar primeiro hábito
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé: Link para a Página Completa */}
      <button
        onClick={onOpenHabitsPage}
        className="w-full pt-3 border-t border-slate-100 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center justify-center gap-1 transition"
      >
        Ver Todos os Hábitos & Histórico <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
