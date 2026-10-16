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
  GraduationCap,
  FileUp,
  FileText,
  Bell,
  BellRing,
  RotateCcw,
  Calculator,
  Clock,
  MapPin,
  User,
  CalendarDays,
  Loader2,
  Sparkles,
  Dumbbell,
  CheckSquare,
  Wallet,
} from 'lucide-react';

import { HabitsCard } from './components/HabitsCard';
import { HabitsSection } from './components/HabitsSection';
import { FinanceSection } from './components/FinanceSection';
import { WeeklyReportCard } from './components/WeeklyReportCard';
import { WeeklyReportSection } from './components/WeeklyReportSection';
import { getHabitLogForDate, getHabitStatusForDate } from './lib/habitEngine';
import { GymSection } from './components/GymSection';
import { db, seedInitialData } from './lib/db';
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
import { parseStudyDocument, getMauaDefaultData, type ParsedDocumentResult } from './lib/documentParser';
import {
  normalizeSubjectName,
  deduplicateSubjectsList,
  cleanAndDeduplicateDatabaseSubjects,
  remapImportedSubjectsWithExisting,
} from './lib/subjectEngine';
import { extractTextFromPDF } from './lib/pdfParser';
import { extractTextFromImage } from './lib/ocrParser';
import { parseWithFreeLLM } from './lib/freellmClient';
import {
  requestNotificationPermission,
  sendLocalNotification,
  getNotificationPermissionStatus,
} from './lib/notificationEngine';
import {
  calculateGradeSimulation,
  createDefaultGradeConfig,
} from './lib/gradeCalculator';
import type {
  SessionMode,
  StudySession,
  WeeklyReview,
  SubjectGradeConfig,
  Assessment,
  Subject,
} from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'focus' | 'college' | 'gym' | 'habits' | 'finance' | 'weekly_report' | 'progress' | 'settings'>('home');
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
  const collegeClasses = useLiveQuery(() => db.collegeClasses.toArray()) || [];
  const subjectGrades = useLiveQuery(() => db.subjectGrades.toArray()) || [];

  // Consultas Reativas da Seção Academia
  const gymExercises = useLiveQuery(() => db.gymExercises.toArray()) || [];
  const gymRoutines = useLiveQuery(() => db.gymRoutines.toArray()) || [];
  const gymWorkouts = useLiveQuery(() => db.gymWorkouts.toArray()) || [];
  const gymMeasurements = useLiveQuery(() => db.gymMeasurements.toArray()) || [];
  const gymPreferences = useLiveQuery(() => db.gymPreferences.get('gym_preferences'));

  // Consultas Reativas do Rastreador de Hábitos
  const habits = useLiveQuery(() => db.habits.toArray()) || [];
  const habitLogs = useLiveQuery(() => db.habitLogs.toArray()) || [];

  // Sub-abas e modais do Portal da Faculdade
  const [collegeSubTab, setCollegeSubTab] = useState<'disciplines' | 'timetable' | 'import'>('disciplines');
  const [activeGradeSubjectId, setActiveGradeSubjectId] = useState<string | null>(null);
  const [selectedTimetableDay, setSelectedTimetableDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 ? 1 : Math.min(6, d);
  });
  const [showAddClassForm, setShowAddClassForm] = useState(false);

  // Estados de importação inteligente (PDF, OCR, Texto, FreeLLM)
  const [isImporting, setIsImporting] = useState(false);
  const [importStatusMessage, setImportStatusMessage] = useState<string>('');
  const [pastedText, setPastedText] = useState('');
  const [pendingImportResult, setPendingImportResult] = useState<ParsedDocumentResult | null>(null);
  const [editableImportText, setEditableImportText] = useState<string>('');

  // Data local no formato YYYY-MM-DD
  const todayStr = formatDateToLocalYYYYMMDD(new Date());

  // Estado de Notificações Mobile
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [notifiedSessionStart, setNotifiedSessionStart] = useState<number | null>(null);

  // Inicialização das sementes e saneamento de duplicatas
  useEffect(() => {
    (async () => {
      await seedInitialData();
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

  const handleLoadMauaData = async () => {
    try {
      const data = getMauaDefaultData();
      const existing = await db.subjects.toArray();
      const parsedMock: ParsedDocumentResult = {
        detectedType: 'timetable',
        createdSubjects: data.subjects,
        createdClassSchedules: data.classes,
        createdTasks: [],
        createdTracks: data.tracks,
        summary: 'Mauá',
      };
      const remapped = remapImportedSubjectsWithExisting(existing, parsedMock);

      await db.subjects.bulkPut(remapped.createdSubjects);
      const gradeConfigs = remapped.createdSubjects.map((s: Subject) => createDefaultGradeConfig(s.id, 6.0));
      await db.subjectGrades.bulkPut(gradeConfigs);
      if (remapped.createdClassSchedules && remapped.createdClassSchedules.length > 0) {
        await db.collegeClasses.bulkPut(remapped.createdClassSchedules);
      }
      if (remapped.createdTracks.length > 0) {
        await db.learningPaths.bulkPut(remapped.createdTracks);
      }
      await cleanAndDeduplicateDatabaseSubjects();
      triggerVictoryEffect();
      setCollegeSubTab('timetable');
    } catch (err: any) {
      console.error('Falha ao sincronizar dados da Mauá:', err);
      alert(`Erro ao sincronizar dados: ${err.message || err}`);
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
            Quartel General
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
            Câmara de Foco
            {timerState.status === 'running' && (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping ml-auto" />
            )}
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
                      Câmara de Foco Ativa ({timerState.mode})
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
                  Entrar na Câmara
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

        {/* TAB: CÂMARA DE FOCO */}
        {activeTab === 'focus' && (
          <div className="max-w-xl mx-auto space-y-6 text-center">
            <header>
              <h2 className="text-2xl font-black text-slate-900">Câmara de Foco Profundo</h2>
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



        {/* TAB: FACULDADE (MATÉRIAS ACADÊMICAS, NOTAS & GRADE HORÁRIA) */}
        {activeTab === 'college' && (
          <div className="space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-6 h-6 text-indigo-600" />
                  <h2 className="text-2xl font-black text-slate-900">Portal da Faculdade</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Disciplinas acadêmicas, simulador de notas para provas e grade horária semanal de aulas.
                </p>
              </div>

              {/* Sub-navegação do Portal da Faculdade */}
              <div className="inline-flex p-1 bg-slate-200/80 rounded-2xl gap-1 self-start sm:self-auto">
                <button
                  onClick={() => setCollegeSubTab('disciplines')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                    collegeSubTab === 'disciplines'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                  Disciplinas & Notas
                </button>
                <button
                  onClick={() => setCollegeSubTab('timetable')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                    collegeSubTab === 'timetable'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                  Grade Horária
                </button>
                <button
                  onClick={() => setCollegeSubTab('import')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                    collegeSubTab === 'import'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileUp className="w-3.5 h-3.5 text-indigo-600" />
                  Importador
                </button>
              </div>
            </header>

            {/* SUB-ABA 1: DISCIPLINAS & CALCULADORA DE NOTAS */}
            {collegeSubTab === 'disciplines' && (
              <div className="space-y-6">
                {/* Cadastro de Disciplina da Faculdade */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                  <h3 className="font-extrabold text-slate-900 text-sm">Adicionar Disciplina do Semestre</h3>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const name = (form.elements.namedItem('collegeName') as HTMLInputElement).value;
                      const color = (form.elements.namedItem('collegeColor') as HTMLInputElement).value || '#4f46e5';
                      const targetMinutes = Number((form.elements.namedItem('collegeTarget') as HTMLInputElement).value) || 120;
                      const deadline = (form.elements.namedItem('collegeDeadline') as HTMLInputElement).value;

                      if (!name) return;

                      const newSubId = `col-${Date.now()}`;
                      await db.subjects.add({
                        id: newSubId,
                        name,
                        color,
                        priority: 'high',
                        category: 'college',
                        targetMinutesPerWeek: targetMinutes,
                        deadline: deadline || undefined,
                        archived: false,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                      });

                      // Inicializar configuração de notas padrão para a matéria
                      await db.subjectGrades.add(createDefaultGradeConfig(newSubId, 6.0));

                      form.reset();
                      triggerVictoryEffect();
                      alert('Disciplina e simulador de notas criados com sucesso!');
                    }}
                    className="grid grid-cols-1 sm:grid-cols-4 gap-2"
                  >
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <input
                        name="collegeColor"
                        type="color"
                        defaultValue="#4f46e5"
                        className="w-9 h-9 rounded-xl cursor-pointer border-0 bg-transparent p-0"
                        title="Cor da matéria"
                      />
                      <input
                        name="collegeName"
                        placeholder="Nome da disciplina (ex: Cálculo II, Algoritmos, Redes)..."
                        required
                        className="flex-1 text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <input
                        name="collegeDeadline"
                        type="date"
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                        title="Data da Próxima Prova ou Trabalho Final"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        name="collegeTarget"
                        type="number"
                        defaultValue={120}
                        className="w-20 text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-center focus:outline-hidden"
                        title="Meta semanal de minutos"
                      />
                      <button
                        type="submit"
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs p-3 rounded-xl shadow-xs transition active:scale-95"
                      >
                        + Adicionar
                      </button>
                    </div>
                  </form>
                </div>

                {/* Disciplinas Cadastradas com Notas */}
                {(() => {
                  const hasCollege = subjects.some((s) => s.category === 'college');
                  const rawList = hasCollege
                    ? subjects.filter((s) => s.category === 'college')
                    : subjects.filter((s) => !s.category);
                  const collegeDisciplines = deduplicateSubjectsList(rawList);

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900 text-sm">Disciplinas do Semestre & Situação Acadêmica</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 font-medium">
                            {collegeDisciplines.length} disciplinas
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await cleanAndDeduplicateDatabaseSubjects();
                              if (res.mergedCount > 0) {
                                triggerVictoryEffect();
                                alert(`${res.mergedCount} matéria(s) duplicada(s) foram unificadas no banco de dados!`);
                              } else {
                                alert('Nenhuma matéria duplicada encontrada.');
                              }
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition"
                            title="Unificar matérias repetidas"
                          >
                            Unificar Duplicadas
                          </button>
                        </div>
                      </div>

                      {collegeDisciplines.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {collegeDisciplines.map((colSub) => {
                          const collegeTasks = tasks.filter((t) => t.subjectId === colSub.id);
                          const completedTasks = collegeTasks.filter((t) => t.status === 'completed');

                          const gradeConfig =
                            subjectGrades.find((g) => g.subjectId === colSub.id) ||
                            createDefaultGradeConfig(colSub.id);
                          const sim = calculateGradeSimulation(gradeConfig);

                          return (
                            <div
                              key={colSub.id}
                              className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between"
                            >
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-4 h-4 rounded-lg shadow-2xs"
                                      style={{ backgroundColor: colSub.color }}
                                    />
                                    <div>
                                      <h4 className="font-extrabold text-slate-900 text-base">{colSub.name}</h4>
                                      <div className="text-[11px] text-slate-400">
                                        Meta: {colSub.targetMinutesPerWeek}m/sem • {completedTasks.length}/{collegeTasks.length} tarefas
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => prepareTimer('pomodoro', 25, colSub.id)}
                                      className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition"
                                      title="Focar nesta matéria"
                                    >
                                      <Play className="w-3.5 h-3.5 fill-current" />
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (confirm(`Remover disciplina "${colSub.name}"?`)) {
                                          await db.subjects.delete(colSub.id);
                                          const gr = subjectGrades.find((g) => g.subjectId === colSub.id);
                                          if (gr) await db.subjectGrades.delete(gr.id);
                                        }
                                      }}
                                      className="text-slate-300 hover:text-rose-500 p-1 transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {colSub.deadline && (
                                  <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/80 flex items-center justify-between">
                                    <span>Próxima Prova / Entrega:</span>
                                    <span className="font-mono font-bold">{colSub.deadline}</span>
                                  </div>
                                )}

                                {/* Status de Notas & Simulação (Feature 1) */}
                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                      <Calculator className="w-3 h-3 text-indigo-600" />
                                      Cálculo de Média
                                    </span>
                                    {sim.status === 'passed' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                                        APROVADO 🎉
                                      </span>
                                    ) : sim.status === 'danger_exam' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                                        RISCO EXAME ⚠️
                                      </span>
                                    ) : sim.status === 'failed' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                                        REPROVADO ❌
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                                        EM ANDAMENTO 🎯
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-baseline justify-between text-xs">
                                    <span className="text-slate-600 font-medium">Média Atual:</span>
                                    <span className="font-mono font-black text-slate-900">
                                      {sim.currentWeightedAverage !== null
                                        ? `${sim.currentWeightedAverage.toFixed(1)} / 10`
                                        : 'Aguardando notas'}
                                    </span>
                                  </div>

                                  <div className="text-[11px] text-slate-600 leading-tight">
                                    {sim.message}
                                  </div>

                                  <button
                                    onClick={() => setActiveGradeSubjectId(colSub.id)}
                                    className="w-full flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold py-2 rounded-xl text-[11px] transition shadow-2xs active:scale-98"
                                  >
                                    <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                                    Abrir Calculadora & Simulador P1/P2/Exame
                                  </button>
                                </div>
                              </div>

                              {/* Ações Rápidas de Tarefas para a Faculdade */}
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                                <button
                                  onClick={() => {
                                    const title = prompt(`Adicionar trabalho ou estudo para ${colSub.name}:`);
                                    if (title) {
                                      db.tasks.add({
                                        id: `task-${Date.now()}`,
                                        title,
                                        subjectId: colSub.id,
                                        priority: 'high',
                                        estimatedMinutes: 45,
                                        actualStudiedMinutes: 0,
                                        status: 'pending',
                                        createdAt: Date.now(),
                                        updatedAt: Date.now(),
                                      });
                                    }
                                  }}
                                  className="text-indigo-600 font-bold hover:underline"
                                >
                                  + Adicionar Trabalho/Estudo
                                </button>
                                <span className="text-slate-400 text-[11px]">
                                  {collegeTasks.filter((t) => t.status === 'pending').length} pendentes
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-4">
                      <GraduationCap className="w-12 h-12 text-indigo-400 mx-auto" />
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-base">Nenhuma disciplina cadastrada</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                          Adicione suas matérias no formulário acima ou sincronize instantaneamente suas 5 matérias da Mauá.
                        </p>
                      </div>
                      <button
                        onClick={handleLoadMauaData}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-2xl shadow-sm hover:shadow transition active:scale-95"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        ⚡ Carregar Grade Completa da Mauá (5 Matérias)
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
              </div>
            )}

            {/* SUB-ABA 2: GRADE HORÁRIA SEMANAL DE AULAS (Feature 6) */}
            {collegeSubTab === 'timetable' && (
              <div className="space-y-6">
                {/* Seletor de Dia da Semana */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-2xl">
                    {[
                      { day: 1, label: 'Seg' },
                      { day: 2, label: 'Ter' },
                      { day: 3, label: 'Qua' },
                      { day: 4, label: 'Qui' },
                      { day: 5, label: 'Sex' },
                      { day: 6, label: 'Sáb' },
                    ].map((item) => {
                      const countForDay = collegeClasses.filter((c) => c.dayOfWeek === item.day).length;
                      return (
                        <button
                          key={item.day}
                          onClick={() => setSelectedTimetableDay(item.day)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                            selectedTimetableDay === item.day
                              ? 'bg-white text-indigo-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {item.label}
                          {countForDay > 0 && (
                            <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[9px] flex items-center justify-center font-black">
                              {countForDay}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setShowAddClassForm(!showAddClassForm)}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    {showAddClassForm ? 'Fechar Formulário' : 'Adicionar Aula'}
                  </button>
                </div>

                {/* Formulário de Adicionar Aula na Grade */}
                {showAddClassForm && (
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                    <h3 className="font-extrabold text-slate-900 text-sm">Cadastrar Horário de Aula</h3>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const subjectId = (form.elements.namedItem('classSubjectId') as HTMLSelectElement).value;
                        const dayOfWeek = Number((form.elements.namedItem('classDay') as HTMLSelectElement).value) as 1 | 2 | 3 | 4 | 5 | 6;
                        const startTime = (form.elements.namedItem('classStartTime') as HTMLInputElement).value || '19:00';
                        const endTime = (form.elements.namedItem('classEndTime') as HTMLInputElement).value || '20:40';
                        const room = (form.elements.namedItem('classRoom') as HTMLInputElement).value;
                        const professor = (form.elements.namedItem('classProfessor') as HTMLInputElement).value;
                        const notes = (form.elements.namedItem('classNotes') as HTMLInputElement).value;

                        if (!subjectId) {
                          alert('Selecione uma disciplina da faculdade.');
                          return;
                        }

                        await db.collegeClasses.add({
                          id: `class-${Date.now()}`,
                          subjectId,
                          dayOfWeek,
                          startTime,
                          endTime,
                          room: room || undefined,
                          professor: professor || undefined,
                          notes: notes || undefined,
                          createdAt: Date.now(),
                          updatedAt: Date.now(),
                        });

                        form.reset();
                        setShowAddClassForm(false);
                        triggerVictoryEffect();
                        alert('Aula cadastrada na grade com sucesso!');
                      }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
                    >
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Disciplina</label>
                        <select
                          name="classSubjectId"
                          required
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                        >
                          <option value="">Selecione a matéria...</option>
                          {subjects
                            .filter((s) => s.category === 'college')
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Dia da Semana</label>
                        <select
                          name="classDay"
                          defaultValue={selectedTimetableDay}
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                        >
                          <option value={1}>Segunda-feira</option>
                          <option value={2}>Terça-feira</option>
                          <option value={3}>Quarta-feira</option>
                          <option value={4}>Quinta-feira</option>
                          <option value={5}>Sexta-feira</option>
                          <option value={6}>Sábado</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Início</label>
                          <input
                            name="classStartTime"
                            type="time"
                            defaultValue="19:00"
                            className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Término</label>
                          <input
                            name="classEndTime"
                            type="time"
                            defaultValue="20:40"
                            className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Sala / Laboratório</label>
                        <input
                          name="classRoom"
                          placeholder="Ex: Sala 304, Lab 2"
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Professor</label>
                        <input
                          name="classProfessor"
                          placeholder="Ex: Prof. Roberto"
                          className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden"
                        />
                      </div>

                      <div className="flex items-end">
                        <button
                          type="submit"
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-2.5 rounded-xl shadow-xs transition active:scale-95"
                        >
                          Salvar Horário
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Lista de Aulas do Dia Selecionado */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-sm">
                      Aulas de{' '}
                      {selectedTimetableDay === 1
                        ? 'Segunda-feira'
                        : selectedTimetableDay === 2
                        ? 'Terça-feira'
                        : selectedTimetableDay === 3
                        ? 'Quarta-feira'
                        : selectedTimetableDay === 4
                        ? 'Quinta-feira'
                        : selectedTimetableDay === 5
                        ? 'Sexta-feira'
                        : 'Sábado'}
                    </h3>
                    <span className="text-xs text-slate-400 font-medium">
                      {collegeClasses.filter((c) => c.dayOfWeek === selectedTimetableDay).length} horários
                    </span>
                  </div>

                  {collegeClasses.filter((c) => c.dayOfWeek === selectedTimetableDay).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {collegeClasses
                        .filter((c) => c.dayOfWeek === selectedTimetableDay)
                        .sort((a, b) => a.startTime.localeCompare(b.startTime))
                        .map((cls) => {
                          const sub = subjects.find((s) => s.id === cls.subjectId);

                          return (
                            <div
                              key={cls.id}
                              className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between gap-4"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: sub?.color || '#4f46e5' }}
                                  />
                                  <h4 className="font-extrabold text-slate-900 text-sm">
                                    {sub?.name || 'Disciplina'}
                                  </h4>
                                </div>

                                <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                                  <span className="flex items-center gap-1 font-bold text-slate-700">
                                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                    {cls.startTime} - {cls.endTime}
                                  </span>
                                  {cls.room && (
                                    <span className="flex items-center gap-1 text-slate-600">
                                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                      {cls.room}
                                    </span>
                                  )}
                                </div>

                                {cls.professor && (
                                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                    <User className="w-3 h-3 text-slate-400" />
                                    {cls.professor}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => prepareTimer('pomodoro', 25, cls.subjectId)}
                                  className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-3 py-2 rounded-xl transition"
                                  title="Preparar sessão de estudo para esta matéria"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Estudar
                                </button>
                                <button
                                  onClick={async () => {
                                    if (confirm('Remover esta aula da grade?')) {
                                      await db.collegeClasses.delete(cls.id);
                                    }
                                  }}
                                  className="text-slate-300 hover:text-rose-500 p-1.5 transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-4">
                      <Clock className="w-10 h-10 text-indigo-300 mx-auto" />
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          {collegeClasses.length === 0
                            ? 'Nenhuma aula cadastrada na sua grade'
                            : 'Sem aulas cadastradas neste dia'}
                        </h4>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          {collegeClasses.length === 0
                            ? 'Sincronize instantaneamente sua grade de horários da Mauá ou adicione aulas manualmente.'
                            : 'Clique em "+ Adicionar Aula" acima para preencher sua grade deste dia.'}
                        </p>
                      </div>
                      <button
                        onClick={handleLoadMauaData}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-2xl shadow-sm hover:shadow transition active:scale-95"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300" />
                        ⚡ Carregar Grade Completa da Mauá (10 Aulas)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUB-ABA 3: IMPORTADOR INTELIGENTE MULTI-FORMATO (PDF, OCR, ICS, JSON, CLIPBOARD) */}
            {collegeSubTab === 'import' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-indigo-50/80 via-white to-amber-50/60 p-6 rounded-3xl border border-indigo-100 shadow-xs space-y-4">
                  <div className="flex items-center gap-2">
                    <FileUp className="w-5 h-5 text-indigo-600" />
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm">
                        Central de Importação Acadêmica Inteligente
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Extraia matérias, datas de provas e trilhas a partir de PDFs, fotos de lousa, calendários ou texto copiado.
                      </p>
                    </div>
                  </div>

                  {/* Badges de Formatos Suportados */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                      📄 PDF (.pdf)
                    </span>
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                      📷 FOTOS / PRINTS (.png, .jpg, .jpeg)
                    </span>
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                      📅 CALENDÁRIO (.ics)
                    </span>
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                      📊 PLANILHAS (.csv, .tsv)
                    </span>
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-slate-100 text-slate-800 border border-slate-200">
                      📝 TEXTO (.txt, .md, .json)
                    </span>
                  </div>

                  {/* Atalho Rápido Mauá 1-Click */}
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-2xl text-white shadow-xs flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-white/10 rounded-xl">
                        <Sparkles className="w-5 h-5 text-amber-300" />
                      </div>
                      <div>
                        <div className="font-extrabold text-xs">Instituto Mauá de Tecnologia (IMT)</div>
                        <div className="text-[11px] text-indigo-200">
                          Sincronizar as 5 matérias, 10 aulas da grade semanal e salas com 1 clique
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleLoadMauaData}
                      className="px-4 py-2 bg-white text-indigo-700 hover:bg-indigo-50 font-black text-xs rounded-xl shadow-xs transition active:scale-95 shrink-0"
                    >
                      ⚡ Sincronizar Grade Mauá
                    </button>
                  </div>

                  {/* Estado de Processamento Ativo */}
                  {isImporting && (
                    <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl border border-indigo-200 text-indigo-900 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
                      <div className="space-y-0.5">
                        <div className="font-bold">Processando documento no aparelho...</div>
                        <div className="text-[11px] text-indigo-700">{importStatusMessage || 'Aguarde...'}</div>
                      </div>
                    </div>
                  )}

                  {/* Área de Upload de Arquivos */}
                  <div className="pt-2">
                    <label
                      className={`w-full flex flex-col items-center justify-center gap-3 p-8 rounded-3xl border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/30 cursor-pointer transition shadow-2xs ${
                        isImporting ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <FileUp className="w-6 h-6" />
                      </div>
                      <div className="text-center space-y-1">
                        <div className="text-xs font-black text-slate-800">
                          Clique para selecionar ou arraste seu arquivo
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Suporta <strong>.pdf</strong>, <strong>.jpeg/.png</strong>, <strong>.ics</strong>, <strong>.txt</strong>, <strong>.md</strong>, <strong>.csv</strong>, <strong>.tsv</strong>, <strong>.json</strong>
                        </div>
                      </div>

                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.ics,.txt,.md,.csv,.tsv,.json"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;

                          setIsImporting(true);
                          try {
                            const ext = file.name.split('.').pop()?.toLowerCase() || '';

                            if (ext === 'pdf') {
                              setImportStatusMessage('Lendo páginas do documento PDF via Web Worker local...');
                              const buffer = await file.arrayBuffer();
                              const pdfText = await extractTextFromPDF(buffer);
                              setImportStatusMessage('Extraindo matérias e datas de provas...');
                              const result = parseStudyDocument(pdfText, file.name);
                              setPendingImportResult(result);
                              setEditableImportText(result.rawText || pdfText);
                            } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
                              setImportStatusMessage('Inicializando OCR WebAssembly no navegador...');
                              let ocrText = '';
                              try {
                                ocrText = await extractTextFromImage(file, (p, status) => {
                                  setImportStatusMessage(`OCR WebAssembly: ${status} (${p}%)`);
                                });
                              } catch (err) {
                                console.warn('Falha no OCR local:', err);
                              }

                              // Se OCR falhou ou retornou pouco texto, tentar FreeLLMAPI local
                              if (!ocrText || ocrText.trim().length < 15) {
                                setImportStatusMessage('Testando IA Local (FreeLLMAPI)...');
                                try {
                                  const reader = new FileReader();
                                  const base64Promise = new Promise<string>((res) => {
                                    reader.onload = () => res(reader.result as string);
                                    reader.readAsDataURL(file);
                                  });
                                  const b64 = await base64Promise;
                                  const aiRes = await parseWithFreeLLM({ imageBase64: b64 });
                                  if (aiRes && (aiRes.createdSubjects.length > 0 || aiRes.createdTasks.length > 0)) {
                                    setPendingImportResult(aiRes);
                                    setEditableImportText(aiRes.rawText || JSON.stringify(aiRes, null, 2));
                                    return;
                                  }
                                } catch (e) {
                                  console.warn('FreeLLM indisponível:', e);
                                }
                              }

                              setImportStatusMessage('Organizando dados reconhecidos...');
                              const result = parseStudyDocument(ocrText, file.name);
                              setPendingImportResult(result);
                              setEditableImportText(result.rawText || ocrText);
                            } else {
                              // Texto, MD, CSV, TSV, JSON, ICS
                              setImportStatusMessage('Lendo arquivo de dados...');
                              const text = await file.text();
                              const result = parseStudyDocument(text, file.name);
                              setPendingImportResult(result);
                              setEditableImportText(result.rawText || text);
                            }
                          } catch (err: any) {
                            alert(`Falha na importação: ${err.message || err}`);
                          } finally {
                            setIsImporting(false);
                            setImportStatusMessage('');
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Opção 2: Colar Texto Diretamente (Clipboard / Ctrl+V) */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <h4 className="font-extrabold text-slate-900 text-xs">
                        Ou Cole o Texto Diretamente (Sem precisar baixar arquivo)
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-400">Ctrl + V do WhatsApp, Moodle ou PDF</span>
                  </div>

                  <textarea
                    rows={4}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`Cole aqui o texto copiado da sua faculdade. Exemplo:\n# Engenharia de Software\n- P1: 2026-11-10\n- P2: 2026-12-08\n- Padrões de Projeto GoF\n- Arquitetura Hexagonal`}
                    className="w-full text-xs p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 font-mono focus:outline-hidden resize-none"
                  />

                  <div className="flex justify-end">
                    <button
                      disabled={!pastedText.trim() || isImporting}
                      onClick={() => {
                        if (!pastedText.trim()) return;
                        const result = parseStudyDocument(pastedText, 'Texto Colado');
                        setPendingImportResult(result);
                        setEditableImportText(result.rawText || pastedText);
                        setPastedText('');
                      }}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Revisar e Processar Texto
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL: CALCULADORA DE NOTAS & SIMULADOR DE PROVA FINAL (Feature 1) */}
            {activeGradeSubjectId && (() => {
              const activeSub = subjects.find((s) => s.id === activeGradeSubjectId);
              const activeConfig: SubjectGradeConfig =
                subjectGrades.find((g) => g.subjectId === activeGradeSubjectId) ||
                createDefaultGradeConfig(activeGradeSubjectId);
              const activeSim = calculateGradeSimulation(activeConfig);

              return (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="bg-white max-w-lg w-full rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-indigo-600" />
                        <div>
                          <h3 className="font-extrabold text-slate-900 text-base">
                            Simulador de Notas: {activeSub?.name || 'Disciplina'}
                          </h3>
                          <div className="text-[10px] text-slate-400">
                            Configure pesos e notas para prever sua aprovação ou necessidade de exame
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveGradeSubjectId(null)}
                        className="text-slate-400 hover:text-slate-700 font-black text-lg p-1"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Resumo da Simulação em Tempo Real */}
                    <div
                      className={`p-4 rounded-2xl border space-y-2 ${
                        activeSim.status === 'passed'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : activeSim.status === 'danger_exam'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : activeSim.status === 'failed'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                      }`}
                    >
                      <div className="text-xs font-bold leading-relaxed">{activeSim.message}</div>
                      <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                        <div className="bg-white/80 p-2 rounded-xl">
                          <div className="text-[10px] text-slate-500 uppercase">Média Atual</div>
                          <div className="text-sm font-black text-slate-900">
                            {activeSim.currentWeightedAverage !== null
                              ? activeSim.currentWeightedAverage.toFixed(1)
                              : '-'}
                          </div>
                        </div>
                        <div className="bg-white/80 p-2 rounded-xl">
                          <div className="text-[10px] text-slate-500 uppercase">Nota Restante</div>
                          <div className="text-sm font-black text-indigo-700">
                            {activeSim.neededRemainingAverage !== null
                              ? activeSim.neededRemainingAverage.toFixed(1)
                              : '-'}
                          </div>
                        </div>
                        <div className="bg-white/80 p-2 rounded-xl">
                          <div className="text-[10px] text-slate-500 uppercase">Exame Final</div>
                          <div className="text-sm font-black text-amber-700">
                            {activeSim.finalExamNeeded !== null && activeSim.finalExamNeeded !== undefined
                              ? activeSim.finalExamNeeded.toFixed(1)
                              : '0'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Parâmetros de Aprovação */}
                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Média Mínima para Aprovação</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="10"
                          defaultValue={activeConfig.passingGrade}
                          onBlur={async (e) => {
                            const val = Number(e.target.value);
                            if (val > 0) {
                              const updated = { ...activeConfig, passingGrade: val, updatedAt: Date.now() };
                              await db.subjectGrades.put(updated);
                            }
                          }}
                          className="w-full p-2 bg-white rounded-xl border border-slate-200 font-mono font-bold text-center"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Média Mínima pós-Exame</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="10"
                          defaultValue={activeConfig.finalExamPassingGrade || 5.0}
                          onBlur={async (e) => {
                            const val = Number(e.target.value);
                            if (val > 0) {
                              const updated = { ...activeConfig, finalExamPassingGrade: val, updatedAt: Date.now() };
                              await db.subjectGrades.put(updated);
                            }
                          }}
                          className="w-full p-2 bg-white rounded-xl border border-slate-200 font-mono font-bold text-center"
                        />
                      </div>
                    </div>

                    {/* Lista de Avaliações */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-slate-900">Avaliações (Provas e Trabalhos)</span>
                        <span className="text-slate-400 font-mono">
                          Peso total: {activeConfig.assessments.reduce((acc, a) => acc + (a.weight || 0), 0)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {activeConfig.assessments.map((ass, idx) => (
                          <div
                            key={ass.id}
                            className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs"
                          >
                            <input
                              type="text"
                              defaultValue={ass.name}
                              placeholder="Nome da avaliação..."
                              onBlur={async (e) => {
                                const newAssessments = [...activeConfig.assessments];
                                newAssessments[idx] = { ...ass, name: e.target.value };
                                await db.subjectGrades.put({ ...activeConfig, assessments: newAssessments, updatedAt: Date.now() });
                              }}
                              className="flex-1 p-1.5 bg-white rounded-xl border border-slate-200 font-bold"
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 font-bold">Peso:</span>
                              <input
                                type="number"
                                min="1"
                                max="100"
                                defaultValue={ass.weight}
                                onBlur={async (e) => {
                                  const val = Number(e.target.value) || 1;
                                  const newAssessments = [...activeConfig.assessments];
                                  newAssessments[idx] = { ...ass, weight: val };
                                  await db.subjectGrades.put({ ...activeConfig, assessments: newAssessments, updatedAt: Date.now() });
                                }}
                                className="w-12 p-1.5 bg-white rounded-xl border border-slate-200 text-center font-mono font-bold"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 font-bold">Nota:</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="10"
                                defaultValue={typeof ass.score === 'number' ? ass.score : ''}
                                placeholder="Pendente"
                                onBlur={async (e) => {
                                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                                  const newAssessments = [...activeConfig.assessments];
                                  newAssessments[idx] = { ...ass, score: val };
                                  await db.subjectGrades.put({ ...activeConfig, assessments: newAssessments, updatedAt: Date.now() });
                                }}
                                className="w-16 p-1.5 bg-white rounded-xl border border-slate-200 text-center font-mono font-black"
                              />
                            </div>
                            <button
                              onClick={async () => {
                                if (activeConfig.assessments.length <= 1) {
                                  alert('A disciplina precisa de pelo menos 1 avaliação.');
                                  return;
                                }
                                const newAssessments = activeConfig.assessments.filter((_, i) => i !== idx);
                                await db.subjectGrades.put({ ...activeConfig, assessments: newAssessments, updatedAt: Date.now() });
                              }}
                              className="text-slate-300 hover:text-rose-500 p-1"
                              title="Remover avaliação"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={async () => {
                          const newAssessments: Assessment[] = [
                            ...activeConfig.assessments,
                            { id: `ass-${Date.now()}`, name: `Avaliação ${activeConfig.assessments.length + 1}`, weight: 2 },
                          ];
                          await db.subjectGrades.put({ ...activeConfig, assessments: newAssessments, updatedAt: Date.now() });
                        }}
                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                      >
                        + Adicionar Prova ou Trabalho
                      </button>
                    </div>

                    <button
                      onClick={() => setActiveGradeSubjectId(null)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl transition shadow-xs text-xs active:scale-98"
                    >
                      Concluir e Salvar Simulação
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* MODAL: REVISÃO E CONFIRMAÇÃO DE IMPORTAÇÃO (OCR / PDF / DOCUMENTOS) */}
            {pendingImportResult && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white max-w-2xl w-full rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[92vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-base">
                          Revisão de Importação Inteligente
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Confira os dados detectados e ajuste o texto se o OCR da foto cometeu algum erro de leitura.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPendingImportResult(null)}
                      className="text-slate-400 hover:text-slate-700 font-black text-lg p-1.5 rounded-lg hover:bg-slate-100 transition"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Resumo Rápido em Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-center">
                    <div className="bg-indigo-50/70 border border-indigo-100 p-2.5 rounded-2xl">
                      <div className="text-[10px] text-indigo-600 font-bold uppercase">Disciplinas</div>
                      <div className="text-lg font-black text-indigo-900">
                        {pendingImportResult.createdSubjects.length}
                      </div>
                    </div>
                    <div className="bg-cyan-50/70 border border-cyan-100 p-2.5 rounded-2xl">
                      <div className="text-[10px] text-cyan-600 font-bold uppercase">Aulas na Grade</div>
                      <div className="text-lg font-black text-cyan-900">
                        {pendingImportResult.createdClassSchedules?.length || 0}
                      </div>
                    </div>
                    <div className="bg-amber-50/70 border border-amber-100 p-2.5 rounded-2xl">
                      <div className="text-[10px] text-amber-600 font-bold uppercase">Provas / Prazos</div>
                      <div className="text-lg font-black text-amber-900">
                        {pendingImportResult.createdTasks.length}
                      </div>
                    </div>
                    <div className="bg-emerald-50/70 border border-emerald-100 p-2.5 rounded-2xl">
                      <div className="text-[10px] text-emerald-600 font-bold uppercase">Trilhas / Ementas</div>
                      <div className="text-lg font-black text-emerald-900">
                        {pendingImportResult.createdTracks.length}
                      </div>
                    </div>
                  </div>

                  {/* Editor do Texto Extraído pelo OCR / Documento */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        Texto Reconhecido pelo Scanner / OCR (Editável):
                      </label>
                      <button
                        onClick={() => {
                          const reprocessed = parseStudyDocument(
                            editableImportText,
                            pendingImportResult.createdSubjects[0]?.name || 'documento.txt'
                          );
                          setPendingImportResult(reprocessed);
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reprocessar Texto
                      </button>
                    </div>
                    <textarea
                      rows={6}
                      value={editableImportText}
                      onChange={(e) => setEditableImportText(e.target.value)}
                      placeholder="Texto extraído pelo scanner..."
                      className="w-full text-xs p-3.5 rounded-2xl border border-slate-200 bg-slate-50 font-mono text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden resize-y"
                    />
                    <div className="text-[10px] text-slate-400 leading-tight">
                      💡 <b>Dica:</b> Se o scanner da foto confundiu algum número de data (ex: 15/11 ou 2026-11-15) ou cortou o nome da disciplina, você pode digitar ou corrigir no campo acima e clicar em <b>Reprocessar Texto</b>.
                    </div>
                  </div>

                  {/* Prévia dos Dados Extraídos */}
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      O que será cadastrado no FocusUp:
                    </h4>

                    {pendingImportResult.createdSubjects.length === 0 &&
                      pendingImportResult.createdTasks.length === 0 &&
                      (!pendingImportResult.createdClassSchedules || pendingImportResult.createdClassSchedules.length === 0) && (
                        <div className="p-4 rounded-2xl bg-slate-50 text-slate-500 text-xs text-center border border-dashed border-slate-200">
                          Nenhuma matéria ou data de prova foi detectada automaticamente. Adicione no texto acima uma matéria e datas (ex: <code>Cálculo II | P1 | 15/11</code>) e clique em <b>Reprocessar Texto</b>.
                        </div>
                      )}

                    {/* Matérias Detectadas */}
                    {pendingImportResult.createdSubjects.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-600">
                          Disciplinas ({pendingImportResult.createdSubjects.length}):
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pendingImportResult.createdSubjects.map((s, idx) => (
                            <div
                              key={s.id || idx}
                              className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800 border border-slate-200"
                            >
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                              <span>{s.name}</span>
                              {s.deadline && (
                                <span className="text-[10px] text-indigo-600 font-mono bg-white px-1.5 py-0.5 rounded-md border border-slate-200">
                                  {s.deadline}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Aulas da Grade Semanal Detectadas */}
                    {pendingImportResult.createdClassSchedules && pendingImportResult.createdClassSchedules.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-600">
                          Horários da Grade Semanal ({pendingImportResult.createdClassSchedules.length} aulas):
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1 pr-1 text-xs">
                          {pendingImportResult.createdClassSchedules.map((cs, idx) => {
                            const sub = pendingImportResult.createdSubjects.find((s) => s.id === cs.subjectId);
                            const dayName = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][cs.dayOfWeek] || 'Dia';
                            return (
                              <div
                                key={cs.id || idx}
                                className="flex items-center justify-between bg-cyan-50/70 border border-cyan-200/70 px-2.5 py-1.5 rounded-xl"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="font-mono text-[10px] font-bold bg-white text-cyan-800 px-1.5 py-0.5 rounded border border-cyan-100">
                                    {dayName} {cs.startTime} - {cs.endTime}
                                  </span>
                                  <span className="font-bold text-slate-800 truncate">{sub?.name || 'Disciplina'}</span>
                                </div>
                                {cs.room && (
                                  <span className="text-[10px] text-cyan-700 font-mono shrink-0 pl-1">{cs.room}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Provas e Prazos Detectados */}
                    {pendingImportResult.createdTasks.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-600">
                          Provas e Entregas ({pendingImportResult.createdTasks.length}):
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                          {pendingImportResult.createdTasks.map((t, idx) => (
                            <div
                              key={t.id || idx}
                              className="flex items-center justify-between bg-amber-50/60 border border-amber-200/60 p-2.5 rounded-xl text-xs"
                            >
                              <span className="font-bold text-slate-800 truncate pr-2">{t.title}</span>
                              <span className="font-mono text-[10px] font-black text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md shrink-0">
                                {t.dueDate || 'Sem data'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Trilhas Detectadas */}
                    {pendingImportResult.createdTracks.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-600">
                          Trilhas de Conteúdo ({pendingImportResult.createdTracks.length}):
                        </div>
                        <div className="space-y-1 text-xs">
                          {pendingImportResult.createdTracks.map((tr, idx) => (
                            <div key={tr.id || idx} className="p-2 bg-emerald-50/60 border border-emerald-200/60 rounded-xl">
                              <div className="font-bold text-emerald-900">{tr.title}</div>
                              <div className="text-[10px] text-emerald-700">
                                {tr.modules[0]?.items?.length || 0} tópico(s) identificado(s) na ementa
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ações Finais */}
                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setPendingImportResult(null)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                    >
                      Descartar
                    </button>
                    <button
                      disabled={
                        pendingImportResult.createdSubjects.length === 0 &&
                        pendingImportResult.createdTasks.length === 0 &&
                        (!pendingImportResult.createdClassSchedules || pendingImportResult.createdClassSchedules.length === 0)
                      }
                      onClick={async () => {
                        try {
                          const existingSubs = await db.subjects.toArray();
                          const remapped = remapImportedSubjectsWithExisting(existingSubs, pendingImportResult);

                          if (remapped.createdSubjects.length > 0) {
                            const subsToSave = remapped.createdSubjects.map((s: Subject) => ({
                              ...s,
                              category: 'college' as const,
                              archived: false,
                            }));
                            await db.subjects.bulkPut(subsToSave);

                            const gradeConfigs = subsToSave.map((s: Subject) => createDefaultGradeConfig(s.id, 6.0));
                            await db.subjectGrades.bulkPut(gradeConfigs);
                          }
                          if (remapped.createdClassSchedules && remapped.createdClassSchedules.length > 0) {
                            await db.collegeClasses.bulkPut(remapped.createdClassSchedules);
                          }
                          if (remapped.createdTasks.length > 0) {
                            await db.tasks.bulkPut(remapped.createdTasks);
                          }
                          if (remapped.createdTracks.length > 0) {
                            await db.learningPaths.bulkPut(remapped.createdTracks);
                          }

                          await cleanAndDeduplicateDatabaseSubjects();

                          triggerVictoryEffect();
                          const targetTab =
                            remapped.createdClassSchedules && remapped.createdClassSchedules.length > 0
                              ? 'timetable'
                              : 'disciplines';
                          setPendingImportResult(null);
                          setCollegeSubTab(targetTab);
                        } catch (err: any) {
                          console.error('Falha ao salvar no banco Dexie:', err);
                          alert(`Erro ao cadastrar dados: ${err.message || err}`);
                        }
                      }}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar e Salvar no FocusUp
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
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

      {/* Navegação Inferior Mobile — Espaçosa, Touch-Friendly & Rolagem Suave */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 z-50 py-2.5 px-2 shadow-lg">
        <div
          ref={mobileNavRef}
          className="flex items-center gap-2 overflow-x-auto scrollbar-none px-2 py-0.5"
        >
          {[
            { id: 'home' as const, label: 'QG', icon: Layers, activeColor: 'text-indigo-600 bg-indigo-50/90 border-indigo-200 shadow-xs' },
            { id: 'focus' as const, label: 'Foco', icon: Zap, activeColor: 'text-amber-600 bg-amber-50/90 border-amber-200 shadow-xs' },
            { id: 'gym' as const, label: 'Treino', icon: Dumbbell, activeColor: 'text-rose-600 bg-rose-50/90 border-rose-200 shadow-xs' },
            { id: 'habits' as const, label: 'Hábitos', icon: CheckSquare, activeColor: 'text-emerald-600 bg-emerald-50/90 border-emerald-200 shadow-xs' },
            { id: 'finance' as const, label: 'Finanças', icon: Wallet, activeColor: 'text-emerald-600 bg-emerald-50/90 border-emerald-200 shadow-xs' },
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
                className={`flex flex-col items-center justify-center min-w-[70px] px-3 py-1.5 rounded-2xl border transition-all active:scale-95 shrink-0 ${
                  isActive
                    ? `${tab.activeColor} font-black`
                    : 'border-transparent text-slate-400 hover:text-slate-600 font-bold hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? '' : 'text-slate-400'}`} />
                <span className="text-[11px] mt-0.5 tracking-tight whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
export default App;
