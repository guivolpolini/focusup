import type { Subject, Task, LearningPath } from '../types';

export interface ParsedDocumentResult {
  detectedType: 'syllabus' | 'calendar' | 'general';
  createdSubjects: Subject[];
  createdTasks: Task[];
  createdTracks: LearningPath[];
  summary: string;
}

/**
 * Parser determinístico local que lê arquivos de texto / markdown / csv / tsv / json / ical (.ics)
 * e extrai automaticamente matérias, datas de provas e trilhas de estudo.
 * 100% offline e no cliente.
 */
export function parseStudyDocument(content: string, filename: string): ParsedDocumentResult {
  const trimmed = content.trim();

  // 1. Detectar se é arquivo iCalendar (.ics)
  if (trimmed.includes('BEGIN:VCALENDAR') || trimmed.includes('BEGIN:VEVENT')) {
    return parseICalendar(trimmed, filename);
  }

  // 2. Detectar se é JSON (.json)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return parseJsonDocument(trimmed, filename);
    } catch {
      // Seguir para parser de texto se JSON for inválido
    }
  }

  // 3. Parser de texto / markdown / csv / tsv padrão
  return parseTextLines(content, filename);
}

function parseICalendar(content: string, filename: string): ParsedDocumentResult {
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;
  const createdSubjects: Subject[] = [];
  const createdTasks: Task[] = [];
  const subjectMap = new Map<string, Subject>();
  const now = Date.now();

  while ((match = veventRegex.exec(content)) !== null) {
    const block = match[1];
    const summaryMatch = block.match(/SUMMARY:([^\r\n]+)/);
    const dtstartMatch = block.match(/DTSTART(?:;[^:]+)?:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
    const descMatch = block.match(/DESCRIPTION:([^\r\n]+)/);

    if (summaryMatch && dtstartMatch) {
      const summary = summaryMatch[1].trim();
      const year = dtstartMatch[1];
      const month = dtstartMatch[2];
      const day = dtstartMatch[3];
      const dateStr = `${year}-${month}-${day}`;

      let subjectName = 'Faculdade';
      let taskTitle = summary;

      if (summary.includes('-')) {
        const parts = summary.split('-');
        taskTitle = parts[0].trim();
        subjectName = parts.slice(1).join('-').trim();
      } else if (summary.includes(':')) {
        const parts = summary.split(':');
        taskTitle = parts[0].trim();
        subjectName = parts.slice(1).join(':').trim();
      }

      if (!subjectMap.has(subjectName)) {
        const newSub: Subject = {
          id: `sub-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: subjectName,
          color: '#4f46e5',
          priority: 'high',
          category: 'college',
          targetMinutesPerWeek: 120,
          deadline: dateStr,
          archived: false,
          createdAt: now,
          updatedAt: now,
        };
        subjectMap.set(subjectName, newSub);
        createdSubjects.push(newSub);
      }

      const sub = subjectMap.get(subjectName)!;
      createdTasks.push({
        id: `task-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: taskTitle,
        dueDate: dateStr,
        description: descMatch ? descMatch[1].trim() : undefined,
        subjectId: sub.id,
        priority: 'high',
        estimatedMinutes: 60,
        actualStudiedMinutes: 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return {
    detectedType: 'calendar',
    createdSubjects,
    createdTasks,
    createdTracks: [],
    summary: `Calendário iCal (.ics) importado: ${createdSubjects.length} matérias e ${createdTasks.length} datas de provas identificadas (${filename}).`,
  };
}

function parseJsonDocument(content: string, filename: string): ParsedDocumentResult {
  const data = JSON.parse(content);
  const now = Date.now();
  const createdSubjects: Subject[] = [];
  const createdTasks: Task[] = [];
  const createdTracks: LearningPath[] = [];

  const rawSubjects = Array.isArray(data) ? data : data.subjects || (data.name ? [data] : []);

  for (const item of rawSubjects) {
    if (!item.name && !item.subject) continue;
    const name = item.name || item.subject;
    const sub: Subject = {
      id: `sub-json-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name,
      color: item.color || '#4f46e5',
      priority: 'high',
      category: 'college',
      targetMinutesPerWeek: item.targetMinutesPerWeek || 120,
      deadline: item.deadline || undefined,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    createdSubjects.push(sub);

    if (Array.isArray(item.exams || item.tasks)) {
      for (const t of item.exams || item.tasks) {
        createdTasks.push({
          id: `task-json-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: t.title || t.name || 'Avaliação',
          dueDate: t.dueDate || t.date || undefined,
          subjectId: sub.id,
          priority: 'high',
          estimatedMinutes: 60,
          actualStudiedMinutes: 0,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (Array.isArray(item.topics || item.modules)) {
      createdTracks.push({
        id: `track-json-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: `Trilha: ${name}`,
        description: `Ementa importada de ${filename}`,
        category: 'Acadêmico',
        level: 'intermediate',
        subjectId: sub.id,
        modules: [
          {
            id: 'mod-1',
            title: 'Conteúdo Programático',
            items: (item.topics || item.modules).map((top: any) => ({
              id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              title: typeof top === 'string' ? top : top.title || 'Tópico',
              type: 'lesson',
              completed: false,
            })),
          },
        ],
        archived: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return {
    detectedType: createdTasks.length > 0 ? 'calendar' : 'syllabus',
    createdSubjects,
    createdTasks,
    createdTracks,
    summary: `Arquivo JSON importado: ${createdSubjects.length} matérias, ${createdTasks.length} avaliações e ${createdTracks.length} trilhas identificadas.`,
  };
}

function parseTextLines(content: string, filename: string): ParsedDocumentResult {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const now = Date.now();

  const createdSubjects: Subject[] = [];
  const createdTasks: Task[] = [];
  const createdTracks: LearningPath[] = [];

  const dateRegex = /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/;
  let currentSubject: Subject | null = null;
  let currentTrack: LearningPath | null = null;

  for (const line of lines) {
    // 1. Detectar cabeçalho de matéria (ex: "# Cálculo II", "Matéria: Banco de Dados", ou "Disciplina: Redes")
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

    // 3. Detectar tópicos/aulas da trilha (linhas com marcadores "-", "*", "•", ou "1.")
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
    summary: `Documento importado (${filename}): ${createdSubjects.length} matérias, ${createdTasks.length} prazos/provas e ${createdTracks.length} trilhas identificadas.`,
  };
}
