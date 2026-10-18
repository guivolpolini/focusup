import { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import {
  CalendarDays,
  Calendar as CalendarIcon,
  CalendarClock,
  Clock,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  Bell,
  BellRing,
  BellOff,
  Search,
  Repeat,
  BookOpen,
  X,
} from 'lucide-react';
import { db } from '../lib/db';
import {
  AGENDA_CATEGORIES,
  REMINDER_OPTIONS,
  RECURRENCE_OPTIONS,
  getAgendaCategoryMeta,
  getEventOccurrencesForRange,
  getMonthCalendarGrid,
  getWeekDates,
  formatAgendaTime,
  formatAgendaDateBR,
  formatAgendaDateFullBR,
  getUpcomingEvents,
  calculateReminderTimestamp,
  calculatePostponedDate,
  resolveEventStatus,
} from '../lib/agendaEngine';
import {
  requestNotificationPermission,
  sendLocalNotification,
  getNotificationPermissionStatus,
} from '../lib/notificationEngine';
import type {
  AgendaCategory,
  AgendaReminderOffset,
  AgendaRecurrence,
  AgendaEvent,
  AgendaOccurrence,
  AgendaEventStatus,
} from '../types';

export function AgendaSection() {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Visualizações: mês, semana, dia, próximos
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day' | 'upcoming'>('month');

  // Data de referência de navegação (ano e mês)
  const [navDate, setNavDate] = useState<Date>(() => new Date());
  // Data selecionada pontualmente para a visualização diária
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  // Filtros
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'all' | 'pending' | 'completed' | 'postponed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal de Adiar Compromisso
  const [postponingOcc, setPostponingOcc] = useState<AgendaOccurrence | null>(null);
  const [postponeTargetDate, setPostponeTargetDate] = useState<string>(todayStr);

  // Notificações
  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'unsupported'>('default');
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  // Modais de Criação e Edição
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null);

  // Campos do formulário
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDate, setFormDate] = useState<string>(todayStr);
  const [formStartTime, setFormStartTime] = useState<string>('09:00');
  const [formEndTime, setFormEndTime] = useState<string>('10:00');
  const [formCategory, setFormCategory] = useState<AgendaCategory>('studies');
  const [formSubjectId, setFormSubjectId] = useState<string>('');
  const [formReminder, setFormReminder] = useState<AgendaReminderOffset>('15m');
  const [formRecurrence, setFormRecurrence] = useState<AgendaRecurrence>('never');
  const [formStatus, setFormStatus] = useState<AgendaEventStatus>('pending');
  const [formDescription, setFormDescription] = useState<string>('');

  // Consultas Reativas do Dexie
  const events = useLiveQuery(() => db.agendaEvents.toArray()) || [];
  const subjects = useLiveQuery(() => db.subjects.filter((s) => !s.archived).toArray()) || [];

  // Ano e Mês atuais de navegação
  const navYear = navDate.getFullYear();
  const navMonth = navDate.getMonth() + 1; // 1-12

  // Início e fim do mês corrente de navegação para cálculo de ocorrências
  const monthRange = useMemo(() => {
    const startStr = `${navYear}-${String(navMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(navYear, navMonth, 0).getDate();
    const endStr = `${navYear}-${String(navMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startStr, endStr };
  }, [navYear, navMonth]);

  // Dias da semana corrente de navegação
  const weekDates = useMemo(() => {
    return getWeekDates(navDate);
  }, [navDate]);

  // Células do calendário mensal
  const monthGrid = useMemo(() => {
    return getMonthCalendarGrid(navYear, navMonth);
  }, [navYear, navMonth]);

  // Intervalo amplo cobrindo as células visíveis do calendário
  const visibleGridRange = useMemo(() => {
    if (monthGrid.length === 0) return monthRange;
    return {
      startStr: monthGrid[0].dateStr,
      endStr: monthGrid[monthGrid.length - 1].dateStr,
    };
  }, [monthGrid, monthRange]);

  // Ocorrências calculadas para o intervalo visível (Antifragilidade: zero duplicações no banco)
  const visibleOccurrences = useMemo(() => {
    return getEventOccurrencesForRange(events, visibleGridRange.startStr, visibleGridRange.endStr);
  }, [events, visibleGridRange]);

  // Ocorrências filtradas por categoria, status e busca
  const filteredOccurrences = useMemo(() => {
    return visibleOccurrences.filter((occ) => {
      if (selectedCategoryFilter !== 'all' && occ.category !== selectedCategoryFilter) {
        return false;
      }
      if (selectedStatusFilter !== 'all' && occ.status !== selectedStatusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = occ.title.toLowerCase().includes(q);
        const matchesDesc = occ.description?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  }, [visibleOccurrences, selectedCategoryFilter, selectedStatusFilter, searchQuery]);

  // Mapa de ocorrências por data YYYY-MM-DD
  const occurrencesByDate = useMemo(() => {
    const map = new Map<string, AgendaOccurrence[]>();
    for (const occ of filteredOccurrences) {
      const list = map.get(occ.date) || [];
      list.push(occ);
      map.set(occ.date, list);
    }
    return map;
  }, [filteredOccurrences]);

  // Próximos compromissos (a partir de hoje)
  const upcomingEvents = useMemo(() => {
    // Busca ocorrências dos próximos 60 dias
    const next60Days = new Date();
    next60Days.setDate(next60Days.getDate() + 60);
    const end60Str = next60Days.toISOString().slice(0, 10);
    const wideOccs = getEventOccurrencesForRange(events, todayStr, end60Str);

    return getUpcomingEvents(
      wideOccs.filter((o) => {
        if (selectedCategoryFilter !== 'all' && o.category !== selectedCategoryFilter) return false;
        if (selectedStatusFilter !== 'all' && o.status !== selectedStatusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          return o.title.toLowerCase().includes(q) || (o.description && o.description.toLowerCase().includes(q));
        }
        return true;
      }),
      todayStr,
      10
    );
  }, [events, todayStr, selectedCategoryFilter, selectedStatusFilter, searchQuery]);

  // Checagem de permissão de notificação inicial
  useEffect(() => {
    setNotifStatus(getNotificationPermissionStatus());
  }, []);

  // Loop inteligente de lembretes locais (executado a cada 30 segundos)
  useEffect(() => {
    const checkReminders = async () => {
      if (getNotificationPermissionStatus() !== 'granted') return;
      const nowMs = Date.now();
      const currentTodayStr = new Date().toISOString().slice(0, 10);
      const todayOccs = getEventOccurrencesForRange(events, currentTodayStr, currentTodayStr);

      for (const occ of todayOccs) {
        if (occ.completed || occ.reminder === 'none') continue;
        const reminderTs = calculateReminderTimestamp(occ.date, occ.startTime, occ.reminder);
        if (!reminderTs) continue;

        const notifKey = `${occ.id}_${reminderTs}`;
        // Se já foi notificado nesta sessão, ignora
        if (notifiedIdsRef.current.has(notifKey)) continue;

        // Dispara se estiver na janela de tempo (entre o horário do lembrete e até 2 minutos depois)
        if (nowMs >= reminderTs && nowMs <= reminderTs + 120000) {
          notifiedIdsRef.current.add(notifKey);
          const timeText = formatAgendaTime(occ.startTime, occ.endTime);
          await sendLocalNotification(`Lembrete FocusUp: ${occ.title}`, {
            body: `${timeText} • ${getAgendaCategoryMeta(occ.category).label}${
              occ.description ? `\n${occ.description}` : ''
            }`,
          });
        }
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [events]);

  // Abertura do modal de criação
  const handleOpenCreateModal = (targetDateStr?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormDate(targetDateStr || selectedDateStr || todayStr);
    setFormStartTime('09:00');
    setFormEndTime('10:00');
    setFormCategory('studies');
    setFormSubjectId('');
    setFormReminder('15m');
    setFormRecurrence('never');
    setFormStatus('pending');
    setFormDescription('');
    setShowEventModal(true);
  };

  // Abertura do modal de edição
  const handleOpenEditModal = (occ: AgendaOccurrence) => {
    const master = events.find((e) => e.id === occ.masterEventId);
    if (!master) return;
    setEditingEvent(master);
    setFormTitle(master.title);
    setFormDate(master.date);
    setFormStartTime(master.startTime || '09:00');
    setFormEndTime(master.endTime || '10:00');
    setFormCategory(master.category);
    setFormSubjectId(master.subjectId || '');
    setFormReminder(master.reminder);
    setFormRecurrence(master.recurrence);
    setFormStatus(resolveEventStatus(master));
    setFormDescription(master.description || '');
    setShowEventModal(true);
  };

  // Salvar evento (Criar ou Atualizar)
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert('Informe o título do compromisso.');
      return;
    }

    const now = Date.now();

    if (editingEvent) {
      await db.agendaEvents.update(editingEvent.id, {
        title: formTitle.trim(),
        date: formDate,
        startTime: formStartTime || undefined,
        endTime: formEndTime || undefined,
        category: formCategory,
        subjectId: formCategory === 'studies' && formSubjectId ? formSubjectId : undefined,
        reminder: formReminder,
        recurrence: formRecurrence,
        status: formStatus,
        completed: formStatus === 'completed',
        completedAt: formStatus === 'completed' ? (editingEvent.completedAt || now) : undefined,
        postponedAt: formStatus === 'postponed' ? (editingEvent.postponedAt || now) : undefined,
        description: formDescription.trim() || undefined,
        updatedAt: now,
      });
    } else {
      const newId = `evt_${now}_${Math.random().toString(36).substring(2, 7)}`;
      await db.agendaEvents.add({
        id: newId,
        title: formTitle.trim(),
        date: formDate,
        startTime: formStartTime || undefined,
        endTime: formEndTime || undefined,
        category: formCategory,
        subjectId: formCategory === 'studies' && formSubjectId ? formSubjectId : undefined,
        reminder: formReminder,
        recurrence: formRecurrence,
        status: formStatus,
        completed: formStatus === 'completed',
        completedAt: formStatus === 'completed' ? now : undefined,
        postponedAt: formStatus === 'postponed' ? now : undefined,
        description: formDescription.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      });

      if (formStatus === 'completed') {
        try {
          confetti({ particleCount: 35, spread: 50, origin: { y: 0.75 } });
        } catch {
          // Ignorar se bloqueado
        }
      }
    }

    setShowEventModal(false);
  };

  // Alternar conclusão (Feito <-> Pendente)
  const handleToggleComplete = async (occ: AgendaOccurrence) => {
    const master = events.find((e) => e.id === occ.masterEventId);
    if (!master) return;

    const currentStatus = resolveEventStatus(master);
    const newStatus: AgendaEventStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    const now = Date.now();

    await db.agendaEvents.update(master.id, {
      status: newStatus,
      completed: newStatus === 'completed',
      completedAt: newStatus === 'completed' ? now : undefined,
      updatedAt: now,
    });

    if (newStatus === 'completed') {
      try {
        confetti({ particleCount: 30, spread: 55, origin: { y: 0.8 } });
      } catch {
        // Ignorar se bloqueado
      }
    }
  };

  // Abrir modal de adiamento
  const handleOpenPostponeModal = (occ: AgendaOccurrence) => {
    setPostponingOcc(occ);
    setPostponeTargetDate(calculatePostponedDate(occ.date, 1));
  };

  // Confirmar adiamento
  const handleConfirmPostpone = async (mode: 'tomorrow' | '2days' | 'nextWeek' | 'custom' | 'markOnly') => {
    if (!postponingOcc) return;
    const master = events.find((e) => e.id === postponingOcc.masterEventId);
    if (!master) return;

    let targetDate = postponingOcc.date;
    if (mode === 'tomorrow') {
      targetDate = calculatePostponedDate(postponingOcc.date, 1);
    } else if (mode === '2days') {
      targetDate = calculatePostponedDate(postponingOcc.date, 2);
    } else if (mode === 'nextWeek') {
      targetDate = calculatePostponedDate(postponingOcc.date, 7);
    } else if (mode === 'custom') {
      targetDate = postponeTargetDate || postponingOcc.date;
    }

    const now = Date.now();
    await db.agendaEvents.update(master.id, {
      status: 'postponed',
      completed: false,
      date: targetDate,
      originalDate: targetDate !== postponingOcc.date ? postponingOcc.date : (master.originalDate || postponingOcc.date),
      postponedAt: now,
      updatedAt: now,
    });

    setPostponingOcc(null);
  };

  // Reverter adiamento e voltar a ser pendente
  const handleRevertToPending = async (occ: AgendaOccurrence) => {
    const master = events.find((e) => e.id === occ.masterEventId);
    if (!master) return;
    const now = Date.now();
    await db.agendaEvents.update(master.id, {
      status: 'pending',
      completed: false,
      updatedAt: now,
    });
    setPostponingOcc(null);
  };

  // Excluir evento
  const handleDeleteEvent = async (occ: AgendaOccurrence) => {
    if (confirm(`Deseja realmente excluir o compromisso "${occ.title}"?`)) {
      await db.agendaEvents.delete(occ.masterEventId);
    }
  };

  // Solicitar permissão de notificação
  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifStatus(granted ? 'granted' : 'denied');
    if (granted) {
      await sendLocalNotification('Lembretes FocusUp Ativados!', {
        body: 'Você receberá notificações reais dos seus compromissos e estudos.',
      });
    }
  };

  // Navegação de Períodos
  const handlePrevPeriod = () => {
    const d = new Date(navDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() - 7);
    } else if (viewMode === 'day') {
      const cur = new Date(selectedDateStr + 'T00:00:00');
      cur.setDate(cur.getDate() - 1);
      const newStr = cur.toISOString().slice(0, 10);
      setSelectedDateStr(newStr);
      d.setDate(d.getDate() - 1);
    }
    setNavDate(d);
  };

  const handleNextPeriod = () => {
    const d = new Date(navDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + 7);
    } else if (viewMode === 'day') {
      const cur = new Date(selectedDateStr + 'T00:00:00');
      cur.setDate(cur.getDate() + 1);
      const newStr = cur.toISOString().slice(0, 10);
      setSelectedDateStr(newStr);
      d.setDate(d.getDate() + 1);
    }
    setNavDate(d);
  };

  const handleGoToday = () => {
    const now = new Date();
    setNavDate(now);
    setSelectedDateStr(todayStr);
  };

  // Título da barra de navegação
  const navTitle = useMemo(() => {
    const monthNames = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    if (viewMode === 'month') {
      return `${monthNames[navMonth - 1]} de ${navYear}`;
    }
    if (viewMode === 'week') {
      const first = weekDates[0];
      const last = weekDates[6];
      const [, m1, d1] = first.split('-');
      const [, m2, d2] = last.split('-');
      return `${d1}/${m1} a ${d2}/${m2} de ${navYear}`;
    }
    if (viewMode === 'day') {
      return formatAgendaDateFullBR(selectedDateStr);
    }
    return 'Próximos Compromissos';
  }, [viewMode, navMonth, navYear, weekDates, selectedDateStr]);

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* 1. CABEÇALHO & ATIVAÇÃO DE NOTIFICAÇÕES */}
      {/* ============================================================ */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-black text-slate-900">Agenda & Compromissos</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Organize seus estudos, treinos, finanças e compromissos diários com lembretes locais inteligentes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status e Botão de Notificações */}
          {notifStatus === 'granted' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
              <BellRing className="w-3.5 h-3.5 text-emerald-600" />
              Lembretes Ativos
            </span>
          ) : notifStatus === 'denied' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-medium" title="Permissão negada no navegador">
              <BellOff className="w-3.5 h-3.5" />
              Notificações Bloqueadas
            </span>
          ) : (
            <button
              onClick={handleRequestNotifications}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition border border-amber-200"
            >
              <Bell className="w-3.5 h-3.5 text-amber-600" />
              Ativar Lembretes
            </button>
          )}

          <button
            onClick={() => handleOpenCreateModal()}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-sm transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Novo Evento
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* 2. BARRA DE CONTROLE: VISUALIZAÇÕES, NAVEGAÇÃO & FILTROS */}
      {/* ============================================================ */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Seletor de Modo de Visualização */}
          <div className="inline-flex p-1 bg-slate-100 rounded-2xl gap-1 self-start sm:self-auto">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                viewMode === 'month'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mês
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                viewMode === 'week'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                viewMode === 'day'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dia
            </button>
            <button
              onClick={() => setViewMode('upcoming')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                viewMode === 'upcoming'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Próximos
            </button>
          </div>

          {/* Navegação entre períodos */}
          {viewMode !== 'upcoming' && (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={handlePrevPeriod}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
                title="Período anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleGoToday}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Hoje
              </button>
              <button
                onClick={handleNextPeriod}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
                title="Próximo período"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-black text-slate-800 ml-1">{navTitle}</span>
            </div>
          )}
        </div>

        {/* Linha de Busca e Filtro de Categorias / Status */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar compromisso por título ou descrição..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            {/* Status Pills */}
            <div className="flex items-center gap-1 border-r border-slate-200 pr-2 mr-1">
              {[
                { id: 'all' as const, label: 'Todos' },
                { id: 'pending' as const, label: 'Pendentes' },
                { id: 'completed' as const, label: 'Feitos' },
                { id: 'postponed' as const, label: 'Adiados' },
              ].map((st) => {
                const isSelected = selectedStatusFilter === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => setSelectedStatusFilter(st.id)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold transition whitespace-nowrap ${
                      isSelected
                        ? st.id === 'completed'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : st.id === 'postponed'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-slate-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setSelectedCategoryFilter('all')}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap ${
                selectedCategoryFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Todas
            </button>
            {Object.entries(AGENDA_CATEGORIES).map(([catKey, catMeta]) => {
              const isSelected = selectedCategoryFilter === catKey;
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategoryFilter(catKey)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${catMeta.dotClass}`} />
                  {catMeta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. VISUALIZAÇÃO MENSAL (CALENDÁRIO COMPACTO) */}
      {/* ============================================================ */}
      {viewMode === 'month' && (
        <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
          {/* Cabeçalho dos Dias da Semana */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <span key={d} className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Grade de Células do Calendário */}
          <div className="grid grid-cols-7 gap-1.5">
            {monthGrid.map((cell) => {
              const dayOccs = occurrencesByDate.get(cell.dateStr) || [];
              const isSelected = selectedDateStr === cell.dateStr;

              return (
                <div
                  key={cell.dateStr}
                  onClick={() => {
                    setSelectedDateStr(cell.dateStr);
                    setViewMode('day');
                  }}
                  className={`min-h-[80px] sm:min-h-[96px] p-1.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 shadow-xs'
                      : cell.isToday
                      ? 'border-indigo-300 bg-indigo-50/20'
                      : cell.isCurrentMonth
                      ? 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                      : 'border-transparent bg-slate-50/40 opacity-40 hover:opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${
                        cell.isToday
                          ? 'bg-indigo-600 text-white'
                          : cell.isCurrentMonth
                          ? 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {dayOccs.length > 0 && (
                      <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-600">
                        {dayOccs.length}
                      </span>
                    )}
                  </div>

                  {/* Micro-barras e chips dos compromissos do dia */}
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayOccs.slice(0, 2).map((occ) => {
                      const catMeta = getAgendaCategoryMeta(occ.category);
                      return (
                        <div
                          key={occ.id}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md truncate flex items-center gap-1 ${catMeta.bgClass} ${catMeta.textClass}`}
                          title={`${occ.title} (${formatAgendaTime(occ.startTime, occ.endTime)})`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${catMeta.dotClass}`} />
                          <span className="truncate">{occ.title}</span>
                        </div>
                      );
                    })}
                    {dayOccs.length > 2 && (
                      <div className="text-[9px] font-bold text-slate-400 pl-1">
                        +{dayOccs.length - 2} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. VISUALIZAÇÃO SEMANAL (CARDS ERGONÔMICOS MOBILE-FIRST) */}
      {/* ============================================================ */}
      {viewMode === 'week' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
            {weekDates.map((dateStr) => {
              const dayOccs = occurrencesByDate.get(dateStr) || [];
              const isToday = dateStr === todayStr;
              const [, , day] = dateStr.split('-');
              const weekdayName = new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', {
                weekday: 'short',
              });

              return (
                <div
                  key={dateStr}
                  className={`bg-white p-3.5 rounded-2xl border transition flex flex-col justify-between min-h-[140px] ${
                    isToday ? 'border-indigo-400 shadow-xs' : 'border-slate-200/80 shadow-2xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">
                          {weekdayName}
                        </span>
                        <span
                          className={`text-sm font-black ${
                            isToday ? 'text-indigo-600' : 'text-slate-800'
                          }`}
                        >
                          {day}
                        </span>
                      </div>
                      <button
                        onClick={() => handleOpenCreateModal(dateStr)}
                        className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
                        title="Adicionar evento neste dia"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Lista dos eventos deste dia da semana */}
                    <div className="space-y-1.5 mt-2">
                      {dayOccs.length > 0 ? (
                        dayOccs.map((occ) => {
                          const catMeta = getAgendaCategoryMeta(occ.category);
                          return (
                            <div
                              key={occ.id}
                              onClick={() => {
                                setSelectedDateStr(dateStr);
                                setViewMode('day');
                              }}
                              className={`p-1.5 rounded-xl border text-xs cursor-pointer transition ${
                                occ.status === 'completed'
                                  ? 'bg-emerald-50/50 border-emerald-200 text-emerald-700 opacity-60 line-through'
                                  : occ.status === 'postponed'
                                  ? 'bg-amber-50/80 border-amber-300 text-amber-900 font-bold'
                                  : `${catMeta.bgClass} ${catMeta.borderClass} ${catMeta.textClass}`
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-[11px] truncate flex items-center gap-1">
                                  {occ.status === 'postponed' && (
                                    <span className="text-[9px] text-amber-700">⏳</span>
                                  )}
                                  {occ.title}
                                </span>
                                {occ.startTime && (
                                  <span className="text-[9px] font-extrabold shrink-0">
                                    {occ.startTime}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="py-4 text-center text-slate-300 text-[10px]">
                          Livre
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedDateStr(dateStr);
                      setViewMode('day');
                    }}
                    className="mt-2 text-[10px] font-bold text-slate-400 hover:text-indigo-600 text-center block pt-1 border-t border-slate-100"
                  >
                    Ver dia
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. VISUALIZAÇÃO DIÁRIA (CRONOLÓGICA DETALHADA) */}
      {/* ============================================================ */}
      {viewMode === 'day' && (() => {
        const dayOccs = occurrencesByDate.get(selectedDateStr) || [];
        const isToday = selectedDateStr === todayStr;

        return (
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {isToday ? 'Hoje' : 'Dia Selecionado'}
                </span>
                <h3 className="text-xl font-black text-slate-900 capitalize">
                  {formatAgendaDateFullBR(selectedDateStr)}
                </h3>
              </div>

              <button
                onClick={() => handleOpenCreateModal(selectedDateStr)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Agendar para este dia
              </button>
            </div>

            {/* Linha do tempo dos compromissos */}
            {dayOccs.length > 0 ? (
              <div className="space-y-3">
                {dayOccs.map((occ) => {
                  const catMeta = getAgendaCategoryMeta(occ.category);
                  const subject = subjects.find((s) => s.id === occ.subjectId);

                  return (
                    <div
                      key={occ.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        occ.status === 'completed'
                          ? 'bg-slate-50/70 border-slate-200/70 opacity-60'
                          : occ.status === 'postponed'
                          ? 'bg-amber-50/40 border-amber-300/80 hover:border-amber-400 shadow-2xs'
                          : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          onClick={() => handleToggleComplete(occ)}
                          className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition ${
                            occ.status === 'completed'
                              ? 'text-emerald-500'
                              : occ.status === 'postponed'
                              ? 'text-amber-500 hover:text-emerald-500'
                              : 'text-slate-300 hover:text-emerald-500'
                          }`}
                          title={occ.status === 'completed' ? 'Marcar como Pendente' : 'Marcar como Feito'}
                        >
                          {occ.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 fill-emerald-500 text-white" />
                          ) : (
                            <Circle className="w-5 h-5 stroke-[1.8]" />
                          )}
                        </button>

                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 rounded-md ${catMeta.bgClass} ${catMeta.textClass}`}
                            >
                              {catMeta.label}
                            </span>

                            {/* Badges de Feito ou Adiado */}
                            {occ.status === 'completed' && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Feito
                              </span>
                            )}

                            {occ.status === 'postponed' && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                <CalendarClock className="w-3 h-3 text-amber-700" />
                                Adiado
                                {occ.originalDate && occ.originalDate !== occ.date && (
                                  <span className="text-[9px] font-semibold text-amber-800">
                                    (de {formatAgendaDateBR(occ.originalDate)})
                                  </span>
                                )}
                              </span>
                            )}

                            {subject && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 flex items-center gap-1">
                                <BookOpen className="w-3 h-3 text-sky-600" />
                                {subject.name}
                              </span>
                            )}

                            {occ.recurrence !== 'never' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 flex items-center gap-1">
                                <Repeat className="w-3 h-3" />
                                Recorrente
                              </span>
                            )}

                            {occ.reminder !== 'none' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 flex items-center gap-1">
                                <Bell className="w-3 h-3 text-amber-600" />
                                {REMINDER_OPTIONS.find((r) => r.value === occ.reminder)?.label}
                              </span>
                            )}
                          </div>

                          <h4
                            className={`font-black text-sm text-slate-900 truncate ${
                              occ.status === 'completed' ? 'line-through text-slate-400' : ''
                            }`}
                          >
                            {occ.title}
                          </h4>

                          {occ.description && (
                            <p className="text-xs text-slate-500 whitespace-pre-line">
                              {occ.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatAgendaTime(occ.startTime, occ.endTime)}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenPostponeModal(occ)}
                            className="p-1.5 text-slate-500 hover:text-amber-700 rounded-lg hover:bg-amber-50 transition flex items-center gap-1 text-xs font-bold"
                            title="Adiar compromisso"
                          >
                            <CalendarClock className="w-4 h-4 text-amber-600" />
                            <span className="text-[11px] text-amber-700 font-bold">Adiar</span>
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(occ)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition"
                            title="Editar evento"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(occ)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                            title="Excluir evento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-700">Nenhum compromisso para este dia</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Mantenha o dia livre ou clique no botão abaixo para adicionar uma tarefa, estudo ou treino.
                  </p>
                </div>
                <button
                  onClick={() => handleOpenCreateModal(selectedDateStr)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition"
                >
                  <Plus className="w-4 h-4" /> Agendar Compromisso
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ============================================================ */}
      {/* 6. VISUALIZAÇÃO DE PRÓXIMOS EVENTOS */}
      {/* ============================================================ */}
      {viewMode === 'upcoming' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Próximos Compromissos</h3>
              <p className="text-[11px] text-slate-400">Eventos e tarefas futuras ordenadas cronologicamente</p>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-xl">
              {upcomingEvents.length} a frente
            </span>
          </div>

          {upcomingEvents.length > 0 ? (
            <div className="space-y-2.5">
              {upcomingEvents.map((occ) => {
                const catMeta = getAgendaCategoryMeta(occ.category);
                return (
                  <div
                    key={occ.id}
                    className="p-3.5 rounded-2xl border border-slate-200/70 hover:border-slate-300 bg-white flex items-center justify-between gap-3 text-xs shadow-2xs transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-center shrink-0 w-12 p-1.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">
                          {new Date(occ.date + 'T00:00:00').toLocaleDateString('pt-BR', {
                            month: 'short',
                          })}
                        </span>
                        <span className="text-sm font-black text-slate-800 block">
                          {occ.date.split('-')[2]}
                        </span>
                      </div>

                      <div className="truncate">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${catMeta.bgClass} ${catMeta.textClass}`}
                          >
                            {catMeta.label}
                          </span>
                          {occ.status === 'completed' && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                              Feito
                            </span>
                          )}
                          {occ.status === 'postponed' && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                              <CalendarClock className="w-2.5 h-2.5 text-amber-700" />
                              Adiado
                            </span>
                          )}
                          {occ.recurrence !== 'never' && (
                            <span className="text-[9px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                              Recorrente
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-slate-900 text-xs mt-0.5 truncate">
                          {occ.title}
                        </h4>
                        <span className="text-[10px] text-slate-400">
                          {formatAgendaDateBR(occ.date)} • {formatAgendaTime(occ.startTime, occ.endTime)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenPostponeModal(occ)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition"
                        title="Adiar compromisso"
                      >
                        <CalendarClock className="w-4 h-4 text-amber-600" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDateStr(occ.date);
                          setViewMode('day');
                        }}
                        className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition"
                      >
                        Ver no Dia
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <CalendarIcon className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">Nenhum compromisso futuro encontrado</p>
              <p className="text-[11px] text-slate-400">Clique em "+ Novo Evento" para agendar uma atividade.</p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. MODAL DE CRIAÇÃO E EDIÇÃO DE EVENTO */}
      {/* ============================================================ */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-xl border border-slate-100 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-base">
                  {editingEvent ? 'Editar Compromisso' : 'Novo Compromisso'}
                </h3>
              </div>
              <button
                onClick={() => setShowEventModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4 text-xs">
              {/* Título */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Título do Compromisso *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Estudar AWS S3, Treino de Costas, Reunião..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Status do Compromisso: Pendente, Feito, Adiado */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Status do Compromisso</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'pending' as const, label: 'Pendente', icon: Circle, color: 'border-slate-300 bg-slate-50 text-slate-700' },
                    { id: 'completed' as const, label: 'Feito', icon: CheckCircle2, color: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
                    { id: 'postponed' as const, label: 'Adiado', icon: CalendarClock, color: 'border-amber-500 bg-amber-50 text-amber-800' },
                  ].map((st) => {
                    const isSelected = formStatus === st.id;
                    const Icon = st.icon;
                    return (
                      <button
                        type="button"
                        key={st.id}
                        onClick={() => setFormStatus(st.id)}
                        className={`py-2 px-3 rounded-xl border text-center font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? `${st.color} ring-2 ring-indigo-500/20 shadow-xs font-black`
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {st.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Data e Horários */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Data *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Início</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Término</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Categoria */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Categoria</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(Object.keys(AGENDA_CATEGORIES) as AgendaCategory[]).map((catKey) => {
                    const meta = AGENDA_CATEGORIES[catKey];
                    const isSelected = formCategory === catKey;
                    return (
                      <button
                        type="button"
                        key={catKey}
                        onClick={() => setFormCategory(catKey)}
                        className={`p-2 rounded-xl border text-center transition font-bold flex flex-col items-center gap-1 ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
                        <span className="text-[10px] truncate w-full">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Vínculo Opcional com Matéria de Estudos */}
              {formCategory === 'studies' && subjects.length > 0 && (
                <div className="space-y-1 bg-sky-50/50 p-3 rounded-2xl border border-sky-100">
                  <label className="font-bold text-sky-900 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-sky-600" />
                    Vincular a uma Matéria Cadastrada (Opcional)
                  </label>
                  <select
                    value={formSubjectId}
                    onChange={(e) => setFormSubjectId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-sky-200 rounded-xl text-slate-800 focus:outline-hidden focus:border-sky-500"
                  >
                    <option value="">Nenhuma matéria vinculada</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Lembrete & Recorrência */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 flex items-center gap-1">
                    <Bell className="w-3.5 h-3.5 text-slate-400" /> Lembrete
                  </label>
                  <select
                    value={formReminder}
                    onChange={(e) => setFormReminder(e.target.value as AgendaReminderOffset)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
                  >
                    {REMINDER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 flex items-center gap-1">
                    <Repeat className="w-3.5 h-3.5 text-slate-400" /> Repetição
                  </label>
                  <select
                    value={formRecurrence}
                    onChange={(e) => setFormRecurrence(e.target.value as AgendaRecurrence)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500"
                  >
                    {RECURRENCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Anotações Opcionais */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Anotações / Descrição</label>
                <textarea
                  rows={2}
                  placeholder="Detalhes, tópicos a cobrir ou link..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-xs transition active:scale-95"
                >
                  {editingEvent ? 'Salvar Alterações' : 'Salvar Compromisso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 8. MODAL DE ADIAR COMPROMISSO */}
      {/* ============================================================ */}
      {postponingOcc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-slate-900 text-base">Adiar Compromisso</h3>
              </div>
              <button
                onClick={() => setPostponingOcc(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200">
              <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">
                Compromisso Selecionado
              </span>
              <h4 className="font-bold text-slate-900 text-sm">{postponingOcc.title}</h4>
              <p className="text-xs text-slate-500">
                Data agendada: <strong className="text-slate-800">{formatAgendaDateBR(postponingOcc.date)}</strong>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Opções Rápidas de Adiamento</label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => handleConfirmPostpone('tomorrow')}
                  className="w-full text-left p-3 rounded-2xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 font-black text-xs flex items-center justify-center">
                      +1d
                    </span>
                    <div>
                      <span className="font-bold text-xs text-slate-800 block">Adiar para Amanhã</span>
                      <span className="text-[10px] text-slate-400">
                        {formatAgendaDateBR(calculatePostponedDate(postponingOcc.date, 1))}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600" />
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmPostpone('2days')}
                  className="w-full text-left p-3 rounded-2xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 font-black text-xs flex items-center justify-center">
                      +2d
                    </span>
                    <div>
                      <span className="font-bold text-xs text-slate-800 block">Adiar para Daqui a 2 Dias</span>
                      <span className="text-[10px] text-slate-400">
                        {formatAgendaDateBR(calculatePostponedDate(postponingOcc.date, 2))}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600" />
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmPostpone('nextWeek')}
                  className="w-full text-left p-3 rounded-2xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 font-black text-xs flex items-center justify-center">
                      +7d
                    </span>
                    <div>
                      <span className="font-bold text-xs text-slate-800 block">Adiar para Próxima Semana</span>
                      <span className="text-[10px] text-slate-400">
                        {formatAgendaDateBR(calculatePostponedDate(postponingOcc.date, 7))}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600" />
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmPostpone('markOnly')}
                  className="w-full text-left p-3 rounded-2xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-black text-xs flex items-center justify-center">
                      🏷️
                    </span>
                    <div>
                      <span className="font-bold text-xs text-slate-800 block">Apenas Marcar como Adiado</span>
                      <span className="text-[10px] text-slate-400">Mantém na data atual com status Adiado</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600" />
                </button>
              </div>
            </div>

            {/* Escolher data específica */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Ou Escolher uma Data Específica:</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={postponeTargetDate}
                  onChange={(e) => setPostponeTargetDate(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-amber-500 font-bold"
                />
                <button
                  type="button"
                  onClick={() => handleConfirmPostpone('custom')}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition"
                >
                  Mover Data
                </button>
              </div>
            </div>

            {/* Reverter para pendente se já estava adiado */}
            {postponingOcc.status === 'postponed' && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleRevertToPending(postponingOcc)}
                  className="w-full py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs transition"
                >
                  Voltar para Pendente (Desfazer Adiamento)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AgendaSection;
