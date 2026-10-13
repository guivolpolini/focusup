import { describe, it, expect } from 'vitest';
import { calculateTimerProgress, type ActiveTimerState } from '../lib/timerEngine';

describe('Timer Engine (Resiliência Temporal)', () => {
  it('calcula o tempo restante corretamente enquanto rodando', () => {
    const baseNow = 1700000000000;
    const state: ActiveTimerState = {
      status: 'running',
      mode: 'pomodoro',
      plannedMinutes: 25,
      startedAt: baseNow,
      accumulatedPausedMs: 0,
      isBreak: false,
    };

    // 5 minutos depois
    const after5min = baseNow + 5 * 60 * 1000;
    const progress = calculateTimerProgress(state, after5min);

    expect(progress.actualStudiedSeconds).toBe(5 * 60);
    expect(progress.remainingSeconds).toBe(20 * 60);
    expect(progress.progressPercentage).toBe(20);
    expect(progress.isFinished).toBe(false);
  });

  it('desconta pausas corretamente e não pontua pausas como estudo', () => {
    const baseNow = 1700000000000;
    const state: ActiveTimerState = {
      status: 'running',
      mode: 'pomodoro',
      plannedMinutes: 25,
      startedAt: baseNow,
      accumulatedPausedMs: 3 * 60 * 1000, // 3 min de pausa acumulada
      isBreak: false,
    };

    // 10 minutos se passaram desde o início
    const after10min = baseNow + 10 * 60 * 1000;
    const progress = calculateTimerProgress(state, after10min);

    // Estudado real: 10 - 3 = 7 min
    expect(progress.actualStudiedSeconds).toBe(7 * 60);
    expect(progress.remainingSeconds).toBe(18 * 60);
  });

  it('congela o tempo restante quando pausado', () => {
    const baseNow = 1700000000000;
    const pausedAt = baseNow + 10 * 60 * 1000; // pausou após 10 min
    const state: ActiveTimerState = {
      status: 'paused',
      mode: 'pomodoro',
      plannedMinutes: 25,
      startedAt: baseNow,
      pausedAt,
      accumulatedPausedMs: 0,
      isBreak: false,
    };

    // 1 hora depois com o app suspenso
    const muchLater = baseNow + 60 * 60 * 1000;
    const progress = calculateTimerProgress(state, muchLater);

    expect(progress.actualStudiedSeconds).toBe(10 * 60);
    expect(progress.remainingSeconds).toBe(15 * 60);
  });

  it('detecta conclusão ao atingir ou ultrapassar o tempo planejado', () => {
    const baseNow = 1700000000000;
    const state: ActiveTimerState = {
      status: 'running',
      mode: 'five_min',
      plannedMinutes: 5,
      startedAt: baseNow,
      accumulatedPausedMs: 0,
      isBreak: false,
    };

    const after6min = baseNow + 6 * 60 * 1000;
    const progress = calculateTimerProgress(state, after6min);

    expect(progress.remainingSeconds).toBe(0);
    expect(progress.isFinished).toBe(true);
    expect(progress.progressPercentage).toBe(100);
  });
});
