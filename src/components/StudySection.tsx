import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  Plus,
  Clock,
  Calendar,
  Layers,
  Edit3,
  Trash2,
  X,
  CheckCircle2,
  Filter,
  Sparkles,
  Code,
  Cloud,
  Database,
  Terminal,
  Cpu,
  Brain,
  Zap,
} from 'lucide-react';
import { db } from '../lib/db';
import type { Subject, StudySession } from '../types';
import {
  calculateStudyWeeklyStats,
  formatStudyDuration,
  formatStudyRelativeDate,
  buildStudySession,
  STUDY_COLOR_PRESETS,
  STUDY_ICON_PRESETS,
} from '../lib/studyEngine';

interface StudySectionProps {
  onStartFocus?: (subjectId?: string) => void;
}

export function StudySection({ onStartFocus }: StudySectionProps) {
  // Dados Reativos do Dexie
  const subjects = useLiveQuery(() => db.subjects.filter((s) => !s.archived).toArray()) || [];
  const sessions = useLiveQuery(() => db.studySessions.toArray()) || [];

  // Filtro do Histórico por Matéria
  const [historySubjectFilter, setHistorySubjectFilter] = useState<string>('all');

  // Estado do Modal de Registro/Edição de Estudo
  const [showLogModal, setShowLogModal] = useState<boolean>(false);
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);
  const [logSubjectId, setLogSubjectId] = useState<string>('');
  const [logDateStr, setLogDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [logHours, setLogHours] = useState<number>(1);
  const [logMinutes, setLogMinutes] = useState<number>(0);
  const [logNotes, setLogNotes] = useState<string>('');

  // Estado do Modal de Criação/Edição de Matéria
  const [showSubjectModal, setShowSubjectModal] = useState<boolean>(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subName, setSubName] = useState<string>('');
  const [subColor, setSubColor] = useState<string>('#6366f1');
  const [subIcon, setSubIcon] = useState<string>('book');

  // Estatísticas Semanais
  const weeklyStats = useMemo(() => {
    return calculateStudyWeeklyStats(sessions, subjects, new Date());
  }, [sessions, subjects]);

  // Histórico ordenado por data e horário (mais recente primeiro)
  const sortedSessions = useMemo(() => {
    return [...sessions]
      .filter((s) => s.status === 'completed')
      .sort((a, b) => {
        const timeA = a.startedAt || a.createdAt;
        const timeB = b.startedAt || b.createdAt;
        return timeB - timeA;
      });
  }, [sessions]);

  // Histórico filtrado pela matéria selecionada
  const filteredSessions = useMemo(() => {
    if (historySubjectFilter === 'all') return sortedSessions;
    return sortedSessions.filter((s) => s.subjectId === historySubjectFilter);
  }, [sortedSessions, historySubjectFilter]);

  // Mapa de Matérias por ID para lookup rápido
  const subjectMap = useMemo(() => {
    const map = new Map<string, Subject>();
    subjects.forEach((s) => map.set(s.id, s));
    return map;
  }, [subjects]);

  // Renderiza o ícone visual da matéria
  const renderIcon = (iconId?: string, className = 'w-4 h-4') => {
    switch (iconId) {
      case 'code':
        return <Code className={className} />;
      case 'cloud':
        return <Cloud className={className} />;
      case 'database':
        return <Database className={className} />;
      case 'terminal':
        return <Terminal className={className} />;
      case 'cpu':
        return <Cpu className={className} />;
      case 'brain':
        return <Brain className={className} />;
      case 'sparkles':
        return <Sparkles className={className} />;
      case 'book':
      default:
        return <BookOpen className={className} />;
    }
  };

  // Abrir Modal para Novo Registro de Estudo
  const handleOpenNewLogModal = (preselectedSubjectId?: string) => {
    setEditingSession(null);
    setLogSubjectId(preselectedSubjectId || (subjects.length > 0 ? subjects[0].id : ''));
    setLogDateStr(new Date().toISOString().slice(0, 10));
    setLogHours(1);
    setLogMinutes(0);
    setLogNotes('');
    setShowLogModal(true);
  };

  // Abrir Modal para Editar Registro de Estudo Existente
  const handleOpenEditLogModal = (session: StudySession) => {
    setEditingSession(session);
    setLogSubjectId(session.subjectId || (subjects.length > 0 ? subjects[0].id : ''));
    const sessionDate = session.startedAt
      ? new Date(session.startedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setLogDateStr(sessionDate);
    const totalMins = Math.max(1, Math.round((session.actualDurationSeconds || 0) / 60));
    setLogHours(Math.floor(totalMins / 60));
    setLogMinutes(totalMins % 60);
    setLogNotes(session.notes || '');
    setShowLogModal(true);
  };

  // Salvar Registro de Estudo (Novo ou Editado)
  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logSubjectId && subjects.length > 0) {
      alert('Por favor, selecione uma matéria para registrar o estudo.');
      return;
    }

    const totalMinutes = logHours * 60 + logMinutes;
    if (totalMinutes <= 0) {
      alert('Informe um tempo de estudo válido (mínimo de 1 minuto).');
      return;
    }

    const studySession = buildStudySession({
      subjectId: logSubjectId,
      dateStr: logDateStr,
      hours: logHours,
      minutes: logMinutes,
      notes: logNotes,
      existingSession: editingSession || undefined,
    });

    await db.studySessions.put(studySession);
    setShowLogModal(false);
  };

  // Excluir Registro de Estudo
  const handleDeleteLog = async (session: StudySession) => {
    const subName = subjectMap.get(session.subjectId || '')?.name || 'Estudo';
    if (confirm(`Deseja excluir este registro de estudo de "${subName}"?`)) {
      await db.studySessions.delete(session.id);
    }
  };

  // Abrir Modal de Matéria (Nova)
  const handleOpenNewSubjectModal = () => {
    setEditingSubject(null);
    setSubName('');
    setSubColor('#6366f1');
    setSubIcon('book');
    setShowSubjectModal(true);
  };

  // Abrir Modal de Matéria (Edição)
  const handleOpenEditSubjectModal = (sub: Subject) => {
    setEditingSubject(sub);
    setSubName(sub.name);
    setSubColor(sub.color || '#6366f1');
    setSubIcon(sub.icon || 'book');
    setShowSubjectModal(true);
  };

  // Salvar Matéria (Nova ou Editada)
  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = subName.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (editingSubject) {
      await db.subjects.update(editingSubject.id, {
        name: trimmed,
        color: subColor,
        icon: subIcon,
        updatedAt: now,
      });
    } else {
      const newSubject: Subject = {
        id: `sub_${now}_${Math.random().toString(36).substring(2, 7)}`,
        name: trimmed,
        color: subColor,
        icon: subIcon,
        priority: 'medium',
        category: 'self_study',
        targetMinutesPerWeek: 120,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.subjects.add(newSubject);
    }

    setShowSubjectModal(false);
  };

  // Excluir Matéria
  const handleDeleteSubject = async (sub: Subject) => {
    if (
      confirm(
        `Deseja realmente excluir a matéria "${sub.name}"?\n\nSeus registros de estudo anteriores serão mantidos no histórico.`
      )
    ) {
      await db.subjects.delete(sub.id);
    }
  };

  // Preset rápido de tempo no modal de estudo
  const handleSetQuickDuration = (h: number, m: number) => {
    setLogHours(h);
    setLogMinutes(m);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* ============================================================ */}
      {/* 1. CABEÇALHO DA SEÇÃO ESTUDOS */}
      {/* ============================================================ */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Estudos</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Organize suas matérias, registre seu tempo e acompanhe sua evolução semanal.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => handleOpenNewLogModal()}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4 py-3 rounded-2xl shadow-sm transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Registrar Estudo
        </button>
      </header>

      {/* ============================================================ */}
      {/* 2. TOP CARDS: MÉTRICAS DA SEMANA */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total de Horas Estudadas na Semana */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Horas na Semana
            </span>
            <span className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {weeklyStats.formattedTotalHours}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Nesta semana (segunda a domingo)
            </span>
          </div>
        </div>

        {/* Quantidade de Matérias Estudadas na Semana */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Matérias Estudadas
            </span>
            <span className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {weeklyStats.subjectsStudiedCount}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              de {subjects.length} matéria(s) cadastrada(s)
            </span>
          </div>
        </div>

        {/* Total de Sessões na Semana */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Sessões Realizadas
            </span>
            <span className="p-1.5 rounded-xl bg-amber-50 text-amber-600">
              <Sparkles className="w-4 h-4" />
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">
              {weeklyStats.sessionsCountThisWeek}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {sortedSessions.length} no histórico total
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. SEÇÃO: MINHAS MATÉRIAS */}
      {/* ============================================================ */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <h3 className="font-extrabold text-slate-900 text-sm">
              Minhas Matérias ({subjects.length})
            </h3>
          </div>

          <button
            onClick={handleOpenNewSubjectModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Matéria
          </button>
        </div>

        {/* Lista de Cards de Matérias */}
        {subjects.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-700">Nenhuma matéria cadastrada ainda</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Cadastre suas matérias para começar a registrar seus estudos.
              </p>
            </div>
            <button
              onClick={handleOpenNewSubjectModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition"
            >
              <Plus className="w-4 h-4" /> Cadastrar Primeira Matéria
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {subjects.map((sub) => {
              const weekMinutes = weeklyStats.subjectWeeklyMinutesMap.get(sub.id) || 0;
              const totalMinutes = weeklyStats.subjectTotalMinutesMap.get(sub.id) || 0;

              return (
                <div
                  key={sub.id}
                  className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 transition flex flex-col justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                        style={{ backgroundColor: sub.color || '#6366f1' }}
                      >
                        {renderIcon(sub.icon, 'w-4 h-4')}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-sm truncate" title={sub.name}>
                          {sub.name}
                        </h4>
                        <div className="text-[11px] text-slate-400">
                          {totalMinutes > 0 ? `${formatStudyDuration(totalMinutes)} no total` : 'Sem registros'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditSubjectModal(sub)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                        title="Editar matéria"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(sub)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Excluir matéria"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Nesta semana
                      </span>
                      <span
                        className={`text-xs font-extrabold mt-0.5 block ${
                          weekMinutes > 0 ? 'text-indigo-600' : 'text-slate-500'
                        }`}
                      >
                        {formatStudyDuration(weekMinutes)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onStartFocus && (
                        <button
                          onClick={() => onStartFocus(sub.id)}
                          className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center gap-1 transition"
                          title="Iniciar cronômetro de foco nesta matéria"
                        >
                          <Zap className="w-3 h-3 text-amber-500" />
                          Foco
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenNewLogModal(sub.id)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center gap-1 transition"
                        title="Registrar estudo nesta matéria"
                      >
                        <Plus className="w-3 h-3" />
                        Registrar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 4. SEÇÃO: HISTÓRICO DE ESTUDOS */}
      {/* ============================================================ */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h3 className="font-extrabold text-slate-900 text-sm">
              Histórico de Estudos ({filteredSessions.length})
            </h3>
          </div>

          {/* Filtro por Matéria */}
          {subjects.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={historySubjectFilter}
                onChange={(e) => setHistorySubjectFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500 transition cursor-pointer"
              >
                <option value="all">Todas as Matérias</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {filteredSessions.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Clock className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              {historySubjectFilter !== 'all'
                ? 'Nenhum estudo registrado para a matéria selecionada.'
                : 'Nenhum estudo registrado ainda.'}
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Clique no botão "Registrar Estudo" acima para salvar o tempo e o conteúdo das suas sessões.
            </p>
            {subjects.length > 0 && (
              <button
                onClick={() =>
                  handleOpenNewLogModal(historySubjectFilter !== 'all' ? historySubjectFilter : undefined)
                }
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" /> Registrar Agora
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSessions.map((session) => {
              const sub = subjectMap.get(session.subjectId || '');
              const totalMins = Math.max(1, Math.round((session.actualDurationSeconds || 0) / 60));
              const dateStr = session.startedAt
                ? new Date(session.startedAt).toISOString().slice(0, 10)
                : new Date(session.createdAt).toISOString().slice(0, 10);

              return (
                <div
                  key={session.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 px-2 rounded-xl transition"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5 shadow-2xs"
                      style={{ backgroundColor: sub?.color || '#94a3b8' }}
                    >
                      {renderIcon(sub?.icon, 'w-4 h-4')}
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {sub?.name || 'Estudo Geral'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                          {formatStudyDuration(totalMins)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatStudyRelativeDate(dateStr)}
                        </span>
                      </div>

                      {session.notes && (
                        <p className="text-xs text-slate-600 italic break-words">
                          "{session.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => handleOpenEditLogModal(session)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                      title="Editar registro"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteLog(session)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      title="Excluir registro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODAL 1: REGISTRAR / EDITAR ESTUDO */}
      {/* ============================================================ */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900">
                  {editingSession ? 'Editar Registro de Estudo' : 'Registrar Estudo'}
                </h3>
              </div>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLog} className="space-y-4">
              {/* Seleção de Matéria */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Matéria *</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogModal(false);
                      handleOpenNewSubjectModal();
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:underline"
                  >
                    + Nova Matéria
                  </button>
                </div>

                {subjects.length === 0 ? (
                  <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs flex items-center justify-between">
                    <span>Nenhuma matéria cadastrada.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLogModal(false);
                        handleOpenNewSubjectModal();
                      }}
                      className="font-bold underline"
                    >
                      Cadastrar agora
                    </button>
                  </div>
                ) : (
                  <select
                    value={logSubjectId}
                    onChange={(e) => setLogSubjectId(e.target.value)}
                    required
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Data do Estudo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Data do Estudo *
                </label>
                <input
                  type="date"
                  required
                  value={logDateStr}
                  onChange={(e) => setLogDateStr(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>

              {/* Tempo Estudado (Horas e Minutos) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tempo Estudado *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Horas</span>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={logHours}
                      onChange={(e) => setLogHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-sm font-bold text-center px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block mb-0.5">Minutos</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={logMinutes}
                      onChange={(e) => setLogMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                      className="w-full text-sm font-bold text-center px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Chips de Atalho Rápido */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-400 self-center mr-1">Atalhos:</span>
                  {[
                    { label: '25m', h: 0, m: 25 },
                    { label: '50m', h: 0, m: 50 },
                    { label: '1h', h: 1, m: 0 },
                    { label: '1h 30m', h: 1, m: 30 },
                    { label: '2h', h: 2, m: 0 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleSetQuickDuration(preset.h, preset.m)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition ${
                        logHours === preset.h && logMinutes === preset.m
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Observação Opcional */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observação (Opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Resolução de exercícios práticos, leitura do capítulo 3, setup de containers..."
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Ações */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: CADASTRAR / EDITAR MATÉRIA */}
      {/* ============================================================ */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                {editingSubject ? 'Editar Matéria' : 'Nova Matéria'}
              </h3>
              <button
                onClick={() => setShowSubjectModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome da Matéria *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: AWS e Cloud, Java, Python, Banco de Dados..."
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-semibold"
                />
              </div>

              {/* Seletor de Cores */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Cor da Matéria
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {STUDY_COLOR_PRESETS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setSubColor(c.hex)}
                      className={`w-7 h-7 rounded-xl transition-all ${
                        subColor === c.hex
                          ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-xs'
                          : 'opacity-85 hover:opacity-100 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                  <input
                    type="color"
                    value={subColor}
                    onChange={(e) => setSubColor(e.target.value)}
                    className="w-7 h-7 rounded-xl cursor-pointer border-0 bg-transparent p-0"
                    title="Cor personalizada"
                  />
                </div>
              </div>

              {/* Seletor de Ícones Opcionais */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Ícone Opcional
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {STUDY_ICON_PRESETS.map((icon) => (
                    <button
                      key={icon.id}
                      type="button"
                      onClick={() => setSubIcon(icon.id)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
                        subIcon === icon.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-bold'
                          : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {renderIcon(icon.id, 'w-4 h-4')}
                      <span className="text-[10px]">{icon.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ações */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSubjectModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default StudySection;
