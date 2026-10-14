import { describe, it, expect } from 'vitest';
import {
  normalizeSubjectName,
  deduplicateSubjectsList,
  remapImportedSubjectsWithExisting,
} from '../lib/subjectEngine';
import type { Subject } from '../types';
import type { ParsedDocumentResult } from '../lib/documentParser';

describe('subjectEngine - Deduplicação e Saneamento de Disciplinas', () => {
  it('deve normalizar nomes ignorando acentos, maiúsculas e espaços múltiplos', () => {
    expect(normalizeSubjectName('Cálculo II')).toBe('calculo ii');
    expect(normalizeSubjectName('  calculo   ii  ')).toBe('calculo ii');
    expect(normalizeSubjectName('Engenharia de Software')).toBe('engenharia de software');
    expect(normalizeSubjectName('TTI205 - Engenharia de Software')).toBe('engenharia de software');
    expect(normalizeSubjectName('CIC205 Álgebra Linear e Geometria Analítica SUB1')).toBe(
      'algebra linear e geometria analitica'
    );
    expect(normalizeSubjectName('Engenharia de Software (Faculdade)')).toBe('engenharia de software');
    expect(normalizeSubjectName('ÁLGEBRA LINEAR E GEOMETRIA ANALÍTICA')).toBe(
      'algebra linear e geometria analitica'
    );
  });

  it('deve deduplicar lista de matérias preservando a versão mais rica', () => {
    const list: Subject[] = [
      {
        id: 'sub-1',
        name: 'Engenharia de Software',
        color: '#4f46e5',
        priority: 'high',
        targetMinutesPerWeek: 180,
        archived: false,
        createdAt: 100,
        updatedAt: 100,
      },
      {
        id: 'sub-2',
        name: 'engenharia de software',
        color: '#06b6d4',
        priority: 'high',
        category: 'college',
        targetMinutesPerWeek: 180,
        deadline: '2026-11-20',
        archived: false,
        createdAt: 200,
        updatedAt: 200,
      },
      {
        id: 'sub-3',
        name: 'Cálculo Numérico',
        color: '#10b981',
        priority: 'high',
        category: 'college',
        targetMinutesPerWeek: 120,
        archived: false,
        createdAt: 100,
        updatedAt: 100,
      },
    ];

    const deduped = deduplicateSubjectsList(list);
    expect(deduped.length).toBe(2);

    const eng = deduped.find((s) => s.name.toLowerCase().includes('engenharia'));
    expect(eng).toBeDefined();
    expect(eng?.category).toBe('college');
    expect(eng?.deadline).toBe('2026-11-20');
  });

  it('deve remapear IDs em classes e tarefas importadas quando a matéria já existe', () => {
    const existing: Subject[] = [
      {
        id: 'existing-eng',
        name: 'Engenharia de Software',
        color: '#4f46e5',
        priority: 'high',
        category: 'college',
        targetMinutesPerWeek: 180,
        archived: false,
        createdAt: 100,
        updatedAt: 100,
      },
    ];

    const parsed: ParsedDocumentResult = {
      detectedType: 'timetable',
      createdSubjects: [
        {
          id: 'temp-dup-eng',
          name: 'Engenharia de Software',
          color: '#000000',
          priority: 'high',
          targetMinutesPerWeek: 180,
          deadline: '2026-12-01',
          archived: false,
          createdAt: 300,
          updatedAt: 300,
        },
        {
          id: 'new-sub-calc',
          name: 'Cálculo II',
          color: '#10b981',
          priority: 'high',
          targetMinutesPerWeek: 180,
          archived: false,
          createdAt: 300,
          updatedAt: 300,
        },
      ],
      createdTasks: [
        {
          id: 'task-1',
          title: 'Prova 1',
          subjectId: 'temp-dup-eng',
          priority: 'high',
          estimatedMinutes: 60,
          actualStudiedMinutes: 0,
          status: 'pending',
          createdAt: 300,
          updatedAt: 300,
        },
      ],
      createdTracks: [],
      createdClassSchedules: [
        {
          id: 'class-1',
          subjectId: 'temp-dup-eng',
          dayOfWeek: 1,
          startTime: '07:40',
          endTime: '09:20',
          createdAt: 300,
          updatedAt: 300,
        },
      ],
      summary: 'Importação teste',
    };

    const remapped = remapImportedSubjectsWithExisting(existing, parsed);

    // O subjectId da aula e da tarefa deve ter sido remapeado para existing-eng
    expect(remapped.createdClassSchedules?.[0].subjectId).toBe('existing-eng');
    expect(remapped.createdTasks[0].subjectId).toBe('existing-eng');

    // A lista de matérias deve conter apenas 2 matérias únicas, e Engenharia com ID 'existing-eng'
    expect(remapped.createdSubjects.length).toBe(2);
    const eng = remapped.createdSubjects.find((s: Subject) => s.name === 'Engenharia de Software');
    expect(eng?.id).toBe('existing-eng');
    expect(eng?.deadline).toBe('2026-12-01');
  });
});
