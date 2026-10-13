import Dexie, { type Table } from 'dexie';
import type {
  Subject,
  Task,
  LearningPath,
  StudySession,
  Flashcard,
  StudyPreferences,
  StudyPlan,
  WeeklyReview,
  PortfolioProject,
} from '../types';

export class FocusUpDatabase extends Dexie {
  subjects!: Table<Subject, string>;
  tasks!: Table<Task, string>;
  learningPaths!: Table<LearningPath, string>;
  studySessions!: Table<StudySession, string>;
  flashcards!: Table<Flashcard, string>;
  preferences!: Table<StudyPreferences, string>;
  studyPlans!: Table<StudyPlan, string>;
  weeklyReviews!: Table<WeeklyReview, string>;
  portfolioProjects!: Table<PortfolioProject, string>;

  constructor() {
    super('FocusUpDB');

    this.version(1).stores({
      subjects: 'id, name, priority, archived, createdAt, updatedAt',
      tasks: 'id, subjectId, learningPathId, priority, dueDate, status, createdAt, updatedAt',
      learningPaths: 'id, category, level, archived, createdAt, updatedAt',
      studySessions: 'id, subjectId, taskId, learningPathId, mode, status, startedAt, createdAt, updatedAt',
      flashcards: 'id, subjectId, learningPathId, nextReviewDate, archived, createdAt, updatedAt',
      preferences: 'id, updatedAt',
      studyPlans: 'id, weekStartDate, weekEndDate, status, createdAt, updatedAt',
      weeklyReviews: 'id, weekStartDate, weekEndDate, createdAt, updatedAt',
      portfolioProjects: 'id, status, targetDate, createdAt, updatedAt',
    });
  }
}

export const db = new FocusUpDatabase();

// Dados semente iniciais
export async function seedInitialData() {
  const prefCount = await db.preferences.count();
  if (prefCount === 0) {
    const defaultPreferences: StudyPreferences = {
      id: 'user_preferences',
      dailyGoalMinutes: 120,
      weeklyAvailability: [
        { dayOfWeek: 0, minutesAvailable: 60 },  // Dom
        { dayOfWeek: 1, minutesAvailable: 120 }, // Seg
        { dayOfWeek: 2, minutesAvailable: 120 }, // Ter
        { dayOfWeek: 3, minutesAvailable: 120 }, // Qua
        { dayOfWeek: 4, minutesAvailable: 120 }, // Qui
        { dayOfWeek: 5, minutesAvailable: 120 }, // Sex
        { dayOfWeek: 6, minutesAvailable: 90 },  // Sáb
      ],
      primaryArea: 'Tecnologia e Desenvolvimento de Software',
      theme: 'light',
      breakIntervalMinutes: 5,
      updatedAt: Date.now(),
    };
    await db.preferences.add(defaultPreferences);
  }

  const subjectsCount = await db.subjects.count();
  if (subjectsCount === 0) {
    const now = Date.now();
    const defaultSubjects: Subject[] = [
      {
        id: 'sub-aws',
        name: 'AWS & Cloud Computing',
        description: 'Fundamentos de nuvem, arquitetura, S3, EC2, IAM, Lambda',
        color: '#f59e0b',
        priority: 'high',
        targetMinutesPerWeek: 180,
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sub-sql',
        name: 'Bancos de Dados Relacionais',
        description: 'PostgreSQL, modelagem relacional, queries avançadas, índices e transações',
        color: '#3b82f6',
        priority: 'high',
        targetMinutesPerWeek: 180,
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sub-nosql',
        name: 'Bancos de Dados NoSQL',
        description: 'MongoDB, Redis, modelagem orientada a documentos e cache distribuído',
        color: '#10b981',
        priority: 'medium',
        targetMinutesPerWeek: 120,
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'sub-java',
        name: 'Java & Backend',
        description: 'Core Java, Spring Boot, APIs REST, JPA/Hibernate, Design Patterns',
        color: '#ef4444',
        priority: 'high',
        targetMinutesPerWeek: 240,
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.subjects.bulkAdd(defaultSubjects);

    // Adicionar trilhas iniciais sugeridas
    const defaultPaths: LearningPath[] = [
      {
        id: 'path-aws-practitioner',
        title: 'Trilha Cloud & AWS Fundamentals',
        description: 'Construa uma base sólida em arquitetura em nuvem e serviços essenciais da AWS.',
        category: 'Cloud',
        level: 'beginner',
        subjectId: 'sub-aws',
        archived: false,
        createdAt: now,
        updatedAt: now,
        modules: [
          {
            id: 'mod-aws-1',
            title: 'Módulo 1: Conceitos Básicos de Nuvem',
            items: [
              { id: 'item-aws-1-1', title: 'O que é Computação em Nuvem e modelos de serviço (IaaS, PaaS, SaaS)', type: 'lesson', completed: false },
              { id: 'item-aws-1-2', title: 'Infraestrutura global da AWS: Regiões e Zonas de Disponibilidade', type: 'lesson', completed: false },
              { id: 'item-aws-1-3', title: 'Simulado de fixação de conceitos básicos', type: 'exercise', completed: false },
            ],
          },
          {
            id: 'mod-aws-2',
            title: 'Módulo 2: Serviços de Computação e Armazenamento',
            items: [
              { id: 'item-aws-2-1', title: 'Amazon EC2: instâncias, tipos e ciclo de vida', type: 'lesson', completed: false },
              { id: 'item-aws-2-2', title: 'Amazon S3: buckets, classes de armazenamento e políticas', type: 'lesson', completed: false },
              { id: 'item-aws-2-3', title: 'Laboratório Prático: Hospedar um site estático no S3', type: 'project', completed: false },
            ],
          },
        ],
      },
      {
        id: 'path-sql-mastery',
        title: 'Trilha PostgreSQL & Modelagem Relacional',
        description: 'Do modelo entidade-relacionamento a consultas complexas e tuning de índices.',
        category: 'Databases',
        level: 'intermediate',
        subjectId: 'sub-sql',
        archived: false,
        createdAt: now,
        updatedAt: now,
        modules: [
          {
            id: 'mod-sql-1',
            title: 'Módulo 1: Modelagem e Normalização',
            items: [
              { id: 'item-sql-1-1', title: '1FN, 2FN, 3FN e integridade referencial com Chaves Estrangeiras', type: 'lesson', completed: false },
              { id: 'item-sql-1-2', title: 'Exercício prático de modelagem de um sistema de e-commerce', type: 'exercise', completed: false },
            ],
          },
          {
            id: 'mod-sql-2',
            title: 'Módulo 2: Consultas Avançadas e Otimização',
            items: [
              { id: 'item-sql-2-1', title: 'Window Functions (ROW_NUMBER, RANK, DENSE_RANK)', type: 'lesson', completed: false },
              { id: 'item-sql-2-2', title: 'Compreendendo EXPLAIN ANALYZE e índices B-Tree vs Hash', type: 'lesson', completed: false },
              { id: 'item-sql-2-3', title: 'Projeto: Query tuning em tabela com 1 milhão de registros', type: 'project', completed: false },
            ],
          },
        ],
      },
      {
        id: 'path-java-backend',
        title: 'Trilha Java & Spring Boot Profissional',
        description: 'Aplicações backend corporativas com Spring Boot, JPA e arquitetura em camadas.',
        category: 'Backend',
        level: 'intermediate',
        subjectId: 'sub-java',
        archived: false,
        createdAt: now,
        updatedAt: now,
        modules: [
          {
            id: 'mod-java-1',
            title: 'Módulo 1: Java Moderno e OOP Avançada',
            items: [
              { id: 'item-java-1-1', title: 'Streams API, Lambdas e Optional', type: 'lesson', completed: false },
              { id: 'item-java-1-2', title: 'Exercício: Refatoração de código imperativo para funcional', type: 'exercise', completed: false },
            ],
          },
          {
            id: 'mod-java-2',
            title: 'Módulo 2: Spring Boot REST API',
            items: [
              { id: 'item-java-2-1', title: 'Controladores REST, DTOs e validação com Bean Validation', type: 'lesson', completed: false },
              { id: 'item-java-2-2', title: 'Tratamento global de exceções com ControllerAdvice', type: 'lesson', completed: false },
              { id: 'item-java-2-3', title: 'Projeto de Portfólio: API de Gestão de Tarefas com Spring Boot e PostgreSQL', type: 'project', completed: false },
            ],
          },
        ],
      },
    ];

    await db.learningPaths.bulkAdd(defaultPaths);
  }
}
