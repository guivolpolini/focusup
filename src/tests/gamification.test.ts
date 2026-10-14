import { describe, it, expect } from 'vitest';
import { calculateGamification, RANKS } from '../lib/gamification';

describe('Gamification Engine (Cálculo de XP & Níveis)', () => {
  it('calcula XP inicial no nível 1 para novo usuário', () => {
    const stats = calculateGamification(0, 0, 0, 0);
    expect(stats.xp).toBe(0);
    expect(stats.level).toBe(1);
    expect(stats.title).toBe(RANKS[0].title);
    expect(stats.rankBadge).toBe(RANKS[0].badge);
  });

  it('computa XP correto para minutos de foco, sessões, flashcards e streak', () => {
    // 60 minutos (120 XP) + 2 sessões (40 XP) + 4 flashcards (20 XP) + 3 dias de streak (45 XP) = 225 XP
    const stats = calculateGamification(3600, 2, 4, 3);
    expect(stats.xp).toBe(225);
    // 225 XP deve atingir o nível 2 (minXp: 150)
    expect(stats.level).toBe(2);
    expect(stats.title).toBe(RANKS[1].title);
  });

  it('progride de nível proporcionalmente conforme o estudante acumula XP', () => {
    // 3000 minutos (6000 XP) -> deve atingir o nível máximo configurado
    const stats = calculateGamification(3000 * 60, 20, 50, 10);
    expect(stats.level).toBeGreaterThanOrEqual(7);
  });
});
