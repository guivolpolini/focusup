import { useEffect, useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import { ConsistencyCalendar } from './components/ConsistencyCalendar';
import { groupActivityByDay, calculateStreaks } from './lib/consistencyEngine';
import {
  Play,
  Pause,
  CheckCircle2,
  Layers,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Flame,
  Zap,
  Shield,
  Trophy,
  Swords,
  ChevronRight,
  Settings2,
  Plus,
  BookOpen,
  FileText,
  Bell,
  BellRing,
  RotateCcw,
  Dumbbell,
  CheckSquare,
  Wallet,
} from 'lucide-react';

import { HabitsCard } from './components/HabitsCard';
import { HabitsSection } from './components/HabitsSection';
import { FinanceSection } from './components/FinanceSection';
import { StudySection } from './components/StudySection';
import { WeeklyReportCard } from './components/WeeklyReportCard';
import { WeeklyReportSection } from './components/WeeklyReportSection';
import { getHabitLogForDate, getHabitStatusForDate } from './lib/habitEngine';
import { GymSection } from './components/GymSection';
import { db, seedInitialData, ensureDefaultFinanceCategories } from './lib/db';
import {
  type ActiveTimerState,
  calculateTimerProgress,
  loadTimerState,
  saveTimerState,
  clearTimerState,
} from './lib/timerEngine';
import { formatDateToLocalYYYYMMDD } from './lib/srsEngine';
import {
  exportAllData,
  validateBackupString,
  restoreByReplacement,
  restoreByMerge,
} from './lib/backupEngine';
import { calculateGamification } from './lib/gamification';
import { generateWeeklyReviewAnalysis } from './lib/weeklyReviewEngine';
import {
  normalizeSubjectName,
  deduplicateSubjectsList,
  cleanAndDeduplicateDatabaseSubjects,
} from './lib/subjectEngine';
import {
  requestNotificationPermission,
  sendLocalNotification,
  getNotificationPermissionStatus,
} from './lib/notificationEngine';
import type {
  SessionMode,
  StudySession,
  WeeklyReview,
} from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'focus' | 'studies' | 'gym' | 'habits' | 'finance' | 'weekly_report' | 'progress' | 'settings'>('home');
  const [now, setNow] = useState(Date.now());
  const [currentReview, setCurrentReview] = useState<WeeklyReview | null>(null);

  // Ref e auto-scroll para a barra de navegação móvel espaçosa
  const mobileNavRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mobileNavRef.current) {
      const activeEl = mobileNavRef.current.querySelector<HTMLElement>('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeTab]);

  // Estado do Cronômetro
  const [timerState, setTimerState] = useState<ActiveTimerState>(() => {
    const saved = loadTimerState();
    return saved || {
      status: 'idle',
      mode: 'pomodoro',
      plannedMinutes: 25,
      startedAt: Date.now(),
      accumulatedPausedMs: 0,
      isBreak: false,
    };
  });

  // Consultas Reativas ao Dexie
  const subjects = useLiveQuery(() => db.subjects.filter((s) => !s.archived).toArray()) || [];
  const uniqueSubjects = useMemo(() => deduplicateSubjectsList(subjects), [subjects]);
  const tasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const flashcards = useLiveQuery(() => db.flashcards.filter((f) => !f.archived).toArray()) || [];
  const sessions = useLiveQuery(() => db.studySessions.toArray()) || [];
  const preferences = useLiveQuery(() => db.preferences.get('user_preferences'));

  // Consultas Reativas da Seção Academia
  const gymExercises = useLiveQuery(() => db.gymExercises.toArray()) || [];
  const gymRoutines = useLiveQuery(() => db.gymRoutines.toArray()) || [];
  const gymWorkouts = useLiveQuery(() => db.gymWorkouts.toArray()) || [];
  const gymMeasurements = useLiveQuery(() => db.gymMeasurements.toArray()) || [];
  const gymPreferences = useLiveQuery(() => db.gymPreferences.get('gym_preferences'));

  // Consultas Reativas do Rastreador de Hábitos
  const habits = useLiveQuery(() => db.habits.toArray()) || [];
  const habitLogs = useLiveQuery(() => db.habitLogs.toArray()) || [];

  // Data local no formato YYYY-MM-DD
  const todayStr = formatDateToLocalYYYYMMDD(new Date());

  // Estado de Notificações Mobile
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [notifiedSessionStart, setNotifiedSessionStart] = useState<number | null>(null);

  // Inicialização das sementes e saneamento de duplicatas
  useEffect(() => {
    (async () => {
      await seedInitialData();
      await ensureDefaultFinanceCategories();
      await cleanAndDeduplicateDatabaseSubjects();
      setNotifPermission(getNotificationPermissionStatus());
    })();
  }, []);

  // Loop de relógio para UI do Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Salvar estado do timer quando alterado
  useEffect(() => {
    if (timerState.status !== 'idle') {
      saveTimerState(timerState);
    } else {
      clearTimerState();
    }
  }, [timerState]);

  // Cálculos do timer
  const timerProgress = calculateTimerProgress(timerState, now);

  // Disparo de notificação e vibração no término do timer
  useEffect(() => {
    if (
      timerState.status === 'running' &&
      timerProgress.isFinished &&
      notifiedSessionStart !== timerState.startedAt
    ) {
      setNotifiedSessionStart(timerState.startedAt);
      sendLocalNotification('Tempo Esgotado! ⚡ FocusUp', {
        body: `Sua sessão de ${timerState.plannedMinutes} min foi concluída! Registre seu progresso.`,
        tag: 'focusup-timer-done',
      });
    }
  }, [timerState.status, timerProgress.isFinished, timerState.startedAt, timerState.plannedMinutes, notifiedSessionStart]);

  // Manipuladores do Cronômetro
  const prepareTimer = (mode: SessionMode = 'pomodoro', customMinutes?: number, subjectId?: string, taskId?: string) => {
    let minutes = 25;
    if (mode === 'deep_work') minutes = 50;
    if (mode === 'five_min') minutes = 5;
    if (mode === 'custom' && customMinutes) minutes = customMinutes;

    const newState: ActiveTimerState = {
      status: 'idle',
      mode,
      plannedMinutes: minutes,
      startedAt: Date.now(),
      accumulatedPausedMs: 0,
      subjectId: subjectId !== undefined ? subjectId : timerState.subjectId,
      taskId: taskId !== undefined ? taskId : timerState.taskId,
      isBreak: false,
    };
    setTimerState(newState);
    setActiveTab('focus');
  };

  const startTimer = (mode?: SessionMode, customMinutes?: number, subjectId?: string, taskId?: string) => {
    setTimerState((prev) => {
      let minutes = customMinutes || prev.plannedMinutes;
      const chosenMode = mode || prev.mode;
      if (!customMinutes) {
        if (chosenMode === 'deep_work') minutes = 50;
        else if (chosenMode === 'five_min') minutes = 5;
        else if (chosenMode === 'pomodoro') minutes = 25;
      }

      return {
        ...prev,
        status: 'running',
        mode: chosenMode,
        plannedMinutes: minutes,
        startedAt: Date.now(),
        accumulatedPausedMs: 0,
        pausedAt: undefined,
        subjectId: subjectId !== undefined ? subjectId : prev.subjectId,
        taskId: taskId !== undefined ? taskId : prev.taskId,
      };
    });
    setActiveTab('focus');
  };

  const pauseTimer = () => {
    if (timerState.status !== 'running') return;
    setTimerState((prev) => ({
      ...prev,
      status: 'paused',
      pausedAt: Date.now(),
    }));
  };

  const resumeTimer = () => {
    if (timerState.status !== 'paused' || !timerState.pausedAt) return;
    const pauseDuration = Date.now() - timerState.pausedAt;
    setTimerState((prev) => ({
      ...prev,
      status: 'running',
      pausedAt: undefined,
      accumulatedPausedMs: prev.accumulatedPausedMs + pauseDuration,
    }));
  };

  const restartTimer = () => {
    setTimerState((prev) => ({
      ...prev,
      status: 'idle',
      startedAt: Date.now(),
      accumulatedPausedMs: 0,
      pausedAt: undefined,
    }));
  };

  const triggerVictoryEffect = () => {
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

  const finishSession = async () => {
    const actualSeconds = timerProgress.actualStudiedSeconds;
    if (actualSeconds >= 60) {
      const newSession: StudySession = {
        id: `session-${Date.now()}`,
        subjectId: timerState.subjectId,
        taskId: timerState.taskId,
        mode: timerState.mode,
        plannedDurationMinutes: timerState.plannedMinutes,
        actualDurationSeconds: actualSeconds,
        startedAt: timerState.startedAt,
        endedAt: Date.now(),
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.studySessions.add(newSession);

      if (timerState.taskId) {
        const task = await db.tasks.get(timerState.taskId);
        if (task) {
          await db.tasks.update(task.id, {
            actualStudiedMinutes: task.actualStudiedMinutes + Math.floor(actualSeconds / 60),
            updatedAt: Date.now(),
          });
        }
      }

      triggerVictoryEffect();
      sendLocalNotification('Missão Concluída! 🚀 FocusUp', {
        body: `Sessão de ${Math.floor(actualSeconds / 60)} min finalizada! Seu XP foi atualizado no ranking.`,
        tag: 'focusup-session-complete',
      });
    }

    setTimerState({
      status: 'idle',
      mode: 'pomodoro',
      plannedMinutes: 25,
      startedAt: Date.now(),
      accumulatedPausedMs: 0,
      isBreak: false,
    });
    clearTimerState();
  };

  const cancelSession = () => {
    if (confirm('Deseja cancelar esta sessão? O progresso não salvo será descartado.')) {
      setTimerState({
        status: 'idle',
        mode: 'pomodoro',
        plannedMinutes: 25,
        startedAt: Date.now(),
        accumulatedPausedMs: 0,
        isBreak: false,
      });
      clearTimerState();
    }
  };

  // Métricas do Dia
  const todaySessions = sessions.filter((s) => {
    const sDate = formatDateToLocalYYYYMMDD(new Date(s.startedAt));
    return sDate === todayStr && s.status === 'completed';
  });
  const studiedMinutesToday = Math.floor(
    todaySessions.reduce((acc, s) => acc + s.actualDurationSeconds, 0) / 60
  );
  const dailyGoal = preferences?.dailyGoalMinutes || 120;
  const dailyProgressPercent = Math.min(100, Math.round((studiedMinutesToday / dailyGoal) * 100));

  // Sequência Real de Dias (Streak) e Mapa de Consistência
  const activityDayMap = useMemo(() => {
    return groupActivityByDay(sessions, tasks, dailyGoal);
  }, [sessions, tasks, dailyGoal]);

  const { currentStreak: streak } = useMemo(() => {
    return calculateStreaks(activityDayMap);
  }, [activityDayMap]);

  // Estatísticas de Gamificação (XP & Rank)
  const totalStudiedSecondsAllTime = sessions.reduce((acc, s) => acc + s.actualDurationSeconds, 0);
  const totalFlashcardReviews = flashcards.reduce((acc, f) => acc + f.reviewsCount, 0);
  const gameStats = calculateGamification(
    totalStudiedSecondsAllTime,
    sessions.length,
    totalFlashcardReviews,
    streak
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col md:flex-row pb-28 md:pb-0 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Sidebar Desktop — Visual Claro & Gamificado */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center gap-3 mb-6 px-1">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-amber-400 flex items-center justify-center text-white font-black text-xl shadow-md shadow-indigo-500/25">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-lg text-slate-900 tracking-tight">FocusUp</h1>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded-md border border-indigo-200">
                PRO
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">Foco & Produtividade</p>
          </div>
        </div>

        {/* Card do Jogador — Claro, Elegante e Gamificado */}
        <div className="bg-gradient-to-br from-indigo-50/80 via-white to-amber-50/60 rounded-2xl p-4 border border-indigo-100/80 mb-6 shadow-xs">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl drop-shadow-xs">{gameStats.rankBadge}</span>
              <div>
                <div className="text-xs font-black text-slate-900 flex items-center gap-1">
                  Nível {gameStats.level}
                </div>
                <div className="text-[11px] text-indigo-700 font-bold truncate max-w-[130px]">
                  {gameStats.title}
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-black text-amber-600 bg-amber-100/70 px-2 py-0.5 rounded-lg border border-amber-300/60">
              {gameStats.xp} XP
            </span>
          </div>

          {/* Barra de Progresso de XP */}
          <div className="w-full bg-slate-200/70 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-300/40">
            <div
              className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-amber-400 h-full rounded-full transition-all duration-500 shadow-xs"
              style={{
                width: `${Math.min(100, (gameStats.currentLevelXp / gameStats.nextLevelXp) * 100)}%`,
              }}
            />
          </div>
          <div className="text-[10px] text-right text-slate-500 mt-1.5 font-mono font-semibold">
            {gameStats.currentLevelXp}/{gameStats.nextLevelXp} XP para Nvl. {gameStats.level + 1}
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <button
            onClick={() => setActiveTab('home')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'home'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="w-5 h-5" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('finance')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'finance'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-5 h-5 text-emerald-500" />
            Financeiro
          </button>
          <button
            onClick={() => setActiveTab('studies')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'studies'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-5 h-5 text-sky-500" />
            Estudos
          </button>
          <button
            onClick={() => setActiveTab('gym')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'gym'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Dumbbell className="w-5 h-5 text-amber-500" />
            Academia
          </button>
          <button
            onClick={() => setActiveTab('habits')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'habits'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-5 h-5 text-emerald-500" />
            Hábitos
          </button>
          <button
            onClick={() => setActiveTab('focus')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'focus'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Zap className="w-5 h-5 text-amber-500" />
            Foco
            {timerState.status === 'running' && (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping ml-auto" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('weekly_report')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'weekly_report'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileText className="w-5 h-5 text-indigo-500" />
            Relatório Semanal
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'progress'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-5 h-5 text-amber-500" />
            Conquistas & Métricas
          </button>
        </nav>

        <div className="pt-4 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'settings' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Shield className="w-4 h-4 text-slate-400" />
            Cofre de Dados (Backup)
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal — Fundo Claro */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
        {/* TAB: INÍCIO (QUARTEL GENERAL CLARO) */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-400 to-indigo-600 flex items-center justify-center text-3xl shadow-md shadow-indigo-500/15">
                  {gameStats.rankBadge}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    Nível {gameStats.level} — {gameStats.title}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    +{gameStats.xp} XP conquistados com foco e disciplina comprovada.
                  </p>
                </div>
              </div>
              <button
                onClick={() => prepareTimer('pomodoro')}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-2xl shadow-sm transition active:scale-95 text-sm"
              >
                <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />
                Batalha de Foco (25m)
              </button>
            </header>

            {/* Grid de Estatísticas Gamificadas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meta Diária</span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">{studiedMinutesToday}m</span>
                  <span className="text-xs text-slate-400 font-bold">/ {dailyGoal}m</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${dailyProgressPercent}%` }}
                  />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Streak Ativa</span>
                <div className="mt-2 flex items-center gap-2">
                  <Flame className="w-7 h-7 text-amber-500" />
                  <span className="text-3xl font-black text-slate-900">{streak} dias</span>
                </div>
                <p className="text-[10px] text-amber-600 mt-2 font-bold">Bônus de XP diário ativo</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tarefas Pendentes</span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">
                    {tasks.filter((t) => t.status !== 'completed').length}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">em aberto</span>
                </div>
                <button
                  onClick={() => setActiveTab('focus')}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 mt-2 inline-flex items-center gap-1"
                >
                  Ver no QG de Foco <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sessões Vitoriosas</span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">{todaySessions.length}</span>
                  <span className="text-xs text-slate-400 font-bold">hoje</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-medium">{sessions.length} vitórias totais</p>
              </div>
            </div>

            {/* Banner de Sessão Ativa */}
            {timerState.status !== 'idle' && (
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-5 rounded-3xl shadow-md flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-[11px] uppercase tracking-widest font-extrabold text-indigo-200">
                      Sessão de Foco Ativa ({timerState.mode})
                    </span>
                  </div>
                  <div className="text-4xl font-mono font-black tracking-tight mt-1">
                    {Math.floor(timerProgress.remainingSeconds / 60)}:
                    {String(timerProgress.remainingSeconds % 60).padStart(2, '0')}
                  </div>
                </div>
                <button
                  onClick={() => setActiveTab('focus')}
                  className="bg-white text-indigo-700 font-black px-5 py-2.5 rounded-xl shadow-xs text-sm hover:bg-indigo-50 transition active:scale-95"
                >
                  Abrir Foco
                </button>
              </div>
            )}

            {/* Calendário de Consistência no Dashboard */}
            <ConsistencyCalendar
              sessions={sessions}
              tasks={tasks}
              dailyGoalMinutes={dailyGoal}
              onStartFocusToday={() => prepareTimer('pomodoro')}
            />

            {/* Grid: Meus Hábitos & Resumo da Semana */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <HabitsCard
                habits={habits}
                habitLogs={habitLogs}
                onOpenHabitsPage={() => setActiveTab('habits')}
                onToggleHabit={async (habit) => {
                  const todayStr = formatDateToLocalYYYYMMDD(new Date());
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
                    confetti({ particleCount: 35, spread: 55, origin: { y: 0.85 } });
                  }
                }}
                onOpenNewHabitModal={() => setActiveTab('habits')}
              />
              <WeeklyReportCard
                sessions={sessions}
                tasks={tasks}
                subjects={subjects}
                gymWorkouts={gymWorkouts}
                habits={habits}
                habitLogs={habitLogs}
                studyPreferences={preferences}
                gymPreferences={gymPreferences}
                onOpenReportPage={() => setActiveTab('weekly_report')}
              />
            </div>

            {/* Árvore de Matérias */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Swords className="w-5 h-5 text-amber-500" /> Árvore de Matérias
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">
                    {uniqueSubjects.length} matérias ativas
                  </span>
                  {subjects.length > uniqueSubjects.length && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await cleanAndDeduplicateDatabaseSubjects();
                        if (res.mergedCount > 0) {
                          triggerVictoryEffect();
                          alert(`${res.mergedCount} matéria(s) duplicada(s) foram unificadas no banco!`);
                        }
                      }}
                      className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition"
                      title="Unificar matérias repetidas"
                    >
                      Unificar {subjects.length - uniqueSubjects.length} Duplicadas
                    </button>
                  )}
                </div>
              </div>

              {/* Formulário Rápido de Nova Matéria */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = (form.elements.namedItem('subName') as HTMLInputElement).value;
                  const color = (form.elements.namedItem('subColor') as HTMLInputElement).value || '#6366f1';
                  const targetMinutes = Number((form.elements.namedItem('subTarget') as HTMLInputElement).value) || 120;

                  if (!name) return;

                  const norm = normalizeSubjectName(name);
                  const alreadyExists = subjects.some((s) => normalizeSubjectName(s.name) === norm);
                  if (alreadyExists) {
                    alert(`A matéria "${name}" já está cadastrada!`);
                    return;
                  }

                  await db.subjects.add({
                    id: `sub-${Date.now()}`,
                    name,
                    color,
                    priority: 'medium',
                    targetMinutesPerWeek: targetMinutes,
                    archived: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  });

                  form.reset();
                  triggerVictoryEffect();
                  alert('Nova matéria adicionada à sua árvore de conhecimentos!');
                }}
                className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100"
              >
                <input
                  name="subColor"
                  type="color"
                  defaultValue="#6366f1"
                  className="w-8 h-8 rounded-xl cursor-pointer border-0 bg-transparent p-0"
                  title="Cor da matéria"
                />
                <input
                  name="subName"
                  placeholder="Nome da matéria (ex: Docker, Rust, Algoritmos)..."
                  required
                  className="flex-1 text-xs p-2 bg-transparent focus:outline-hidden"
                />
                <input
                  name="subTarget"
                  type="number"
                  defaultValue={120}
                  className="w-16 text-xs p-2 bg-white rounded-lg border border-slate-200 text-center focus:outline-hidden"
                  title="Meta de minutos por semana"
                />
                <span className="text-[10px] text-slate-400 font-bold mr-1">m/sem</span>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition active:scale-95 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {uniqueSubjects.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-4 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-lg shrink-0 shadow-xs"
                        style={{ backgroundColor: sub.color }}
                      />
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{sub.name}</div>
                        <div className="text-[11px] text-slate-500 font-medium">Meta: {sub.targetMinutesPerWeek}m/sem</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => prepareTimer('pomodoro', 25, sub.id)}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-indigo-600 transition active:scale-95 shadow-xs"
                        title="Preparar foco nesta matéria"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Deseja remover a matéria "${sub.name}"?`)) {
                            const norm = normalizeSubjectName(sub.name);
                            const toDelete = subjects.filter((s) => normalizeSubjectName(s.name) === norm);
                            for (const d of toDelete) {
                              await db.subjects.delete(d.id);
                            }
                          }
                        }}
                        className="text-slate-300 hover:text-rose-500 p-1 transition"
                        title="Remover matéria"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: FOCO (POMODORO & DEEP WORK) */}
        {activeTab === 'focus' && (
          <div className="max-w-xl mx-auto space-y-6 text-center">
            <header>
              <h2 className="text-2xl font-black text-slate-900">Timer de Foco</h2>
              <p className="text-xs text-slate-500 mt-1">
                Conclua a sessão para receber +XP e avançar seu nível de maestria.
              </p>
            </header>

            <div className="inline-flex p-1 bg-slate-200/80 rounded-2xl gap-1">
              <button
                onClick={() => prepareTimer('pomodoro', 25)}
                disabled={timerState.status === 'running'}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  timerState.mode === 'pomodoro' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Pomodoro (25m)
              </button>
              <button
                onClick={() => prepareTimer('deep_work', 50)}
                disabled={timerState.status === 'running'}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  timerState.mode === 'deep_work' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Deep Work (50m)
              </button>
              <button
                onClick={() => prepareTimer('five_min', 5)}
                disabled={timerState.status === 'running'}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  timerState.mode === 'five_min' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                5 Minutos
              </button>
            </div>

            {/* Mostrador Principal Gamificado Claro */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex justify-center">
                <div className="relative w-68 h-68 rounded-full border-8 border-slate-100 flex flex-col items-center justify-center bg-slate-50/50">
                  <div className="text-5xl font-mono font-black tracking-tight text-slate-900">
                    {Math.floor(timerProgress.remainingSeconds / 60)}:
                    {String(timerProgress.remainingSeconds % 60).padStart(2, '0')}
                  </div>
                  <div className="text-xs font-bold text-indigo-600 mt-2 uppercase tracking-widest flex items-center gap-1.5">
                    {timerState.status === 'running' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                        Em Foco
                      </>
                    ) : timerState.status === 'paused' ? (
                      'Pausado'
                    ) : (
                      'Pronto para o Estudo'
                    )}
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {timerState.status === 'idle' ? (
                  <>
                    <button
                      onClick={() => startTimer(timerState.mode, timerState.plannedMinutes)}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-2xl font-black shadow-sm transition active:scale-95"
                    >
                      <Play className="w-5 h-5 fill-white" />
                      Iniciar
                    </button>
                    <button
                      onClick={restartTimer}
                      className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3.5 rounded-2xl font-bold transition active:scale-95"
                      title="Recomeçar do início"
                    >
                      <RotateCcw className="w-4 h-4 text-indigo-600" />
                      Recomeçar
                    </button>
                  </>
                ) : timerState.status === 'running' ? (
                  <>
                    <button
                      onClick={pauseTimer}
                      className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl font-bold transition active:scale-95"
                      title="Pausar"
                    >
                      <Pause className="w-5 h-5 fill-current" />
                      Pausar
                    </button>
                    <button
                      onClick={restartTimer}
                      className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl font-bold transition active:scale-95"
                      title="Recomeçar do início"
                    >
                      <RotateCcw className="w-4 h-4 text-indigo-600" />
                      Recomeçar
                    </button>
                    <button
                      onClick={finishSession}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-2xl font-black shadow-sm transition active:scale-95"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Concluir (+XP)
                    </button>
                    <button
                      onClick={cancelSession}
                      className="p-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-95"
                      title="Cancelar"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={resumeTimer}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl font-black shadow-sm transition active:scale-95"
                    >
                      <Play className="w-5 h-5 fill-white" />
                      Iniciar
                    </button>
                    <button
                      onClick={restartTimer}
                      className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3.5 rounded-2xl font-bold transition active:scale-95"
                      title="Recomeçar do início"
                    >
                      <RotateCcw className="w-4 h-4 text-indigo-600" />
                      Recomeçar
                    </button>
                    <button
                      onClick={finishSession}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-2xl font-black shadow-sm transition active:scale-95"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      Concluir (+XP)
                    </button>
                    <button
                      onClick={cancelSession}
                      className="p-3.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-95"
                      title="Cancelar"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}



        {/* TAB: ESTUDOS (MATÉRIAS, TEMPO SEMANAL, REGISTRO E HISTÓRICO) */}
        {activeTab === 'studies' && (
          <StudySection
            onStartFocus={(subId) => {
              prepareTimer('pomodoro', 25, subId);
              setActiveTab('focus');
            }}
          />
        )}

        {/* TAB: ACADEMIA & HIPERTROFIA */}
        {activeTab === 'gym' && (
          <GymSection
            exercises={gymExercises}
            routines={gymRoutines}
            workouts={gymWorkouts}
            measurements={gymMeasurements}
            preferences={gymPreferences}
          />
        )}

        {/* TAB: RASTREADOR DE HÁBITOS */}
        {activeTab === 'habits' && (
          <HabitsSection
            habits={habits}
            habitLogs={habitLogs}
          />
        )}

        {/* TAB: MÓDULO FINANCEIRO */}
        {activeTab === 'finance' && (
          <FinanceSection />
        )}

        {/* TAB: RELATÓRIO SEMANAL */}
        {activeTab === 'weekly_report' && (
          <WeeklyReportSection
            sessions={sessions}
            tasks={tasks}
            subjects={subjects}
            gymWorkouts={gymWorkouts}
            habits={habits}
            habitLogs={habitLogs}
            studyPreferences={preferences}
            gymPreferences={gymPreferences}
          />
        )}

        {/* TAB: CONQUISTAS & MÉTRICAS */}
        {activeTab === 'progress' && (
          <div className="space-y-6">
            <header>
              <h2 className="text-2xl font-black text-slate-900">Salão de Conquistas & Métricas</h2>
              <p className="text-xs text-slate-500 mt-1">Dados reais obtidos através de horas aplicadas de foco.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nível Atual</span>
                <div className="text-3xl font-black text-slate-900 mt-2 flex items-center gap-2">
                  <span>{gameStats.rankBadge}</span> Nvl. {gameStats.level}
                </div>
                <div className="text-xs text-indigo-600 font-bold mt-1">{gameStats.title}</div>
              </div>
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Horas de Foco Real</span>
                <div className="text-3xl font-black text-indigo-600 mt-2">
                  {(totalStudiedSecondsAllTime / 3600).toFixed(1)}h
                </div>
                <div className="text-xs text-slate-400 font-medium mt-1">Tempo efetivamente estudado</div>
              </div>
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sessões de Foco</span>
                <div className="text-3xl font-black text-slate-900 mt-2">{sessions.length}</div>
                <div className="text-xs text-slate-400 font-medium mt-1">Sessões registradas no histórico</div>
              </div>
            </div>

            {/* Painel de Análise e Revisão Semanal Automática */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Relatório Semanal Baseado em Regras</h3>
                  <p className="text-xs text-slate-500">
                    Análise determinística e transparente derivada exclusivamente dos seus registros de estudo.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const subjectNames: Record<string, string> = {};
                    subjects.forEach((s) => (subjectNames[s.id] = s.name));
                    const priorityIds = subjects.filter((s) => s.priority === 'high').map((s) => s.id);

                    const analysis = generateWeeklyReviewAnalysis({
                      weekStartDate: new Date(),
                      sessions,
                      weeklyGoalMinutes: (preferences?.dailyGoalMinutes || 120) * 7,
                      subjectNames,
                      prioritySubjectIds: priorityIds,
                    });
                    setCurrentReview(analysis);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                >
                  Gerar Análise Semanal
                </button>
              </div>

              {currentReview && (
                <div className="mt-4 p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <span className="text-xs font-bold text-slate-700">
                      Período: {currentReview.weekStartDate} a {currentReview.weekEndDate}
                    </span>
                    <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                      {currentReview.goalCompletionRate}% da Meta Semanal
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-700">Observações dos Seus Dados:</div>
                    <ul className="space-y-1">
                      {currentReview.observations.map((obs, i) => (
                        <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                          <span className="text-indigo-500 font-bold">•</span> {obs}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {currentReview.proposedNextPlan && (
                    <div className="p-4 rounded-xl bg-white border border-indigo-100 space-y-2">
                      <div className="text-xs font-black text-slate-900">
                        Proposta de Foco para a Próxima Semana:
                      </div>
                      <p className="text-xs text-slate-600">
                        {currentReview.proposedNextPlan.notes}
                      </p>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => alert('Plano aceito com sucesso para a próxima semana!')}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition"
                        >
                          Aceitar Proposta
                        </button>
                        <button
                          onClick={() => setCurrentReview(null)}
                          className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-3 py-1.5 rounded-lg transition"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: CONFIGURAÇÕES & COFRE DE DADOS */}
        {activeTab === 'settings' && (
          <div className="max-w-xl mx-auto space-y-6">
            <header>
              <h2 className="text-2xl font-black text-slate-900">Configurações & Cofre de Dados</h2>
              <p className="text-xs text-slate-500 mt-1">Ajuste suas metas de estudo e gerencie seus backups.</p>
            </header>

            {/* Ajuste de Metas de Estudo */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-sm">Metas de Estudo</h3>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <div className="text-xs font-bold text-slate-800">Meta Diária de Foco</div>
                  <div className="text-[10px] text-slate-400">Minutos de estudo esperados por dia</div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    defaultValue={preferences?.dailyGoalMinutes || 120}
                    onBlur={async (e) => {
                      const val = Number(e.target.value);
                      if (val > 0) {
                        await db.preferences.update('user_preferences', {
                          dailyGoalMinutes: val,
                          updatedAt: Date.now(),
                        });
                        alert('Meta diária atualizada!');
                      }
                    }}
                    className="w-20 text-xs p-2 rounded-xl bg-white border border-slate-200 text-center font-bold font-mono focus:outline-hidden"
                  />
                  <span className="text-xs font-bold text-slate-500">minutos</span>
                </div>
              </div>
            </div>

            {/* Notificações no Celular & Vibração */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-extrabold text-slate-900 text-sm">Notificações no Celular & Vibração</h3>
                </div>
                {notifPermission === 'granted' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                    ATIVADAS ✅
                  </span>
                )}
                {notifPermission === 'denied' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                    BLOQUEADAS ⚠️
                  </span>
                )}
                {notifPermission === 'default' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                    PENDENTE
                  </span>
                )}
                {notifPermission === 'unsupported' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">
                    NÃO SUPORTADO
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Receba alertas sonoros e hápticos (vibração) no final de cada sessão Pomodoro ou Deep Work, mesmo com o app em segundo plano.
              </p>

              {notifPermission !== 'granted' ? (
                <button
                  onClick={async () => {
                    const granted = await requestNotificationPermission();
                    setNotifPermission(getNotificationPermissionStatus());
                    if (granted) {
                      await sendLocalNotification('FocusUp Notificações Ativas! ⚡', {
                        body: 'Você receberá alertas no término de suas sessões de estudo com vibração física.',
                      });
                      alert('Notificações ativadas com sucesso!');
                    } else {
                      alert('Permissão não concedida. Verifique as configurações de notificações do seu navegador.');
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl transition shadow-xs text-xs active:scale-98"
                >
                  <BellRing className="w-4 h-4" />
                  Ativar Notificações no Celular
                </button>
              ) : (
                <button
                  onClick={async () => {
                    await sendLocalNotification('Teste de Notificação FocusUp! 🔔', {
                      body: 'Alerta funcionando! Seu celular vibrou e o aviso foi entregue com sucesso.',
                    });
                    alert('Notificação de teste disparada!');
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-2xl transition text-xs active:scale-98"
                >
                  <BellRing className="w-4 h-4 text-indigo-600" />
                  Testar Alerta & Vibração Agora
                </button>
              )}

              {/* Guia de Instalação Mobile PWA */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-bold text-slate-700">Como instalar no Celular (PWA):</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-600">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                    <span className="font-bold text-indigo-700">📱 Android (Chrome / Edge)</span>
                    <p>Toque no menu <strong>⋮</strong> e selecione <strong>"Instalar aplicativo"</strong> ou "Adicionar à tela inicial".</p>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                    <span className="font-bold text-indigo-700">🍏 iPhone (Safari iOS 16.4+)</span>
                    <p>Toque no botão de compartilhar <strong>⎋</strong> e escolha <strong>"Adicionar à Tela de Início"</strong>.</p>
                  </div>
                </div>
                <div className="text-[9px] text-slate-400">
                  🛡️ 100% offline & local via Service Worker. Nenhum servidor externo rastreia suas notificações.
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl text-amber-800 text-xs border border-amber-200">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                <span>
                  O FocusUp opera em modo local-first. Exporte regularmente um arquivo JSON de backup para não perder
                  seu nível, XP ou histórico de estudos caso limpe o cache do navegador.
                </span>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={async () => {
                    const json = await exportAllData();
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `focusup-backup-${formatDateToLocalYYYYMMDD(new Date())}.json`;
                    a.click();
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl transition shadow-sm text-sm active:scale-98"
                >
                  <Download className="w-4 h-4" />
                  Exportar Backup Completo (JSON)
                </button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <label className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold py-3 rounded-2xl cursor-pointer transition text-xs">
                    <Upload className="w-4 h-4 text-emerald-600" />
                    Mesclar Dados (LWW)
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const text = await file.text();
                        const validation = validateBackupString(text);
                        if (!validation.success) {
                          alert(`Erro de validação: ${validation.error}`);
                          return;
                        }
                        const res = await restoreByMerge(validation.payload);
                        triggerVictoryEffect();
                        alert(`Mesclagem concluída! ${res.added} novos registros adicionados, ${res.updated} atualizados.`);
                      }}
                    />
                  </label>

                  <label className="flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold py-3 rounded-2xl cursor-pointer transition text-xs">
                    <Upload className="w-4 h-4 text-rose-600" />
                    Substituir Tudo
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const text = await file.text();
                        const validation = validateBackupString(text);
                        if (!validation.success) {
                          alert(`Erro de validação: ${validation.error}`);
                          return;
                        }
                        if (
                          confirm(
                            'ATENÇÃO: Deseja realmente substituir todos os dados atuais por este backup? Esta ação não pode ser desfeita.'
                          )
                        ) {
                          await restoreByReplacement(validation.payload);
                          triggerVictoryEffect();
                          alert('Backup restaurado com sucesso!');
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Navegação Inferior Mobile — Compacta, Ergonômica & Touch-Friendly */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 z-50 py-1.5 px-1 shadow-lg">
        <div
          ref={mobileNavRef}
          className="flex items-center gap-1 overflow-x-auto scrollbar-none px-1 py-0.5"
        >
          {[
            { id: 'home' as const, label: 'Dashboard', icon: Layers, activeColor: 'text-indigo-600 bg-indigo-50/90 border-indigo-200 shadow-xs' },
            { id: 'finance' as const, label: 'Finanças', icon: Wallet, activeColor: 'text-emerald-600 bg-emerald-50/90 border-emerald-200 shadow-xs' },
            { id: 'studies' as const, label: 'Estudos', icon: BookOpen, activeColor: 'text-sky-600 bg-sky-50/90 border-sky-200 shadow-xs' },
            { id: 'gym' as const, label: 'Treino', icon: Dumbbell, activeColor: 'text-rose-600 bg-rose-50/90 border-rose-200 shadow-xs' },
            { id: 'habits' as const, label: 'Hábitos', icon: CheckSquare, activeColor: 'text-emerald-600 bg-emerald-50/90 border-emerald-200 shadow-xs' },
            { id: 'focus' as const, label: 'Foco', icon: Zap, activeColor: 'text-amber-600 bg-amber-50/90 border-amber-200 shadow-xs' },
            { id: 'weekly_report' as const, label: 'Relatório', icon: FileText, activeColor: 'text-indigo-600 bg-indigo-50/90 border-indigo-200 shadow-xs' },
            { id: 'progress' as const, label: 'Conquistas', icon: Trophy, activeColor: 'text-amber-600 bg-amber-50/90 border-amber-200 shadow-xs' },
            { id: 'settings' as const, label: 'Cofre', icon: Shield, activeColor: 'text-slate-700 bg-slate-100 border-slate-300 shadow-xs' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-active={isActive ? 'true' : 'false'}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center min-w-[54px] px-1.5 py-1 rounded-xl border transition-all active:scale-95 shrink-0 ${
                  isActive
                    ? `${tab.activeColor} font-black`
                    : 'border-transparent text-slate-400 hover:text-slate-600 font-bold hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? '' : 'text-slate-400'}`} />
                <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
export default App;
