import type { Subject, Task, LearningPath } from '../types';

export interface ParsedDocumentResult {
  detectedType: 'syllabus' | 'calendar' | 'general';
  createdSubjects: Subject[];
  createdTasks: Task[];
  createdTracks: LearningPath[];
  rawText?: string;
  summary: string;
}

/**
 * Parser determinístico local que lê arquivos de texto / markdown / csv / tsv / json / ical (.ics)
 * e fotos/prints de cronogramas acadêmicos, extraindo matérias, datas de provas e trilhas.
 * 100% offline e no cliente.
 */
export function parseStudyDocument(content: string, filename: string): ParsedDocumentResult {
  const trimmed = content.trim();

  // 1. Detectar se é arquivo iCalendar (.ics)
  if (trimmed.includes('BEGIN:VCALENDAR') || trimmed.includes('BEGIN:VEVENT')) {
    const res = parseICalendar(trimmed, filename);
    res.rawText = content;
    return res;
  }

  // 2. Detectar se é JSON (.json)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const res = parseJsonDocument(trimmed, filename);
      res.rawText = content;
      return res;
    } catch {
      // Seguir para parser de texto se JSON for inválido
    }
  }

  // 3. Parser de linhas de texto (com suporte avançado a tabelas, OCR e fotos)
  const res = parseTextLines(content, filename);
  res.rawText = content;
  return res;
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

/**
 * Normaliza e padroniza datas em texto (YYYY-MM-DD, DD/MM/YYYY ou DD/MM)
 */
function normalizeDate(rawDateStr: string): string | null {
  const currentYear = new Date().getFullYear();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) {
    return rawDateStr;
  }

  // DD/MM/YYYY
  const dmyMatch = rawDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // DD/MM (sem ano)
  const dmMatch = rawDateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dmMatch) {
    const day = dmMatch[1].padStart(2, '0');
    const month = dmMatch[2].padStart(2, '0');
    return `${currentYear}-${month}-${day}`;
  }

  return null;
}

function parseTextLines(content: string, filename: string): ParsedDocumentResult {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const now = Date.now();
  const createdSubjects: Subject[] = [];
  const createdTasks: Task[] = [];
  const createdTracks: LearningPath[] = [];

  // Regex de data flexível (DD/MM/YYYY, DD/MM ou YYYY-MM-DD)
  const dateRegex = /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\b\d{1,2}\/\d{1,2}\b)/;

  // Regex para termos acadêmicos típicos
  const academicSubjectKeywords =
    /^(?:Cálculo|Engenharia|Física|Química|Algoritmos|Programação|Estruturas?|Bancos? de Dados|Sistemas?|Redes?|Inteligência Artificial|Direito|Economia|Administração|Contabilidade|Filosofia|Sociologia|Metodologia|Pesquisa|Arquitetura|Design|Segurança|Compiladores|Teoria da Computação|Estatística|Probabilidade|Matemática|Álgebra|Desenvolvimento|Web|Mobile|Software)/i;

  let currentSubject: Subject | null = null;
  let currentTrack: LearningPath | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignorar linhas puramente decorativas (ex: "====", "----", "____")
    if (/^[=\-_*#\s]{3,}$/.test(line)) continue;

    // 1. Detectar cabeçalho explícito de matéria (#, Matéria:, Disciplina:, Curso:)
    const explicitSubjectMatch = line.match(
      /^(?:#+\s*|(?:Matéria|Disciplina|Curso|Componente):\s*)([A-Za-z0-9À-ÿ\s\-\_]+)/i
    );

    // 2. Detectar se a linha é um título de matéria pelo vocabulário acadêmico (sem data)
    const isAcademicKeyword = !dateRegex.test(line) && academicSubjectKeywords.test(line);

    // 3. Detectar se a linha parece um título (curta, sem pontuação final, sem data, primeiras palavras com maiúscula)
    const isLikelyTitle =
      !dateRegex.test(line) &&
      line.length >= 3 &&
      line.length <= 40 &&
      !line.startsWith('-') &&
      !line.startsWith('*') &&
      !line.startsWith('•') &&
      !/^\d+\./.test(line) &&
      !line.toLowerCase().includes('horário') &&
      !line.toLowerCase().includes('calendário') &&
      (i === 0 || explicitSubjectMatch || isAcademicKeyword);

    if (explicitSubjectMatch || isAcademicKeyword || (isLikelyTitle && createdSubjects.length === 0)) {
      const subjectName = (explicitSubjectMatch ? explicitSubjectMatch[1] : line)
        .replace(/^[#*•:\s]+/, '')
        .trim();

      if (subjectName.length > 2 && !createdSubjects.some((s) => s.name.toLowerCase() === subjectName.toLowerCase())) {
        currentSubject = {
          id: `sub-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: subjectName,
          color: '#4f46e5',
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
          description: `Importada de ${filename}`,
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
    }

    // 4. Detectar linhas que contêm data de prova ou entrega de trabalho
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      const rawDate = dateMatch[1];
      const normalizedDate = normalizeDate(rawDate);

      if (normalizedDate) {
        // Remover a data da linha para obter o nome da avaliação
        let taskTitle = line.replace(dateRegex, '').replace(/^[-*•:|#\s]+/, '').replace(/[-:|#\s]+$/, '').trim();

        // Se a linha tiver separador "|" ou "-", tentar extrair matéria da mesma linha
        // Ex: "Cálculo II | P1 | 15/11" ou "15/11 - Engenharia de Software - P1"
        if (line.includes('|') || line.includes(' - ')) {
          const parts = line.split(/[|\-]|\s{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
          const nonDateParts = parts.filter((p) => !dateRegex.test(p));

          if (nonDateParts.length >= 2) {
            // Um é matéria, outro é prova
            const possibleSubName = nonDateParts[0];
            const possibleExamName = nonDateParts.slice(1).join(' - ');

            // Se ainda não temos essa matéria, criar
            let existingSub = createdSubjects.find(
              (s) => s.name.toLowerCase() === possibleSubName.toLowerCase()
            );
            if (!existingSub) {
              existingSub = {
                id: `sub-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                name: possibleSubName,
                color: '#4f46e5',
                priority: 'high',
                category: 'college',
                targetMinutesPerWeek: 120,
                deadline: normalizedDate,
                archived: false,
                createdAt: now,
                updatedAt: now,
              };
              createdSubjects.push(existingSub);
            }
            currentSubject = existingSub;
            taskTitle = possibleExamName;
          }
        }

        if (!taskTitle) taskTitle = 'Avaliação / Prova';

        const task: Task = {
          id: `task-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: taskTitle,
          dueDate: normalizedDate,
          subjectId: currentSubject ? currentSubject.id : 'sub-college-fallback',
          priority: 'high',
          estimatedMinutes: 60,
          actualStudiedMinutes: 0,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        };
        createdTasks.push(task);

        if (currentSubject && !currentSubject.deadline) {
          currentSubject.deadline = normalizedDate;
        }
        continue;
      }
    }

    // 5. Detectar tópicos da trilha (linhas com marcadores "-", "*", "•", ou numeração "1.")
    if (
      currentTrack &&
      (line.startsWith('-') || line.startsWith('*') || line.startsWith('•') || /^\d+[\.\)]\s*/.test(line))
    ) {
      const topicTitle = line.replace(/^[-*•\d.\)]+\s*/, '').trim();
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

  // 6. Salvaguarda: se foram encontradas tarefas/provas ou tópicos mas nenhuma matéria foi criada
  if (createdSubjects.length === 0 && (createdTasks.length > 0 || createdTracks.length > 0)) {
    const cleanFileName = filename.replace(/\.[^/.]+$/, '').replace(/whatsapp\s*image/i, 'Faculdade');
    const fallbackSubject: Subject = {
      id: `sub-doc-${Date.now()}-fallback`,
      name: cleanFileName || 'Minha Disciplina',
      color: '#4f46e5',
      priority: 'high',
      category: 'college',
      targetMinutesPerWeek: 120,
      deadline: createdTasks[0]?.dueDate,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    createdSubjects.push(fallbackSubject);

    // Associar tarefas órfãs à matéria criada
    for (const t of createdTasks) {
      if (t.subjectId === 'sub-college-fallback') {
        t.subjectId = fallbackSubject.id;
      }
    }
  }

  return {
    detectedType: createdTasks.length > 0 ? 'calendar' : createdTracks.length > 0 ? 'syllabus' : 'general',
    createdSubjects,
    createdTasks,
    createdTracks: createdTracks.filter((t) => t.modules[0].items.length > 0),
    summary: `Documento processado (${filename}): ${createdSubjects.length} matéria(s), ${createdTasks.length} prazo(s) e ${createdTracks.length} trilha(s) identificada(s).`,
  };
}
