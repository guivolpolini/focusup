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

  it('extrai eventos de arquivos iCalendar (.ics)', () => {
    const icsContent = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
DTSTART:20261120T190000Z
SUMMARY:P1 - Redes de Computadores
DESCRIPTION:Prova no laboratório 3
END:VEVENT
BEGIN:VEVENT
DTSTART:20261205T200000Z
SUMMARY:P2 - Redes de Computadores
DESCRIPTION:Entrega de topologia
END:VEVENT
END:VCALENDAR
    `;

    const result = parseStudyDocument(icsContent, 'calendario-provas.ics');

    expect(result.detectedType).toBe('calendar');
    expect(result.createdSubjects.length).toBe(1);
    expect(result.createdSubjects[0].name).toBe('Redes de Computadores');
    expect(result.createdTasks.length).toBe(2);
    expect(result.createdTasks[0].dueDate).toBe('2026-11-20');
    expect(result.createdTasks[0].title).toBe('P1');
  });

  it('extrai matérias e ementas de arquivo JSON', () => {
    const jsonContent = JSON.stringify({
      name: 'Inteligência Artificial',
      deadline: '2026-12-01',
      exams: [{ title: 'Exame Final', date: '2026-12-01' }],
      topics: ['Busca em Grafos', 'Redes Neurais', 'Algoritmos Genéticos'],
    });

    const result = parseStudyDocument(jsonContent, 'ementa.json');

    expect(result.createdSubjects.length).toBe(1);
    expect(result.createdSubjects[0].name).toBe('Inteligência Artificial');
    expect(result.createdTasks.length).toBe(1);
    expect(result.createdTracks.length).toBe(1);
    expect(result.createdTracks[0].modules[0].items.length).toBe(3);
  });

  it('extrai matérias e provas com datas brasileiras DD/MM e tabelas OCR', () => {
    const ocrText = `
      Cálculo II | P1 | 15/11
      Cálculo II | P2 | 10/12
      Física Teórica | Prova Semestral | 28/11
    `;

    const result = parseStudyDocument(ocrText, 'WhatsApp Image 2026-10-13.jpeg');

    expect(result.createdSubjects.length).toBeGreaterThanOrEqual(2);
    expect(result.createdSubjects.some((s) => s.name.includes('Cálculo'))).toBe(true);
    expect(result.createdSubjects.some((s) => s.name.includes('Física'))).toBe(true);
    expect(result.createdTasks.length).toBe(3);
    expect(result.createdTasks[0].dueDate).toMatch(/^\d{4}-11-15$/);
  });

  it('cria matéria fallback e tarefas quando não há cabeçalho explícito', () => {
    const plainSchedule = `
      P1 de Algoritmos - 20/11
      Entrega do Trabalho 1 - 25/11
    `;

    const result = parseStudyDocument(plainSchedule, 'WhatsApp Image 2026-10-13.jpeg');

    expect(result.createdSubjects.length).toBe(1);
    expect(result.createdTasks.length).toBe(2);
    expect(result.createdTasks[0].subjectId).toBe(result.createdSubjects[0].id);
  });
});
