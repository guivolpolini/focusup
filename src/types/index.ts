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
