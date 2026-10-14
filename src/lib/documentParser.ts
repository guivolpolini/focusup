import type { Subject, Task, LearningPath } from '../types';

export interface ParsedDocumentResult {
  detectedType: 'syllabus' | 'calendar' | 'general';
  createdSubjects: Subject[];
  createdTasks: Task[];
  createdTracks: LearningPath[];
  summary: string;
}

/**
 * Parser determinístico local que lê arquivos de texto / markdown / csv / ical
 * e extrai automaticamente matérias, datas de provas e trilhas de estudo.
 * 100% offline e no cliente.
 */
export function parseStudyDocument(content: string, filename: string): ParsedDocumentResult {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const now = Date.now();

  const createdSubjects: Subject[] = [];
  const createdTasks: Task[] = [];
  const createdTracks: LearningPath[] = [];

  const dateRegex = /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/;
  let currentSubject: Subject | null = null;
  let currentTrack: LearningPath | null = null;

  for (const line of lines) {
    // 1. Detectar se é cabeçalho de matéria (ex: "# Cálculo II", "Matéria: Banco de Dados", ou "Disciplina: Redes")
    const subjectMatch = line.match(/^(?:#+\s*|(?:Matéria|Disciplina|Curso):\s*)([A-Za-z0-9À-ÿ\s\-\_]+)/i);
    if (subjectMatch) {
      const subjectName = subjectMatch[1].trim();
      currentSubject = {
        id: `sub-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: subjectName,
        color: '#6366f1',
        priority: 'high',
        category: 'college',
        targetMinutesPerWeek: 120,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      createdSubjects.push(currentSubject);

      currentTrack = {
        id: `track-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: `Trilha: ${subjectName}`,
        description: `Trilha de estudos importada do documento ${filename}`,
        category: 'Acadêmico',
        level: 'intermediate',
        subjectId: currentSubject.id,
        modules: [{ id: `mod-1`, title: 'Conteúdo Programático', items: [] }],
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      createdTracks.push(currentTrack);
      continue;
    }

    // 2. Detectar se há data de prova ou entrega de trabalho na linha
    // ex: "Prova 1 - 2026-11-20" ou "Entrega Projeto: 15/11/2026"
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      let formattedDate = dateMatch[1];
      if (formattedDate.includes('/')) {
        const [d, m, y] = formattedDate.split('/');
        formattedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }

      const taskTitle = line.replace(dateRegex, '').replace(/^[-*•:]\s*/, '').trim() || 'Avaliação / Entrega';

      const task: Task = {
        id: `task-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: taskTitle,
        dueDate: formattedDate,
        subjectId: currentSubject ? currentSubject.id : 'sub-college-default',
        priority: 'high',
        estimatedMinutes: 60,
        actualStudiedMinutes: 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      createdTasks.push(task);

      if (currentSubject && !currentSubject.deadline) {
        currentSubject.deadline = formattedDate;
      }
      continue;
    }

    // 3. Detectar tópicos/aulas da trilha (linhas com marcadores "-", "*", ou "Módulo")
    if (currentTrack && (line.startsWith('-') || line.startsWith('*') || line.startsWith('•') || /^\d+\./.test(line))) {
      const topicTitle = line.replace(/^[-*•\d.]+\s*/, '').trim();
      if (topicTitle.length > 2) {
        currentTrack.modules[0].items.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: topicTitle,
          type: topicTitle.toLowerCase().includes('projeto')
            ? 'project'
            : topicTitle.toLowerCase().includes('exercício')
            ? 'exercise'
            : 'lesson',
          completed: false,
        });
      }
    }
  }

  return {
    detectedType: createdTasks.length > 0 ? 'calendar' : createdTracks.length > 0 ? 'syllabus' : 'general',
    createdSubjects,
    createdTasks,
    createdTracks: createdTracks.filter((t) => t.modules[0].items.length > 0),
    summary: `Documento importado: ${createdSubjects.length} matérias, ${createdTasks.length} prazos/provas e ${createdTracks.length} trilhas identificadas.`,
  };
}
