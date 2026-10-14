export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'postponed';
export type SessionMode = 'pomodoro' | 'deep_work' | 'custom' | 'five_min';
export type SRSGrade = 'hard' | 'medium' | 'easy';

export interface Subject {
  id: string;
  name: string;
  description?: string;
  color: string;
  priority: Priority;
  category?: 'college' | 'self_study'; // 'college' para faculdade, 'self_study' para autodidata
  targetMinutesPerWeek: number;
  startDate?: string;
  deadline?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  subjectId: string;
  learningPathId?: string;
  priority: Priority;
  dueDate?: string;
  estimatedMinutes: number;
  actualStudiedMinutes: number;
  status: TaskStatus;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface LessonItem {
  id: string;
  title: string;
  type: 'lesson' | 'exercise' | 'project';
  completed: boolean;
  completedAt?: number;
}

export interface ModuleItem {
  id: string;
  title: string;
  items: LessonItem[];
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  modules: ModuleItem[];
  subjectId?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StudySession {
  id: string;
  subjectId?: string;
  taskId?: string;
  learningPathId?: string;
  lessonId?: string;
  mode: SessionMode;
  plannedDurationMinutes: number;
  actualDurationSeconds: number;
  startedAt: number; // UTC timestamp
  endedAt?: number; // UTC timestamp
  status: 'completed' | 'abandoned';
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Flashcard {
  id: string;
  front: string; // pergunta
  back: string; // resposta
  subjectId: string;
  learningPathId?: string;
  tags?: string[];
  easeFactor: number; // Inicial: 2.5
  intervalDays: number; // Próximo intervalo em dias
  repetitions: number; // Contador de acertos consecutivos
  nextReviewDate: string; // YYYY-MM-DD
  lastReviewedAt?: number; // UTC timestamp
  reviewsCount: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DayAvailability {
  dayOfWeek: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  minutesAvailable: number;
  preferredStartTime?: string; // HH:mm
}

export interface StudyPreferences {
  id: string; // "user_preferences"
  dailyGoalMinutes: number;
  weeklyAvailability: DayAvailability[];
  primaryArea: string;
  theme: 'light' | 'dark';
  breakIntervalMinutes: number;
  updatedAt: number;
}

export interface PlannedActivity {
  id: string;
  planId: string;
  date: string; // YYYY-MM-DD
  startTime?: string;
  plannedMinutes: number;
  subjectId?: string;
  taskId?: string;
  flashcardReview?: boolean;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
}

export interface StudyPlan {
  id: string;
  weekStartDate: string; // YYYY-MM-DD (segunda-feira)
  weekEndDate: string; // YYYY-MM-DD (domingo)
  activities: PlannedActivity[];
  totalPlannedMinutes: number;
  status: 'active' | 'completed' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface WeeklyReview {
  id: string;
  weekStartDate: string; // YYYY-MM-DD
  weekEndDate: string; // YYYY-MM-DD
  totalStudiedMinutes: number;
  totalPlannedMinutes: number;
  goalCompletionRate: number; // 0 a 100
  sessionsCount: number;
  daysStudiedCount: number;
  subjectDistribution: Record<string, number>; // subjectId -> minutes
  observations: string[];
  proposedNextPlan?: {
    recommendedFocusSubjectId?: string;
    suggestedDailyGoalMinutes: number;
    notes: string;
  };
  accepted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PortfolioProject {
  id: string;
  title: string;
  description: string;
  skills: string[];
  repoUrl?: string;
  demoUrl?: string;
  targetDate?: string;
  status: 'planned' | 'in_progress' | 'completed';
  createdAt: number;
  updatedAt: number;
}

export interface Assessment {
  id: string;
  name: string; // Ex: 'P1', 'P2', 'Trabalho Semestral', 'Atividades'
  weight: number; // Ex: 4 para peso 4
  score?: number; // Ex: 7.5 (undefined se pendente)
  maxScore?: number; // Padrão 10
}

export interface SubjectGradeConfig {
  id: string; // id do registro ou subjectId
  subjectId: string;
  passingGrade: number; // Média mínima para aprovação direta (ex: 6.0 ou 7.0)
  finalExamPassingGrade?: number; // Média mínima necessária após exame (ex: 5.0)
  assessments: Assessment[];
  updatedAt: number;
}

export interface GradeSimulationResult {
  currentWeightedAverage: number | null;
  accumulatedPoints: number;
  totalWeight: number;
  completedWeight: number;
  remainingWeight: number;
  status: 'passed' | 'pending' | 'danger_exam' | 'failed';
  neededRemainingAverage: number | null;
  finalExamNeeded?: number | null;
  message: string;
}

export interface CollegeClassSchedule {
  id: string;
  subjectId: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6; // 1 = Seg, 2 = Ter, 3 = Qua, 4 = Qui, 5 = Sex, 6 = Sáb
  startTime: string; // '19:00'
  endTime: string; // '20:40'
  room?: string; // 'Sala 302' ou 'Lab 4'
  professor?: string; // 'Prof. Marcelo'
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type MuscleGroup =
  | 'peito'
  | 'costas'
  | 'ombros'
  | 'biceps'
  | 'triceps'
  | 'pernas'
  | 'quadriceps'
  | 'posterior'
  | 'gluteos'
  | 'panturrilha'
  | 'abdomen'
  | 'cardio'
  | 'outro';

export interface GymExercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string; // 'Halteres' | 'Barra' | 'Máquina' | 'Polia' | 'Peso Corporal' | 'Livre' | 'Outro'
  instructions?: string;
  notes?: string;
  isFavorite: boolean;
  isCustom: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GymRoutineExercise {
  id: string; // identificador único na ficha
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  targetSets: number; // ex: 4
  targetReps: string; // ex: "8-12" ou "10"
  defaultRestSeconds: number; // ex: 60, 90, 120
  targetWeightKg?: number; // Carga inicial prevista
  notes?: string;
}

export interface GymRoutine {
  id: string;
  name: string; // ex: "Treino A - Peito e Tríceps"
  splitCategory?: string; // "ABC" | "ABCD" | "Push/Pull/Legs" | "Superior/Inferior" | "Personalizado"
  description?: string;
  muscleGroups: MuscleGroup[];
  exercises: GymRoutineExercise[];
  defaultRestSeconds: number;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GymSetLog {
  setNumber: number;
  weightKg: number;
  reps: number;
  completed: boolean;
  restSeconds?: number;
}

export interface GymWorkoutExerciseLog {
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  sets: GymSetLog[];
  notes?: string;
}

export interface GymWorkout {
  id: string;
  routineId?: string;
  routineName: string;
  startedAt: number; // timestamp UTC
  endedAt?: number; // timestamp UTC
  durationMinutes: number;
  exercises: GymWorkoutExerciseLog[];
  totalVolumeKg: number;
  totalSetsCompleted: number;
  notes?: string;
  status: 'completed' | 'abandoned' | 'in_progress';
  createdAt: number;
  updatedAt: number;
}

export interface GymMeasurement {
  id: string;
  date: string; // 'YYYY-MM-DD'
  weightKg?: number;
  bodyFatPercent?: number;
  chestCm?: number;
  waistCm?: number;
  leftBicepsCm?: number;
  rightBicepsCm?: number;
  thighsCm?: number;
  calvesCm?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GymPreferences {
  id: string; // 'gym_preferences'
  weeklyGoalDays: number; // ex: 3, 4, 5
  preferredDays: number[]; // [1, 2, 4, 5] (1 = Seg, ..., 6 = Sáb, 0 = Dom)
  plannedRoutineMap: Record<number, string>; // { 1: routineId, 3: routineId }
  defaultRestSeconds: number; // ex: 90
  updatedAt: number;
}

export interface ActiveWorkoutState {
  id: string;
  routineId?: string;
  routineName: string;
  startedAt: number;
  elapsedSeconds: number;
  isPaused: boolean;
  exercises: GymWorkoutExerciseLog[];
  notes?: string;
  currentRestTimer?: {
    startedAt: number;
    durationSeconds: number;
    targetExerciseName?: string;
  } | null;
}

