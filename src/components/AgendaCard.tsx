import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import {
  CalendarDays,
  CalendarClock,
  Clock,
  CheckCircle2,
  Circle,
  ChevronRight,
  Plus,
  Bell,
  Sparkles,
  X,
} from 'lucide-react';
import { db } from '../lib/db';
import {
  getEventOccurrencesForRange,
  getAgendaCategoryMeta,
  formatAgendaTime,
  formatAgendaDateFullBR,
  formatAgendaDateBR,
  calculatePostponedDate,
  resolveEventStatus,
} from '../lib/agendaEngine';
import type { AgendaOccurrence, AgendaEventStatus } from '../types';

interface AgendaCardProps {
  onOpenAgendaPage: () => void;
  onOpenNewEventModal?: () => void;
}

export function AgendaCard({ onOpenAgendaPage, onOpenNewEventModal }: AgendaCardProps) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayLabel = useMemo(() => formatAgendaDateFullBR(todayStr), [todayStr]);

  // Consulta reativa do Dexie
  const events = useLiveQuery(() => db.agendaEvents.toArray()) || [];

  // Estado para modal rápido de adiamento
  const [postponingOcc, setPostponingOcc] = useState<AgendaOccurrence | null>(null);

  // Ocorrências de hoje
  const todayOccurrences = useMemo(() => {
    return getEventOccurrencesForRange(events, todayStr, todayStr);
  }, [events, todayStr]);

  const totalCount = todayOccurrences.length;
  const completedCount = todayOccurrences.filter((o) => o.status === 'completed' || o.completed).length;
  const postponedCount = todayOccurrences.filter((o) => o.status === 'postponed').length;
  const pendingCount = totalCount - completedCount - postponedCount;

  // Próximo evento não concluído de hoje
  const nextEvent = useMemo(() => {
    return todayOccurrences.find((o) => o.status !== 'completed' && !o.completed);
  }, [todayOccurrences]);

  // Toggle de conclusão de evento (Feito <-> Pendente)
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
        confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } });
      } catch {
        // Ignorar se bloqueado
      }
    }
  };

  // Adiar compromisso rapidamente
  const handlePostpone = async (occ: AgendaOccurrence, days: number | 'markOnly') => {
    const master = events.find((e) => e.id === occ.masterEventId);
    if (!master) return;

    const targetDate = days === 'markOnly' ? occ.date : calculatePostponedDate(occ.date, days);
    const now = Date.now();

    await db.agendaEvents.update(master.id, {
      status: 'postponed',
      completed: false,
      date: targetDate,
      originalDate: targetDate !== occ.date ? occ.date : (master.originalDate || occ.date),
      postponedAt: now,
      updatedAt: now,
    });

    setPostponingOcc(null);
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between">
      {/* Topo do Card */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Agenda de Hoje</h3>
              <span className="text-[10px] text-slate-400 font-medium capitalize truncate block max-w-[160px] sm:max-w-[200px]">
                {todayLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onOpenNewEventModal && (
              <button
                onClick={onOpenNewEventModal}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition"
                title="Novo compromisso"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onOpenAgendaPage}
              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition flex items-center gap-0.5 text-xs font-bold"
              title="Abrir agenda completa"
            >
              <span className="text-[11px] text-slate-500 hover:text-indigo-700">Ver tudo</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Resumo Rápido de Hoje */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Compromissos
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                pendingCount === 0 && totalCount > 0
                  ? 'bg-emerald-100/70 text-emerald-800'
                  : 'bg-indigo-100/70 text-indigo-800'
              }`}
            >
              {totalCount === 0
                ? 'Dia Livre'
                : pendingCount === 0
                ? 'Tudo Concluído! 🏆'
                : `${pendingCount} pendente(s)`}
            </span>
          </div>

          <div className="flex items-baseline justify-between flex-wrap gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{totalCount}</span>
              <span className="text-xs text-slate-400 font-semibold">
                evento(s) agendado(s) hoje
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
                {completedCount} feito(s)
              </span>
              {postponedCount > 0 && (
                <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">
                  {postponedCount} adiado(s)
                </span>
              )}
            </div>
          </div>

          {/* Destaque do próximo evento */}
          {nextEvent && (
            <div className="pt-2 border-t border-slate-200/50 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="font-bold text-slate-700 truncate">{nextEvent.title}</span>
              </div>
              <span className="text-[11px] font-extrabold text-indigo-600 shrink-0">
                {formatAgendaTime(nextEvent.startTime, nextEvent.endTime)}
              </span>
            </div>
          )}
        </div>

        {/* Lista dos Compromissos do Dia */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Linha do Tempo</span>
            <span className="text-[10px] font-semibold text-slate-400">
              {completedCount}/{totalCount} feitos
            </span>
          </div>

          {todayOccurrences.length > 0 ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {todayOccurrences.map((occ) => {
                const catMeta = getAgendaCategoryMeta(occ.category);
                return (
                  <div
                    key={occ.id}
                    className={`p-2 rounded-xl border transition-all select-none flex items-center justify-between gap-2.5 text-xs ${
                      occ.status === 'completed'
                        ? 'bg-slate-50 border-slate-200/60 text-slate-400'
                        : occ.status === 'postponed'
                        ? 'bg-amber-50/40 border-amber-300 text-slate-800'
                        : 'bg-white border-slate-200/80 hover:bg-slate-50/80 text-slate-800'
                    }`}
                  >
                    <div
                      onClick={() => handleToggleComplete(occ)}
                      className="flex items-center gap-2 min-w-0 cursor-pointer flex-1"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition ${
                          occ.status === 'completed'
                            ? 'text-emerald-500'
                            : occ.status === 'postponed'
                            ? 'text-amber-500'
                            : 'text-slate-300 hover:text-emerald-500'
                        }`}
                      >
                        {occ.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white" />
                        ) : (
                          <Circle className="w-4 h-4 stroke-[1.8]" />
                        )}
                      </div>

                      <div className="truncate">
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={`font-bold text-[11px] truncate ${
                              occ.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'
                            }`}
                          >
                            {occ.title}
                          </span>
                          {occ.status === 'postponed' && (
                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                              Adiado
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-400 flex items-center gap-1.5">
                          <span>{formatAgendaTime(occ.startTime, occ.endTime)}</span>
                          <span>•</span>
                          <span
                            className="font-semibold"
                            style={{ color: catMeta.color }}
                          >
                            {catMeta.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPostponingOcc(occ);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition"
                        title="Adiar compromisso"
                      >
                        <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                      </button>

                      {occ.reminder !== 'none' && (
                        <span className="p-1 rounded-md bg-slate-100 text-slate-400 shrink-0" title="Lembrete ativo">
                          <Bell className="w-3 h-3 text-indigo-500" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-center text-slate-400 rounded-xl bg-slate-50/50 border border-dashed border-slate-200 space-y-1">
              <Sparkles className="w-5 h-5 mx-auto text-amber-400 mb-1" />
              <p className="text-[11px] font-semibold text-slate-600">Sem compromissos hoje</p>
              <p className="text-[10px] text-slate-400">Aproveite para focar em estudos ou descanso.</p>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé com Atalho Direto para a Agenda */}
      <div className="pt-2">
        <button
          onClick={onOpenAgendaPage}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold transition active:scale-95 border border-indigo-100"
        >
          <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
          <span>Acessar Agenda Completa</span>
          <ChevronRight className="w-3.5 h-3.5 ml-auto text-indigo-500" />
        </button>
      </div>

      {/* Modal Rápido de Adiamento no Dashboard */}
      {postponingOcc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-xl border border-slate-100 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-900 font-extrabold text-sm">
                <CalendarClock className="w-4 h-4 text-amber-600" />
                <span>Adiar Compromisso</span>
              </div>
              <button
                onClick={() => setPostponingOcc(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs">
              <p className="font-bold text-slate-900 truncate">{postponingOcc.title}</p>
              <p className="text-[10px] text-slate-500">
                Data agendada: {formatAgendaDateBR(postponingOcc.date)}
              </p>
            </div>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => handlePostpone(postponingOcc, 1)}
                className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 text-xs font-bold text-slate-800 flex items-center justify-between transition"
              >
                <span>Adiar para Amanhã (+1d)</span>
                <span className="text-[10px] text-slate-400">
                  {formatAgendaDateBR(calculatePostponedDate(postponingOcc.date, 1))}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handlePostpone(postponingOcc, 7)}
                className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 text-xs font-bold text-slate-800 flex items-center justify-between transition"
              >
                <span>Adiar para Próxima Semana (+7d)</span>
                <span className="text-[10px] text-slate-400">
                  {formatAgendaDateBR(calculatePostponedDate(postponingOcc.date, 7))}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handlePostpone(postponingOcc, 'markOnly')}
                className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 text-xs font-bold text-slate-800 flex items-center justify-between transition"
              >
                <span>Apenas Marcar como Adiado</span>
                <span className="text-[10px] text-slate-400">Mantém hoje</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgendaCard;
