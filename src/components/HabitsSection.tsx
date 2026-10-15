import { useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckSquare,
  CheckCircle2,
  Circle,
  Plus,
  Flame,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { db } from '../lib/db';
import type { Habit, HabitLog } from '../types';
import {
  calculateHabitStreak,
  calculateHabitsDailyProgress,
  getHabitLogForDate,
  getHabitStatusForDate,
  PRESET_HABIT_TEMPLATES,
} from '../lib/habitEngine';
import { formatDateToLocalYYYYMMDD } from '../lib/srsEngine';

interface HabitsSectionProps {
  habits: Habit[];
  habitLogs: HabitLog[];
}

export function HabitsSection({ habits, habitLogs }: HabitsSectionProps) {
  const [newHabitName, setNewHabitName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayStr = formatDateToLocalYYYYMMDD(new Date());

  const activeHabits = useMemo(() => habits.filter((h) => !h.isArchived), [habits]);

  const todayProgress = useMemo(
    () => calculateHabitsDailyProgress(habits, habitLogs, todayStr),
    [habits, habitLogs, todayStr]
  );

  const bestStreakOverall = useMemo(() => {
    if (activeHabits.length === 0) return 0;
    return Math.max(...activeHabits.map((h) => calculateHabitStreak(h, habitLogs, todayStr).currentStreak), 0);
  }, [activeHabits, habitLogs, todayStr]);

  // Alternar conclusão do hábito em 1 clique
  const handleToggleHabit = async (habit: Habit) => {
    const log = getHabitLogForDate(habitLogs, habit.id, todayStr);
    const status = getHabitStatusForDate(habit, log);
    const nowTime = Date.now();
    const logId = `${habit.id}_${todayStr}`;

    if (status.completed) {
      if (log) {
        await db.habitLogs.update(log.id, {
          completed: false,
          currentValue: 0,
          updatedAt: nowTime,
        });
      }
    } else {
      const targetVal = habit.targetType === 'numeric' ? (habit.targetValue || 1) : 1;
      await db.habitLogs.put({
        id: logId,
        habitId: habit.id,
        date: todayStr,
        completed: true,
        currentValue: targetVal,
        targetValue: targetVal,
        completedAt: nowTime,
        createdAt: log ? log.createdAt : nowTime,
        updatedAt: nowTime,
      });

      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
      });
    }
  };

  // Cadastro rápido com 1 campo
  const handleAddHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newHabitName.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      await db.habits.add({
        id: `habit-${Date.now()}`,
        name: trimmed,
        icon: 'check',
        color: '#10b981',
        category: 'produtividade',
        frequencyType: 'daily',
        targetType: 'boolean',
        startDate: todayStr,
        isArchived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setNewHabitName('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Excluir hábito
  const handleDeleteHabit = async (id: string, name: string) => {
    if (window.confirm(`Excluir o hábito "${name}"?`)) {
      await db.habits.delete(id);
      const logsToDelete = habitLogs.filter((l) => l.habitId === id);
      if (logsToDelete.length > 0) {
        await db.habitLogs.bulkDelete(logsToDelete.map((l) => l.id));
      }
    }
  };

  // Popular hábitos sugeridos de exemplo caso lista vazia
  const handleSeedPresets = async () => {
    const nowTime = Date.now();
    const presetsToAdd: Habit[] = PRESET_HABIT_TEMPLATES.slice(0, 4).map((tpl, i) => ({
      id: `habit-preset-${nowTime}-${i}`,
      name: tpl.name,
      description: tpl.description,
      icon: tpl.icon,
      color: tpl.color,
      category: tpl.category,
      frequencyType: 'daily',
      targetType: 'boolean',
      startDate: todayStr,
      isArchived: false,
      createdAt: nowTime + i,
      updatedAt: nowTime + i,
    }));
    await db.habits.bulkAdd(presetsToAdd);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Cabeçalho */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-emerald-600" />
            <h2 className="text-2xl font-black text-slate-900">Hábitos Diários</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Construa consistência com 1 toque por dia. Sem formulários longos.
          </p>
        </div>

        {/* Métricas rápidas */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="px-3.5 py-1.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="text-emerald-600 font-black">
              {todayProgress.totalCompleted}/{todayProgress.totalScheduled}
            </span>
            <span>concluídos hoje</span>
          </div>
          {bestStreakOverall > 0 && (
            <div className="px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200/70 text-amber-700 flex items-center gap-1.5 text-xs font-black">
              <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span>{bestStreakOverall} {bestStreakOverall === 1 ? 'dia' : 'dias'}</span>
            </div>
          )}
        </div>
      </header>

      {/* Barra de Progresso do Dia */}
      {activeHabits.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700">Progresso de Hoje</span>
            <span className="font-mono font-black text-emerald-600">{todayProgress.progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${todayProgress.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Adição Rápida (1 campo de texto) */}
      <form onSubmit={handleAddHabit} className="flex gap-2">
        <input
          type="text"
          value={newHabitName}
          onChange={(e) => setNewHabitName(e.target.value)}
          placeholder="Novo hábito (ex: Beber 2L água, Ler 10 páginas, Treinar)..."
          className="flex-1 px-4 py-3 text-sm bg-white border border-slate-200 rounded-2xl focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-2xs transition"
          disabled={isSubmitting}
        />
        <button
          type="submit"
          disabled={!newHabitName.trim() || isSubmitting}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-5 py-3 rounded-2xl shadow-xs transition active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Adicionar</span>
        </button>
      </form>

      {/* Lista de Hábitos */}
      <div className="space-y-2.5">
        {activeHabits.length > 0 ? (
          activeHabits.map((habit) => {
            const log = getHabitLogForDate(habitLogs, habit.id, todayStr);
            const status = getHabitStatusForDate(habit, log);
            const streak = calculateHabitStreak(habit, habitLogs, todayStr);

            return (
              <div
                key={habit.id}
                onClick={() => handleToggleHabit(habit)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-4 group ${
                  status.completed
                    ? 'bg-emerald-50/60 border-emerald-200/90 text-slate-800'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 ${
                      status.completed
                        ? 'bg-emerald-500 text-white shadow-xs scale-105'
                        : 'text-slate-300 group-hover:text-slate-400'
                    }`}
                  >
                    {status.completed ? (
                      <CheckCircle2 className="w-6 h-6 fill-emerald-500 text-white stroke-2" />
                    ) : (
                      <Circle className="w-6 h-6 stroke-[1.8]" />
                    )}
                  </button>

                  <div className="truncate">
                    <span
                      className={`text-sm font-bold block truncate transition ${
                        status.completed ? 'line-through text-slate-400 font-medium' : 'text-slate-900'
                      }`}
                    >
                      {habit.name}
                    </span>
                    {habit.description && (
                      <span className="text-[11px] text-slate-400 block truncate">
                        {habit.description}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {streak.currentStreak > 0 && (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
                        status.completed
                          ? 'text-emerald-700 bg-emerald-100/60 border-emerald-200'
                          : 'text-amber-700 bg-amber-50 border-amber-200/70'
                      }`}
                    >
                      <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
                      {streak.currentStreak} {streak.currentStreak === 1 ? 'dia' : 'dias'}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteHabit(habit.id, habit.name)}
                    className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition opacity-40 group-hover:opacity-100"
                    title="Excluir hábito"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white p-8 rounded-3xl border border-slate-200/90 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Nenhum hábito cadastrado</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Digite um hábito acima para começar, ou carregue uma rotina sugerida com 1 clique.
              </p>
            </div>
            <button
              onClick={handleSeedPresets}
              className="inline-flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs px-4 py-2.5 rounded-xl transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Carregar Hábitos Sugeridos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
