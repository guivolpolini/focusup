import { describe, expect, it } from 'vitest';
import {
  formatDateToLocalYYYYMMDD,
  formatLocalMonthKey,
  formatTimestampToLocalYYYYMMDD,
  getTodayLocalYYYYMMDD,
} from '../lib/srsEngine';
import { formatStudyRelativeDate } from '../lib/studyEngine';

describe('Local Date Utilities (UTC vs Local regression guard)', () => {
  it('preserves local calendar date even at 23:45 local time', () => {
    const lateNight = new Date(2026, 10, 18, 23, 45, 0); // 18/11/2026 23:45 local
    expect(formatDateToLocalYYYYMMDD(lateNight)).toBe('2026-11-18');
    expect(formatTimestampToLocalYYYYMMDD(lateNight.getTime())).toBe('2026-11-18');
    expect(formatLocalMonthKey(lateNight)).toBe('2026-11');
  });

  it('handles month-end at 23:59 without jumping to next month', () => {
    const monthEnd = new Date(2026, 9, 31, 23, 59, 59); // 31/10/2026 23:59:59 local
    expect(formatDateToLocalYYYYMMDD(monthEnd)).toBe('2026-10-31');
    expect(formatLocalMonthKey(monthEnd)).toBe('2026-10');
  });

  it('getTodayLocalYYYYMMDD returns valid YYYY-MM-DD', () => {
    expect(getTodayLocalYYYYMMDD()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('formatStudyRelativeDate accurately distinguishes Hoje and Ontem', () => {
    expect(formatStudyRelativeDate('2026-11-18', '2026-11-18')).toBe('Hoje (18/11)');
    expect(formatStudyRelativeDate('2026-11-17', '2026-11-18')).toBe('Ontem (17/11)');
    expect(formatStudyRelativeDate('2026-11-01', '2026-11-18')).toBe('01/11/2026');
  });
});
