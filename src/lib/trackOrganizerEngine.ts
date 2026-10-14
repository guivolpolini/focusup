import type { LearningPath, ModuleItem, LessonItem, Task } from '../types';
import { formatDateToLocalYYYYMMDD } from './srsEngine';

export interface TrackScheduleSummary {
  totalEstimatedMinutes: number;
  completedMinutes: number;
  remainingMinutes: number;
  totalItems: number;
  completedItems: number;
  progressPercent: number;
  totalWeeks: number;
  targetEndDate?: string;
  currentStep?: {
    moduleTitle: string;
    item: LessonItem;
    moduleIndex: number;
    itemIndex: number;
  };
  pacingStatus: 'ahead' | 'on_track' | 'behind' | 'completed';
}

/**
 * Adiciona dias a uma data formatada YYYY-MM-DD e retorna YYYY-MM-DD
 */
export function addDaysToYYYYMMDD(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateToLocalYYYYMMDD(d);
}

/**
 * Detecta o tipo de item ('lesson' | 'exercise' | 'project') com base no texto
 */
export function detectItemType(text: string): 'lesson' | 'exercise' | 'project' {
  const clean = text.toLowerCase();
  if (/(?:exerc[ií]cio|desafio|pr[aá]tica|lab|treino|fixa[cç][aã]o|quiz|simulado)/i.test(clean)) {
    return 'exercise';
  }
  if (/(?:projeto|trabalho|case|clone|constru[ií]r|portfolio|mvp|deploy|sistema)/i.test(clean)) {
    return 'project';
  }
  return 'lesson';
}

/**
 * Extrai minutos estimados do texto ou aplica padrão pelo tipo
 */
export function extractEstimatedMinutes(text: string, type: 'lesson' | 'exercise' | 'project'): number {
  // Ex: "45 min", "30m", "15 minutos"
  const minMatch = text.match(/\b(\d+)\s*(?:min(?:utos?)?|m)\b/i);
  if (minMatch) {
    return parseInt(minMatch[1], 10);
  }

  // Ex: "1h", "2 horas", "1.5h"
  const hourMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:h|horas?)\b/i);
  if (hourMatch) {
    return Math.round(parseFloat(hourMatch[1]) * 60);
  }

  // Padrões sensatos
  switch (type) {
    case 'project':
      return 90;
    case 'exercise':
      return 45;
    case 'lesson':
    default:
      return 30;
  }
}

/**
 * Limpa títulos de itens removendo tags como [exercício], [30m], etc.
 */
export function cleanItemTitle(text: string): string {
  return text
    .replace(/^[-*+•\d.)\]\s]+/, '') // marcadores iniciais
    .replace(/\[\s*(?:x|\s)\s*\]/gi, '') // checkboxes markdown
    .replace(/\[(?:exerc[ií]cio|projeto|aula|leitura|pr[aá]tica)\]/gi, '') // tags de tipo
    .replace(/\((?:\d+\s*(?:min|m|h|horas?))\)/gi, '') // tags de tempo
    .replace(/\[(?:\d+\s*(?:min|m|h|horas?))\]/gi, '')
    .trim();
}

/**
 * Detecta se o texto segue o padrão de ementa / currículo estruturado por semanas ou módulos com tópicos
 */
export function isCurriculumSyllabusFormat(text: string): boolean {
  // Se contiver cabeçalhos markdown explícitos (ex: "## Módulo"), trata como Markdown padrão
  if (/^#{1,3}\s+/m.test(text)) return false;

  return (
    /(?:SEMANA|M[OÓ]DULO|FASE)\s*\d+\s*[-—:]/i.test(text) &&
    (/conte[uú]do\s*:/i.test(text) || /^\[[A-ZÀ-Ú0-9\s\-_–—]+\]$/m.test(text) || /projeto\s*da\s*semana/i.test(text))
  );
}

/**
 * Parser especializado para currículos detalhados (ex: trilhas de semanas com tópicos, ementa e projetos)
 */
export function parseCurriculumSyllabus(
  rawText: string,
  options: {
    title?: string;
    defaultHoursPerWeek?: number;
    startDate?: string;
    level?: 'beginner' | 'intermediate' | 'advanced';
    category?: string;
  } = {}
): LearningPath {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());
  const startDate = options.startDate || formatDateToLocalYYYYMMDD(new Date());

  let trackTitle = options.title || '';
  let hoursPerWeek = options.defaultHoursPerWeek;

  interface RawSyllabusMod {
    title: string;
    description?: string;
    items: { title: string; type: 'lesson' | 'exercise' | 'project'; estimatedMinutes: number }[];
    resources: string[];
  }

  const rawModules: RawSyllabusMod[] = [];
  let currentMod: RawSyllabusMod | null = null;
  let currentTopic = '';
  let currentContentLines: string[] = [];

  function flushContent() {
    if (!currentMod || !currentTopic) return;
    const fullContent = currentContentLines.join(' ').trim();

    if (fullContent) {
      const parts = fullContent.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length <= 4) {
        currentMod.items.push({
          title: `${currentTopic}: ${parts.join(', ')}`,
          type: detectItemType(currentTopic),
          estimatedMinutes: 45,
        });
      } else {
        const mid = Math.ceil(parts.length / 2);
        currentMod.items.push({
          title: `${currentTopic}: ${parts.slice(0, mid).join(', ')}`,
          type: detectItemType(currentTopic),
          estimatedMinutes: 45,
        });
        currentMod.items.push({
          title: `${currentTopic}: ${parts.slice(mid).join(', ')}`,
          type: detectItemType(currentTopic),
          estimatedMinutes: 45,
        });
      }
    } else {
      currentMod.items.push({
        title: currentTopic,
        type: detectItemType(currentTopic),
        estimatedMinutes: 45,
      });
    }

    currentContentLines = [];
    currentTopic = '';
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Linhas divisórias decorativas
    if (/^[=━─\-_~*]{3,}$/.test(line)) continue;

    // Seções de encerramento / resumo
    if (/^(?:RESUMO GERAL|DICA|DICAS|NOTAS FINAIS|CONCLUSÃO)/i.test(line)) {
      flushContent();
      break;
    }

    // Metadados do cabeçalho
    if (!trackTitle && line.startsWith('# ')) {
      trackTitle = line.replace(/^#\s+/, '').trim();
      continue;
    }

    if (!trackTitle && /TRILHA DE ESTUDOS\s*[-—:]\s*(.+)/i.test(line)) {
      const match = line.match(/TRILHA DE ESTUDOS\s*[-—:]\s*(.+)/i);
      if (match) trackTitle = match[1].trim();
      continue;
    }

    const pacingMatch = line.match(/(\d+)\s*horas?\s*por\s*dia/i);
    if (pacingMatch && !hoursPerWeek) {
      hoursPerWeek = Math.min(28, parseInt(pacingMatch[1], 10) * 7);
    }

    // Cabeçalho de Semana / Módulo
    const modMatch = line.match(/^(?:SEMANA|M[OÓ]DULO|FASE|PARTE|ETAPA)\s*(\d+)\s*[-—:]\s*(.+)/i);
    if (modMatch) {
      flushContent();
      currentMod = {
        title: `Semana ${modMatch[1]}: ${modMatch[2].trim()}`,
        items: [],
        resources: [],
      };
      rawModules.push(currentMod);
      continue;
    }

    // Projeto da semana
    const projMatch = line.match(/^projeto(?:\s*da\s*semana)?\s*[:–-]\s*(.+)/i);
    if (projMatch && currentMod) {
      flushContent();
      currentMod.items.push({
        title: `Projeto da Semana: ${projMatch[1].trim()}`,
        type: 'project',
        estimatedMinutes: 90,
      });
      continue;
    }

    // Tópico em colchetes [LÓGICA DE PROGRAMAÇÃO]
    const topicMatch = line.match(/^\[(.*?)\]$/);
    if (topicMatch && currentMod) {
      flushContent();
      currentTopic = topicMatch[1].replace(/^[–—\s]+|[–—\s]+$/g, '').trim();
      continue;
    }

    // Linha de Conteúdo:
    if (/^conte[uú]do\s*:\s*(.*)/i.test(line)) {
      const rest = line.replace(/^conte[uú]do\s*:\s*/i, '').trim();
      currentContentLines = rest ? [rest] : [];
      continue;
    }

    // Continuação de Conteúdo
    if (currentTopic && currentContentLines.length > 0) {
      if (/^(?:recursos|projeto|---)/i.test(line) || /^\[.*\]$/.test(line)) {
        flushContent();
        if (/^projeto/i.test(line) && currentMod) {
          const pMatch = line.match(/^projeto(?:\s*da\s*semana)?\s*[:–-]\s*(.+)/i);
          if (pMatch) {
            currentMod.items.push({
              title: `Projeto da Semana: ${pMatch[1].trim()}`,
              type: 'project',
              estimatedMinutes: 90,
            });
          }
        } else if (/^\[.*\]$/.test(line)) {
          const tMatch = line.match(/^\[(.*?)\]$/);
          if (tMatch) currentTopic = tMatch[1].replace(/^[–—\s]+|[–—\s]+$/g, '').trim();
        }
      } else {
        currentContentLines.push(line);
      }
      continue;
    }

    // Recursos e Links (salvos como descrição do módulo, não como tarefas de estudo)
    if (
      /^[▶🌐]/.test(line) ||
      /youtube\.com|loiane\.training|betrybe\.com|freecodecamp\.org|roadmap\.sh|refactoring\.guru/i.test(line)
    ) {
      if (currentMod && !line.includes('http') && !line.includes('.com') && !line.includes('playlist?')) {
        const cleanRec = line.replace(/^[▶🌐\s]+/, '').trim();
        if (cleanRec && !currentMod.resources.includes(cleanRec)) {
          currentMod.resources.push(cleanRec);
        }
      }
      continue;
    }
  }

  flushContent();

  const finalHours = hoursPerWeek || 21;
  const now = Date.now();
  const pathId = `track-${now}-${Math.random().toString(36).substring(2, 6)}`;

  const modules: ModuleItem[] = rawModules.map((mod, modIdx) => {
    const modId = `mod-${modIdx + 1}-${Math.random().toString(36).substring(2, 5)}`;
    const items: LessonItem[] = mod.items.map((it, itIdx) => ({
      id: `item-${modId}-${itIdx + 1}`,
      title: it.title,
      type: it.type,
      completed: false,
      estimatedMinutes: it.estimatedMinutes,
    }));

    const desc = mod.resources.length > 0 ? `Recursos: ${mod.resources.slice(0, 4).join(' • ')}` : undefined;

    return {
      id: modId,
      title: mod.title,
      description: desc,
      items,
    };
  });

  const rawPath: LearningPath = {
    id: pathId,
    title: trackTitle || 'Trilha de Estudos para Programador',
    description: `Roteiro completo de 8 semanas com metas diárias e projetos práticos.`,
    category: options.category || 'Tecnologia',
    level: options.level || 'intermediate',
    modules,
    targetHoursPerWeek: finalHours,
    startDate,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  const { path } = organizeTrackPacing(rawPath, { targetHoursPerWeek: finalHours, startDate });
  return path;
}

/**
 * Converte texto livre, ementa ou roteiro em uma LearningPath organizada
 */
export function parseRawLearningPathText(
  rawText: string,
  options: {
    title?: string;
    defaultHoursPerWeek?: number;
    startDate?: string;
    level?: 'beginner' | 'intermediate' | 'advanced';
    category?: string;
  } = {}
): LearningPath {
  // Se for formato de ementa / currículo detalhado por semanas, usar parser especializado
  if (isCurriculumSyllabusFormat(rawText)) {
    return parseCurriculumSyllabus(rawText, options);
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[=━─\-_~*]{3,}$/.test(l) && !/^https?:\/\//i.test(l));

  const startDate = options.startDate || formatDateToLocalYYYYMMDD(new Date());
  const hoursPerWeek = options.defaultHoursPerWeek || 5;

  let trackTitle = options.title || 'Trilha Personalizada';
  let trackDescription = 'Roteiro de estudos estruturado para execução focada.';
  let foundTitle = Boolean(options.title);

  const rawModules: { title: string; items: { text: string }[] }[] = [];
  let currentModule: { title: string; items: { text: string }[] } | null = null;
  const looseItems: string[] = [];

  for (const line of lines) {
    // Linhas a ignorar (divisores decorativos e URLs)
    if (/^[=━─\-_~*]{3,}$/.test(line)) continue;
    if (/^(?:RESUMO GERAL|DICA|DICAS|NOTAS FINAIS)/i.test(line)) break;

    // 1. Título principal se for cabeçalho nível 1 (# ...)
    if (line.startsWith('# ') && !foundTitle) {
      trackTitle = line.replace(/^#\s+/, '').trim();
      foundTitle = true;
      continue;
    }

    // 2. Cabeçalho de Módulo / Seção (##, ###, Módulo X, Fase X, Semana X, ou "1. ...")
    const isModuleHeader =
      /^#{2,3}\s+/.test(line) ||
      /^(?:m[oó]dulo|fase|etapa|cap[ií]tulo|semana|unidade|parte)\s*\d*[:–-]?\s*/i.test(line) ||
      (/^\d+\.\s+[A-ZÀ-Ú]/.test(line) && !line.includes('min') && !line.includes('[ ]'));

    if (isModuleHeader) {
      const modTitle = line
        .replace(/^#{2,3}\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim();

      currentModule = {
        title: modTitle,
        items: [],
      };
      rawModules.push(currentModule);
      continue;
    }

    // 3. Item de aula / tarefa (-, *, +, •, [ ], ou texto solto)
    const isBullet = /^[-*+•]/.test(line) || /^\[[ x]\]/i.test(line) || /^\d+\.\d+/.test(line);

    if (isBullet) {
      if (currentModule) {
        currentModule.items.push({ text: line });
      } else {
        looseItems.push(line);
      }
    } else {
      // Texto descritivo ou item sem marcador
      if (currentModule) {
        currentModule.items.push({ text: line });
      } else if (!foundTitle && lines.indexOf(line) === 0) {
        trackTitle = line;
        foundTitle = true;
      } else {
        looseItems.push(line);
      }
    }
  }

  // Se não identificou módulos explícitos, agrupar os itens soltos em fases equilibradas
  if (rawModules.length === 0 && looseItems.length > 0) {
    const itemsPerModule = 4;
    const totalModules = Math.ceil(looseItems.length / itemsPerModule);

    for (let m = 0; m < totalModules; m++) {
      const slice = looseItems.slice(m * itemsPerModule, (m + 1) * itemsPerModule);
      let phaseName = `Fase ${m + 1}: `;
      if (m === 0) phaseName += 'Fundamentos & Conceitos Iniciais';
      else if (m === totalModules - 1) phaseName += 'Projetos Práticos & Consolidação';
      else phaseName += `Aprofundamento & Prática (${m + 1})`;

      rawModules.push({
        title: phaseName,
        items: slice.map((text) => ({ text })),
      });
    }
  } else if (looseItems.length > 0 && rawModules.length > 0) {
    // Alocar itens soltos no primeiro módulo
    rawModules[0].items.unshift(...looseItems.map((text) => ({ text })));
  }

  // Fallback caso não haja itens
  if (rawModules.length === 0) {
    rawModules.push({
      title: 'Módulo 1: Introdução & Fundamentos',
      items: [{ text: 'Revisão geral do conteúdo' }, { text: 'Exercícios práticos de fixação' }],
    });
  }

  // Converter para ModuleItem com LessonItem tipados e com minutos estimados
  const now = Date.now();
  const pathId = `track-${now}-${Math.random().toString(36).substring(2, 6)}`;

  const modules: ModuleItem[] = rawModules.map((mod, modIdx) => {
    const modId = `mod-${modIdx + 1}-${Math.random().toString(36).substring(2, 5)}`;
    const items: LessonItem[] = mod.items.map((it, itIdx) => {
      const type = detectItemType(it.text);
      const estMinutes = extractEstimatedMinutes(it.text, type);
      const title = cleanItemTitle(it.text) || `Tópico ${itIdx + 1}`;

      return {
        id: `item-${modId}-${itIdx + 1}`,
        title,
        type,
        completed: false,
        estimatedMinutes: estMinutes,
      };
    });

    return {
      id: modId,
      title: mod.title,
      items,
    };
  });

  const rawPath: LearningPath = {
    id: pathId,
    title: trackTitle,
    description: trackDescription,
    category: options.category || 'Autodidata',
    level: options.level || 'intermediate',
    modules,
    targetHoursPerWeek: hoursPerWeek,
    startDate,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  const { path } = organizeTrackPacing(rawPath, { targetHoursPerWeek: hoursPerWeek, startDate });
  return path;
}

/**
 * Organiza o ritmo de estudos, distribuindo módulos em semanas e calculando datas alvo
 */
export function organizeTrackPacing(
  path: LearningPath,
  options: {
    targetHoursPerWeek?: number;
    startDate?: string;
  } = {}
): { path: LearningPath; summary: TrackScheduleSummary } {
  const targetHours = options.targetHoursPerWeek || path.targetHoursPerWeek || 5;
  const targetMinutesPerWeek = Math.max(60, targetHours * 60);
  const startDate = options.startDate || path.startDate || formatDateToLocalYYYYMMDD(new Date());

  let accumulatedMinutes = 0;
  let totalEstimatedMinutes = 0;
  let completedMinutes = 0;
  let totalItems = 0;
  let completedItems = 0;
  let currentStep: TrackScheduleSummary['currentStep'] = undefined;

  const updatedModules: ModuleItem[] = path.modules.map((mod, modIdx) => {
    let modEstimatedMinutes = 0;

    const updatedItems: LessonItem[] = mod.items.map((item, itemIdx) => {
      const estMin = item.estimatedMinutes || (item.type === 'project' ? 90 : item.type === 'exercise' ? 45 : 30);
      totalEstimatedMinutes += estMin;
      modEstimatedMinutes += estMin;
      totalItems += 1;

      if (item.completed) {
        completedMinutes += estMin;
        completedItems += 1;
      } else if (!currentStep) {
        currentStep = {
          moduleTitle: mod.title,
          item,
          moduleIndex: modIdx,
          itemIndex: itemIdx,
        };
      }

      return {
        ...item,
        estimatedMinutes: estMin,
      };
    });

    // Calcular semana estimada do módulo com base nos minutos acumulados
    const startWeek = Math.max(1, Math.floor(accumulatedMinutes / targetMinutesPerWeek) + 1);
    accumulatedMinutes += modEstimatedMinutes;
    const endWeek = Math.max(startWeek, Math.ceil(accumulatedMinutes / targetMinutesPerWeek));

    // Data alvo do módulo: final da semana correspondente (7 dias por semana)
    const targetDate = addDaysToYYYYMMDD(startDate, endWeek * 7 - 1);

    // Distribuir datas de vencimento (dueDates) para os itens dentro do módulo
    const itemsWithDates = updatedItems.map((item, idx) => {
      const dayOffset = Math.min(
        endWeek * 7 - 1,
        (startWeek - 1) * 7 + Math.floor((idx / Math.max(1, updatedItems.length)) * 7)
      );
      const itemDueDate = addDaysToYYYYMMDD(startDate, dayOffset);
      return {
        ...item,
        dueDate: item.dueDate || itemDueDate,
      };
    });

    return {
      ...mod,
      targetWeek: endWeek,
      targetDate,
      items: itemsWithDates,
    };
  });

  const totalWeeks = Math.max(1, Math.ceil(totalEstimatedMinutes / targetMinutesPerWeek));
  const targetEndDate = addDaysToYYYYMMDD(startDate, totalWeeks * 7 - 1);

  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const remainingMinutes = Math.max(0, totalEstimatedMinutes - completedMinutes);

  // Determinar status de ritmo (pacing)
  const todayStr = formatDateToLocalYYYYMMDD(new Date());
  let pacingStatus: TrackScheduleSummary['pacingStatus'] = 'on_track';
  const activeStep = currentStep as TrackScheduleSummary['currentStep'];

  if (completedItems === totalItems && totalItems > 0) {
    pacingStatus = 'completed';
  } else if (activeStep?.item.dueDate && activeStep.item.dueDate < todayStr) {
    pacingStatus = 'behind';
  } else if (
    progressPercent >
    ((new Date().getTime() - new Date(`${startDate}T00:00:00`).getTime()) / (totalWeeks * 7 * 86400000)) * 100 + 15
  ) {
    pacingStatus = 'ahead';
  }

  const updatedPath: LearningPath = {
    ...path,
    targetHoursPerWeek: targetHours,
    startDate,
    targetEndDate,
    modules: updatedModules,
    updatedAt: Date.now(),
  };

  const summary: TrackScheduleSummary = {
    totalEstimatedMinutes,
    completedMinutes,
    remainingMinutes,
    totalItems,
    completedItems,
    progressPercent,
    totalWeeks,
    targetEndDate,
    currentStep,
    pacingStatus,
  };

  return { path: updatedPath, summary };
}

/**
 * Converte as aulas incompletas da trilha em tarefas datadas no FocusUp
 */
export function generateTasksFromTrack(
  path: LearningPath,
  subjectId: string
): { tasks: Task[]; updatedPath: LearningPath } {
  const tasks: Task[] = [];
  const now = Date.now();

  const updatedModules = path.modules.map((mod) => {
    const updatedItems = mod.items.map((item) => {
      if (item.completed) return item;

      const taskId = item.taskId || `task-track-${path.id}-${item.id}`;
      const newTask: Task = {
        id: taskId,
        title: `${mod.title}: ${item.title}`,
        description: `Trilha: ${path.title} • Tipo: ${item.type.toUpperCase()}`,
        subjectId,
        learningPathId: path.id,
        priority: item.type === 'project' ? 'high' : item.type === 'exercise' ? 'medium' : 'low',
        dueDate: item.dueDate || path.targetEndDate,
        estimatedMinutes: item.estimatedMinutes || 30,
        actualStudiedMinutes: 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };

      tasks.push(newTask);
      return {
        ...item,
        taskId,
      };
    });

    return {
      ...mod,
      items: updatedItems,
    };
  });

  const updatedPath: LearningPath = {
    ...path,
    modules: updatedModules,
    updatedAt: now,
  };

  return { tasks, updatedPath };
}

/**
 * Atualiza o status de conclusão de um item e recalcula o ritmo
 */
export function toggleLessonItemCompletion(
  path: LearningPath,
  moduleId: string,
  itemId: string
): { path: LearningPath; completed: boolean } {
  let targetCompleted = false;

  const updatedModules = path.modules.map((mod) => {
    if (mod.id !== moduleId) return mod;
    return {
      ...mod,
      items: mod.items.map((item) => {
        if (item.id !== itemId) return item;
        targetCompleted = !item.completed;
        return {
          ...item,
          completed: targetCompleted,
          completedAt: targetCompleted ? Date.now() : undefined,
        };
      }),
    };
  });

  const updatedPath: LearningPath = {
    ...path,
    modules: updatedModules,
    updatedAt: Date.now(),
  };

  return { path: updatedPath, completed: targetCompleted };
}

/**
 * Sincroniza a conclusão de uma tarefa com a aula correspondente na trilha
 */
export function syncTrackWithTaskStatus(
  path: LearningPath,
  taskId: string,
  taskCompleted: boolean
): LearningPath {
  const updatedModules = path.modules.map((mod) => ({
    ...mod,
    items: mod.items.map((item) => {
      if (item.taskId !== taskId) return item;
      return {
        ...item,
        completed: taskCompleted,
        completedAt: taskCompleted ? Date.now() : undefined,
      };
    }),
  }));

  return {
    ...path,
    modules: updatedModules,
    updatedAt: Date.now(),
  };
}

/**
 * Gera uma trilha de aprendizado estruturada usando FreeLLMAPI (se online) ou fallback inteligente
 */
export async function generateAILearningPath(
  topic: string,
  options: {
    level?: 'beginner' | 'intermediate' | 'advanced';
    targetHoursPerWeek?: number;
    startDate?: string;
  } = {}
): Promise<LearningPath> {
  const level = options.level || 'beginner';
  const hours = options.targetHoursPerWeek || 5;
  const startDate = options.startDate || formatDateToLocalYYYYMMDD(new Date());

  // Tentativa de usar FreeLLMAPI local se disponível
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const baseUrl =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_BASE_URL) ||
      'http://localhost:3001/v1';
    const apiKey =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) ||
      'freellmapi-local-key';

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'auto',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Você é um mentor especialista em educação autodidata e design instrucional.
Crie um roteiro de estudos (trilha) prático e direto para o tópico solicitado pelo usuário.
Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "title": "Nome da Trilha",
  "description": "Breve descrição do objetivo",
  "category": "Tecnologia / Acadêmico / Idiomas / Carreira",
  "modules": [
    {
      "title": "Módulo 1: Fundamentos",
      "items": [
        { "title": "Nome da Aula", "type": "lesson", "estimatedMinutes": 30 },
        { "title": "Exercício de Fixação", "type": "exercise", "estimatedMinutes": 45 },
        { "title": "Projeto Prático", "type": "project", "estimatedMinutes": 90 }
      ]
    }
  ]
}`,
          },
          {
            role: 'user',
            content: `Quero aprender: "${topic}". Nível: ${level}. Tempo disponível: ${hours} horas por semana.`,
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        if (parsed.modules && parsed.modules.length > 0) {
          const now = Date.now();
          const pathId = `track-ai-${now}-${Math.random().toString(36).substring(2, 6)}`;
          const modules: ModuleItem[] = parsed.modules.map((m: any, mIdx: number) => ({
            id: `mod-${mIdx + 1}-${now}`,
            title: m.title || `Módulo ${mIdx + 1}`,
            items: (m.items || []).map((it: any, itIdx: number) => ({
              id: `item-${mIdx + 1}-${itIdx + 1}-${now}`,
              title: cleanItemTitle(it.title || `Lição ${itIdx + 1}`),
              type: it.type === 'project' ? 'project' : it.type === 'exercise' ? 'exercise' : 'lesson',
              completed: false,
              estimatedMinutes: it.estimatedMinutes || (it.type === 'project' ? 90 : it.type === 'exercise' ? 45 : 30),
            })),
          }));

          const rawPath: LearningPath = {
            id: pathId,
            title: parsed.title || `Trilha: ${topic}`,
            description: parsed.description || `Roteiro acelerado de estudos para ${topic}`,
            category: parsed.category || 'Autodidata',
            level,
            modules,
            targetHoursPerWeek: hours,
            startDate,
            archived: false,
            createdAt: now,
            updatedAt: now,
          };

          return organizeTrackPacing(rawPath, { targetHoursPerWeek: hours, startDate }).path;
        }
      }
    }
  } catch {
    // Fallback silencioso para o gerador estruturado offline
  }

  // Fallback offline estruturado de alta fidelidade
  return createCuratedOfflineTrack(topic, level, hours, startDate);
}

/**
 * Gerador de trilha offline quando não há IA disponível
 */
export function createCuratedOfflineTrack(
  topic: string,
  level: 'beginner' | 'intermediate' | 'advanced',
  hoursPerWeek: number,
  startDate: string
): LearningPath {
  const now = Date.now();
  const pathId = `track-offline-${now}-${Math.random().toString(36).substring(2, 6)}`;

  const modules: ModuleItem[] = [
    {
      id: `mod-1-${now}`,
      title: 'Módulo 1: Fundamentos & Visão Geral',
      items: [
        {
          id: `item-1-1-${now}`,
          title: `Introdução e Conceitos Chave de ${topic}`,
          type: 'lesson',
          completed: false,
          estimatedMinutes: 30,
        },
        {
          id: `item-1-2-${now}`,
          title: `Configuração do Ambiente e Primeiros Passos`,
          type: 'lesson',
          completed: false,
          estimatedMinutes: 30,
        },
        {
          id: `item-1-3-${now}`,
          title: `Exercício Prático de Fixação dos Fundamentos`,
          type: 'exercise',
          completed: false,
          estimatedMinutes: 45,
        },
      ],
    },
    {
      id: `mod-2-${now}`,
      title: 'Módulo 2: Técnicas Centrais & Resolução de Problemas',
      items: [
        {
          id: `item-2-1-${now}`,
          title: `Padrões Essenciais e Melhores Práticas em ${topic}`,
          type: 'lesson',
          completed: false,
          estimatedMinutes: 40,
        },
        {
          id: `item-2-2-${now}`,
          title: `Desafio Prático com Casos Reais`,
          type: 'exercise',
          completed: false,
          estimatedMinutes: 50,
        },
        {
          id: `item-2-3-${now}`,
          title: `Resolução de Erros Comuns e Otimização`,
          type: 'lesson',
          completed: false,
          estimatedMinutes: 35,
        },
      ],
    },
    {
      id: `mod-3-${now}`,
      title: 'Módulo 3: Projeto de Portfólio & Consolidação',
      items: [
        {
          id: `item-3-1-${now}`,
          title: `Planejamento e Arquitetura do Projeto Prático`,
          type: 'lesson',
          completed: false,
          estimatedMinutes: 30,
        },
        {
          id: `item-3-2-${now}`,
          title: `Desenvolvimento do Projeto Final de ${topic}`,
          type: 'project',
          completed: false,
          estimatedMinutes: 90,
        },
        {
          id: `item-3-3-${now}`,
          title: `Revisão de Aprendizados e Documentação`,
          type: 'exercise',
          completed: false,
          estimatedMinutes: 45,
        },
      ],
    },
  ];

  const rawPath: LearningPath = {
    id: pathId,
    title: `Trilha: ${topic}`,
    description: `Roteiro estruturado para dominar ${topic} de forma progressiva.`,
    category: 'Autodidata',
    level,
    modules,
    targetHoursPerWeek: hoursPerWeek,
    startDate,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  return organizeTrackPacing(rawPath, { targetHoursPerWeek: hoursPerWeek, startDate }).path;
}
