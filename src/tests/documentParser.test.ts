import { describe, it, expect } from 'vitest';
import { parseStudyDocument } from '../lib/documentParser';

describe('Document Parser Engine (Importação de Ementas e Calendários)', () => {
  it('extrai matérias e datas de provas de um calendário acadêmico em texto', () => {
    const documentText = `
# Cálculo Numérico
- Prova 1: 2026-11-15
- Prova 2: 2026-12-10
- Entrega do Trabalho Final: 2026-12-18

# Engenharia de Software
- Apresentação do Projeto: 2026-11-28
    `;

    const result = parseStudyDocument(documentText, 'calendario-semestre.txt');

    expect(result.createdSubjects.length).toBe(2);
    expect(result.createdSubjects[0].name).toBe('Cálculo Numérico');
    expect(result.createdSubjects[0].deadline).toBe('2026-11-15');
    expect(result.createdTasks.length).toBe(4);
    expect(result.createdTasks[0].dueDate).toBe('2026-11-15');
  });

  it('extrai tópicos de uma trilha ou ementa de estudos', () => {
    const syllabusText = `
Disciplina: Arquitetura de Computadores
- Introdução ao Assembly x86
- Memória Cache e Hierarquia
- Exercício Prático de Pipeline
- Projeto Final de Simulador
    `;

    const result = parseStudyDocument(syllabusText, 'ementa-arquitetura.md');

    expect(result.createdSubjects.length).toBe(1);
    expect(result.createdTracks.length).toBe(1);
    expect(result.createdTracks[0].modules[0].items.length).toBe(4);
    expect(result.createdTracks[0].modules[0].items[2].type).toBe('exercise');
    expect(result.createdTracks[0].modules[0].items[3].type).toBe('project');
  });
});
