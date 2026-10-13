export interface GamificationStats {
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  title: string;
  rankBadge: string;
}

export const RANKS = [
  { level: 1, title: 'Iniciado nos Estudos', badge: '🌱', minXp: 0 },
  { level: 2, title: 'Aprendiz Disciplinado', badge: '⚡', minXp: 150 },
  { level: 3, title: 'Foco de Ferro', badge: '🛡️', minXp: 400 },
  { level: 4, title: 'Arquiteto do Conhecimento', badge: '⚔️', minXp: 800 },
  { level: 5, title: 'Especialista em Foco', badge: '🔮', minXp: 1400 },
  { level: 6, title: 'Mestre da Consistência', badge: '👑', minXp: 2200 },
  { level: 7, title: 'Lorde do Aprendizado', badge: '💎', minXp: 3500 },
];

/**
 * Calcula o nível, XP e título a partir do total de minutos estudados,
 * sessões finalizadas e flashcards revisados (dados 100% reais, sem números fictícios).
 * 
 * Regra de XP:
 * - 1 minuto de foco concluído = 2 XP
 * - 1 sessão de foco completada = 20 XP bônus
 * - 1 revisão de flashcard = 5 XP
 * - Cada dia de streak ativo = 15 XP
 */
export function calculateGamification(
  totalStudiedSeconds: number,
  completedSessionsCount: number,
  reviewsCount: number,
  streakDays: number
): GamificationStats {
  const minutesXp = Math.floor(totalStudiedSeconds / 60) * 2;
  const sessionsXp = completedSessionsCount * 20;
  const flashcardsXp = reviewsCount * 5;
  const streakXp = streakDays * 15;

  const totalXp = minutesXp + sessionsXp + flashcardsXp + streakXp;

  let currentRank = RANKS[0];
  let nextRank = RANKS[1];

  for (let i = 0; i < RANKS.length; i++) {
    if (totalXp >= RANKS[i].minXp) {
      currentRank = RANKS[i];
      nextRank = RANKS[i + 1] || { ...RANKS[i], minXp: RANKS[i].minXp + 2000, level: RANKS[i].level + 1 };
    }
  }

  const xpInCurrentLevel = totalXp - currentRank.minXp;
  const xpNeededForNext = nextRank.minXp - currentRank.minXp;

  return {
    xp: totalXp,
    level: currentRank.level,
    currentLevelXp: Math.max(0, xpInCurrentLevel),
    nextLevelXp: xpNeededForNext,
    title: currentRank.title,
    rankBadge: currentRank.badge,
  };
}
