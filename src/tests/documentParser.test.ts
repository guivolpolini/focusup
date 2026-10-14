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

  it('extrai todas as 5 matérias da foto do horário acadêmico do Instituto Mauá de Tecnologia', () => {
    const mauaPhotoOcr = `
      INSTITUTO MAUÁ DE TECNOLOGIA - IMT - S. CAETANO
      Aluno: Guilherme Murbach Volpolini RA: 24.00212-7 Período Letivo: 2026
      Curso: CIÊNCIA DA COMPUTAÇÃO Turno: MATUTINO

      Quadro de horário do aluno
      Horário | Segunda-Feira | Terça-Feira | Quarta-Feira | Quinta-Feira | Sexta-Feira
      07:40 - 09:20 | Disc: CIC205 - Sl. H.102 | Disc: TTI2001 SUB2 Sl. U.23 | Disc: TTI205 - Sl. REMOTO | Disc: CIC205 SUB1 Sl. H.205 |
      09:30 - 11:10 | Disc: TTI205 SUB2 Sl. U.28 | Disc: TTI204 SUB2 Sl. U.26 | | Disc: CIC206 SUB1 Sl. H.206 |
      11:20 - 13:00 | Disc: TTI2001 - Sl. H.103 | | Disc: CIC206 - Sl. REMOTO | Disc: TTI204 - Sl. U.25 |

      LEGENDA
      Disciplina Turma Subturma Descrição Professor
      cos acs ÁLGEBRA LINEAR É GEOMETRIA ANALÍTICA MARIANA POLAR
      Cs CICsas2 01 SUBI ALGEBRA LINEAR E GEOMETRIA ANALÍTICA MARIANA POJAR
      cics ccsasao TEORIA DA COMPUT. AUTOMATOS E LINGUAGENS FORMAIS MARCO ANTONIO FURLAN DE SOUZA
      cics —ccsasator SUBI — [TEORIA DA COMPUT, AUTÔMATOS E LINGUAGENS FORMAIS MARCO ANTONIO FURLAN DE SOUZA
      Town cicama LOGICA MATEMÁTICA E MATEMÁTICA DISCRETA MARIA LUISA GOMES DA SILVA MANCINI
      Tm Cicastatoz SUB LOGICA MATEMÁTICA E MATEMÁTICA DISCRETA MARIA LUISA GOMES DA SILVA MANCINI
      mM ciGSas2TO BANCO DE DADOS NÃO RELACIONAIS É BIG DATA LEONARDO ANIOLETTO FERREIRA
      TIEN CICS353T0 SUB — BANCO DE DADOS NÃO RELACIONAIS E BIG DATA MARCO AURELIO MAZZEI
      Tos ciesasao ENGENHARIA DE SOFTWARE ROBSON CALVETTI
      Tmos — Csas2tor SUR ENGENHARIA DE SOFTWARE ISAAC JESUS DA SILVA
    `;

    const result = parseStudyDocument(mauaPhotoOcr, 'horario-maua.jpg');

    expect(result.detectedType).toBe('timetable');
    expect(result.createdSubjects.length).toBe(5);

    const subjectNames = result.createdSubjects.map((s) => s.name);
    expect(subjectNames).toContain('Álgebra Linear e Geometria Analítica');
    expect(subjectNames).toContain('Teoria da Computação, Autômatos e Linguagens Formais');
    expect(subjectNames).toContain('Lógica Matemática e Matemática Discreta');
    expect(subjectNames).toContain('Banco de Dados Não Relacionais e Big Data');
    expect(subjectNames).toContain('Engenharia de Software');

    // Não deve confundir o curso com disciplina
    expect(subjectNames).not.toContain('Ciência Da Computação');
    expect(subjectNames).not.toContain('CIÊNCIA DA COMPUTAÇÃO');

    // Horários semanais identificados
    expect(result.createdClassSchedules).toBeDefined();
    expect(result.createdClassSchedules!.length).toBeGreaterThanOrEqual(10);
  });
});
