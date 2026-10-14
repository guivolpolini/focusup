import React, { useState, useMemo } from 'react';
import type { LearningPath, Subject, SessionMode } from '../types';
import { db } from '../lib/db';
import {
  parseRawLearningPathText,
  organizeTrackPacing,
  generateTasksFromTrack,
  toggleLessonItemCompletion,
  generateAILearningPath,
} from '../lib/trackOrganizerEngine';
import {
  Sparkles,
  Play,
  CheckCircle2,
  Calendar,
  Clock,
  Layers,
  Trash2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Upload,
  BookOpen,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  X,
  Target,
} from 'lucide-react';

interface LearningTracksSectionProps {
  learningPaths: LearningPath[];
  subjects: Subject[];
  onStartFocus: (mode: SessionMode, minutes?: number, subjectId?: string, taskId?: string) => void;
  onTriggerVictory: () => void;
}

export const LearningTracksSection: React.FC<LearningTracksSectionProps> = ({
  learningPaths,
  subjects,
  onStartFocus,
  onTriggerVictory,
}) => {
  // Modal de criação / importação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'text' | 'ai' | 'file'>('text');

  // Form states - Texto Livre / Ementa
  const [trackTitle, setTrackTitle] = useState('');
  const [trackCategory, setTrackCategory] = useState('Autodidata');
  const [trackLevel, setTrackLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [hoursPerWeek, setHoursPerWeek] = useState(5);
  const [rawText, setRawText] = useState('');
  const [autoScheduleTasks, setAutoScheduleTasks] = useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');

  // Form states - AI
  const [aiTopic, setAiTopic] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Expansão de módulos por trilha
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // Estatísticas globais das trilhas
  const stats = useMemo(() => {
    let totalItems = 0;
    let completedItems = 0;
    let totalEstimatedMinutes = 0;
    let completedMinutes = 0;

    for (const p of learningPaths) {
      for (const m of p.modules) {
        for (const it of m.items) {
          totalItems += 1;
          const estMin = it.estimatedMinutes || (it.type === 'project' ? 90 : it.type === 'exercise' ? 45 : 30);
          totalEstimatedMinutes += estMin;
          if (it.completed) {
            completedItems += 1;
            completedMinutes += estMin;
          }
        }
      }
    }

    const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const remainingHours = Math.round(Math.max(0, totalEstimatedMinutes - completedMinutes) / 60);

    return {
      activeTracksCount: learningPaths.length,
      totalItems,
      completedItems,
      overallProgress,
      remainingHours,
    };
  }, [learningPaths]);

  const toggleModuleAccordion = (trackId: string, modId: string) => {
    const key = `${trackId}-${modId}`;
    setExpandedModules((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? true : !prev[key],
    }));
  };

  const handleCreateFromText = async () => {
    if (!rawText.trim()) {
      alert('Por favor, cole o conteúdo ou tópicos da trilha.');
      return;
    }

    try {
      const parsed = parseRawLearningPathText(rawText, {
        title: trackTitle.trim() || undefined,
        category: trackCategory,
        level: trackLevel,
        defaultHoursPerWeek: hoursPerWeek,
      });

      // Se usuário vinculou ou precisa criar matéria
      let subjectId = selectedSubjectId;
      if (!subjectId) {
        // Criar matéria correspondente automaticamente
        const newSubjectId = `sub-track-${Date.now()}`;
        const newSub: Subject = {
          id: newSubjectId,
          name: parsed.title,
          color: '#6366f1',
          priority: 'medium',
          category: 'self_study',
          targetMinutesPerWeek: hoursPerWeek * 60,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.subjects.add(newSub);
        subjectId = newSubjectId;
      }

      parsed.subjectId = subjectId;

      if (autoScheduleTasks) {
        const { tasks, updatedPath } = generateTasksFromTrack(parsed, subjectId);
        if (tasks.length > 0) {
          await db.tasks.bulkAdd(tasks);
        }
        await db.learningPaths.add(updatedPath);
      } else {
        await db.learningPaths.add(parsed);
      }

      onTriggerVictory();
      setIsModalOpen(false);
      resetModalForm();
    } catch (err: any) {
      console.error('Erro ao criar trilha:', err);
      alert(`Falha ao criar trilha: ${err.message || err}`);
    }
  };

  const handleGenerateAI = async () => {
    if (!aiTopic.trim()) {
      alert('Informe o que você deseja aprender.');
      return;
    }

    setIsAiLoading(true);
    try {
      const generated = await generateAILearningPath(aiTopic.trim(), {
        level: trackLevel,
        targetHoursPerWeek: hoursPerWeek,
      });

      let subjectId = selectedSubjectId;
      if (!subjectId) {
        const newSubjectId = `sub-track-${Date.now()}`;
        const newSub: Subject = {
          id: newSubjectId,
          name: generated.title,
          color: '#4f46e5',
          priority: 'medium',
          category: 'self_study',
          targetMinutesPerWeek: hoursPerWeek * 60,
          archived: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.subjects.add(newSub);
        subjectId = newSubjectId;
      }

      generated.subjectId = subjectId;

      if (autoScheduleTasks) {
        const { tasks, updatedPath } = generateTasksFromTrack(generated, subjectId);
        if (tasks.length > 0) {
          await db.tasks.bulkAdd(tasks);
        }
        await db.learningPaths.add(updatedPath);
      } else {
        await db.learningPaths.add(generated);
      }

      onTriggerVictory();
      setIsModalOpen(false);
      resetModalForm();
    } catch (err: any) {
      console.error('Erro ao gerar com IA:', err);
      alert(`Falha ao gerar trilha: ${err.message || err}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        if (!trackTitle) {
          const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          setTrackTitle(cleanName);
        }
        setModalTab('text');
      }
    };
    reader.readAsText(file);
  };

  const resetModalForm = () => {
    setTrackTitle('');
    setRawText('');
    setAiTopic('');
    setSelectedSubjectId('');
    setHoursPerWeek(5);
  };

  const handleDeleteTrack = async (track: LearningPath) => {
    if (confirm(`Tem certeza que deseja excluir a trilha "${track.title}"?`)) {
      // Remover tarefas vinculadas se houver
      const linkedTasks = await db.tasks.where('learningPathId').equals(track.id).toArray();
      if (linkedTasks.length > 0) {
        await db.tasks.bulkDelete(linkedTasks.map((t) => t.id));
      }
      await db.learningPaths.delete(track.id);
    }
  };

  const handleScheduleTasksForTrack = async (track: LearningPath) => {
    try {
      const targetSubjectId = track.subjectId || subjects[0]?.id;
      if (!targetSubjectId) {
        alert('Crie ou selecione uma matéria para vincular as tarefas.');
        return;
      }

      const { tasks, updatedPath } = generateTasksFromTrack(track, targetSubjectId);
      if (tasks.length > 0) {
        await db.tasks.bulkPut(tasks);
        await db.learningPaths.update(track.id, {
          modules: updatedPath.modules,
          updatedAt: Date.now(),
        });
        onTriggerVictory();
        alert(`${tasks.length} tarefas agendadas no seu cronograma com sucesso!`);
      } else {
        alert('Todas as tarefas desta trilha já foram concluídas ou agendadas.');
      }
    } catch (err: any) {
      console.error('Erro ao sincronizar tarefas:', err);
      alert(`Falha ao sincronizar: ${err.message || err}`);
    }
  };

  const handleToggleItem = async (track: LearningPath, modId: string, itemId: string) => {
    const { path: updatedPath, completed } = toggleLessonItemCompletion(track, modId, itemId);

    // Se o item tem tarefa associada no cronograma, sincroniza
    const mod = track.modules.find((m) => m.id === modId);
    const item = mod?.items.find((it) => it.id === itemId);
    if (item?.taskId) {
      await db.tasks.update(item.taskId, {
        status: completed ? 'completed' : 'pending',
        completedAt: completed ? Date.now() : undefined,
        updatedAt: Date.now(),
      });
    }

    await db.learningPaths.update(track.id, {
      modules: updatedPath.modules,
      updatedAt: Date.now(),
    });

    if (completed) onTriggerVictory();
  };

  return (
    <div className="space-y-6">
      {/* Header com Ação Principal */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-black text-slate-900">Trilhas de Aprendizado & Roteiros</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Envie e organize qualquer ementa ou roteiro de estudos com metas semanais, ritmo inteligente e tarefas no cronograma.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-100 transition active:scale-95 self-start sm:self-auto"
        >
          <Sparkles className="w-4 h-4" />
          <span>+ Enviar ou Criar Trilha</span>
        </button>
      </header>

      {/* Cards de Métricas Gerais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Trilhas Ativas</span>
            <BookOpen className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-xl font-black text-slate-900">{stats.activeTracksCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Roteiros em andamento</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Progresso Geral</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-xl font-black text-slate-900">{stats.overallProgress}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {stats.completedItems} de {stats.totalItems} lições concluídas
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Horas Restantes</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-xl font-black text-slate-900">~{stats.remainingHours}h</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Estimativa para conclusão</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Organização</span>
            <Target className="w-4 h-4 text-purple-500" />
          </div>
          <div className="mt-2 text-xl font-black text-indigo-600">Ritmo Ativo</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Sincronizado com tarefas</div>
        </div>
      </div>

      {/* Lista de Trilhas de Aprendizado */}
      {learningPaths.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-dashed border-slate-300 text-center space-y-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="font-extrabold text-slate-900 text-base">Nenhuma trilha cadastrada ainda</h3>
            <p className="text-xs text-slate-500 mt-1">
              Cole uma ementa, gere um roteiro com IA ou importe um arquivo de tópicos. O FocusUp organiza os módulos, o ritmo semanal e cria tarefas no seu calendário.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Criar Minha Primeira Trilha</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {learningPaths.map((track) => {
            const { summary } = organizeTrackPacing(track, {
              targetHoursPerWeek: track.targetHoursPerWeek || 5,
            });

            return (
              <div
                key={track.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {track.category} • {track.level.toUpperCase()}
                        </span>
                        {summary.pacingStatus === 'behind' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Precisa Acelerar
                          </span>
                        )}
                        {summary.pacingStatus === 'completed' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Trilha Concluída!
                          </span>
                        )}
                      </div>
                      <h3 className="font-extrabold text-slate-900 text-lg leading-tight mt-1">{track.title}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2">{track.description}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleScheduleTasksForTrack(track)}
                        title="Agendar tarefas no cronograma diário"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      >
                        <CalendarDays className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTrack(track)}
                        title="Excluir trilha"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Informações de Ritmo e Progresso */}
                  <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{track.targetHoursPerWeek || 5}h / semana</span>
                      </div>
                      {summary.targetEndDate && (
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Conclusão prevista: {summary.targetEndDate}</span>
                        </div>
                      )}
                    </div>

                    {/* Barra de Progresso */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-slate-600">
                          {summary.completedItems} de {summary.totalItems} aulas e projetos
                        </span>
                        <span className="text-indigo-600 font-mono">{summary.progressPercent}%</span>
                      </div>
                      <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${summary.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Próximo Passo Recomendado */}
                  {summary.currentStep && (
                    <div className="p-3.5 bg-indigo-50/70 rounded-2xl border border-indigo-100 flex items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-[10px] font-black uppercase text-indigo-600 tracking-wider flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />
                          <span>Próxima Ação Recomendada</span>
                        </div>
                        <div className="font-bold text-xs text-slate-900 truncate">
                          {summary.currentStep.item.title}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {summary.currentStep.moduleTitle} • {summary.currentStep.item.estimatedMinutes || 30} min
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          onStartFocus('pomodoro', 25, track.subjectId, summary.currentStep?.item.taskId)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition shrink-0 active:scale-95"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Focar Agora</span>
                      </button>
                    </div>
                  )}

                  {/* Lista de Módulos (Acordeão) */}
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-bold text-slate-800">Módulos & Conteúdo:</div>
                    {track.modules.map((mod, modIdx) => {
                      const modKey = `${track.id}-${mod.id}`;
                      const isExpanded = expandedModules[modKey] !== false; // padrão aberto
                      const modCompleted = mod.items.filter((i) => i.completed).length;
                      const modTotal = mod.items.length;

                      return (
                        <div key={mod.id} className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => toggleModuleAccordion(track.id, mod.id)}
                            className="w-full p-3 bg-slate-50/60 hover:bg-slate-100/60 transition flex items-center justify-between text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
                                {modIdx + 1}
                              </span>
                              <div>
                                <div className="font-bold text-xs text-slate-800">{mod.title}</div>
                                {mod.targetDate && (
                                  <div className="text-[10px] text-slate-400">
                                    Meta: {mod.targetDate} • {modCompleted}/{modTotal} concluídos
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-slate-400">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="p-3 space-y-1.5 bg-white border-t border-slate-100">
                              {mod.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between text-xs p-2 rounded-xl hover:bg-slate-50 border border-slate-100 transition"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleItem(track, mod.id, item.id)}
                                      className={`w-4 h-4 rounded-md border flex items-center justify-center transition shrink-0 ${
                                        item.completed
                                          ? 'bg-emerald-600 border-emerald-600 text-white'
                                          : 'border-slate-300 hover:border-indigo-500'
                                      }`}
                                    >
                                      {item.completed && <CheckCircle2 className="w-3 h-3 stroke-[3]" />}
                                    </button>
                                    <span
                                      className={`truncate ${
                                        item.completed ? 'line-through text-slate-400' : 'text-slate-800 font-medium'
                                      }`}
                                    >
                                      {item.title}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span
                                      className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                                        item.type === 'project'
                                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                                          : item.type === 'exercise'
                                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                                          : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                      }`}
                                    >
                                      {item.type}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {item.estimatedMinutes || 30}m
                                    </span>
                                    {!item.completed && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onStartFocus('pomodoro', 25, track.subjectId, item.taskId)
                                        }
                                        className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 p-1 rounded-md hover:bg-slate-100 transition"
                                        title="Focar nesta lição"
                                      >
                                        <Play className="w-3 h-3 fill-current" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Enviar / Criar Nova Trilha Inteligente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-lg">Organizar Trilha de Aprendizado</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tabs do Modal */}
            <div className="flex p-1 bg-slate-100 rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => setModalTab('text')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                  modalTab === 'text' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Colar Roteiro / Ementa
              </button>
              <button
                type="button"
                onClick={() => setModalTab('ai')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 ${
                  modalTab === 'ai' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gerar com IA</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('file')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
                  modalTab === 'file' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Importar Arquivo (.md / .txt)
              </button>
            </div>

            {/* Configurações Gerais da Trilha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Carga Horária Semanal</label>
                <select
                  value={hoursPerWeek}
                  onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 font-medium focus:outline-hidden"
                >
                  <option value={3}>3 horas / semana</option>
                  <option value={5}>5 horas / semana</option>
                  <option value={8}>8 horas / semana</option>
                  <option value={12}>12 horas / semana</option>
                  <option value={15}>15 horas / semana</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Nível de Dificuldade</label>
                <select
                  value={trackLevel}
                  onChange={(e) => setTrackLevel(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 font-medium focus:outline-hidden"
                >
                  <option value="beginner">Iniciante</option>
                  <option value="intermediate">Intermediário</option>
                  <option value="advanced">Avançado</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Categoria</label>
                <select
                  value={trackCategory}
                  onChange={(e) => setTrackCategory(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 font-medium focus:outline-hidden"
                >
                  <option value="Autodidata">Autodidata</option>
                  <option value="Tecnologia">Tecnologia</option>
                  <option value="Faculdade">Faculdade</option>
                  <option value="Concursos">Concursos</option>
                  <option value="Idiomas">Idiomas</option>
                  <option value="Carreira">Carreira</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Vincular a Matéria</label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 font-medium focus:outline-hidden"
                >
                  <option value="">(Criar matéria automaticamente)</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* TAB 1: Colar Texto */}
            {modalTab === 'text' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Título da Trilha (opcional)</label>
                  <input
                    type="text"
                    value={trackTitle}
                    onChange={(e) => setTrackTitle(e.target.value)}
                    placeholder="Ex: Trilha Completa de Rust ou Engenharia de Dados"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Conteúdo / Ementa (Markdown, tópicos ou lista)
                  </label>
                  <textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={`Cole aqui sua ementa ou lista de tópicos. Exemplo:
## Módulo 1: Fundamentos
- Introdução e Variáveis (30 min)
- Exercício de condicionais e loops [exercício]
## Módulo 2: Estruturas de Dados
- Arrays e Listas Ligadas
- Projeto: Calculadora com Pilhas [projeto]`}
                    className="w-full text-xs p-3 font-mono rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Dica: use <code>## Módulo</code> para separar seções, <code>[exercício]</code> para desafios e <code>(30m)</code> para tempos estimados.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: Gerar com IA */}
            {modalTab === 'ai' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    O que você quer aprender?
                  </label>
                  <input
                    type="text"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="Ex: Docker & Kubernetes do Zero, Análise de Algoritmos, Spring Boot 3..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-hidden font-medium"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    O assistente estruturará uma trilha pedagógica completa dividida em módulos progressivos, exercícios práticos e projeto de portfólio.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: Importar Arquivo */}
            {modalTab === 'file' && (
              <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-3">
                <Upload className="w-8 h-8 text-indigo-500 mx-auto" />
                <div>
                  <div className="text-xs font-bold text-slate-800">Selecione um arquivo de texto ou Markdown</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Arquivos .md ou .txt com ementa de estudos</div>
                </div>
                <input
                  type="file"
                  accept=".md,.txt,.text"
                  onChange={handleFileUpload}
                  className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>
            )}

            {/* Checkbox de agendamento automático de tarefas */}
            <label className="flex items-center gap-2 cursor-pointer p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
              <input
                type="checkbox"
                checked={autoScheduleTasks}
                onChange={(e) => setAutoScheduleTasks(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500"
              />
              <span className="text-xs font-bold text-slate-800">
                Agendar automaticamente no meu cronograma como tarefas diárias
              </span>
            </label>

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancelar
              </button>

              {modalTab === 'ai' ? (
                <button
                  type="button"
                  disabled={isAiLoading || !aiTopic.trim()}
                  onClick={handleGenerateAI}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs rounded-xl shadow-xs transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAiLoading ? 'Gerando Trilha...' : 'Gerar Roteiro Inteligente'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!rawText.trim()}
                  onClick={handleCreateFromText}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs rounded-xl shadow-xs transition"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Salvar e Organizar Trilha</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
