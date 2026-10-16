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
  CollegeClassSchedule,
  SubjectGradeConfig,
  GymExercise,
  GymRoutine,
  GymWorkout,
  GymMeasurement,
  GymPreferences,
  Habit,
  HabitLog,
  FinanceTransaction,
  FinanceCard,
  FinanceCategory,
  FinanceMonthlyBudget,
  FinanceRecurringExpense,
} from '../types';
import { DEFAULT_FINANCE_CATEGORIES } from './financeEngine';

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
  collegeClasses!: Table<CollegeClassSchedule, string>;
  subjectGrades!: Table<SubjectGradeConfig, string>;
  gymExercises!: Table<GymExercise, string>;
  gymRoutines!: Table<GymRoutine, string>;
  gymWorkouts!: Table<GymWorkout, string>;
  gymMeasurements!: Table<GymMeasurement, string>;
  gymPreferences!: Table<GymPreferences, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  financeTransactions!: Table<FinanceTransaction, string>;
  financeCards!: Table<FinanceCard, string>;
  financeCategories!: Table<FinanceCategory, string>;
  financeBudgets!: Table<FinanceMonthlyBudget, string>;
  financeRecurring!: Table<FinanceRecurringExpense, string>;

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

    this.version(2).stores({
      collegeClasses: 'id, subjectId, dayOfWeek, startTime, createdAt, updatedAt',
      subjectGrades: 'id, subjectId, updatedAt',
    });

    this.version(3).stores({
      gymExercises: 'id, name, muscleGroup, isFavorite, isCustom, createdAt, updatedAt',
      gymRoutines: 'id, name, isArchived, createdAt, updatedAt',
      gymWorkouts: 'id, routineId, status, startedAt, endedAt, createdAt, updatedAt',
      gymMeasurements: 'id, date, createdAt, updatedAt',
      gymPreferences: 'id, updatedAt',
    });

    this.version(4).stores({
      habits: 'id, name, category, frequencyType, isArchived, createdAt, updatedAt',
      habitLogs: 'id, habitId, date, completed, createdAt, updatedAt',
    });

    this.version(5).stores({
      financeTransactions: 'id, type, date, categoryId, paymentMethod, cardId, installmentPlanId, invoiceMonth, createdAt, updatedAt',
      financeCards: 'id, name, isArchived, createdAt, updatedAt',
      financeCategories: 'id, name, type, isCustom',
      financeBudgets: 'id, monthKey, updatedAt',
    });

    this.version(6).stores({
      financeTransactions: 'id, type, date, categoryId, paymentMethod, cardId, installmentPlanId, invoiceMonth, recurringExpenseId, occurrenceKey, createdAt, updatedAt',
      financeRecurring: 'id, name, categoryId, frequency, status, firstDueDate, createdAt, updatedAt',
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

  const collegeCount = await db.subjects.where('category').equals('college').count();
  if (collegeCount === 0) {
    const now = Date.now();
    const collegeSub: Subject = {
      id: 'col-eng-soft',
      name: 'Engenharia de Software',
      description: 'Padrões de projeto, arquitetura de sistemas e metodologias ágeis',
      color: '#4f46e5',
      priority: 'high',
      category: 'college',
      targetMinutesPerWeek: 180,
      deadline: '2026-11-15',
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.subjects.add(collegeSub);

    await db.collegeClasses.add({
      id: 'class-1',
      subjectId: 'col-eng-soft',
      dayOfWeek: 1, // Segunda-feira
      startTime: '19:00',
      endTime: '20:40',
      room: 'Sala 304 - Prédio Central',
      professor: 'Prof. André Silveira',
      notes: 'Trazer notebook com ambiente Node/Java configurado',
      createdAt: now,
      updatedAt: now,
    });

    await db.subjectGrades.add({
      id: 'grade-col-eng-soft',
      subjectId: 'col-eng-soft',
      passingGrade: 6.0,
      finalExamPassingGrade: 5.0,
      assessments: [
        { id: 'ass-p1', name: 'P1 (Prova Teórica)', weight: 4, score: 7.0 },
        { id: 'ass-p2', name: 'P2 (Projeto Prático)', weight: 6 },
      ],
      updatedAt: now,
    });
  }

  // Semente da Seção Academia (Exercícios e Fichas Padrão)
  await seedGymInitialData(false);

  // Categorias padrão de Finanças
  await ensureDefaultFinanceCategories();
}

export async function seedGymInitialData(force = false) {
  const now = Date.now();
  const gymExerciseCount = await db.gymExercises.count();
  const gymRoutineCount = await db.gymRoutines.count();

  if (gymExerciseCount === 0 || force) {
    const defaultExercises: GymExercise[] = [
      // Peito
      { id: 'ex-supino-reto', name: 'Supino Reto com Barra', muscleGroup: 'peito', equipment: 'Barra', isFavorite: true, isCustom: false, instructions: 'Mantenha os pés firmes no chão, desça a barra até o meio do peito e empurre estendendo os braços.', createdAt: now, updatedAt: now },
      { id: 'ex-supino-inclinado', name: 'Supino Inclinado com Halteres', muscleGroup: 'peito', equipment: 'Halteres', isFavorite: true, isCustom: false, instructions: 'Banco a 30-45 graus. Foco na porção clavicular (superior) do peitoral.', createdAt: now, updatedAt: now },
      { id: 'ex-crucifixo-maquina', name: 'Crucifixo na Máquina (Peck Deck)', muscleGroup: 'peito', equipment: 'Máquina', isFavorite: false, isCustom: false, instructions: 'Alongue bem no retorno sem projetar os ombros para frente.', createdAt: now, updatedAt: now },
      { id: 'ex-crossover', name: 'Crossover na Polia Média', muscleGroup: 'peito', equipment: 'Polia', isFavorite: false, isCustom: false, instructions: 'Cruze as mãos à frente do tronco, apertando o peitoral no pico de contração.', createdAt: now, updatedAt: now },

      // Costas
      { id: 'ex-puxada-alta', name: 'Puxada Alta Aberta no Pulley', muscleGroup: 'costas', equipment: 'Polia', isFavorite: true, isCustom: false, instructions: 'Puxe a barra em direção ao peito com o tronco levemente inclinado para trás.', createdAt: now, updatedAt: now },
      { id: 'ex-remada-curvada', name: 'Remada Curvada com Barra', muscleGroup: 'costas', equipment: 'Barra', isFavorite: true, isCustom: false, instructions: 'Tronco inclinado a 45 graus, coluna ereta e joelhos semi-flexionados.', createdAt: now, updatedAt: now },
      { id: 'ex-remada-baixa', name: 'Remada Baixa com Triângulo', muscleGroup: 'costas', equipment: 'Polia', isFavorite: false, isCustom: false, instructions: 'Puxe em direção ao umbigo, esmagando as escápulas.', createdAt: now, updatedAt: now },
      { id: 'ex-barra-fixa', name: 'Barra Fixa (Pronada)', muscleGroup: 'costas', equipment: 'Peso Corporal', isFavorite: false, isCustom: false, instructions: 'Pegada aberta. Puxe até o queixo ultrapassar a barra.', createdAt: now, updatedAt: now },

      // Ombros
      { id: 'ex-desenvolvimento-halteres', name: 'Desenvolvimento Sentado com Halteres', muscleGroup: 'ombros', equipment: 'Halteres', isFavorite: true, isCustom: false, instructions: 'Empurre os halteres acima da cabeça sem bater os pesos no topo.', createdAt: now, updatedAt: now },
      { id: 'ex-elevacao-lateral', name: 'Elevação Lateral com Halteres', muscleGroup: 'ombros', equipment: 'Halteres', isFavorite: true, isCustom: false, instructions: 'Eleve os braços até a linha dos ombros, mantendo leve flexão nos cotovelos.', createdAt: now, updatedAt: now },
      { id: 'ex-crucifixo-inverso', name: 'Crucifixo Inverso na Máquina', muscleGroup: 'ombros', equipment: 'Máquina', isFavorite: false, isCustom: false, instructions: 'Foco no deltóide posterior.', createdAt: now, updatedAt: now },

      // Bíceps
      { id: 'ex-rosca-direta', name: 'Rosca Direta com Barra W', muscleGroup: 'biceps', equipment: 'Barra', isFavorite: true, isCustom: false, instructions: 'Cotovelos colados ao tronco durante todo o movimento.', createdAt: now, updatedAt: now },
      { id: 'ex-rosca-martelo', name: 'Rosca Martelo com Halteres', muscleGroup: 'biceps', equipment: 'Halteres', isFavorite: true, isCustom: false, instructions: 'Pegada neutra (palmas voltadas uma para a outra). Ativa braquial e antebraço.', createdAt: now, updatedAt: now },

      // Tríceps
      { id: 'ex-triceps-corda', name: 'Tríceps Corda no Pulley', muscleGroup: 'triceps', equipment: 'Polia', isFavorite: true, isCustom: false, instructions: 'Abra a corda no final da descida para contração máxima.', createdAt: now, updatedAt: now },
      { id: 'ex-triceps-testa', name: 'Tríceps Testa com Barra W', muscleGroup: 'triceps', equipment: 'Barra', isFavorite: false, isCustom: false, instructions: 'Desça a barra controladamente em direção à testa mantendo os cotovelos fixos.', createdAt: now, updatedAt: now },

      // Pernas / Quadríceps
      { id: 'ex-agachamento-livre', name: 'Agachamento Livre com Barra', muscleGroup: 'quadriceps', equipment: 'Barra', isFavorite: true, isCustom: false, instructions: 'Pés na largura dos ombros, agache até 90 graus ou mais mantendo coluna neutra.', createdAt: now, updatedAt: now },
      { id: 'ex-leg-press-45', name: 'Leg Press 45º', muscleGroup: 'quadriceps', equipment: 'Máquina', isFavorite: true, isCustom: false, instructions: 'Desça a plataforma controlando a carga sem tirar o quadril do encosto.', createdAt: now, updatedAt: now },
      { id: 'ex-cadeira-extensora', name: 'Cadeira Extensora', muscleGroup: 'quadriceps', equipment: 'Máquina', isFavorite: false, isCustom: false, instructions: 'Estenda totalmente as pernas e segure 1 segundo no topo.', createdAt: now, updatedAt: now },

      // Posterior / Glúteos
      { id: 'ex-stiff', name: 'Stiff com Barra ou Halteres', muscleGroup: 'posterior', equipment: 'Barra', isFavorite: true, isCustom: false, instructions: 'Quadril para trás com joelhos levemente destravados, coluna reta.', createdAt: now, updatedAt: now },
      { id: 'ex-mesa-flexora', name: 'Mesa Flexora', muscleGroup: 'posterior', equipment: 'Máquina', isFavorite: true, isCustom: false, instructions: 'Flexione as pernas aproximando os calcanhares dos glúteos.', createdAt: now, updatedAt: now },
      { id: 'ex-elevacao-pelvica', name: 'Elevação Pélvica com Barra', muscleGroup: 'gluteos', equipment: 'Barra', isFavorite: false, isCustom: false, instructions: 'Apoie as escápulas no banco e suba o quadril contraindo os glúteos.', createdAt: now, updatedAt: now },

      // Panturrilhas & Abdômen
      { id: 'ex-panturrilha-pe', name: 'Gêmeos em Pé na Máquina', muscleGroup: 'panturrilha', equipment: 'Máquina', isFavorite: false, isCustom: false, instructions: 'Amplitude completa de movimento com alongamento máximo na descida.', createdAt: now, updatedAt: now },
      { id: 'ex-prancha-abdominal', name: 'Prancha Abdominal Isométrica', muscleGroup: 'abdomen', equipment: 'Peso Corporal', isFavorite: false, isCustom: false, instructions: 'Corpo alinhado e abdômen contraído durante o tempo determinado.', createdAt: now, updatedAt: now },
      { id: 'ex-abdominal-infra', name: 'Abdominal Infra Suspenso na Barra', muscleGroup: 'abdomen', equipment: 'Peso Corporal', isFavorite: false, isCustom: false, instructions: 'Eleve os joelhos em direção ao peito sem balançar o corpo.', createdAt: now, updatedAt: now },
    ];
    await db.gymExercises.bulkPut(defaultExercises);
  }

  if (gymRoutineCount === 0 || force) {
    // Fichas Iniciais (Divisão ABC Clássica)
    const defaultRoutines: GymRoutine[] = [
      {
        id: 'routine-abc-a',
        name: 'Treino A — Peito, Ombros e Tríceps (Push)',
        splitCategory: 'ABC',
        description: 'Foco em músculos de empurrar: peitoral, deltoides anterior/lateral e tríceps.',
        muscleGroups: ['peito', 'ombros', 'triceps'],
        defaultRestSeconds: 90,
        isArchived: false,
        exercises: [
          { id: 're-1', exerciseId: 'ex-supino-reto', name: 'Supino Reto com Barra', muscleGroup: 'peito', targetSets: 4, targetReps: '8-10', defaultRestSeconds: 90, targetWeightKg: 40 },
          { id: 're-2', exerciseId: 'ex-supino-inclinado', name: 'Supino Inclinado com Halteres', muscleGroup: 'peito', targetSets: 3, targetReps: '10-12', defaultRestSeconds: 90, targetWeightKg: 18 },
          { id: 're-3', exerciseId: 'ex-crucifixo-maquina', name: 'Crucifixo na Máquina (Peck Deck)', muscleGroup: 'peito', targetSets: 3, targetReps: '12', defaultRestSeconds: 60, targetWeightKg: 45 },
          { id: 're-4', exerciseId: 'ex-desenvolvimento-halteres', name: 'Desenvolvimento Sentado com Halteres', muscleGroup: 'ombros', targetSets: 3, targetReps: '10', defaultRestSeconds: 90, targetWeightKg: 14 },
          { id: 're-5', exerciseId: 'ex-elevacao-lateral', name: 'Elevação Lateral com Halteres', muscleGroup: 'ombros', targetSets: 4, targetReps: '12-15', defaultRestSeconds: 60, targetWeightKg: 8 },
          { id: 're-6', exerciseId: 'ex-triceps-corda', name: 'Tríceps Corda no Pulley', muscleGroup: 'triceps', targetSets: 3, targetReps: '12', defaultRestSeconds: 60, targetWeightKg: 25 },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'routine-abc-b',
        name: 'Treino B — Costas, Bíceps e Trapézio (Pull)',
        splitCategory: 'ABC',
        description: 'Foco em puxadas: dorsal, romboides, deltóide posterior e flexores do cotovelo.',
        muscleGroups: ['costas', 'biceps', 'ombros'],
        defaultRestSeconds: 90,
        isArchived: false,
        exercises: [
          { id: 're-7', exerciseId: 'ex-puxada-alta', name: 'Puxada Alta Aberta no Pulley', muscleGroup: 'costas', targetSets: 4, targetReps: '8-10', defaultRestSeconds: 90, targetWeightKg: 50 },
          { id: 're-8', exerciseId: 'ex-remada-curvada', name: 'Remada Curvada com Barra', muscleGroup: 'costas', targetSets: 3, targetReps: '10', defaultRestSeconds: 90, targetWeightKg: 40 },
          { id: 're-9', exerciseId: 'ex-remada-baixa', name: 'Remada Baixa com Triângulo', muscleGroup: 'costas', targetSets: 3, targetReps: '12', defaultRestSeconds: 60, targetWeightKg: 45 },
          { id: 're-10', exerciseId: 'ex-crucifixo-inverso', name: 'Crucifixo Inverso na Máquina', muscleGroup: 'ombros', targetSets: 3, targetReps: '15', defaultRestSeconds: 60, targetWeightKg: 35 },
          { id: 're-11', exerciseId: 'ex-rosca-direta', name: 'Rosca Direta com Barra W', muscleGroup: 'biceps', targetSets: 3, targetReps: '10-12', defaultRestSeconds: 60, targetWeightKg: 20 },
          { id: 're-12', exerciseId: 'ex-rosca-martelo', name: 'Rosca Martelo com Halteres', muscleGroup: 'biceps', targetSets: 3, targetReps: '12', defaultRestSeconds: 60, targetWeightKg: 12 },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'routine-abc-c',
        name: 'Treino C — Pernas Completo e Abdômen (Legs)',
        splitCategory: 'ABC',
        description: 'Foco nos membros inferiores (quadríceps, posteriores, glúteos e panturrilhas) e core.',
        muscleGroups: ['quadriceps', 'posterior', 'gluteos', 'panturrilha', 'abdomen'],
        defaultRestSeconds: 120,
        isArchived: false,
        exercises: [
          { id: 're-13', exerciseId: 'ex-agachamento-livre', name: 'Agachamento Livre com Barra', muscleGroup: 'quadriceps', targetSets: 4, targetReps: '8-10', defaultRestSeconds: 120, targetWeightKg: 50 },
          { id: 're-14', exerciseId: 'ex-leg-press-45', name: 'Leg Press 45º', muscleGroup: 'quadriceps', targetSets: 3, targetReps: '10-12', defaultRestSeconds: 90, targetWeightKg: 120 },
          { id: 're-15', exerciseId: 'ex-cadeira-extensora', name: 'Cadeira Extensora', muscleGroup: 'quadriceps', targetSets: 3, targetReps: '12-15', defaultRestSeconds: 60, targetWeightKg: 40 },
          { id: 're-16', exerciseId: 'ex-mesa-flexora', name: 'Mesa Flexora', muscleGroup: 'posterior', targetSets: 3, targetReps: '12', defaultRestSeconds: 60, targetWeightKg: 35 },
          { id: 're-17', exerciseId: 'ex-panturrilha-pe', name: 'Gêmeos em Pé na Máquina', muscleGroup: 'panturrilha', targetSets: 4, targetReps: '15', defaultRestSeconds: 45, targetWeightKg: 50 },
          { id: 're-18', exerciseId: 'ex-prancha-abdominal', name: 'Prancha Abdominal Isométrica', muscleGroup: 'abdomen', targetSets: 3, targetReps: '45s', defaultRestSeconds: 45 },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];
    await db.gymRoutines.bulkPut(defaultRoutines);

    const defaultGymPreferences: GymPreferences = {
      id: 'gym_preferences',
      weeklyGoalDays: 4,
      preferredDays: [1, 2, 4, 5], // Seg, Ter, Qui, Sex
      plannedRoutineMap: {
        1: 'routine-abc-a',
        2: 'routine-abc-b',
        4: 'routine-abc-c',
        5: 'routine-abc-a',
      },
      defaultRestSeconds: 90,
      updatedAt: now,
    };
    await db.gymPreferences.put(defaultGymPreferences);
  }
}

/**
 * Garante que todas as categorias financeiras padrão do FocusUp estejam presentes no IndexedDB.
 * Preserva 100% das categorias personalizadas criadas pelo usuário e não duplica nomes já existentes.
 */
export async function ensureDefaultFinanceCategories(): Promise<void> {
  try {
    const existing = await db.financeCategories.toArray();
    const existingIds = new Set(existing.map((c) => c.id));
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase().trim()));

    const missing = DEFAULT_FINANCE_CATEGORIES.filter((def) => {
      if (existingIds.has(def.id)) return false;
      if (existingNames.has(def.name.toLowerCase().trim())) return false;
      return true;
    });

    if (missing.length > 0) {
      await db.financeCategories.bulkPut(missing);
    }
  } catch (err) {
    console.error('Erro ao inicializar categorias financeiras padrão:', err);
  }
}
