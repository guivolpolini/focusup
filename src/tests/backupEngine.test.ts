import { describe, it, expect } from 'vitest';
import { validateBackupString, mergeEntitiesLWW } from '../lib/backupEngine';

describe('Backup Engine (Validação Zod & Merge LWW)', () => {
  it('valida com sucesso um backup estruturado', () => {
    const validJson = JSON.stringify({
      version: 1,
      appName: 'FocusUp',
      exportedAt: '2026-10-13T20:00:00.000Z',
      data: {
        subjects: [{ id: 'sub-1', name: 'Test', updatedAt: 100 }],
        tasks: [],
        learningPaths: [],
        studySessions: [],
        flashcards: [],
        preferences: [],
        studyPlans: [],
        weeklyReviews: [],
        portfolioProjects: [],
      },
    });

    const result = validateBackupString(validJson);
    expect(result.success).toBe(true);
  });

  it('rejeita backups corrompidos ou com app diferente', () => {
    const invalidJson = JSON.stringify({
      version: 1,
      appName: 'OtherApp',
      data: {},
    });

    const result = validateBackupString(invalidJson);
    expect(result.success).toBe(false);
  });

  it('aplica merge determinístico Last-Write-Wins (LWW) corretamente', () => {
    const local = [
      { id: '1', name: 'Versão Local Antiga', updatedAt: 100 },
      { id: '2', name: 'Versão Local Recente', updatedAt: 300 },
    ];

    const incoming = [
      { id: '1', name: 'Versão Backup Nova', updatedAt: 200 }, // deve atualizar
      { id: '2', name: 'Versão Backup Velha', updatedAt: 150 }, // NÃO deve atualizar
      { id: '3', name: 'Novo Registro do Backup', updatedAt: 100 }, // deve adicionar
    ];

    const result = mergeEntitiesLWW(local, incoming);

    expect(result.addedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.merged.length).toBe(3);

    const item1 = result.merged.find((i) => i.id === '1');
    expect(item1?.name).toBe('Versão Backup Nova');

    const item2 = result.merged.find((i) => i.id === '2');
    expect(item2?.name).toBe('Versão Local Recente');

    const item3 = result.merged.find((i) => i.id === '3');
    expect(item3?.name).toBe('Novo Registro do Backup');
  });
});
