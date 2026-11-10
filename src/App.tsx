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
  ChevronRight,
  Settings2,
  BookOpen,
  FileText,
  Bell,
  BellRing,
  RotateCcw,
  Dumbbell,
  CheckSquare,
  Wallet,
  CalendarDays,
  ArrowLeft,
  Grid,
} from 'lucide-react';

import { HabitsCard } from './components/HabitsCard';
import { HabitsSection } from './components/HabitsSection';
import { FinanceCard } from './components/FinanceCard';
import { FinanceSection } from './components/FinanceSection';
import { StudySection } from './components/StudySection';
import { AgendaCard } from './components/AgendaCard';
import { AgendaSection } from './components/AgendaSection';
import { WeeklyReportSection } from './components/WeeklyReportSection';
import { getHabitLogForDate, getHabitStatusForDate } from './lib/habitEngine';
import { GymCard } from './components/GymCard';
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
  const [activeTab, setActiveTab] = useState<'home' | 'focus' | 'studies' | 'agenda' | 'gym' | 'habits' | 'finance' | 'weekly_report' | 'progress' | 'settings' | 'more'>('home');
  const [now, setNow] = useState(Date.now());
  const [currentReview, setCurrentReview] = useState<WeeklyReview | null>(null);

  // Determina se a aba ativa é um submódulo da central de ferramentas
  const isMoreSubTab = useMemo(() => {
    return ['studies', 'agenda', 'gym', 'habits', 'focus', 'weekly_report', 'settings'].includes(activeTab);
  }, [activeTab]);

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

  // Saudação personalizada por horário e data por extenso
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Boa noite';
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);

  const todayFormatted = useMemo(() => {
    const str = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
    return str.charAt(0).toUpperCase() + str.slice(1);
  }, []);

  // Hábitos ativos e contagem de concluídos hoje
  const activeHabits = useMemo(() => habits.filter((h) => !h.isArchived), [habits]);
  const completedHabitsTodayCount = useMemo(() => {
    return activeHabits.filter((h) => {
      const log = getHabitLogForDate(habitLogs, h.id, todayStr);
      return getHabitStatusForDate(h, log).completed;
    }).length;
  }, [activeHabits, habitLogs, todayStr]);

  // Treino de hoje
  const isGymCompletedToday = useMemo(() => {
    return gymWorkouts.some((w) => {
      const dStr = formatDateToLocalYYYYMMDD(new Date(w.startedAt));
      return dStr === todayStr;
    });
  }, [gymWorkouts, todayStr]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col md:flex-row pb-28 md:pb-0 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Sidebar Desktop — Visual Claro & Gamificado */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200/90 p-5 shadow-xs">
        <div className="flex items-center gap-3 mb-6 px-1">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-amber-400 flex items-center justify-center p-2.5 shadow-md shadow-indigo-500/25 shrink-0">
            <svg viewBox="0 0 512 512" fill="none" className="w-full h-full drop-shadow-xs" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M 172 150 C 172 133 186 120 203 120 L 360 120 C 372 120 378 128 374 137 L 348 186 C 345 192 338 196 331 196 L 240 196 L 240 242 L 322 242 C 332 242 337 249 333 258 L 312 296 C 309 302 302 306 295 306 L 240 306 L 240 376 C 240 393 225 406 206 406 C 187 406 172 393 172 376 Z"
                fill="#FFFFFF"
              />
            </svg>
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
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-1">
            Principal
          </div>
          <button
            onClick={() => setActiveTab('home')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'home'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Layers className="w-5 h-5" />
            Hoje
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
            Finanças
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
            Progresso
          </button>
          <button
            onClick={() => setActiveTab('more')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'more' || isMoreSubTab
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Grid className="w-5 h-5 text-indigo-400" />
            Mais Módulos
          </button>

          <div className="pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3">
            Ferramentas
          </div>
          <button
            onClick={() => setActiveTab('studies')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'studies' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4 text-sky-500" />
            Estudos & Matérias
          </button>
          <button
            onClick={() => setActiveTab('agenda')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'agenda' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <CalendarDays className="w-4 h-4 text-indigo-500" />
            Agenda
          </button>
          <button
            onClick={() => setActiveTab('gym')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'gym' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Dumbbell className="w-4 h-4 text-amber-500" />
            Academia
          </button>
          <button
            onClick={() => setActiveTab('habits')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'habits' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <CheckSquare className="w-4 h-4 text-emerald-500" />
            Hábitos
          </button>
          <button
            onClick={() => setActiveTab('focus')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'focus' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-500" />
            Foco (Pomodoro)
            {timerState.status === 'running' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping ml-auto" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('weekly_report')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'weekly_report' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-500" />
            Relatório Semanal
          </button>
        </nav>

        <div className="pt-3 border-t border-slate-100">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'settings' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Shield className="w-4 h-4 text-slate-400" />
            Cofre de Dados (Backup)
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal — Fundo Claro com espaçamento para barra mobile */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 pb-24 md:pb-8">
        {/* Barra Superior de Retorno ao Navegar em um Submódulo */}
        {isMoreSubTab && (
          <div className="mb-5 flex items-center justify-between bg-white px-4 py-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
            <button
              onClick={() => setActiveTab('more')}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-indigo-600 transition active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para Mais Módulos
            </button>
            <button
              onClick={() => setActiveTab('home')}
              className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition cursor-pointer"
            >
              Ir para Hoje
            </button>
          </div>
        )}
        {/* TAB: INÍCIO (DASHBOARD PREMIUM & MINIMALISTA) */}
        {activeTab === 'home' && (
          <div className="space-y-6">
            {/* Header com Saudação Personalizada & Ação Primária */}
            <header className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200/60 px-3 py-1 rounded-full uppercase tracking-wider">
                    {todayFormatted}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    • {gameStats.title} (Nvl. {gameStats.level})
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1.5">
                  {greeting}, Guilherme 👋
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  {dailyProgressPercent >= 100
                    ? 'Excelente! Sua meta diária de estudos já foi atingida hoje.'
                    : `Você estudou ${studiedMinutesToday}m hoje. Falta pouco para atingir sua meta de ${dailyGoal}m.`}
                </p>
              </div>

              {/* Botão de Foco Primário em 1 Toque */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => prepareTimer('pomodoro', 25)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-3.5 rounded-2xl shadow-sm transition active:scale-95 text-sm cursor-pointer"
                >
                  <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />
                  Iniciar Foco (25m)
                </button>
              </div>
            </header>

            {/* Barra de Ações Rápidas (1 Toque) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => prepareTimer('pomodoro', 25)}
                className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-indigo-300 transition flex items-center gap-3 text-left active:scale-[0.98] cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Foco 25m</div>
                  <div className="text-[10px] text-slate-400">Pomodoro direto</div>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('finance')}
                className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-emerald-300 transition flex items-center gap-3 text-left active:scale-[0.98] cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Finanças</div>
                  <div className="text-[10px] text-slate-400">Ver carteira</div>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('agenda')}
                className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-indigo-300 transition flex items-center gap-3 text-left active:scale-[0.98] cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Agenda</div>
                  <div className="text-[10px] text-slate-400">Compromissos</div>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('gym')}
                className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-rose-300 transition flex items-center gap-3 text-left active:scale-[0.98] cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <Dumbbell className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Academia</div>
                  <div className="text-[10px] text-slate-400">{isGymCompletedToday ? 'Treino feito ✓' : 'Marcar treino'}</div>
                </div>
              </button>
            </div>

            {/* Grid de Estatísticas e Progresso Diário */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estudo Hoje</span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">{studiedMinutesToday}m</span>
                  <span className="text-xs text-slate-400 font-bold">/ {dailyGoal}m</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${dailyProgressPercent}%` }}
                  />
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sequência</span>
                <div className="mt-2 flex items-center gap-2">
                  <Flame className="w-6 h-6 text-amber-500" />
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">{streak} dias</span>
                </div>
                <p className="text-[10px] text-amber-600 mt-2 font-bold">Consistência ativa</p>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hábitos do Dia</span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">
                    {completedHabitsTodayCount}
                  </span>
                  <span className="text-xs text-slate-400 font-bold">/ {activeHabits.length} feitos</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${activeHabits.length > 0 ? (completedHabitsTodayCount / activeHabits.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Treino do Dia</span>
                <div className="mt-2 flex items-center gap-2">
                  <Dumbbell className={`w-6 h-6 ${isGymCompletedToday ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <span className="text-lg sm:text-xl font-black text-slate-900">
                    {isGymCompletedToday ? 'Concluído' : 'Pendente'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 font-medium">
                  {isGymCompletedToday ? 'Presença confirmada' : 'Ainda não registrado'}
                </p>
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

            {/* Grid dos 4 Cartões Centrais: Finanças, Agenda, Hábitos e Academia */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FinanceCard onOpenFinancePage={() => setActiveTab('finance')} />
              <AgendaCard onOpenAgendaPage={() => setActiveTab('agenda')} />
              <HabitsCard
                habits={habits}
                habitLogs={habitLogs}
                onOpenHabitsPage={() => setActiveTab('habits')}
                onToggleHabit={async (habit) => {
                  const sDate = formatDateToLocalYYYYMMDD(new Date());
                  const log = getHabitLogForDate(habitLogs, habit.id, sDate);
                  const status = getHabitStatusForDate(habit, log);
                  const nowTime = Date.now();
                  const logId = `${habit.id}_${sDate}`;

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
                      date: sDate,
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
              <GymCard onOpenGymPage={() => setActiveTab('gym')} />
            </div>

            {/* Acesso Rápido às Matérias Ativas */}
            {uniqueSubjects.length > 0 && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-extrabold text-slate-900 text-sm">Foco Rápido por Matéria</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('studies')}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                  >
                    Gerenciar Matérias →
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {uniqueSubjects.slice(0, 6).map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => prepareTimer('pomodoro', 25, sub.id)}
                      className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-indigo-50/60 hover:border-indigo-200 transition flex items-center justify-between group cursor-pointer text-left active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-3.5 h-3.5 rounded-md shrink-0 shadow-xs"
                          style={{ backgroundColor: sub.color }}
                        />
                        <span className="font-bold text-slate-800 text-xs truncate group-hover:text-indigo-900">
                          {sub.name}
                        </span>
                      </div>
                      <div className="p-1.5 rounded-lg bg-white border border-slate-200 group-hover:border-indigo-500 text-indigo-600 transition shrink-0 ml-2 shadow-2xs">
                        <Play className="w-3 h-3 fill-current" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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

        {/* TAB: AGENDA DE COMPROMISSOS */}
        {activeTab === 'agenda' && (
          <AgendaSection />
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

            {/* Calendário de Consistência Anual */}
            <ConsistencyCalendar
              sessions={sessions}
              tasks={tasks}
              dailyGoalMinutes={dailyGoal}
              onStartFocusToday={() => prepareTimer('pomodoro')}
            />

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
        {/* TAB: MAIS MÓDULOS & FERRAMENTAS */}
        {activeTab === 'more' && (
          <div className="space-y-6">
            <header className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Grid className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">Mais Módulos & Ferramentas</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Acesse seus módulos de estudo, agenda, treinos, hábitos e configurações do sistema.
                  </p>
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Estudos & Faculdade */}
              <button
                onClick={() => setActiveTab('studies')}
                className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:border-indigo-300 hover:shadow-md transition text-left group cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition">
                      Estudos & Faculdade
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Matérias, provas, simulador de notas e upload de PDFs
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-indigo-600">
                  <span>{uniqueSubjects.length} matérias ativas</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              {/* Agenda & Compromissos */}
              <button
                onClick={() => setActiveTab('agenda')}
                className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:border-indigo-300 hover:shadow-md transition text-left group cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <CalendarDays className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition">
                      Agenda & Compromissos
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Visualização semanal, eventos e horários
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-indigo-600">
                  <span>Ver calendário</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              {/* Academia & Frequência */}
              <button
                onClick={() => setActiveTab('gym')}
                className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:border-indigo-300 hover:shadow-md transition text-left group cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <Dumbbell className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition">
                      Academia & Treinos
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Registro de presença diária e histórico de treinos
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-indigo-600">
                  <span>{gymWorkouts.length} treinos registrados</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              {/* Rastreador de Hábitos */}
              <button
                onClick={() => setActiveTab('habits')}
                className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:border-indigo-300 hover:shadow-md transition text-left group cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <CheckSquare className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition">
                      Rastreador de Hábitos
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Criar novos hábitos, metas numéricas e rotinas
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-indigo-600">
                  <span>{habits.filter(h => !h.isArchived).length} hábitos ativos</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              {/* Câmara de Foco Completa */}
              <button
                onClick={() => setActiveTab('focus')}
                className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:border-indigo-300 hover:shadow-md transition text-left group cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition">
                      Câmara de Foco Completa
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Pomodoro, Deep Work, 5 minutos e modo livre
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-indigo-600">
                  <span>{timerState.status === 'running' ? '⚡ Cronômetro ativo' : 'Configurar sessão'}</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              {/* Relatório Semanal Completo */}
              <button
                onClick={() => setActiveTab('weekly_report')}
                className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:border-indigo-300 hover:shadow-md transition text-left group cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition">
                      Relatório Semanal
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Comparativos de estudos, finanças e metas
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-indigo-600">
                  <span>Ver análise</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>

              {/* Cofre de Dados & Configurações */}
              <button
                onClick={() => setActiveTab('settings')}
                className="p-5 bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:border-indigo-300 hover:shadow-md transition text-left group cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <Shield className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition">
                      Cofre de Dados & Configurações
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Backup JSON, restauração, metas e notificações
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-indigo-600">
                  <span>Gerenciar cofre</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Navegação Inferior Mobile — 4 Botões Grandes, Ergonômicos & Sem Rolagem */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 z-50 py-2 px-3 shadow-lg">
        <div className="grid grid-cols-4 gap-1.5 max-w-md mx-auto">
          {[
            { id: 'home' as const, label: 'Hoje', icon: Layers, activeColor: 'text-indigo-600 bg-indigo-50/90 border-indigo-200 shadow-xs' },
            { id: 'finance' as const, label: 'Finanças', icon: Wallet, activeColor: 'text-emerald-600 bg-emerald-50/90 border-emerald-200 shadow-xs' },
            { id: 'progress' as const, label: 'Progresso', icon: Trophy, activeColor: 'text-amber-600 bg-amber-50/90 border-amber-200 shadow-xs' },
            { id: 'more' as const, label: 'Mais', icon: Grid, activeColor: 'text-indigo-600 bg-indigo-50/90 border-indigo-200 shadow-xs' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === 'more' ? (activeTab === 'more' || isMoreSubTab) : activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border transition-all active:scale-95 cursor-pointer ${
                  isActive
                    ? `${tab.activeColor} font-black`
                    : 'border-transparent text-slate-400 hover:text-slate-600 font-bold hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? '' : 'text-slate-400'}`} />
                <span className="text-[11px] mt-0.5 tracking-tight font-bold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
export default App;
