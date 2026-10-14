import { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  Dumbbell,
  Play,
  Plus,
  Trash2,
  Edit2,
  Copy,
  CheckCircle2,
  Flame,
  Trophy,
  Clock,
  Calendar,
  Activity,
  Ruler,
  BookOpen,
  History,
  TrendingUp,
  Search,
  Star,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

import { db } from '../lib/db';
import type {
  GymExercise,
  GymRoutine,
  GymWorkout,
  GymMeasurement,
  GymPreferences,
  ActiveWorkoutState,
  MuscleGroup,
  GymRoutineExercise,
} from '../types';
import {
  calculateGymWeeklyStats,
  calculateWorkoutVolume,
  calculateExercisePRs,
  getRemainingRestSeconds,
  saveActiveWorkoutState,
  loadActiveWorkoutState,
  clearActiveWorkoutState,
} from '../lib/gymEngine';
import { sendLocalNotification } from '../lib/notificationEngine';
import { formatDateToLocalYYYYMMDD } from '../lib/srsEngine';

interface GymSectionProps {
  exercises: GymExercise[];
  routines: GymRoutine[];
  workouts: GymWorkout[];
  measurements: GymMeasurement[];
  preferences?: GymPreferences;
}

type GymSubTab =
  | 'dashboard'
  | 'routines'
  | 'workout'
  | 'exercises'
  | 'history'
  | 'evolution'
  | 'measurements'
  | 'planning';

const MUSCLE_GROUPS: { id: MuscleGroup; label: string; color: string }[] = [
  { id: 'peito', label: 'Peito', color: '#6366f1' },
  { id: 'costas', label: 'Costas', color: '#06b6d4' },
  { id: 'ombros', label: 'Ombros', color: '#f59e0b' },
  { id: 'biceps', label: 'Bíceps', color: '#10b981' },
  { id: 'triceps', label: 'Tríceps', color: '#ec4899' },
  { id: 'quadriceps', label: 'Quadríceps', color: '#8b5cf6' },
  { id: 'posterior', label: 'Posterior', color: '#3b82f6' },
  { id: 'gluteos', label: 'Glúteos', color: '#f43f5e' },
  { id: 'panturrilha', label: 'Panturrilha', color: '#14b8a6' },
  { id: 'abdomen', label: 'Abdômen & Core', color: '#eab308' },
  { id: 'cardio', label: 'Cardio', color: '#ef4444' },
  { id: 'outro', label: 'Outro', color: '#64748b' },
];

export function GymSection({
  exercises,
  routines,
  workouts,
  measurements,
  preferences,
}: GymSectionProps) {
  const [activeSubTab, setActiveSubTab] = useState<GymSubTab>('dashboard');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState<string>('todos');
  const [searchExerciseQuery, setSearchExerciseQuery] = useState('');
  const [now, setNow] = useState(Date.now());

  // Estado do Treino em Andamento (com persistência tolerante a reload)
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkoutState | null>(() => {
    return loadActiveWorkoutState();
  });

  // Modal / Edição de Ficha
  const [editingRoutine, setEditingRoutine] = useState<GymRoutine | null>(null);
  const [isCreatingRoutine, setIsCreatingRoutine] = useState(false);

  // Modal / Cadastro de Exercício Customizado
  const [showNewExerciseModal, setShowNewExerciseModal] = useState(false);

  // Modal / Nova Medição Corporal
  const [showNewMeasurementModal, setShowNewMeasurementModal] = useState(false);

  // Detalhe de Treino no Histórico
  const [viewingWorkout, setViewingWorkout] = useState<GymWorkout | null>(null);

  // Exercício selecionado para visualização de PR / Evolução
  const [selectedPRExerciseId, setSelectedPRExerciseId] = useState<string>(
    exercises[0]?.id || 'ex-supino-reto'
  );

  // Loop de relógio para cronômetros
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Salvar estado ativo automaticamente a cada alteração
  useEffect(() => {
    if (activeWorkout) {
      saveActiveWorkoutState(activeWorkout);
    } else {
      clearActiveWorkoutState();
    }
  }, [activeWorkout]);

  // Estatísticas Semanais
  const weeklyGoal = preferences?.weeklyGoalDays || 4;
  const weeklyStats = useMemo(() => {
    return calculateGymWeeklyStats(workouts, weeklyGoal);
  }, [workouts, weeklyGoal]);

  // Alerta de término de descanso
  useEffect(() => {
    if (
      activeWorkout?.currentRestTimer &&
      !activeWorkout.isPaused
    ) {
      const remaining = getRemainingRestSeconds(
        activeWorkout.currentRestTimer.startedAt,
        activeWorkout.currentRestTimer.durationSeconds,
        now
      );
      if (remaining === 0) {
        sendLocalNotification('Descanso Finalizado! ⚡ FocusUp Academia', {
          body: `Hora da próxima série de ${activeWorkout.currentRestTimer.targetExerciseName || 'exercício'}!`,
          tag: 'gym-rest-done',
        });
      }
    }
  }, [now, activeWorkout]);

  // Disparar confetes ao bater meta ou finalizar treino
  const triggerVictory = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4f46e5', '#10b981', '#f59e0b', '#06b6d4'],
      });
    } catch {
      // Ignorar caso bloqueado
    }
  };

  // Iniciar uma Ficha de Treino
  const startWorkoutFromRoutine = (routine: GymRoutine) => {
    if (activeWorkout) {
      if (!confirm('Já existe um treino em andamento. Deseja descartá-lo e iniciar este?')) {
        return;
      }
    }

    const initialExercises = routine.exercises.map((re) => {
      // Buscar histórico anterior do exercício para sugerir carga e repetições
      const pr = calculateExercisePRs(workouts, re.exerciseId);
      const lastHistory = pr.history[pr.history.length - 1];
      const suggestedWeight = re.targetWeightKg || lastHistory?.weightKg || 0;
      const targetRepsNum = parseInt(re.targetReps) || 10;

      const sets = Array.from({ length: re.targetSets }, (_, idx) => ({
        setNumber: idx + 1,
        weightKg: suggestedWeight,
        reps: targetRepsNum,
        completed: false,
        restSeconds: re.defaultRestSeconds || routine.defaultRestSeconds || 90,
      }));

      return {
        exerciseId: re.exerciseId,
        name: re.name,
        muscleGroup: re.muscleGroup,
        sets,
        notes: re.notes,
      };
    });

    const newWorkoutState: ActiveWorkoutState = {
      id: `workout-${Date.now()}`,
      routineId: routine.id,
      routineName: routine.name,
      startedAt: Date.now(),
      elapsedSeconds: 0,
      isPaused: false,
      exercises: initialExercises,
      currentRestTimer: null,
    };

    setActiveWorkout(newWorkoutState);
    setActiveSubTab('workout');
  };

  // Concluir Treino em Andamento
  const finishActiveWorkout = async () => {
    if (!activeWorkout) return;

    const { totalVolumeKg, totalSetsCompleted } = calculateWorkoutVolume(activeWorkout.exercises);
    const durationMinutes = Math.max(1, Math.round((Date.now() - activeWorkout.startedAt) / (1000 * 60)));

    const completedWorkout: GymWorkout = {
      id: activeWorkout.id,
      routineId: activeWorkout.routineId,
      routineName: activeWorkout.routineName,
      startedAt: activeWorkout.startedAt,
      endedAt: Date.now(),
      durationMinutes,
      exercises: activeWorkout.exercises,
      totalVolumeKg,
      totalSetsCompleted,
      notes: activeWorkout.notes,
      status: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.gymWorkouts.add(completedWorkout);
    setActiveWorkout(null);
    clearActiveWorkoutState();
    triggerVictory();
    sendLocalNotification('Treino Concluído! 🏆 FocusUp Academia', {
      body: `${activeWorkout.routineName} finalizado! ${totalSetsCompleted} séries e ${totalVolumeKg.toLocaleString()} kg levantados.`,
      tag: 'gym-workout-done',
    });
    setActiveSubTab('dashboard');
  };

  // Descartar Treino em Andamento com confirmação
  const discardActiveWorkout = () => {
    if (confirm('Deseja realmente cancelar e descartar este treino? O progresso não salvo será perdido.')) {
      setActiveWorkout(null);
      clearActiveWorkoutState();
      setActiveSubTab('dashboard');
    }
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DA SEÇÃO ACADEMIA */}
      <header className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-rose-500/15">
            <Dumbbell className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900">Quartel da Academia</h2>
              <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                Hipertrofia & Força
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Fichas inteligentes, registro série a série, cronômetro de descanso e evolução real.
            </p>
          </div>
        </div>

        {/* Botão de Ação Rápida */}
        <div className="flex items-center gap-2">
          {activeWorkout ? (
            <button
              onClick={() => setActiveSubTab('workout')}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white font-extrabold px-5 py-3 rounded-2xl shadow-sm transition active:scale-95 text-xs animate-pulse"
            >
              <Activity className="w-4 h-4" />
              Retomar Treino em Andamento
            </button>
          ) : routines.length > 0 ? (
            <button
              onClick={() => startWorkoutFromRoutine(routines[0])}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-2xl shadow-sm transition active:scale-95 text-xs"
            >
              <Play className="w-4 h-4 fill-current" />
              Iniciar Treino ({routines[0].name.split('—')[0].trim()})
            </button>
          ) : (
            <button
              onClick={() => setIsCreatingRoutine(true)}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-2xl shadow-sm transition active:scale-95 text-xs"
            >
              <Plus className="w-4 h-4" />
              Criar Primeira Ficha
            </button>
          )}
        </div>
      </header>

      {/* BANNER FLUTUANTE DE TREINO ATIVO (SE HOUVER TREINO ROLANDO E O USUÁRIO NÃO ESTIVER NA ABA WORKOUT) */}
      {activeWorkout && activeSubTab !== 'workout' && (
        <div className="bg-gradient-to-r from-rose-600 to-amber-600 text-white p-4 rounded-3xl shadow-md flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-white animate-ping" />
            <div>
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-amber-200">
                Treino em Andamento: {activeWorkout.routineName}
              </div>
              <div className="text-xs font-bold mt-0.5">
                {calculateWorkoutVolume(activeWorkout.exercises).totalSetsCompleted} séries concluídas
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('workout')}
              className="bg-white text-rose-700 font-black px-4 py-2 rounded-xl text-xs shadow-xs hover:bg-amber-50 transition active:scale-95"
            >
              Abrir Treino
            </button>
            <button
              onClick={discardActiveWorkout}
              className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition text-xs"
              title="Cancelar treino"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* BARRA DE NAVEGAÇÃO INTERNA DA ACADEMIA */}
      <nav className="flex items-center gap-1.5 p-1.5 bg-slate-200/80 rounded-2xl overflow-x-auto scrollbar-thin">
        {[
          { id: 'dashboard' as GymSubTab, label: 'Dashboard', icon: Activity },
          { id: 'routines' as GymSubTab, label: 'Fichas de Treino', icon: BookOpen },
          { id: 'workout' as GymSubTab, label: 'Modo Treino', icon: Play, badge: activeWorkout ? 'Ativo' : undefined },
          { id: 'exercises' as GymSubTab, label: 'Exercícios', icon: Dumbbell },
          { id: 'history' as GymSubTab, label: 'Histórico', icon: History },
          { id: 'evolution' as GymSubTab, label: 'Evolução & PRs', icon: TrendingUp },
          { id: 'measurements' as GymSubTab, label: 'Medidas', icon: Ruler },
          { id: 'planning' as GymSubTab, label: 'Planejamento', icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-300/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.badge && (
                <span className="text-[9px] font-black bg-rose-500 text-white px-1.5 py-0.2 rounded-full animate-pulse">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ========================================================================= */}
      {/* SUB-ABA 1: DASHBOARD DA ACADEMIA                                         */}
      {/* ========================================================================= */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Grid de Métricas da Semana */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Meta Semanal de Treinos */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meta Semanal</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900">{weeklyStats.workoutsThisWeekCount}</span>
                <span className="text-xs text-slate-400 font-bold">/ {weeklyGoal} treinos</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${weeklyStats.progressPercent}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-2 block font-medium">
                {weeklyStats.workoutsThisWeekCount >= weeklyGoal ? 'Meta da semana batida! 🎯' : `Faltam ${weeklyGoal - weeklyStats.workoutsThisWeekCount} treinos`}
              </span>
            </div>

            {/* Sequência de Semanas */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sequência Semanal</span>
              <div className="mt-2 flex items-center gap-2">
                <Flame className="w-7 h-7 text-amber-500" />
                <span className="text-3xl font-black text-slate-900">{weeklyStats.weeklyStreak} sem</span>
              </div>
              <p className="text-[10px] text-amber-600 mt-2 font-bold">
                {weeklyStats.weeklyStreak > 0 ? 'Consistência blindada 🔥' : 'Inicie sua sequência hoje'}
              </p>
            </div>

            {/* Tempo Treinado na Semana */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tempo na Semana</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-slate-900">{weeklyStats.totalMinutesThisWeek}m</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 font-medium">
                {Math.round(weeklyStats.totalMinutesThisWeek / 60)}h dedicadas aos treinos
              </p>
            </div>

            {/* Último Treino Realizado */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Último Treino</span>
              {weeklyStats.lastWorkout ? (
                <>
                  <div className="text-sm font-black text-slate-900 mt-2 truncate">
                    {weeklyStats.lastWorkout.routineName}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-1">
                    {formatDateToLocalYYYYMMDD(new Date(weeklyStats.lastWorkout.startedAt))} • {weeklyStats.lastWorkout.durationMinutes}m
                  </div>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1">
                    {weeklyStats.lastWorkout.totalVolumeKg.toLocaleString()} kg levantados
                  </p>
                </>
              ) : (
                <div className="text-xs text-slate-400 mt-2">Nenhum treino registrado ainda.</div>
              )}
            </div>
          </div>

          {/* Atalhos Rápidos para as Fichas */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Fichas de Treino Cadastradas</h3>
                <p className="text-xs text-slate-500">Escolha uma ficha para iniciar sua sessão ou configure novos exercícios.</p>
              </div>
              <button
                onClick={() => setIsCreatingRoutine(true)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition"
              >
                + Nova Ficha
              </button>
            </div>

            {routines.filter((r) => !r.isArchived).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {routines
                  .filter((r) => !r.isArchived)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 hover:border-indigo-300 transition space-y-3 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                            {r.splitCategory || 'Ficha'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">
                            {r.exercises.length} exercícios
                          </span>
                        </div>
                        <h4 className="font-black text-slate-900 text-sm mt-2">{r.name}</h4>
                        {r.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{r.description}</p>}
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                        <button
                          onClick={() => startWorkoutFromRoutine(r)}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 rounded-xl transition shadow-xs active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Iniciar Treino
                        </button>
                        <button
                          onClick={() => {
                            setEditingRoutine(r);
                            setActiveSubTab('routines');
                          }}
                          className="p-2 text-slate-400 hover:text-slate-700 bg-white rounded-xl border border-slate-200 transition"
                          title="Editar ficha"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                <Dumbbell className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-sm font-bold text-slate-700">Nenhuma ficha criada ainda</div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Crie sua primeira ficha de treino personalizada ou explore a biblioteca de exercícios.
                </p>
                <button
                  onClick={() => setIsCreatingRoutine(true)}
                  className="bg-indigo-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs hover:bg-indigo-700 transition"
                >
                  Criar Ficha de Treino
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 2: FICHAS DE TREINO (GERENCIADOR)                                 */}
      {/* ========================================================================= */}
      {activeSubTab === 'routines' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Gerenciador de Fichas</h3>
              <p className="text-xs text-slate-500">Crie, duplique, edite ou organize a ordem dos exercícios.</p>
            </div>
            <button
              onClick={() => {
                setEditingRoutine({
                  id: `routine-${Date.now()}`,
                  name: 'Novo Treino',
                  splitCategory: 'Personalizado',
                  description: '',
                  muscleGroups: [],
                  exercises: [],
                  defaultRestSeconds: 90,
                  isArchived: false,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                });
                setIsCreatingRoutine(true);
              }}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4" /> Nova Ficha
            </button>
          </div>

          {/* Lista de Fichas Existentes */}
          <div className="space-y-4">
            {routines.map((routine) => (
              <div
                key={routine.id}
                className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-100">
                        {routine.splitCategory || 'Geral'}
                      </span>
                      <h4 className="font-black text-slate-900 text-base">{routine.name}</h4>
                    </div>
                    {routine.description && (
                      <p className="text-xs text-slate-500 mt-1">{routine.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startWorkoutFromRoutine(routine)}
                      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs transition active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Iniciar
                    </button>
                    <button
                      onClick={() => {
                        setEditingRoutine(routine);
                        setIsCreatingRoutine(true);
                      }}
                      className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                      title="Editar ficha"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        // Duplicar ficha
                        const duplicated: GymRoutine = {
                          ...routine,
                          id: `routine-${Date.now()}`,
                          name: `${routine.name} (Cópia)`,
                          createdAt: Date.now(),
                          updatedAt: Date.now(),
                        };
                        await db.gymRoutines.add(duplicated);
                        triggerVictory();
                      }}
                      className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
                      title="Duplicar ficha"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Deseja remover a ficha "${routine.name}"?`)) {
                          await db.gymRoutines.delete(routine.id);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 rounded-xl border border-slate-200 transition"
                      title="Excluir ficha"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Lista de Exercícios da Ficha */}
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Exercícios ({routine.exercises.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {routine.exercises.map((ex, idx) => (
                      <div
                        key={ex.id || idx}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs flex items-center justify-between"
                      >
                        <div className="truncate pr-2">
                          <span className="text-slate-400 font-mono text-[10px] mr-1.5">{idx + 1}.</span>
                          <span className="font-bold text-slate-800">{ex.name}</span>
                          <div className="text-[10px] text-slate-400">
                            {ex.targetSets} séries • {ex.targetReps} reps • {ex.defaultRestSeconds}s rest
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Modal / Formulário de Criação ou Edição de Ficha */}
          {isCreatingRoutine && editingRoutine && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white max-w-2xl w-full rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-slate-900 text-base">
                    {routines.some((r) => r.id === editingRoutine.id) ? 'Editar Ficha de Treino' : 'Nova Ficha de Treino'}
                  </h3>
                  <button
                    onClick={() => {
                      setIsCreatingRoutine(false);
                      setEditingRoutine(null);
                    }}
                    className="text-slate-400 hover:text-slate-700 font-black text-lg p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nome da Ficha</label>
                    <input
                      type="text"
                      value={editingRoutine.name}
                      onChange={(e) => setEditingRoutine({ ...editingRoutine, name: e.target.value })}
                      placeholder="Ex: Treino A - Peito e Tríceps"
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-900 focus:bg-white focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Divisão / Categoria</label>
                    <input
                      type="text"
                      value={editingRoutine.splitCategory || ''}
                      onChange={(e) => setEditingRoutine({ ...editingRoutine, splitCategory: e.target.value })}
                      placeholder="Ex: ABC, ABCD, Push, Pull"
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-hidden"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">Descrição / Foco</label>
                    <input
                      type="text"
                      value={editingRoutine.description || ''}
                      onChange={(e) => setEditingRoutine({ ...editingRoutine, description: e.target.value })}
                      placeholder="Ex: Foco em empurrar, peitoral e deltoides."
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Lista de Exercícios na Ficha com Reordenação */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800">Exercícios da Ficha</label>
                    <span className="text-[10px] text-slate-400">Arraste ou use as setas para ordenar</span>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {editingRoutine.exercises.map((ex, idx) => (
                      <div
                        key={ex.id || idx}
                        className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-0.5">
                            <button
                              disabled={idx === 0}
                              onClick={() => {
                                const newExs = [...editingRoutine.exercises];
                                const temp = newExs[idx - 1];
                                newExs[idx - 1] = newExs[idx];
                                newExs[idx] = temp;
                                setEditingRoutine({ ...editingRoutine, exercises: newExs });
                              }}
                              className="text-slate-400 hover:text-slate-800 disabled:opacity-20"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={idx === editingRoutine.exercises.length - 1}
                              onClick={() => {
                                const newExs = [...editingRoutine.exercises];
                                const temp = newExs[idx + 1];
                                newExs[idx + 1] = newExs[idx];
                                newExs[idx] = temp;
                                setEditingRoutine({ ...editingRoutine, exercises: newExs });
                              }}
                              className="text-slate-400 hover:text-slate-800 disabled:opacity-20"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{ex.name}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span>Séries:</span>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={ex.targetSets}
                                onChange={(e) => {
                                  const newExs = [...editingRoutine.exercises];
                                  newExs[idx] = { ...ex, targetSets: Number(e.target.value) || 3 };
                                  setEditingRoutine({ ...editingRoutine, exercises: newExs });
                                }}
                                className="w-12 p-0.5 bg-white border border-slate-200 rounded text-center font-bold"
                              />
                              <span>Reps:</span>
                              <input
                                type="text"
                                value={ex.targetReps}
                                onChange={(e) => {
                                  const newExs = [...editingRoutine.exercises];
                                  newExs[idx] = { ...ex, targetReps: e.target.value };
                                  setEditingRoutine({ ...editingRoutine, exercises: newExs });
                                }}
                                className="w-16 p-0.5 bg-white border border-slate-200 rounded text-center font-bold"
                              />
                              <span>Descanso:</span>
                              <input
                                type="number"
                                value={ex.defaultRestSeconds}
                                onChange={(e) => {
                                  const newExs = [...editingRoutine.exercises];
                                  newExs[idx] = { ...ex, defaultRestSeconds: Number(e.target.value) || 60 };
                                  setEditingRoutine({ ...editingRoutine, exercises: newExs });
                                }}
                                className="w-14 p-0.5 bg-white border border-slate-200 rounded text-center font-bold"
                              />
                              <span>s</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            const newExs = editingRoutine.exercises.filter((_, i) => i !== idx);
                            setEditingRoutine({ ...editingRoutine, exercises: newExs });
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1.5"
                          title="Remover da ficha"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Adicionar Exercício da Biblioteca à Ficha */}
                  <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2">
                    <span className="text-[11px] font-bold text-indigo-900 block">
                      + Adicionar Exercício da Biblioteca:
                    </span>
                    <select
                      onChange={(e) => {
                        const chosen = exercises.find((ex) => ex.id === e.target.value);
                        if (!chosen) return;
                        const newRoutineEx: GymRoutineExercise = {
                          id: `re-${Date.now()}`,
                          exerciseId: chosen.id,
                          name: chosen.name,
                          muscleGroup: chosen.muscleGroup,
                          targetSets: 3,
                          targetReps: '10-12',
                          defaultRestSeconds: 90,
                          targetWeightKg: 0,
                        };
                        setEditingRoutine({
                          ...editingRoutine,
                          exercises: [...editingRoutine.exercises, newRoutineEx],
                        });
                        e.target.value = '';
                      }}
                      className="w-full text-xs p-2.5 bg-white border border-indigo-200 rounded-xl font-bold text-slate-800 focus:outline-hidden"
                    >
                      <option value="">Selecione um exercício para incluir...</option>
                      {exercises.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name} ({ex.muscleGroup} • {ex.equipment})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setIsCreatingRoutine(false);
                      setEditingRoutine(null);
                    }}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      if (!editingRoutine.name.trim()) {
                        alert('Informe o nome da ficha.');
                        return;
                      }
                      await db.gymRoutines.put({ ...editingRoutine, updatedAt: Date.now() });
                      setIsCreatingRoutine(false);
                      setEditingRoutine(null);
                      triggerVictory();
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                  >
                    Salvar Ficha
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 3: MODO TREINO EM ANDAMENTO (TELA DEDICADA)                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'workout' && (
        <div className="space-y-6">
          {activeWorkout ? (
            <div className="space-y-6">
              {/* Painel do Topo do Treino */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-mono text-amber-300 font-black">
                      Sessão de Foco Muscular Ativa
                    </span>
                    <h3 className="text-xl font-black mt-0.5">{activeWorkout.routineName}</h3>
                  </div>

                  {/* Cronômetro Geral do Treino */}
                  <div className="flex items-center gap-3">
                    <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/10 text-center">
                      <span className="text-[9px] uppercase tracking-wider text-slate-300 block">Tempo Decorrido</span>
                      <span className="text-2xl font-mono font-black text-white">
                        {Math.floor((now - activeWorkout.startedAt) / (1000 * 60))}:
                        {String(Math.floor(((now - activeWorkout.startedAt) / 1000) % 60)).padStart(2, '0')}
                      </span>
                    </div>

                    <button
                      onClick={finishActiveWorkout}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-5 py-3 rounded-2xl shadow-sm transition active:scale-95 text-xs flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Finalizar Treino
                    </button>
                    <button
                      onClick={discardActiveWorkout}
                      className="text-slate-400 hover:text-rose-400 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition"
                      title="Descartar treino"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Cronômetro de Descanso Embutido */}
                {activeWorkout.currentRestTimer && (() => {
                  const remaining = getRemainingRestSeconds(
                    activeWorkout.currentRestTimer.startedAt,
                    activeWorkout.currentRestTimer.durationSeconds,
                    now
                  );
                  const isDone = remaining === 0;

                  return (
                    <div
                      className={`p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-3 ${
                        isDone
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-amber-500/20 border-amber-400/80 text-amber-100 animate-pulse'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Clock className={`w-6 h-6 ${isDone ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider">
                            {isDone ? 'Descanso Concluído!' : `Descanso (${activeWorkout.currentRestTimer.targetExerciseName})`}
                          </div>
                          <div className="text-2xl font-mono font-black">
                            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            if (!activeWorkout.currentRestTimer) return;
                            setActiveWorkout({
                              ...activeWorkout,
                              currentRestTimer: {
                                ...activeWorkout.currentRestTimer,
                                durationSeconds: activeWorkout.currentRestTimer.durationSeconds + 15,
                              },
                            });
                          }}
                          className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold"
                        >
                          +15s
                        </button>
                        <button
                          onClick={() => {
                            setActiveWorkout({ ...activeWorkout, currentRestTimer: null });
                          }}
                          className="px-3 py-1.5 bg-white text-slate-900 rounded-xl text-xs font-black shadow-xs"
                        >
                          Pular Descanso
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Barra de Progresso de Séries */}
                {(() => {
                  const { totalSetsCompleted } = calculateWorkoutVolume(activeWorkout.exercises);
                  const totalSetsPlanned = activeWorkout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
                  const percent = totalSetsPlanned > 0 ? Math.round((totalSetsCompleted / totalSetsPlanned) * 100) : 0;

                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-300 font-bold">
                        <span>Progresso do Treino</span>
                        <span>{totalSetsCompleted} de {totalSetsPlanned} séries ({percent}%)</span>
                      </div>
                      <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Lista de Exercícios e Séries para Registro ao Vivo */}
              <div className="space-y-4">
                {activeWorkout.exercises.map((ex, exIdx) => (
                  <div
                    key={ex.exerciseId || exIdx}
                    className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 font-black text-xs flex items-center justify-center">
                          {exIdx + 1}
                        </span>
                        <h4 className="font-extrabold text-slate-900 text-sm">{ex.name}</h4>
                        <span className="text-[10px] font-mono text-slate-400 capitalize">({ex.muscleGroup})</span>
                      </div>

                      <button
                        onClick={() => {
                          // Adicionar série extra neste exercício
                          const newExercises = [...activeWorkout.exercises];
                          const lastSet = ex.sets[ex.sets.length - 1];
                          newExercises[exIdx].sets.push({
                            setNumber: ex.sets.length + 1,
                            weightKg: lastSet?.weightKg || 0,
                            reps: lastSet?.reps || 10,
                            completed: false,
                            restSeconds: lastSet?.restSeconds || 90,
                          });
                          setActiveWorkout({ ...activeWorkout, exercises: newExercises });
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition"
                      >
                        + Série Extra
                      </button>
                    </div>

                    {/* Tabela de Séries */}
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
                        <div className="col-span-2">Série</div>
                        <div className="col-span-4">Carga (kg)</div>
                        <div className="col-span-3">Reps</div>
                        <div className="col-span-3">Status</div>
                      </div>

                      {ex.sets.map((set, setIdx) => (
                        <div
                          key={set.setNumber || setIdx}
                          className={`grid grid-cols-12 gap-2 items-center p-2 rounded-2xl transition border ${
                            set.completed
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                              : 'bg-slate-50 border-slate-100 text-slate-800'
                          }`}
                        >
                          <div className="col-span-2 font-mono font-black text-center text-xs">
                            #{set.setNumber}
                          </div>
                          <div className="col-span-4">
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              value={set.weightKg}
                              onChange={(e) => {
                                const newExercises = [...activeWorkout.exercises];
                                newExercises[exIdx].sets[setIdx].weightKg = Number(e.target.value) || 0;
                                setActiveWorkout({ ...activeWorkout, exercises: newExercises });
                              }}
                              className="w-full text-center p-1.5 bg-white rounded-xl border border-slate-200 font-mono font-bold text-xs focus:outline-hidden"
                            />
                          </div>
                          <div className="col-span-3">
                            <input
                              type="number"
                              min={1}
                              value={set.reps}
                              onChange={(e) => {
                                const newExercises = [...activeWorkout.exercises];
                                newExercises[exIdx].sets[setIdx].reps = Number(e.target.value) || 0;
                                setActiveWorkout({ ...activeWorkout, exercises: newExercises });
                              }}
                              className="w-full text-center p-1.5 bg-white rounded-xl border border-slate-200 font-mono font-bold text-xs focus:outline-hidden"
                            />
                          </div>
                          <div className="col-span-3 flex justify-center">
                            <button
                              onClick={() => {
                                const newExercises = [...activeWorkout.exercises];
                                const isNowCompleted = !set.completed;
                                newExercises[exIdx].sets[setIdx].completed = isNowCompleted;

                                // Se concluiu série, iniciar cronômetro de descanso automaticamente
                                let restTimer = activeWorkout.currentRestTimer;
                                if (isNowCompleted) {
                                  restTimer = {
                                    startedAt: Date.now(),
                                    durationSeconds: set.restSeconds || 90,
                                    targetExerciseName: ex.name,
                                  };
                                }

                                setActiveWorkout({
                                  ...activeWorkout,
                                  exercises: newExercises,
                                  currentRestTimer: restTimer,
                                });
                              }}
                              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs transition shadow-2xs ${
                                set.completed
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white border border-slate-300 text-slate-400 hover:border-emerald-500'
                              }`}
                            >
                              {set.completed ? <CheckCircle2 className="w-5 h-5 stroke-[2.5]" /> : 'OK'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-4">
              <Dumbbell className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="font-extrabold text-slate-900 text-base">Nenhum treino em andamento</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Selecione uma ficha de treino abaixo para abrir a interface dedicada e registrar suas cargas série a série.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {routines.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => startWorkoutFromRoutine(r)}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Iniciar {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 4: BIBLIOTECA DE EXERCÍCIOS                                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'exercises' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Biblioteca de Exercícios</h3>
              <p className="text-xs text-slate-500">Catálogo completo de musculação 100% offline.</p>
            </div>
            <button
              onClick={() => setShowNewExerciseModal(true)}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-xs transition active:scale-95 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" /> Cadastrar Exercício
            </button>
          </div>

          {/* Filtros de Busca e Grupos Musculares */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchExerciseQuery}
                onChange={(e) => setSearchExerciseQuery(e.target.value)}
                placeholder="Pesquisar por nome de exercício ou equipamento..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs focus:outline-hidden focus:border-indigo-500 shadow-xs"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setSelectedMuscleFilter('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  selectedMuscleFilter === 'todos'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Todos ({exercises.length})
              </button>
              {MUSCLE_GROUPS.map((mg) => {
                const count = exercises.filter((e) => e.muscleGroup === mg.id).length;
                return (
                  <button
                    key={mg.id}
                    onClick={() => setSelectedMuscleFilter(mg.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      selectedMuscleFilter === mg.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {mg.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista de Exercícios */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {exercises
              .filter((ex) => {
                if (selectedMuscleFilter !== 'todos' && ex.muscleGroup !== selectedMuscleFilter) return false;
                if (searchExerciseQuery.trim()) {
                  const q = searchExerciseQuery.toLowerCase();
                  return ex.name.toLowerCase().includes(q) || ex.equipment.toLowerCase().includes(q);
                }
                return true;
              })
              .map((ex) => (
                <div
                  key={ex.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-2 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                        {ex.equipment}
                      </span>
                      <button
                        onClick={async () => {
                          await db.gymExercises.update(ex.id, {
                            isFavorite: !ex.isFavorite,
                            updatedAt: Date.now(),
                          });
                        }}
                        className="text-slate-300 hover:text-amber-500 transition"
                      >
                        <Star className={`w-4 h-4 ${ex.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                      </button>
                    </div>
                    <h4 className="font-extrabold text-slate-900 text-xs mt-2">{ex.name}</h4>
                    {ex.instructions && (
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {ex.instructions}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="capitalize font-bold text-indigo-600">{ex.muscleGroup}</span>
                    <button
                      onClick={() => {
                        setSelectedPRExerciseId(ex.id);
                        setActiveSubTab('evolution');
                      }}
                      className="font-bold text-slate-600 hover:text-indigo-600"
                    >
                      Ver PRs →
                    </button>
                  </div>
                </div>
              ))}
          </div>

          {/* Modal / Cadastro de Exercício Customizado */}
          {showNewExerciseModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-slate-900 text-base">Cadastrar Novo Exercício</h3>
                  <button
                    onClick={() => setShowNewExerciseModal(false)}
                    className="text-slate-400 hover:text-slate-700 font-black text-lg p-1"
                  >
                    ✕
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
                    const muscleGroup = (form.elements.namedItem('muscleGroup') as HTMLSelectElement).value as MuscleGroup;
                    const equipment = (form.elements.namedItem('equipment') as HTMLInputElement).value || 'Halteres';
                    const instructions = (form.elements.namedItem('instructions') as HTMLTextAreaElement).value;

                    if (!name) return;

                    await db.gymExercises.add({
                      id: `ex-custom-${Date.now()}`,
                      name,
                      muscleGroup,
                      equipment,
                      instructions,
                      isFavorite: false,
                      isCustom: true,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    });

                    setShowNewExerciseModal(false);
                    triggerVictory();
                  }}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nome do Exercício</label>
                    <input
                      name="name"
                      required
                      placeholder="Ex: Elevação Pélvica Unilateral"
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 font-bold focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Grupo Muscular Principal</label>
                    <select
                      name="muscleGroup"
                      required
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-bold focus:outline-hidden"
                    >
                      {MUSCLE_GROUPS.map((mg) => (
                        <option key={mg.id} value={mg.id}>
                          {mg.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Equipamento</label>
                    <input
                      name="equipment"
                      placeholder="Ex: Halteres, Barra, Máquina, Polia, Peso Corporal"
                      defaultValue="Halteres"
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Instruções / Dicas de Execução</label>
                    <textarea
                      name="instructions"
                      rows={3}
                      placeholder="Ex: Manter escápulas travadas e coluna neutra."
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-hidden resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowNewExerciseModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                    >
                      Salvar Exercício
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 5: HISTÓRICO DE TREINOS                                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'history' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Histórico de Treinos</h3>
              <p className="text-xs text-slate-500">
                Consulte todas as suas sessões realizadas com cargas, séries e volumes reais.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-bold">{workouts.length} treinos no histórico</span>
          </div>

          {workouts.length > 0 ? (
            <div className="space-y-3">
              {workouts
                .slice()
                .sort((a, b) => b.startedAt - a.startedAt)
                .map((w) => (
                  <div
                    key={w.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-slate-900 text-sm">{w.routineName}</h4>
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {w.status === 'completed' ? 'Concluído' : 'Incompleto'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 font-mono">
                        <span>📅 {formatDateToLocalYYYYMMDD(new Date(w.startedAt))}</span>
                        <span>⏱️ {w.durationMinutes} min</span>
                        <span>🏋️ {w.totalVolumeKg.toLocaleString()} kg volume</span>
                        <span>🔢 {w.totalSetsCompleted} séries</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewingWorkout(w)}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                      >
                        Ver Detalhes
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm('Deseja excluir este registro de treino do histórico?')) {
                            await db.gymWorkouts.delete(w.id);
                          }
                        }}
                        className="p-2 text-slate-300 hover:text-rose-500 transition"
                        title="Excluir treino"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3">
              <History className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">Nenhum treino concluído ainda</h4>
              <p className="text-xs text-slate-400">
                Inicie e complete seu primeiro treino em uma das fichas para alimentar seu histórico.
              </p>
            </div>
          )}

          {/* Modal / Visualizador de Detalhes do Treino */}
          {viewingWorkout && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white max-w-xl w-full rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-black text-slate-900 text-base">{viewingWorkout.routineName}</h3>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {formatDateToLocalYYYYMMDD(new Date(viewingWorkout.startedAt))} • {viewingWorkout.durationMinutes} minutos
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingWorkout(null)}
                    className="text-slate-400 hover:text-slate-700 font-black text-lg p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
                  <div className="p-3 bg-indigo-50/70 rounded-xl">
                    <span className="text-[10px] text-indigo-700 block font-bold">Volume Total</span>
                    <span className="text-lg font-black text-indigo-900">{viewingWorkout.totalVolumeKg.toLocaleString()} kg</span>
                  </div>
                  <div className="p-3 bg-emerald-50/70 rounded-xl">
                    <span className="text-[10px] text-emerald-700 block font-bold">Séries Concluídas</span>
                    <span className="text-lg font-black text-emerald-900">{viewingWorkout.totalSetsCompleted}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {viewingWorkout.exercises.map((ex, idx) => (
                    <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                      <div className="font-extrabold text-xs text-slate-900">{ex.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ex.sets
                          .filter((s) => s.completed)
                          .map((s) => (
                            <span
                              key={s.setNumber}
                              className="text-[11px] font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-700"
                            >
                              Série #{s.setNumber}: <b>{s.weightKg} kg</b> × {s.reps} reps
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 6: EVOLUÇÃO & RECORDES PESSOAIS (PRs)                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'evolution' && (
        <div className="space-y-6">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">Evolução & Melhores Marcas (PRs)</h3>
            <p className="text-xs text-slate-500">
              Acompanhe a progressão real de carga e repetições para cada exercício da sua rotina.
            </p>
          </div>

          {/* Seletor de Exercício */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700 shrink-0">Exercício:</span>
            <select
              value={selectedPRExerciseId}
              onChange={(e) => setSelectedPRExerciseId(e.target.value)}
              className="flex-1 text-xs p-2.5 bg-slate-50 rounded-xl border border-slate-200 font-bold text-slate-900 focus:outline-hidden"
            >
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.muscleGroup})
                </option>
              ))}
            </select>
          </div>

          {/* Cards de PR do Exercício Selecionado */}
          {(() => {
            const pr = calculateExercisePRs(workouts, selectedPRExerciseId);
            const exInfo = exercises.find((e) => e.id === selectedPRExerciseId);

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl">
                    <span className="text-[10px] font-bold text-amber-800 uppercase flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-amber-600" /> Carga Recorde (PR)
                    </span>
                    <div className="text-2xl font-black text-amber-900 mt-1">
                      {pr.maxWeightKg > 0 ? `${pr.maxWeightKg} kg` : '-'}
                    </div>
                    <span className="text-[10px] text-amber-700">
                      {pr.maxRepsAtMaxWeight > 0 ? `com ${pr.maxRepsAtMaxWeight} repetições` : 'Sem registros'}
                    </span>
                  </div>

                  <div className="bg-indigo-50/70 border border-indigo-200 p-4 rounded-2xl">
                    <span className="text-[10px] font-bold text-indigo-800 uppercase flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-indigo-600" /> Volume Máx. (Série)
                    </span>
                    <div className="text-2xl font-black text-indigo-900 mt-1">
                      {pr.maxSetVolumeKg > 0 ? `${pr.maxSetVolumeKg} kg` : '-'}
                    </div>
                    <span className="text-[10px] text-indigo-700">carga × reps em 1 série</span>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-2xl">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase">Total de Séries</span>
                    <div className="text-2xl font-black text-emerald-900 mt-1">{pr.totalSetsCompleted}</div>
                    <span className="text-[10px] text-emerald-700">séries realizadas</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Sessões Treinadas</span>
                    <div className="text-2xl font-black text-slate-900 mt-1">{pr.totalTimesPerformed}</div>
                    <span className="text-[10px] text-slate-400">treinos com este exercício</span>
                  </div>
                </div>

                {/* Histórico Cronológico de Cargas */}
                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
                  <h4 className="font-extrabold text-slate-900 text-sm">
                    Histórico de Cargas: {exInfo?.name || 'Exercício'}
                  </h4>

                  {pr.history.length > 0 ? (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {pr.history.map((h, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-mono"
                        >
                          <span className="text-slate-500 font-bold">{h.dateStr}</span>
                          <span className="font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                            {h.weightKg} kg × {h.reps} reps
                          </span>
                          <span className="text-indigo-600 font-bold">{h.setVolume} kg vol</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Ainda não existem registros suficientes para este exercício. Conclua uma sessão para visualizar sua progressão.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 7: PESO E MEDIDAS CORPORAIS                                       */}
      {/* ========================================================================= */}
      {activeSubTab === 'measurements' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Peso e Medidas Corporais</h3>
              <p className="text-xs text-slate-500">
                Acompanhe medidas físicas e peso de forma opcional e privada.
              </p>
            </div>
            <button
              onClick={() => setShowNewMeasurementModal(true)}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4" /> Registrar Medição
            </button>
          </div>

          {measurements.length > 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="p-3.5">Data</th>
                      <th className="p-3.5">Peso (kg)</th>
                      <th className="p-3.5">Cintura (cm)</th>
                      <th className="p-3.5">Braço (cm)</th>
                      <th className="p-3.5">Peito (cm)</th>
                      <th className="p-3.5">Coxa (cm)</th>
                      <th className="p-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {measurements
                      .slice()
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition font-mono">
                          <td className="p-3.5 font-bold text-slate-900">{m.date}</td>
                          <td className="p-3.5 font-black text-indigo-600">
                            {m.weightKg ? `${m.weightKg.toFixed(1)} kg` : '-'}
                          </td>
                          <td className="p-3.5 text-slate-600">{m.waistCm ? `${m.waistCm} cm` : '-'}</td>
                          <td className="p-3.5 text-slate-600">{m.rightBicepsCm || m.leftBicepsCm ? `${m.rightBicepsCm || m.leftBicepsCm} cm` : '-'}</td>
                          <td className="p-3.5 text-slate-600">{m.chestCm ? `${m.chestCm} cm` : '-'}</td>
                          <td className="p-3.5 text-slate-600">{m.thighsCm ? `${m.thighsCm} cm` : '-'}</td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={async () => {
                                if (confirm('Remover esta medição?')) {
                                  await db.gymMeasurements.delete(m.id);
                                }
                              }}
                              className="text-slate-300 hover:text-rose-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3">
              <Ruler className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">Nenhuma medição registrada</h4>
              <p className="text-xs text-slate-400">
                Adicione seu peso e circunferências corporais para acompanhar sua evolução estética.
              </p>
            </div>
          )}

          {/* Modal / Nova Medição */}
          {showNewMeasurementModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-slate-900 text-base">Nova Medição Corporal</h3>
                  <button
                    onClick={() => setShowNewMeasurementModal(false)}
                    className="text-slate-400 hover:text-slate-700 font-black text-lg p-1"
                  >
                    ✕
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const date = (form.elements.namedItem('date') as HTMLInputElement).value || formatDateToLocalYYYYMMDD(new Date());
                    const weightKg = Number((form.elements.namedItem('weight') as HTMLInputElement).value) || undefined;
                    const waistCm = Number((form.elements.namedItem('waist') as HTMLInputElement).value) || undefined;
                    const bicepsCm = Number((form.elements.namedItem('biceps') as HTMLInputElement).value) || undefined;
                    const chestCm = Number((form.elements.namedItem('chest') as HTMLInputElement).value) || undefined;
                    const thighsCm = Number((form.elements.namedItem('thighs') as HTMLInputElement).value) || undefined;

                    await db.gymMeasurements.add({
                      id: `measure-${Date.now()}`,
                      date,
                      weightKg,
                      waistCm,
                      rightBicepsCm: bicepsCm,
                      leftBicepsCm: bicepsCm,
                      chestCm,
                      thighsCm,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    });

                    setShowNewMeasurementModal(false);
                    triggerVictory();
                  }}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Data</label>
                    <input
                      name="date"
                      type="date"
                      defaultValue={formatDateToLocalYYYYMMDD(new Date())}
                      className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Peso (kg)</label>
                      <input
                        name="weight"
                        type="number"
                        step={0.1}
                        placeholder="Ex: 75.5"
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Cintura (cm)</label>
                      <input
                        name="waist"
                        type="number"
                        step={0.5}
                        placeholder="Ex: 82"
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Braço (cm)</label>
                      <input
                        name="biceps"
                        type="number"
                        step={0.5}
                        placeholder="Ex: 38"
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Peito (cm)</label>
                      <input
                        name="chest"
                        type="number"
                        step={0.5}
                        placeholder="Ex: 102"
                        className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowNewMeasurementModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                    >
                      Salvar Medição
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 8: PLANEJAMENTO SEMANAL INTEGRADO                                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'planning' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Planejamento da Rotina Semanal</h3>
              <p className="text-xs text-slate-500">
                Defina seus dias preferidos e associe cada dia à ficha desejada. As métricas de treino não interferem nas metas de estudo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="font-bold text-slate-700 text-xs block mb-1">
                  Meta de Treinos por Semana (dias)
                </label>
                <input
                  type="number"
                  min={1}
                  max={7}
                  defaultValue={preferences?.weeklyGoalDays || 4}
                  onChange={async (e) => {
                    const val = Number(e.target.value) || 4;
                    const pref = preferences || {
                      id: 'gym_preferences',
                      weeklyGoalDays: 4,
                      preferredDays: [1, 2, 4, 5],
                      plannedRoutineMap: {},
                      defaultRestSeconds: 90,
                      updatedAt: Date.now(),
                    };
                    await db.gymPreferences.put({ ...pref, weeklyGoalDays: val, updatedAt: Date.now() });
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 text-xs block mb-1">
                  Tempo de Descanso Padrão Entre Séries (segundos)
                </label>
                <input
                  type="number"
                  min={30}
                  max={300}
                  step={15}
                  defaultValue={preferences?.defaultRestSeconds || 90}
                  onChange={async (e) => {
                    const val = Number(e.target.value) || 90;
                    const pref = preferences || {
                      id: 'gym_preferences',
                      weeklyGoalDays: 4,
                      preferredDays: [1, 2, 4, 5],
                      plannedRoutineMap: {},
                      defaultRestSeconds: 90,
                      updatedAt: Date.now(),
                    };
                    await db.gymPreferences.put({ ...pref, defaultRestSeconds: val, updatedAt: Date.now() });
                  }}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-900"
                />
              </div>
            </div>

            {/* Associação dos Dias da Semana */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <span className="text-xs font-black text-slate-800 block">Distribuição Semanal dos Treinos:</span>
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 text-xs">
                {[
                  { day: 1, label: 'Segunda' },
                  { day: 2, label: 'Terça' },
                  { day: 3, label: 'Quarta' },
                  { day: 4, label: 'Quinta' },
                  { day: 5, label: 'Sexta' },
                  { day: 6, label: 'Sábado' },
                  { day: 0, label: 'Domingo' },
                ].map((item) => {
                  const currentRoutineId = preferences?.plannedRoutineMap?.[item.day] || '';

                  return (
                    <div key={item.day} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                      <span className="font-black text-slate-800 text-[11px] block">{item.label}</span>
                      <select
                        value={currentRoutineId}
                        onChange={async (e) => {
                          const val = e.target.value;
                          const pref = preferences || {
                            id: 'gym_preferences',
                            weeklyGoalDays: 4,
                            preferredDays: [1, 2, 4, 5],
                            plannedRoutineMap: {},
                            defaultRestSeconds: 90,
                            updatedAt: Date.now(),
                          };
                          const newMap = { ...pref.plannedRoutineMap };
                          if (val) {
                            newMap[item.day] = val;
                          } else {
                            delete newMap[item.day];
                          }
                          await db.gymPreferences.put({ ...pref, plannedRoutineMap: newMap, updatedAt: Date.now() });
                        }}
                        className="w-full text-[10px] p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-bold focus:outline-hidden"
                      >
                        <option value="">Descanso</option>
                        {routines.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name.split('—')[0].trim()}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
