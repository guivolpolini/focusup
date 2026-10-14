import { describe, it, expect } from 'vitest';
import {
  parseRawLearningPathText,
  organizeTrackPacing,
  generateTasksFromTrack,
  toggleLessonItemCompletion,
  syncTrackWithTaskStatus,
  createCuratedOfflineTrack,
  detectItemType,
  extractEstimatedMinutes,
} from '../lib/trackOrganizerEngine';

describe('trackOrganizerEngine - Organização e Pacing de Trilhas', () => {
  it('detecta tipos de itens corretamente', () => {
    expect(detectItemType('Aula de Introdução ao React')).toBe('lesson');
    expect(detectItemType('Exercício de fixação sobre Hooks')).toBe('exercise');
    expect(detectItemType('Desafio prático com TypeScript')).toBe('exercise');
    expect(detectItemType('Projeto final: Clone do Spotify')).toBe('project');
    expect(detectItemType('Construir MVP de aplicativo web')).toBe('project');
  });

  it('extrai minutos estimados ou usa valores padrão', () => {
    expect(extractEstimatedMinutes('Aula curta (15 min)', 'lesson')).toBe(15);
    expect(extractEstimatedMinutes('Exercício prático [45m]', 'exercise')).toBe(45);
    expect(extractEstimatedMinutes('Imersão em código (2h)', 'lesson')).toBe(120);
    // Padrões
    expect(extractEstimatedMinutes('Aula comum', 'lesson')).toBe(30);
    expect(extractEstimatedMinutes('Exercício comum', 'exercise')).toBe(45);
    expect(extractEstimatedMinutes('Projeto comum', 'project')).toBe(90);
  });

  it('faz o parsing de texto com módulos em markdown e calcula ritmo', () => {
    const rawMarkdown = `
# Trilha de Engenharia de Dados
## Módulo 1: Fundamentos de Python e SQL
- Introdução a bancos relacionais (30 min)
- Exercício de queries com GROUP BY e JOINs [exercício] (45m)
- Projeto: Pipeline ETL com Pandas e SQLite [projeto]
## Módulo 2: Big Data e Orquestração
- Apache Airflow conceitos fundamentais
- Desafio de agendamento de DAGs
`;

    const path = parseRawLearningPathText(rawMarkdown, {
      defaultHoursPerWeek: 5,
      startDate: '2026-10-14',
    });

    expect(path.title).toBe('Trilha de Engenharia de Dados');
    expect(path.modules.length).toBe(2);
    expect(path.modules[0].title).toContain('Módulo 1');
    expect(path.modules[0].items.length).toBe(3);
    expect(path.modules[0].items[0].type).toBe('lesson');
    expect(path.modules[0].items[1].type).toBe('exercise');
    expect(path.modules[0].items[2].type).toBe('project');
    expect(path.modules[0].targetDate).toBeDefined();
    expect(path.targetEndDate).toBeDefined();
  });

  it('agrupa itens soltos sem cabeçalho explícito em fases equilibradas', () => {
    const rawList = `
Conceitos de Docker
Instalação e Dockerfile
Containers e Imagens
Exercício prático de montagem
Docker Compose e redes
Projeto: Subir stack com Postgres e Node
`;

    const path = parseRawLearningPathText(rawList, {
      title: 'Docker para Iniciantes',
      defaultHoursPerWeek: 4,
      startDate: '2026-10-14',
    });

    expect(path.modules.length).toBeGreaterThanOrEqual(1);
    const totalItems = path.modules.reduce((acc, m) => acc + m.items.length, 0);
    expect(totalItems).toBe(6);
  });

  it('organiza o ritmo e identifica o próximo passo e status de ritmo', () => {
    const rawMarkdown = `
# Trilha Go
## Fase 1
- Sintaxe Básica
- Exercício Slices e Maps
## Fase 2
- Goroutines e Channels
- Projeto Servidor HTTP
`;

    const path = parseRawLearningPathText(rawMarkdown, {
      defaultHoursPerWeek: 2,
      startDate: '2026-10-14',
    });

    const { summary } = organizeTrackPacing(path, {
      targetHoursPerWeek: 2,
      startDate: '2026-10-14',
    });

    expect(summary.totalItems).toBe(4);
    expect(summary.completedItems).toBe(0);
    expect(summary.progressPercent).toBe(0);
    expect(summary.currentStep).toBeDefined();
    expect(summary.currentStep?.item.title).toContain('Sintaxe Básica');
    expect(summary.pacingStatus).toBe('on_track');
  });

  it('converte aulas da trilha em tarefas datadas no FocusUp', () => {
    const path = createCuratedOfflineTrack('Rust', 'beginner', 5, '2026-10-14');
    const subjectId = 'sub-rust';

    const { tasks, updatedPath } = generateTasksFromTrack(path, subjectId);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0].subjectId).toBe('sub-rust');
    expect(tasks[0].learningPathId).toBe(path.id);
    expect(tasks[0].dueDate).toBeDefined();

    // Cada item da trilha deve ter o taskId vinculado
    expect(updatedPath.modules[0].items[0].taskId).toBe(tasks[0].id);
  });

  it('alterna conclusão de item e sincroniza com tarefa', () => {
    const path = createCuratedOfflineTrack('TypeScript', 'intermediate', 5, '2026-10-14');
    const modId = path.modules[0].id;
    const itemId = path.modules[0].items[0].id;

    // Concluir item
    const { path: completedPath, completed } = toggleLessonItemCompletion(path, modId, itemId);
    expect(completed).toBe(true);
    expect(completedPath.modules[0].items[0].completed).toBe(true);

    // Sincronizar via taskId
    const mockTaskId = 'task-test-123';
    completedPath.modules[0].items[0].taskId = mockTaskId;

    const uncompletedPath = syncTrackWithTaskStatus(completedPath, mockTaskId, false);
    expect(uncompletedPath.modules[0].items[0].completed).toBe(false);
  });

  it('faz o parsing completo de currículos detalhados com semanas, tópicos e projetos (estilo trilha_programador_junior)', () => {
    const syllabusSample = `
================================================================
  TRILHA DE ESTUDOS — PROGRAMADOR JUNIOR EM 2 MESES
  3 horas por dia · 8 semanas · 168 horas no total
================================================================

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEMANA 1 — FUNDAMENTOS E BASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[LÓGICA DE PROGRAMAÇÃO]
Conteúdo: Variáveis, tipos, operadores, condicionais (if/else, switch),
laços (while, for), funções, arrays, pseudocódigo

Recursos:
  ▶ Curso de Algoritmo — Curso em Vídeo (Gustavo Guanabara)
    youtube.com/playlist?list=123

---

[GIT E GITHUB]
Conteúdo: init, add, commit, push, pull, branches, merge

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEMANA 2 — HTML E CSS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[HTML5 E CSS3]
Conteúdo: Tags semânticas, formulários, box model, Flexbox, Grid

Projeto da semana: Landing page responsiva publicada no GitHub Pages

================================================================
  RESUMO GERAL
================================================================
Semana 1 · Lógica
Semana 2 · HTML
`;

    const path = parseRawLearningPathText(syllabusSample, {
      startDate: '2026-10-14',
    });

    expect(path.title).toBe('PROGRAMADOR JUNIOR EM 2 MESES');
    expect(path.targetHoursPerWeek).toBe(21); // 3h/dia * 7
    expect(path.modules.length).toBe(2);
    expect(path.modules[0].title).toContain('Semana 1');
    expect(path.modules[0].description).toContain('Curso de Algoritmo');

    // Módulo 2 deve ter o projeto identificado com tipo project
    const proj = path.modules[1].items.find((it) => it.type === 'project');
    expect(proj).toBeDefined();
    expect(proj?.title).toContain('Landing page responsiva');
  });
});
