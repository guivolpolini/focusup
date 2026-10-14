import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import {
  Play,
  Pause,
  CheckCircle2,
  Calendar,
  Layers,
  BookOpen,
  BrainCircuit,
  Award,
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
  Star,
  Settings2,
  Plus,
  GraduationCap,
  FileUp,
  FileText,
  Bell,
  BellRing,
  RotateCcw,
} from 'lucide-react';

import { db, seedInitialData } from './lib/db';
import {
  type ActiveTimerState,
  calculateTimerProgress,
  loadTimerState,
  saveTimerState,
  clearTimerState,
} from './lib/timerEngine';
import { calculateNextSRSReview, formatDateToLocalYYYYMMDD } from './lib/srsEngine';
import { generateWeeklySchedule, type SchedulerOutput } from './lib/schedulerEngine';
import {
  exportAllData,
  validateBackupString,
  restoreByReplacement,
  restoreByMerge,
} from './lib/backupEngine';
import { calculateGamification } from './lib/gamification';
import { generateWeeklyReviewAnalysis } from './lib/weeklyReviewEngine';
import { parseStudyDocument } from './lib/documentParser';
import {
  requestNotificationPermission,
  sendLocalNotification,
  getNotificationPermissionStatus,
} from './lib/notificationEngine';
import type { SessionMode, StudySession, WeeklyReview } from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'focus' | 'tracks' | 'college' | 'schedule' | 'progress' | 'flashcards' | 'career' | 'settings'>('home');
  const [now, setNow] = useState(Date.now());
  const [currentReview, setCurrentReview] = useState<WeeklyReview | null>(null);
  const [currentSchedule, setCurrentSchedule] = useState<SchedulerOutput | null>(null);

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
  const subjects = useLiveQuery(() => db.subjects.where('archived').equals(0).toArray()) || [];
  const tasks = useLiveQuery(() => db.tasks.toArray()) || [];
  const flashcards = useLiveQuery(() => db.flashcards.where('archived').equals(0).toArray()) || [];
  const learningPaths = useLiveQuery(() => db.learningPaths.where('archived').equals(0).toArray()) || [];
  const sessions = useLiveQuery(() => db.studySessions.toArray()) || [];
  const preferences = useLiveQuery(() => db.preferences.get('user_preferences'));
  const projects = useLiveQuery(() => db.portfolioProjects.toArray()) || [];

  // Flashcards para revisão hoje
  const todayStr = formatDateToLocalYYYYMMDD(new Date());
  const dueFlashcards = flashcards.filter((f) => f.nextReviewDate <= todayStr);

  // Estado de Notificações Mobile
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [notifiedSessionStart, setNotifiedSessionStart] = useState<number | null>(null);

  // Inicialização das sementes
  useEffect(() => {
    seedInitialData();
    setNotifPermission(getNotificationPermissionStatus());
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
  const startTimer = (mode: SessionMode = 'pomodoro', customMinutes?: number, subjectId?: string, taskId?: string) => {
    let minutes = 25;
    if (mode === 'deep_work') minutes = 50;
    if (mode === 'five_min') minutes = 5;
    if (mode === 'custom' && customMinutes) minutes = customMinutes;

    const newState: ActiveTimerState = {
      status: 'running',
      mode,
      plannedMinutes: minutes,
      startedAt: Date.now(),
      accumulatedPausedMs: 0,
      subjectId: subjectId || timerState.subjectId,
      taskId: taskId || timerState.taskId,
      isBreak: false,
    };
    setTimerState(newState);
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
      status: 'running',
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

  // Sequência Real de Dias (Streak)
  const studyDates = Array.from(
    new Set(
      sessions
        .filter((s) => s.status === 'completed' && s.actualDurationSeconds >= 60)
        .map((s) => formatDateToLocalYYYYMMDD(new Date(s.startedAt)))
    )
  ).sort().reverse();

  let streak = 0;
  let checkDate = new Date();
  for (let i = 0; i < 365; i++) {
    const dStr = formatDateToLocalYYYYMMDD(checkDate);
    if (studyDates.includes(dStr)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (i === 0) {
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Estatísticas de Gamificação (XP & Rank)
  const totalStudiedSecondsAllTime = sessions.reduce((acc, s) => acc + s.actualDurationSeconds, 0);
  const totalFlashcardReviews = flashcards.reduce((acc, f) => acc + f.reviewsCount, 0);
  const gameStats = calculateGamification(
    totalStudiedSecondsAllTime,
    sessions.length,
    totalFlashcardReviews,
    streak
  );

  // Estado para revisão de flashcards
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const handleSRSGrade = async (grade: 'hard' | 'medium' | 'easy') => {
    const card = dueFlashcards[reviewIndex];
    if (!card) return;

    const result = calculateNextSRSReview(
      grade,
      card.repetitions,
      card.intervalDays,
      card.easeFactor,
      new Date()
    );

    await db.flashcards.update(card.id, {
      ...result,
      lastReviewedAt: Date.now(),
      reviewsCount: card.reviewsCount + 1,
      updatedAt: Date.now(),
    });

    setShowAnswer(false);
    // Como a lista reativa do Dexie já remove o cartão após o update, o próximo cartão naturalmente ocupa o índice atual
    if (reviewIndex >= dueFlashcards.length - 1) {
      setReviewIndex(0);
      triggerVictoryEffect();
      alert('Incrível! Todas as cartas do dia foram dominadas! (+XP adicionado)');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col md:flex-row pb-20 md:pb-0 selection:bg-indigo-100 selection:text-indigo-900">
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
            <p className="text-xs text-slate-500 font-medium">Arena do Conhecimento</p>
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
            onClick={() => setActiveTab('tracks')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'tracks'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            Trilhas & Missões
          </button>
          <button
            onClick={() => setActiveTab('college')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'college'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <GraduationCap className="w-5 h-5 text-indigo-500" />
            Faculdade
          </button>
          <button
            onClick={() => setActiveTab('flashcards')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'flashcards'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <BrainCircuit className="w-5 h-5 text-indigo-500" />
            Batalha de Flashcards
            {dueFlashcards.length > 0 && (
              <span className="ml-auto bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-black animate-bounce shadow-xs">
                {dueFlashcards.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'schedule'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-5 h-5" />
            Estratégia Semanal
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
          <button
            onClick={() => setActiveTab('career')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition ${
              activeTab === 'career'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Award className="w-5 h-5 text-emerald-500" />
            Arsenal de Projetos
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
                onClick={() => startTimer('pomodoro')}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-2xl shadow-sm transition active:scale-95 text-sm"
              >
                <Zap className="w-4 h-4 fill-amber-300 text-amber-300" />
                Iniciar Batalha de Foco (25m)
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revisões no Deck</span>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">{dueFlashcards.length}</span>
                  <span className="text-xs text-slate-400 font-bold">cartões</span>
                </div>
                {dueFlashcards.length > 0 ? (
                  <button
                    onClick={() => setActiveTab('flashcards')}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 mt-2 inline-flex items-center gap-1"
                  >
                    Batalhar agora <ChevronRight className="w-3 h-3" />
                  </button>
                ) : (
                  <p className="text-[10px] text-emerald-600 font-bold mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Deck dominado!
                  </p>
                )}
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

            {/* Árvore de Matérias */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Swords className="w-5 h-5 text-amber-500" /> Árvore de Matérias
                </h3>
                <span className="text-xs text-slate-400 font-medium">{subjects.length} matérias ativas</span>
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
                {subjects.map((sub) => (
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
                        onClick={() => startTimer('pomodoro', 25, sub.id)}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-indigo-600 transition active:scale-95 shadow-xs"
                        title="Ativar foco nesta matéria"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Deseja remover a matéria "${sub.name}"?`)) {
                            await db.subjects.delete(sub.id);
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

            {/* Missões e Tarefas Pendentes */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-base">Missões & Tarefas da Semana</h3>
                <span className="text-xs text-slate-400 font-medium">
                  {tasks.filter((t) => t.status === 'completed').length}/{tasks.length} concluídas
                </span>
              </div>

              {/* Formulário Rápido de Criação de Tarefas */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const title = (form.elements.namedItem('taskTitle') as HTMLInputElement).value;
                  const subjectId = (form.elements.namedItem('taskSubjectId') as HTMLSelectElement).value;
                  const estMinutes = Number((form.elements.namedItem('taskMinutes') as HTMLInputElement).value) || 30;

                  if (!title) return;

                  await db.tasks.add({
                    id: `task-${Date.now()}`,
                    title,
                    subjectId,
                    priority: 'high',
                    estimatedMinutes: estMinutes,
                    actualStudiedMinutes: 0,
                    status: 'pending',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  });

                  form.reset();
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  name="taskTitle"
                  placeholder="Nova tarefa ou missão técnica..."
                  required
                  className="flex-1 text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
                <select
                  name="taskSubjectId"
                  className="text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  name="taskMinutes"
                  type="number"
                  defaultValue={30}
                  className="w-20 text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-center focus:outline-hidden"
                  title="Minutos estimados"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-3 rounded-xl shadow-xs transition active:scale-95"
                >
                  + Criar Missão
                </button>
              </form>

              {/* Lista de Tarefas */}
              <div className="space-y-2 pt-2">
                {tasks.length > 0 ? (
                  tasks.slice(0, 5).map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={async () => {
                            const newStatus = t.status === 'completed' ? 'pending' : 'completed';
                            await db.tasks.update(t.id, {
                              status: newStatus,
                              completedAt: newStatus === 'completed' ? Date.now() : undefined,
                              updatedAt: Date.now(),
                            });
                            if (newStatus === 'completed') triggerVictoryEffect();
                          }}
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center transition ${
                            t.status === 'completed'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 hover:border-indigo-500'
                          }`}
                        >
                          {t.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                        <div>
                          <div
                            className={`text-xs font-bold ${
                              t.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {t.title}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Estimado: {t.estimatedMinutes}m • Estudado: {t.actualStudiedMinutes}m
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.status !== 'completed' && (
                          <button
                            onClick={() => startTimer('pomodoro', 25, t.subjectId, t.id)}
                            className="text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition"
                          >
                            Focar
                          </button>
                        )}
                        <button
                          onClick={() => db.tasks.delete(t.id)}
                          className="text-slate-400 hover:text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">Nenhuma tarefa criada ainda.</p>
                )}
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
                onClick={() => startTimer('pomodoro', 25)}
                disabled={timerState.status === 'running'}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  timerState.mode === 'pomodoro' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Pomodoro (25m)
              </button>
              <button
                onClick={() => startTimer('deep_work', 50)}
                disabled={timerState.status === 'running'}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  timerState.mode === 'deep_work' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                Deep Work (50m)
              </button>
              <button
                onClick={() => startTimer('five_min', 5)}
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

        {/* TAB: BATALHA DE FLASHCARDS */}
        {activeTab === 'flashcards' && (
          <div className="max-w-xl mx-auto space-y-6">
            <header className="text-center">
              <h2 className="text-2xl font-black text-slate-900">Arena de Flashcards (SRS)</h2>
              <p className="text-xs text-slate-500 mt-1">
                Derrote os cartões pendentes para consolidar o conhecimento na memória de longo prazo.
              </p>
            </header>

            {dueFlashcards.length > 0 ? (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6 text-center">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-200">
                    Carta {reviewIndex + 1} de {dueFlashcards.length}
                  </span>
                  <span className="text-amber-500 flex items-center gap-1 font-mono font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-400" /> +5 XP
                  </span>
                </div>

                <div className="min-h-40 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-xl font-black text-slate-900">
                    {dueFlashcards[reviewIndex]?.front}
                  </p>

                  {showAnswer && (
                    <div className="mt-5 pt-5 border-t border-slate-200 text-indigo-700 font-semibold animate-in fade-in text-base">
                      {dueFlashcards[reviewIndex]?.back}
                    </div>
                  )}
                </div>

                {!showAnswer ? (
                  <button
                    onClick={() => setShowAnswer(true)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-3.5 rounded-2xl transition shadow-sm active:scale-98"
                  >
                    Virar Carta (Revelar Resposta)
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => handleSRSGrade('hard')}
                      className="p-3.5 rounded-2xl bg-rose-50 text-rose-700 font-bold border border-rose-200 hover:bg-rose-100 transition text-xs"
                    >
                      Difícil (1d)
                    </button>
                    <button
                      onClick={() => handleSRSGrade('medium')}
                      className="p-3.5 rounded-2xl bg-amber-50 text-amber-700 font-bold border border-amber-200 hover:bg-amber-100 transition text-xs"
                    >
                      Médio (3d+)
                    </button>
                    <button
                      onClick={() => handleSRSGrade('easy')}
                      className="p-3.5 rounded-2xl bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 hover:bg-emerald-100 transition text-xs"
                    >
                      Fácil (Multiplica)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-4">
                <Trophy className="w-14 h-14 text-amber-500 mx-auto" />
                <h3 className="font-black text-xl text-slate-900">Todas as cartas dominadas!</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Seu cérebro consolidou o conteúdo agendado para hoje. Volte amanhã para novas revisões.
                </p>
              </div>
            )}

            {/* Gerenciador / Criação de Novos Flashcards */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-slate-900 text-sm">Criar Nova Carta de Revisão</h3>
                <span className="text-xs text-slate-400 font-medium">{flashcards.length} cartas no deck</span>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const front = (form.elements.namedItem('front') as HTMLInputElement).value;
                  const back = (form.elements.namedItem('back') as HTMLTextAreaElement).value;
                  const subjectId = (form.elements.namedItem('subjectId') as HTMLSelectElement).value;

                  if (!front || !back) return;

                  await db.flashcards.add({
                    id: `fc-${Date.now()}`,
                    front,
                    back,
                    subjectId,
                    easeFactor: 2.5,
                    intervalDays: 1,
                    repetitions: 0,
                    nextReviewDate: formatDateToLocalYYYYMMDD(new Date()),
                    reviewsCount: 0,
                    archived: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  });

                  form.reset();
                  alert('Nova carta adicionada à arena!');
                }}
                className="space-y-3"
              >
                <div>
                  <input
                    name="front"
                    placeholder="Pergunta ou conceito (Frente)"
                    required
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <textarea
                    name="back"
                    placeholder="Resposta explicada (Verso)"
                    rows={2}
                    required
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    name="subjectId"
                    className="text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 flex-1 focus:outline-hidden"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                  >
                    + Adicionar Carta
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB: TRILHAS & MISSÕES */}
        {activeTab === 'tracks' && (
          <div className="space-y-6">
            <header>
              <h2 className="text-2xl font-black text-slate-900">Árvores de Habilidade & Missões</h2>
              <p className="text-xs text-slate-500 mt-1">Conquiste cada módulo para avançar em desenvolvimento de software.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {learningPaths.map((path) => {
                const totalItems = path.modules.reduce((acc, m) => acc + m.items.length, 0);
                const completedItems = path.modules.reduce(
                  (acc, m) => acc + m.items.filter((i) => i.completed).length,
                  0
                );
                const pathProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

                return (
                  <div key={path.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {path.category} • {path.level.toUpperCase()}
                        </span>
                        <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                          {pathProgress}% concluído
                        </span>
                      </div>
                      <h3 className="font-extrabold text-slate-900 text-lg mt-2">{path.title}</h3>
                      <p className="text-xs text-slate-500 mt-1">{path.description}</p>
                      
                      {/* Barra de Progresso da Trilha */}
                      <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pathProgress}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      {path.modules.map((mod) => (
                        <div key={mod.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                          <div className="font-bold text-xs text-slate-800">{mod.title}</div>
                          <div className="space-y-1.5">
                            {mod.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between text-xs p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs"
                              >
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={async () => {
                                      const updatedModules = path.modules.map((m) => {
                                        if (m.id !== mod.id) return m;
                                        return {
                                          ...m,
                                          items: m.items.map((it) => {
                                            if (it.id !== item.id) return it;
                                            return {
                                              ...it,
                                              completed: !it.completed,
                                              completedAt: !it.completed ? Date.now() : undefined,
                                            };
                                          }),
                                        };
                                      });
                                      await db.learningPaths.update(path.id, {
                                        modules: updatedModules,
                                        updatedAt: Date.now(),
                                      });
                                      if (!item.completed) triggerVictoryEffect();
                                    }}
                                    className={`w-4 h-4 rounded-md border flex items-center justify-center transition ${
                                      item.completed
                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : 'border-slate-300 hover:border-indigo-500'
                                    }`}
                                  >
                                    {item.completed && <CheckCircle2 className="w-3 h-3 stroke-[3]" />}
                                  </button>
                                  <span
                                    className={`font-medium ${
                                      item.completed ? 'line-through text-slate-400' : 'text-slate-800'
                                    }`}
                                  >
                                    {item.title}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] uppercase font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                    {item.type}
                                  </span>
                                  {!item.completed && (
                                    <button
                                      onClick={() => startTimer('pomodoro', 25, path.subjectId)}
                                      className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 p-1"
                                      title="Estudar esta aula"
                                    >
                                      <Play className="w-3 h-3 fill-current" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB: FACULDADE (MATÉRIAS ACADÊMICAS & PROVAS) */}
        {activeTab === 'college' && (
          <div className="space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-6 h-6 text-indigo-600" />
                  <h2 className="text-2xl font-black text-slate-900">Portal da Faculdade</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Organize suas disciplinas do semestre, prazos de trabalhos, entregas e sessões de estudo para provas.
                </p>
              </div>
            </header>

            {/* Importador Inteligente de Documentos / Calendário de Provas */}
            <div className="bg-gradient-to-br from-indigo-50/70 via-white to-amber-50/50 p-6 rounded-3xl border border-indigo-100 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Importar Documento de Estudos ou Calendário de Provas
                </h3>
              </div>
              <p className="text-xs text-slate-600">
                Envie um arquivo de texto, markdown ou ementa (`.txt`, `.md`, `.csv`). O FocusUp extrairá automaticamente
                as matérias, datas de provas e tópicos da trilha para organizar sua rotina.
              </p>

              <div className="pt-1">
                <label className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer shadow-xs transition active:scale-95">
                  <FileText className="w-4 h-4" />
                  Selecionar Documento (.txt, .md, .csv)
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.text"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      const result = parseStudyDocument(text, file.name);

                      if (result.createdSubjects.length > 0) {
                        await db.subjects.bulkAdd(result.createdSubjects);
                      }
                      if (result.createdTasks.length > 0) {
                        await db.tasks.bulkAdd(result.createdTasks);
                      }
                      if (result.createdTracks.length > 0) {
                        await db.learningPaths.bulkAdd(result.createdTracks);
                      }

                      triggerVictoryEffect();
                      alert(result.summary);
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Cadastro de Disciplina da Faculdade */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-extrabold text-slate-900 text-sm">Adicionar Disciplina do Semestre Manualmente</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = (form.elements.namedItem('collegeName') as HTMLInputElement).value;
                  const color = (form.elements.namedItem('collegeColor') as HTMLInputElement).value || '#4f46e5';
                  const targetMinutes = Number((form.elements.namedItem('collegeTarget') as HTMLInputElement).value) || 120;
                  const deadline = (form.elements.namedItem('collegeDeadline') as HTMLInputElement).value;

                  if (!name) return;

                  await db.subjects.add({
                    id: `col-${Date.now()}`,
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

                  form.reset();
                  triggerVictoryEffect();
                  alert('Disciplina adicionada à grade da faculdade!');
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

            {/* Disciplinas da Faculdade Cadastradas */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">Disciplinas Cadastradas</h3>
                <span className="text-xs text-slate-400 font-medium">
                  {subjects.filter((s) => s.category === 'college').length} disciplinas ativas
                </span>
              </div>

              {subjects.filter((s) => s.category === 'college').length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {subjects
                    .filter((s) => s.category === 'college')
                    .map((colSub) => {
                      const collegeTasks = tasks.filter((t) => t.subjectId === colSub.id);
                      const completedTasks = collegeTasks.filter((t) => t.status === 'completed');

                      return (
                        <div
                          key={colSub.id}
                          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3"
                        >
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
                                onClick={() => startTimer('pomodoro', 25, colSub.id)}
                                className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition"
                                title="Estudar esta disciplina agora"
                              >
                                <Play className="w-3.5 h-3.5 fill-current" />
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Remover disciplina "${colSub.name}"?`)) {
                                    await db.subjects.delete(colSub.id);
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
                <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-3">
                  <GraduationCap className="w-12 h-12 text-indigo-400 mx-auto" />
                  <h4 className="font-extrabold text-slate-900 text-base">Nenhuma disciplina cadastrada</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Adicione suas matérias da faculdade no formulário acima para acompanhar provas, prazos e registrar horas de estudo dedicadas.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: ESTRATÉGIA SEMANAL */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Estratégia Semanal Heurística</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Distribuição baseada na capacidade diária real configurada pelo estudante.
                </p>
              </div>
              <button
                onClick={() => {
                  const schedule = generateWeeklySchedule({
                    weekStartDate: new Date(),
                    availability: preferences?.weeklyAvailability || [],
                    pendingTasks: tasks.filter((t) => t.status === 'pending'),
                    dueFlashcards,
                  });
                  setCurrentSchedule(schedule);
                  triggerVictoryEffect();
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-black transition active:scale-95 shadow-xs"
              >
                Gerar Plano Semanal
              </button>
            </header>

            {/* Disponibilidade Semanal */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">Disponibilidade Semanal Configurada</h3>
              <div className="grid grid-cols-7 gap-2 text-center">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, idx) => {
                  const avail = preferences?.weeklyAvailability.find((a) => a.dayOfWeek === idx);
                  return (
                    <div key={day} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400">{day}</div>
                      <div className="text-sm font-black text-slate-900 mt-1">{avail?.minutesAvailable || 0}m</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detecção Transparente de Sobrecarga */}
            {currentSchedule && currentSchedule.unallocatedTasks.length > 0 && (
              <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200 shadow-xs space-y-3">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  Alerta de Sobrecarga: {currentSchedule.totalOverloadMinutes}m excedentes
                </div>
                <p className="text-xs text-amber-700">
                  As seguintes tarefas não puderam ser alocadas nesta semana pois o tempo diário configurado atingiu o limite:
                </p>
                <div className="space-y-1.5 pt-1">
                  {currentSchedule.unallocatedTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl bg-white/80 border border-amber-200/80 text-xs text-amber-900 font-medium flex items-center justify-between"
                    >
                      <span>• {t.title}</span>
                      <span className="font-bold text-amber-700">{t.estimatedMinutes || 30}m</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Distribuição Diária das Atividades Geradas */}
            {currentSchedule && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Agenda de Estudos da Semana</h3>
                    <p className="text-xs text-slate-400">Total alocado: {currentSchedule.totalPlannedMinutes} minutos</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                    {currentSchedule.plannedActivities.length} Atividades Programadas
                  </span>
                </div>

                <div className="space-y-3">
                  {currentSchedule.dailyLoads.map((day) => {
                    const dayActivities = currentSchedule.plannedActivities.filter((a) => a.date === day.date);
                    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

                    return (
                      <div key={day.date} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">
                            {dayNames[day.dayOfWeek]} ({day.date})
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 font-bold">
                            {day.allocatedMinutes}m / {day.capacityMinutes}m disponíveis
                          </span>
                        </div>

                        {dayActivities.length > 0 ? (
                          <div className="space-y-1.5">
                            {dayActivities.map((act) => {
                              const taskObj = tasks.find((t) => t.id === act.taskId);
                              const subObj = subjects.find((s) => s.id === act.subjectId);

                              return (
                                <div
                                  key={act.id}
                                  className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs flex items-center justify-between shadow-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-2.5 h-2.5 rounded-full"
                                      style={{ backgroundColor: subObj?.color || '#6366f1' }}
                                    />
                                    <span className="font-semibold text-slate-800">
                                      {act.flashcardReview
                                        ? 'Sessão de Revisão de Flashcards'
                                        : taskObj?.title || 'Atividade de Estudo'}
                                    </span>
                                  </div>
                                  <span className="font-mono text-[11px] text-indigo-600 font-bold">
                                    {act.plannedMinutes}m
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">Nenhuma atividade alocada para este dia.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Flashcards no Deck</span>
                <div className="text-3xl font-black text-slate-900 mt-2">{flashcards.length}</div>
                <div className="text-xs text-slate-400 font-medium mt-1">{totalFlashcardReviews} revisões feitas</div>
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

        {/* TAB: ARSENAL DE PROJETOS & PORTFÓLIO */}
        {activeTab === 'career' && (
          <div className="space-y-6">
            <header>
              <h2 className="text-2xl font-black text-slate-900">Arsenal de Projetos & Portfólio</h2>
              <p className="text-xs text-slate-500 mt-1">
                Transforme seu tempo de estudo e XP em projetos de software reais para comprovar suas habilidades.
              </p>
            </header>

            {/* Cadastro de Novo Projeto */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-extrabold text-slate-900 text-sm">Adicionar Projeto ao Portfólio</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const title = (form.elements.namedItem('projTitle') as HTMLInputElement).value;
                  const description = (form.elements.namedItem('projDesc') as HTMLTextAreaElement).value;
                  const skillsStr = (form.elements.namedItem('projSkills') as HTMLInputElement).value;
                  const repoUrl = (form.elements.namedItem('projRepo') as HTMLInputElement).value;
                  const demoUrl = (form.elements.namedItem('projDemo') as HTMLInputElement).value;

                  if (!title) return;

                  await db.portfolioProjects.add({
                    id: `proj-${Date.now()}`,
                    title,
                    description,
                    skills: skillsStr ? skillsStr.split(',').map((s) => s.trim()) : [],
                    repoUrl: repoUrl || undefined,
                    demoUrl: demoUrl || undefined,
                    status: 'in_progress',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  });

                  form.reset();
                  triggerVictoryEffect();
                  alert('Projeto adicionado ao seu arsenal!');
                }}
                className="space-y-3"
              >
                <div>
                  <input
                    name="projTitle"
                    placeholder="Título do Projeto (ex: API de E-commerce com Spring Boot)"
                    required
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <textarea
                    name="projDesc"
                    placeholder="Descrição técnica, arquitetura e objetivo do projeto..."
                    rows={2}
                    required
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    name="projSkills"
                    placeholder="Habilidades (ex: Java, Docker, AWS)"
                    className="text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden"
                  />
                  <input
                    name="projRepo"
                    placeholder="Link do Repositório GitHub"
                    className="text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden"
                  />
                  <input
                    name="projDemo"
                    placeholder="Link da Demonstração ao vivo"
                    className="text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition active:scale-95"
                >
                  + Cadastrar Projeto
                </button>
              </form>
            </div>

            {/* Lista de Projetos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm">Seus Projetos em Andamento e Concluídos</h3>
                <span className="text-xs text-slate-400 font-medium">{projects.length} projetos registrados</span>
              </div>

              {projects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                              p.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {p.status === 'completed' ? 'Concluído' : 'Em Desenvolvimento'}
                          </span>
                          <button
                            onClick={() => db.portfolioProjects.delete(p.id)}
                            className="text-slate-300 hover:text-rose-500 transition"
                            title="Remover projeto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <h4 className="font-extrabold text-slate-900 text-base">{p.title}</h4>
                        <p className="text-xs text-slate-600 leading-relaxed">{p.description}</p>
                      </div>

                      <div className="space-y-3 pt-2">
                        {p.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {p.skills.map((skill, i) => (
                              <span
                                key={i}
                                className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                          {p.repoUrl && (
                            <a
                              href={p.repoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-indigo-600 hover:underline"
                            >
                              GitHub →
                            </a>
                          )}
                          {p.demoUrl && (
                            <a
                              href={p.demoUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-emerald-600 hover:underline"
                            >
                              Demo ao vivo →
                            </a>
                          )}
                          <button
                            onClick={async () => {
                              const newStatus = p.status === 'completed' ? 'in_progress' : 'completed';
                              await db.portfolioProjects.update(p.id, {
                                status: newStatus,
                                updatedAt: Date.now(),
                              });
                              if (newStatus === 'completed') triggerVictoryEffect();
                            }}
                            className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-900 underline"
                          >
                            {p.status === 'completed' ? 'Reabrir' : 'Marcar Concluído'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center space-y-2">
                  <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
                  <p className="text-xs text-slate-500">
                    Nenhum projeto cadastrado ainda. Comece estruturando seu primeiro repositório no formulário acima.
                  </p>
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

      {/* Navegação Inferior Mobile — Tema Claro & Gamificado */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 flex justify-around p-2 z-50">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 p-1 text-[10px] font-bold ${
            activeTab === 'home' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <Layers className="w-5 h-5" />
          QG
        </button>
        <button
          onClick={() => setActiveTab('focus')}
          className={`flex flex-col items-center gap-1 p-1 text-[10px] font-bold ${
            activeTab === 'focus' ? 'text-amber-500' : 'text-slate-400'
          }`}
        >
          <Zap className="w-5 h-5" />
          Foco
        </button>
        <button
          onClick={() => setActiveTab('tracks')}
          className={`flex flex-col items-center gap-1 p-1 text-[10px] font-bold ${
            activeTab === 'tracks' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          Trilhas
        </button>
        <button
          onClick={() => setActiveTab('college')}
          className={`flex flex-col items-center gap-1 p-1 text-[10px] font-bold ${
            activeTab === 'college' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <GraduationCap className="w-5 h-5" />
          Facul
        </button>
        <button
          onClick={() => setActiveTab('flashcards')}
          className={`flex flex-col items-center gap-1 p-1 text-[10px] font-bold ${
            activeTab === 'flashcards' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <BrainCircuit className="w-5 h-5" />
          Cartas
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 p-1 text-[10px] font-bold ${
            activeTab === 'settings' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <Shield className="w-5 h-5" />
          Cofre
        </button>
      </nav>
    </div>
  );
}
export default App;
