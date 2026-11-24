import { describe, expect, it } from 'vitest';
import { addDays, formatCents, formatCountdown, formatDay, formatDayTime, formatRate, formatRuntime, formatTime, todayKey } from './format';

describe('format helpers', () => {
  it('formats cents as US dollars', () => {
    expect(formatCents(1450)).toBe('$14.50');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(123456)).toBe('$1,234.56');
  });

  it('formats tax rates', () => {
    expect(formatRate(0.0775)).toBe('7.75%');
    expect(formatRate(0.1)).toBe('10%');
  });

  it('formats theater-local times as wall-clock values, ignoring the browser time zone', () => {
    expect(formatTime('2030-03-03T19:00:00')).toBe('7:00 PM');
    expect(formatTime('2030-03-03T11:05:00')).toBe('11:05 AM');
    expect(formatDay('2030-03-03')).toBe('Sun, Mar 3');
    expect(formatDayTime('2030-03-03T21:40:00')).toBe('Sun, Mar 3 · 9:40 PM');
  });

  it('formats runtimes and countdowns', () => {
    expect(formatRuntime(128)).toBe('2 hr 8 min');
    expect(formatRuntime(45)).toBe('45 min');
    expect(formatCountdown(9 * 60_000 + 5_000)).toBe('9:05');
    expect(formatCountdown(-1)).toBe('0:00');
  });

  it('does date arithmetic on yyyy-MM-dd strings', () => {
    expect(addDays('2030-02-27', 3)).toBe('2030-03-02');
    expect(addDays('2030-03-02', -29)).toBe('2030-02-01');
    expect(todayKey(new Date(2030, 0, 5, 23, 30))).toBe('2030-01-05');
  });
});
