import type { ParsedDocumentResult } from './documentParser';
import type { Subject, Task, LearningPath } from '../types';

const BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_BASE_URL) ||
  'http://localhost:3001/v1';

const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) ||
  'freellmapi-local-key';

/**
 * Checa se o servidor FreeLLMAPI local está online
 */
export async function isFreeLLMAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${BASE_URL}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Envia texto ou imagem para o FreeLLMAPI local (Vision / Multimodal)
 * e extrai matérias, provas e tópicos em JSON estruturado
 */
export async function parseWithFreeLLM(options: {
  text?: string;
  imageBase64?: string;
}): Promise<ParsedDocumentResult | null> {
  try {
    const { text, imageBase64 } = options;
    const contentPayload: any[] = [];

    if (text) {
      contentPayload.push({
        type: 'text',
        text: `Extraia as matérias acadêmicas, datas de provas (formato YYYY-MM-DD) e tópicos da ementa a partir do seguinte texto:\n\n${text}`,
      });
    }

    if (imageBase64) {
      contentPayload.push({
        type: 'text',
        text: 'Analise esta imagem (ementa, quadro ou cronograma de provas) e extraia: matérias da faculdade, datas de provas (formato YYYY-MM-DD) e tópicos de estudo.',
      });
      contentPayload.push({
        type: 'image_url',
        image_url: {
          url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
        },
      });
    }

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'auto',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Você é um extrator acadêmico. Responda ESTRITAMENTE um objeto JSON válido com a seguinte estrutura:
{
  "subjects": [{ "name": "Nome da Matéria", "color": "#4f46e5", "deadline": "YYYY-MM-DD" }],
  "tasks": [{ "title": "P1 Cálculo", "dueDate": "YYYY-MM-DD", "subjectName": "Cálculo" }],
  "tracks": [{ "title": "Trilha da Matéria", "subjectName": "Cálculo", "topics": ["Tópico 1", "Tópico 2"] }]
}`,
          },
          {
            role: 'user',
            content: contentPayload,
          },
        ],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) return null;

    const parsed = JSON.parse(rawContent);
    const now = Date.now();

    const createdSubjects: Subject[] = (parsed.subjects || []).map((s: any) => ({
      id: `col-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: s.name,
      color: s.color || '#4f46e5',
      priority: 'high',
      category: 'college',
      targetMinutesPerWeek: 120,
      deadline: s.deadline || undefined,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }));

    const subjectMap = new Map(createdSubjects.map((s) => [s.name.toLowerCase(), s.id]));

    const createdTasks: Task[] = (parsed.tasks || []).map((t: any) => {
      const matchId = t.subjectName ? subjectMap.get(t.subjectName.toLowerCase()) : undefined;
      return {
        id: `task-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: t.title,
        dueDate: t.dueDate,
        subjectId: matchId || createdSubjects[0]?.id || 'sub-college-default',
        priority: 'high',
        estimatedMinutes: 60,
        actualStudiedMinutes: 0,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
    });

    const createdTracks: LearningPath[] = (parsed.tracks || []).map((tr: any) => {
      const matchId = tr.subjectName ? subjectMap.get(tr.subjectName.toLowerCase()) : undefined;
      return {
        id: `track-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: tr.title || 'Trilha Acadêmica',
        description: 'Gerada automaticamente via FreeLLMAPI',
        category: 'Acadêmico',
        level: 'intermediate',
        subjectId: matchId,
        modules: [
          {
            id: 'mod-1',
            title: 'Conteúdo Programático',
            items: (tr.topics || []).map((topic: string) => ({
              id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              title: topic,
              type: 'lesson',
              completed: false,
            })),
          },
        ],
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
    });

    return {
      detectedType: createdTasks.length > 0 ? 'calendar' : 'syllabus',
      createdSubjects,
      createdTasks,
      createdTracks,
      summary: `IA Local (FreeLLMAPI): ${createdSubjects.length} matérias, ${createdTasks.length} prazos de provas e ${createdTracks.length} trilhas extraídas com sucesso!`,
    };
  } catch (err) {
    console.warn('Falha no FreeLLMAPI local, usando parser padrão:', err);
    return null;
  }
}
