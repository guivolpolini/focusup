import { useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckSquare,
  Circle,
  Plus,
  Flame,
  Calendar,
  Clock,
  Sparkles,
  Archive,
  ArchiveRestore,
  Trash2,
  Edit2,
  Search,
  Book,
  Droplets,
  Code,
  Dumbbell,
  Moon,
  Heart,
  Globe,
  Target,
  TrendingUp,
  X,
  Check,
} from 'lucide-react';
import { db } from '../lib/db';
import type { Habit, HabitLog, HabitCategory, HabitFrequencyType, HabitTargetType } from '../types';
import {
  calculateHabitStreak,
  calculateHabitCompletionRate,
  calculateHabitsDailyProgress,
  isHabitScheduledForDate,
  getHabitLogForDate,
  getHabitStatusForDate,
  PRESET_HABIT_TEMPLATES,
} from '../lib/habitEngine';
import { formatDateToLocalYYYYMMDD } from '../lib/srsEngine';
import { renderHabitIcon } from './HabitsCard';

interface HabitsSectionProps {
  habits: Habit[];
  habitLogs: HabitLog[];
  onOpenNewHabitModal?: () => void;
}

const CATEGORY_LABELS: Record<HabitCategory, { label: string; color: string }> = {
  estudos: { label: 'Estudos', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  saude: { label: 'Saúde', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  produtividade: { label: 'Produtividade', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  pessoal: { label: 'Pessoal', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  outro: { label: 'Outro', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const AVAILABLE_ICONS = [
  { id: 'check', label: 'Check', icon: CheckSquare },
  { id: 'book', label: 'Livro', icon: Book },
  { id: 'droplets', label: 'Água', icon: Droplets },
  { id: 'code', label: 'Código', icon: Code },
  { id: 'dumbbell', label: 'Treino', icon: Dumbbell },
  { id: 'moon', label: 'Sono', icon: Moon },
  { id: 'heart', label: 'Saúde', icon: Heart },
  { id: 'globe', label: 'Idiomas', icon: Globe },
  { id: 'target', label: 'Alvo', icon: Target },
  { id: 'sparkles', label: 'Hábito', icon: Sparkles },
];

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#3b82f6', // Azul
  '#10b981', // Esmeralda
  '#f59e0b', // Âmbar
  '#ef4444', // Vermelho
  '#8b5cf6', // Roxo
  '#ec4899', // Rosa
  '#06b6d4', // Ciano
];

const DAYS_OF_WEEK = [
  { id: 1, label: 'Seg' },
  { id: 2, label: 'Ter' },
  { id: 3, label: 'Qua' },
  { id: 4, label: 'Qui' },
  { id: 5, label: 'Sex' },
  { id: 6, label: 'Sáb' },
  { id: 0, label: 'Dom' },
];

export function HabitsSection({ habits, habitLogs }: HabitsSectionProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [selectedCategory, setSelectedCategory] = useState<'todos' | HabitCategory>('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Estados de Modais
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [showNumericModal, setShowNumericModal] = useState(false);
  const [selectedNumericHabit, setSelectedNumericHabit] = useState<Habit | null>(null);
  const [numericValueInput, setNumericValueInput] = useState<string>('');
  const [numericNoteInput, setNumericNoteInput] = useState<string>('');

  // Formulário do Hábito
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState<HabitCategory>('estudos');
  const [formIcon, setFormIcon] = useState('book');
  const [formColor, setFormColor] = useState('#6366f1');
  const [formFrequencyType, setFormFrequencyType] = useState<HabitFrequencyType>('daily');
  const [formFrequencyDays, setFormFrequencyDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formFrequencyTimes, setFormFrequencyTimes] = useState<number>(3);
  const [formTargetType, setFormTargetType] = useState<HabitTargetType>('boolean');
  const [formTargetValue, setFormTargetValue] = useState<number>(15);
  const [formUnit, setFormUnit] = useState('min');
  const [formReminder, setFormReminder] = useState('');
  const [formStartDate, setFormStartDate] = useState(formatDateToLocalYYYYMMDD(new Date()));

  const todayStr = formatDateToLocalYYYYMMDD(new Date());

  // Últimos 7 dias para a matriz visual
  const last7Days = useMemo(() => {
    const list: { dateStr: string; dayLabel: string; dayNum: number }[] = [];
    const today = new Date(`${todayStr}T12:00:00`);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const str = formatDateToLocalYYYYMMDD(d);
      const dayIndex = d.getDay();
      const dayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
      list.push({
        dateStr: str,
        dayLabel: dayNames[dayIndex],
        dayNum: d.getDate(),
      });
    }
    return list;
  }, [todayStr]);

  // Filtros aplicados
  const filteredHabits = useMemo(() => {
    return habits.filter((h) => {
      if (activeTab === 'active' && h.isArchived) return false;
      if (activeTab === 'archived' && !h.isArchived) return false;
      if (selectedCategory !== 'todos' && h.category !== selectedCategory) return false;
      if (searchQuery.trim() && !h.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [habits, activeTab, selectedCategory, searchQuery]);

  // Estatísticas Gerais
  const activeHabits = useMemo(() => habits.filter((h) => !h.isArchived), [habits]);
  const todayProgress = useMemo(
    () => calculateHabitsDailyProgress(habits, habitLogs, todayStr),
    [habits, habitLogs, todayStr]
  );

  const bestStreakOverall = useMemo(() => {
    if (activeHabits.length === 0) return 0;
    return Math.max(...activeHabits.map((h) => calculateHabitStreak(h, habitLogs, todayStr).currentStreak), 0);
  }, [activeHabits, habitLogs, todayStr]);

  const globalRate30d = useMemo(() => {
    if (activeHabits.length === 0) return 0;
    const rates = activeHabits.map((h) => calculateHabitCompletionRate(h, habitLogs, 30, todayStr));
    const sum = rates.reduce((a, b) => a + b, 0);
    return Math.round(sum / activeHabits.length);
  }, [activeHabits, habitLogs, todayStr]);

  // Abertura do Modal de Novo / Editar Hábito
  const handleOpenCreateModal = () => {
    setEditingHabit(null);
    setFormName('');
    setFormDesc('');
    setFormCategory('estudos');
    setFormIcon('book');
    setFormColor('#6366f1');
    setFormFrequencyType('daily');
    setFormFrequencyDays([1, 2, 3, 4, 5]);
    setFormFrequencyTimes(3);
    setFormTargetType('boolean');
    setFormTargetValue(15);
    setFormUnit('min');
    setFormReminder('');
    setFormStartDate(todayStr);
    setShowHabitModal(true);
  };

  const handleOpenEditModal = (h: Habit) => {
    setEditingHabit(h);
    setFormName(h.name);
    setFormDesc(h.description || '');
    setFormCategory(h.category);
    setFormIcon(h.icon);
    setFormColor(h.color);
    setFormFrequencyType(h.frequencyType);
    setFormFrequencyDays(h.frequencyDays || [1, 2, 3, 4, 5]);
    setFormFrequencyTimes(h.frequencyTimesPerWeek || 3);
    setFormTargetType(h.targetType);
    setFormTargetValue(h.targetValue || 15);
    setFormUnit(h.unit || 'min');
    setFormReminder(h.reminderTime || '');
    setFormStartDate(h.startDate || todayStr);
    setShowHabitModal(true);
  };

  const handleApplyPreset = (presetIndex: number) => {
    const p = PRESET_HABIT_TEMPLATES[presetIndex];
    if (!p) return;
    setFormName(p.name);
    setFormDesc(p.description || '');
    setFormCategory(p.category);
    setFormIcon(p.icon);
    setFormColor(p.color);
    setFormFrequencyType(p.frequencyType);
    if (p.frequencyDays) setFormFrequencyDays(p.frequencyDays);
    if (p.frequencyTimesPerWeek) setFormFrequencyTimes(p.frequencyTimesPerWeek);
    setFormTargetType(p.targetType);
    if (p.targetValue !== undefined) setFormTargetValue(p.targetValue);
    if (p.unit) setFormUnit(p.unit);
    if (p.reminderTime) setFormReminder(p.reminderTime);
  };

  const handleSaveHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const nowTime = Date.now();
    const habitData: Habit = {
      id: editingHabit ? editingHabit.id : `habit_${nowTime}`,
      name: formName.trim(),
      description: formDesc.trim() || undefined,
      category: formCategory,
      icon: formIcon,
      color: formColor,
      frequencyType: formFrequencyType,
      frequencyDays: formFrequencyType === 'specific_days' ? formFrequencyDays : undefined,
      frequencyTimesPerWeek: formFrequencyType === 'times_per_week' ? formFrequencyTimes : undefined,
      targetType: formTargetType,
      targetValue: formTargetType === 'numeric' ? Number(formTargetValue) : 1,
      unit: formTargetType === 'numeric' ? formUnit.trim() : undefined,
      reminderTime: formReminder || undefined,
      startDate: formStartDate || todayStr,
      isArchived: editingHabit ? editingHabit.isArchived : false,
      createdAt: editingHabit ? editingHabit.createdAt : nowTime,
      updatedAt: nowTime,
    };

    if (editingHabit) {
      await db.habits.put(habitData);
    } else {
      await db.habits.add(habitData);
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
    }

    setShowHabitModal(false);
  };

  // Alternar conclusão rápida de um hábito
  const handleToggleHabitForDate = async (habit: Habit, dateStr: string) => {
    const log = getHabitLogForDate(habitLogs, habit.id, dateStr);
    const status = getHabitStatusForDate(habit, log);
    const nowTime = Date.now();
    const logId = `${habit.id}_${dateStr}`;

    if (status.completed) {
      // Desmarcar
      if (log) {
        await db.habitLogs.update(log.id, {
          completed: false,
          currentValue: 0,
          updatedAt: nowTime,
        });
      }
    } else {
      // Concluir
      const targetVal = habit.targetType === 'numeric' ? (habit.targetValue || 1) : 1;
      const newLog: HabitLog = {
        id: logId,
        habitId: habit.id,
        date: dateStr,
        completed: true,
        currentValue: targetVal,
        targetValue: targetVal,
        completedAt: nowTime,
        createdAt: log ? log.createdAt : nowTime,
        updatedAt: nowTime,
      };
      await db.habitLogs.put(newLog);
      confetti({ particleCount: 35, spread: 55, origin: { y: 0.85 } });
    }
  };

  // Modal Numérico
  const handleOpenNumericModal = (habit: Habit) => {
    setSelectedNumericHabit(habit);
    const log = getHabitLogForDate(habitLogs, habit.id, todayStr);
    setNumericValueInput(log?.currentValue !== undefined ? String(log.currentValue) : String(habit.targetValue || 0));
    setNumericNoteInput(log?.notes || '');
    setShowNumericModal(true);
  };

  const handleSaveNumericLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNumericHabit) return;

    const val = Number(numericValueInput);
    if (isNaN(val) || val < 0) return;

    const targetVal = selectedNumericHabit.targetValue || 1;
    const isCompleted = val >= targetVal;
    const nowTime = Date.now();
    const logId = `${selectedNumericHabit.id}_${todayStr}`;
    const existingLog = getHabitLogForDate(habitLogs, selectedNumericHabit.id, todayStr);

    const log: HabitLog = {
      id: logId,
      habitId: selectedNumericHabit.id,
      date: todayStr,
      completed: isCompleted,
      currentValue: val,
      targetValue: targetVal,
      notes: numericNoteInput.trim() || undefined,
      completedAt: isCompleted ? (existingLog?.completedAt || nowTime) : undefined,
      createdAt: existingLog ? existingLog.createdAt : nowTime,
      updatedAt: nowTime,
    };

    await db.habitLogs.put(log);
    if (isCompleted) {
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.85 } });
    }
    setShowNumericModal(false);
  };

  // Carregar modelos de hábitos sugeridos diretamente
  const handleSeedPresets = async () => {
    if (!confirm('Deseja carregar 5 modelos sugeridos de hábitos para começar sua rotina?')) return;
    const nowTime = Date.now();
    for (let i = 0; i < PRESET_HABIT_TEMPLATES.length; i++) {
      const p = PRESET_HABIT_TEMPLATES[i];
      const newHabit: Habit = {
        id: `preset_h_${nowTime}_${i}`,
        ...p,
        startDate: todayStr,
        isArchived: false,
        createdAt: nowTime + i,
        updatedAt: nowTime + i,
      };
      await db.habits.add(newHabit);
    }
    confetti({ particleCount: 50, spread: 80, origin: { y: 0.7 } });
  };

  const handleArchiveToggle = async (habit: Habit) => {
    await db.habits.update(habit.id, {
      isArchived: !habit.isArchived,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteHabit = async (habit: Habit) => {
    if (confirm(`Tem certeza que deseja excluir o hábito "${habit.name}"? Todo o histórico dele será removido.`)) {
      await db.habits.delete(habit.id);
      // Limpar logs órfãos deste hábito
      const relatedLogs = habitLogs.filter((l) => l.habitId === habit.id);
      for (const log of relatedLogs) {
        await db.habitLogs.delete(log.id);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Topo do Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">Rastreador de Hábitos</h1>
              <p className="text-xs text-slate-500">
                Construa consistência diária com hábitos atômicos e acompanhe sua evolução.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeHabits.length === 0 && (
            <button
              onClick={handleSeedPresets}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100/70 text-indigo-700 text-xs font-bold transition"
            >
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Carregar Modelos Sugeridos
            </button>
          )}
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Novo Hábito
          </button>
        </div>
      </div>

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hábitos Ativos</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900">{activeHabits.length}</span>
            <span className="text-xs text-slate-400 font-bold">cadastrados</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Rotina personalizada</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cumpridos Hoje</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900">{todayProgress.totalCompleted}</span>
            <span className="text-xs text-slate-400 font-bold">/ {todayProgress.totalScheduled}</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${todayProgress.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Maior Sequência</span>
          <div className="mt-2 flex items-center gap-2">
            <Flame className="w-7 h-7 text-amber-500" />
            <span className="text-3xl font-black text-slate-900">{bestStreakOverall}</span>
            <span className="text-xs text-slate-400 font-bold">dias</span>
          </div>
          <p className="text-[10px] text-amber-600 mt-2 font-bold">Recorde de disciplina</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Consistência (30d)</span>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900">{globalRate30d}%</span>
          </div>
          <p className="text-[10px] text-emerald-600 mt-2 font-bold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Média de conclusão
          </p>
        </div>
      </div>

      {/* Barra de Filtros, Abas e Busca */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Abas Ativos / Arquivados */}
          <div className="inline-flex p-1 bg-slate-100 rounded-2xl gap-1 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex-1 sm:flex-none ${
                activeTab === 'active' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Ativos ({activeHabits.length})
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex-1 sm:flex-none ${
                activeTab === 'archived' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Arquivados ({habits.filter((h) => h.isArchived).length})
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar hábito..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Filtro por Categoria */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('todos')}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition ${
              selectedCategory === 'todos'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todas as categorias
          </button>
          {(Object.keys(CATEGORY_LABELS) as HabitCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {CATEGORY_LABELS[cat].label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Hábitos */}
      <div className="space-y-3">
        {filteredHabits.length > 0 ? (
          filteredHabits.map((habit) => {
            const streak = calculateHabitStreak(habit, habitLogs, todayStr);
            const rate30d = calculateHabitCompletionRate(habit, habitLogs, 30, todayStr);
            const todayLog = getHabitLogForDate(habitLogs, habit.id, todayStr);
            const todayStatus = getHabitStatusForDate(habit, todayLog);
            const isScheduledToday = isHabitScheduledForDate(habit, todayStr);

            // Descrição da frequência
            let freqText = 'Todos os dias';
            if (habit.frequencyType === 'specific_days' && habit.frequencyDays) {
              const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
              freqText = habit.frequencyDays.map((d) => names[d]).join(', ');
            } else if (habit.frequencyType === 'times_per_week') {
              freqText = `${habit.frequencyTimesPerWeek || 3}x por semana`;
            }

            return (
              <div
                key={habit.id}
                className={`bg-white p-5 rounded-3xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs ${
                  habit.isArchived ? 'opacity-60 bg-slate-50/50' : 'hover:border-slate-300'
                }`}
              >
                {/* Lado Esquerdo: Identificação do Hábito */}
                <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs"
                    style={{
                      backgroundColor: `${habit.color}15`,
                      color: habit.color,
                    }}
                  >
                    {renderHabitIcon(habit.icon, 'w-5 h-5')}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-extrabold text-slate-900 text-sm truncate">{habit.name}</h3>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${
                          CATEGORY_LABELS[habit.category]?.color || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {CATEGORY_LABELS[habit.category]?.label || habit.category}
                      </span>
                      {streak.currentStreak > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
                          <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
                          {streak.currentStreak} {streak.currentStreak === 1 ? 'dia' : 'dias'}
                        </span>
                      )}
                    </div>

                    {habit.description && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{habit.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-semibold">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" /> {freqText}
                      </span>
                      {habit.targetType === 'numeric' && (
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3 text-slate-400" /> Meta: {habit.targetValue} {habit.unit}
                        </span>
                      )}
                      {habit.reminderTime && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" /> {habit.reminderTime}
                        </span>
                      )}
                      <span className="text-emerald-600 font-bold">30d: {rate30d}%</span>
                    </div>
                  </div>
                </div>

                {/* Centro: Mini Matriz dos Últimos 7 Dias */}
                <div className="flex items-center gap-1.5 self-center sm:self-auto py-1 px-3 bg-slate-50 rounded-2xl border border-slate-100">
                  {last7Days.map((d) => {
                    const isSched = isHabitScheduledForDate(habit, d.dateStr);
                    const log = getHabitLogForDate(habitLogs, habit.id, d.dateStr);
                    const isDone = getHabitStatusForDate(habit, log).completed;
                    const isTodayItem = d.dateStr === todayStr;

                    return (
                      <button
                        key={d.dateStr}
                        onClick={() => handleToggleHabitForDate(habit, d.dateStr)}
                        disabled={habit.isArchived}
                        title={`${d.dateStr}: ${isDone ? 'Concluído' : isSched ? 'Pendente' : 'Não agendado'}`}
                        className={`w-7 h-9 rounded-xl flex flex-col items-center justify-center text-[9px] font-bold transition group ${
                          isTodayItem ? 'ring-1.5 ring-indigo-500' : ''
                        } ${
                          isDone
                            ? 'bg-emerald-500 text-white shadow-2xs'
                            : isSched
                            ? 'bg-white text-slate-400 border border-slate-200 hover:border-emerald-300'
                            : 'bg-transparent text-slate-300 opacity-60'
                        }`}
                      >
                        <span className="text-[8px] opacity-80">{d.dayLabel}</span>
                        <span className="text-[10px] leading-tight font-black">{d.dayNum}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Lado Direito: Ações Hoje & Menu */}
                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {/* Botão de Registro Numérico */}
                  {habit.targetType === 'numeric' && !habit.isArchived && (
                    <button
                      onClick={() => handleOpenNumericModal(habit)}
                      className="text-xs font-bold text-slate-600 hover:text-indigo-600 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 hover:bg-white transition"
                    >
                      {todayStatus.currentValue > 0
                        ? `${todayStatus.currentValue} / ${todayStatus.targetValue} ${habit.unit}`
                        : '+ Registrar'}
                    </button>
                  )}

                  {/* Toggle Rápido Hoje */}
                  {!habit.isArchived && (
                    <button
                      onClick={() => handleToggleHabitForDate(habit, todayStr)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        todayStatus.completed
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs'
                          : isScheduledToday
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={todayStatus.completed ? 'Desmarcar' : 'Concluir hoje'}
                    >
                      {todayStatus.completed ? (
                        <>
                          <Check className="w-4 h-4 stroke-[3]" /> Concluído
                        </>
                      ) : (
                        <>
                          <Circle className="w-4 h-4" /> Marcar Hoje
                        </>
                      )}
                    </button>
                  )}

                  {/* Ações Secundárias */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(habit)}
                      className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition"
                      title="Editar hábito"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleArchiveToggle(habit)}
                      className="p-2 text-slate-400 hover:text-amber-600 rounded-xl hover:bg-amber-50 transition"
                      title={habit.isArchived ? 'Desarquivar hábito' : 'Arquivar hábito'}
                    >
                      {habit.isArchived ? (
                        <ArchiveRestore className="w-3.5 h-3.5" />
                      ) : (
                        <Archive className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      onClick={() => handleDeleteHabit(habit)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition"
                      title="Excluir hábito"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto">
              <Sparkles className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Nenhum hábito encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {searchQuery || selectedCategory !== 'todos'
                  ? 'Tente ajustar os filtros ou a busca acima.'
                  : 'Comece criando seu primeiro hábito ou utilize nossos modelos recomendados.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                onClick={handleOpenCreateModal}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-extrabold text-xs shadow-xs hover:bg-indigo-700 transition"
              >
                + Criar Hábito Personalizado
              </button>
              {habits.length === 0 && (
                <button
                  onClick={handleSeedPresets}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition"
                >
                  ⚡ Carregar Modelos Prontos
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE HÁBITO */}
      {showHabitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <h3 className="font-black text-slate-900 text-base">
                  {editingHabit ? 'Editar Hábito' : 'Novo Hábito'}
                </h3>
              </div>
              <button
                onClick={() => setShowHabitModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modelos Sugeridos para Preenchimento Rápido */}
            {!editingHabit && (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Ou escolha um modelo pronto:
                </label>
                <select
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    if (!isNaN(idx)) handleApplyPreset(idx);
                  }}
                  defaultValue=""
                  className="w-full text-xs p-2 bg-white rounded-xl border border-slate-200 focus:outline-hidden"
                >
                  <option value="" disabled>
                    Selecione um hábito para autopreencher...
                  </option>
                  {PRESET_HABIT_TEMPLATES.map((p, idx) => (
                    <option key={idx} value={idx}>
                      {p.name} ({p.frequencyType === 'daily' ? 'Diário' : 'Semanal'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <form onSubmit={handleSaveHabit} className="space-y-4">
              {/* Nome */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nome do Hábito *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ler 15 minutos, Beber água, Praticar violão..."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Descrição / Motivação (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Por que este hábito é importante para você..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Categoria & Cor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Categoria</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as HabitCategory)}
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-hidden"
                  >
                    <option value="estudos">Estudos</option>
                    <option value="saude">Saúde</option>
                    <option value="produtividade">Produtividade</option>
                    <option value="pessoal">Pessoal</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Cor</label>
                  <div className="flex items-center gap-1.5 pt-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setFormColor(c)}
                        className={`w-6 h-6 rounded-lg transition ${
                          formColor === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Ícone */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Ícone</label>
                <div className="grid grid-cols-5 gap-2">
                  {AVAILABLE_ICONS.map((item) => {
                    const IconComp = item.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setFormIcon(item.id)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
                          formIcon === item.id
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-2xs'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                        <span className="text-[9px] font-bold">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tipo de Frequência */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block">Frequência</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormFrequencyType('daily')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                      formFrequencyType === 'daily'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Todos os dias
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormFrequencyType('specific_days')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                      formFrequencyType === 'specific_days'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Dias específicos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormFrequencyType('times_per_week')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                      formFrequencyType === 'times_per_week'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Vezes por semana
                  </button>
                </div>

                {/* Sub-opções de frequência */}
                {formFrequencyType === 'specific_days' && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 mt-2">
                    <span className="text-[11px] font-bold text-slate-600 block">Selecione os dias:</span>
                    <div className="flex items-center justify-between gap-1">
                      {DAYS_OF_WEEK.map((d) => {
                        const isSelected = formFrequencyDays.includes(d.id);
                        return (
                          <button
                            type="button"
                            key={d.id}
                            onClick={() => {
                              if (isSelected) {
                                if (formFrequencyDays.length > 1) {
                                  setFormFrequencyDays(formFrequencyDays.filter((x) => x !== d.id));
                                }
                              } else {
                                setFormFrequencyDays([...formFrequencyDays, d.id]);
                              }
                            }}
                            className={`w-9 h-9 rounded-xl text-xs font-extrabold transition ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {formFrequencyType === 'times_per_week' && (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 mt-2">
                    <span className="text-xs font-bold text-slate-700">Quantidade de vezes na semana:</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={7}
                        value={formFrequencyTimes}
                        onChange={(e) => setFormFrequencyTimes(Number(e.target.value))}
                        className="w-16 p-2 text-center text-xs font-bold bg-white rounded-xl border border-slate-200"
                      />
                      <span className="text-xs text-slate-500 font-bold">vezes</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Meta (Binária vs Numérica) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block">Tipo de Meta</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormTargetType('boolean')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                      formTargetType === 'boolean'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Sim / Não (Conclusão simples)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTargetType('numeric')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-bold transition ${
                      formTargetType === 'numeric'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Numérica (Tempo ou quantidade)
                  </button>
                </div>

                {formTargetType === 'numeric' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 mt-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Valor Alvo</label>
                      <input
                        type="number"
                        min={1}
                        value={formTargetValue}
                        onChange={(e) => setFormTargetValue(Number(e.target.value))}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">Unidade</label>
                      <input
                        type="text"
                        placeholder="Ex: min, ml, páginas, copos"
                        value={formUnit}
                        onChange={(e) => setFormUnit(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Lembrete & Data de Início */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Lembrete Diário (Opcional)</label>
                  <input
                    type="time"
                    value={formReminder}
                    onChange={(e) => setFormReminder(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHabitModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition active:scale-95"
                >
                  {editingHabit ? 'Salvar Alterações' : 'Criar Hábito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE REGISTRO NUMÉRICO */}
      {showNumericModal && selectedNumericHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: `${selectedNumericHabit.color}15`,
                    color: selectedNumericHabit.color,
                  }}
                >
                  {renderHabitIcon(selectedNumericHabit.icon, 'w-4 h-4')}
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">{selectedNumericHabit.name}</h3>
                  <span className="text-[10px] text-slate-400">Registrar progresso de hoje</span>
                </div>
              </div>
              <button
                onClick={() => setShowNumericModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNumericLog} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Quantidade Realizada ({selectedNumericHabit.unit || 'unidades'})
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    required
                    value={numericValueInput}
                    onChange={(e) => setNumericValueInput(e.target.value)}
                    className="flex-1 text-base font-black p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                  />
                  <span className="text-xs font-bold text-slate-500">
                    / {selectedNumericHabit.targetValue} {selectedNumericHabit.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Anotação Rápida (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Capítulos 3 e 4 lidos..."
                  value={numericNoteInput}
                  onChange={(e) => setNumericNoteInput(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNumericModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-xs transition active:scale-95"
                >
                  Salvar Progresso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
