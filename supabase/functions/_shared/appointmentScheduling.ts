export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export type AppointmentWindowType = 'call' | 'visit' | 'meeting' | 'other';

export type AppointmentWindowRule = {
  start: string;
  end: string;
  days: DayKey[];
};

export type AppointmentWindowConfig = Record<AppointmentWindowType, AppointmentWindowRule>;

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const DEFAULT_APPOINTMENT_WINDOW_CONFIG: AppointmentWindowConfig = {
  call: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  visit: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  meeting: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  other: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
};

function normalizeDayKey(raw: unknown): DayKey | null {
  const value = String(raw || '').trim().toLowerCase();
  if (DAY_KEYS.includes(value as DayKey)) return value as DayKey;

  const aliases: Record<string, DayKey> = {
    sunday: 'sun',
    domingo: 'sun',
    monday: 'mon',
    segunda: 'mon',
    tuesday: 'tue',
    terca: 'tue',
    'terça': 'tue',
    wednesday: 'wed',
    quarta: 'wed',
    thursday: 'thu',
    quinta: 'thu',
    friday: 'fri',
    sexta: 'fri',
    saturday: 'sat',
    sabado: 'sat',
    'sábado': 'sat',
  };

  return aliases[value] || null;
}

function normalizeHHMM(value: unknown, fallback: string): string {
  const parsed = String(value || '').trim();
  const match = parsed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseHHMMToMinutes(value: string): number {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return -1;
  return (Number(match[1]) * 60) + Number(match[2]);
}

export function normalizeAppointmentTypeForWindow(value: unknown): AppointmentWindowType {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'visit') return 'visit';
  if (normalized === 'meeting') return 'meeting';
  if (normalized === 'demo' || normalized === 'call') return 'call';
  return 'other';
}

export function normalizeAppointmentWindowConfig(raw: unknown): AppointmentWindowConfig {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const normalized = { ...DEFAULT_APPOINTMENT_WINDOW_CONFIG };

  const keys: AppointmentWindowType[] = ['call', 'visit', 'meeting', 'other'];
  for (const key of keys) {
    const incoming = source[key];
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) continue;

    const typedIncoming = incoming as Record<string, unknown>;
    const start = normalizeHHMM(typedIncoming.start, DEFAULT_APPOINTMENT_WINDOW_CONFIG[key].start);
    const end = normalizeHHMM(typedIncoming.end, DEFAULT_APPOINTMENT_WINDOW_CONFIG[key].end);
    const incomingDays = Array.isArray(typedIncoming.days) ? typedIncoming.days : [];
    const days = Array.from(
      new Set(
        incomingDays
          .map((day) => normalizeDayKey(day))
          .filter((day): day is DayKey => Boolean(day)),
      ),
    );

    normalized[key] = {
      start,
      end,
      days: days.length > 0 ? days : DEFAULT_APPOINTMENT_WINDOW_CONFIG[key].days,
    };
  }

  return normalized;
}

export function getZonedDateParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: DayKey;
} {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  });

  const parts = dateFormatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value || '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value || '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value || '0');
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  const second = Number(parts.find((part) => part.type === 'second')?.value || '0');
  const weekdayRaw = String(weekdayFormatter.format(date) || '').toLowerCase().slice(0, 3);
  const weekday = (DAY_KEYS.includes(weekdayRaw as DayKey) ? weekdayRaw : 'mon') as DayKey;

  return { year, month, day, hour, minute, second, weekday };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtc - date.getTime();
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

export function overlapsBusyRange(
  startMs: number,
  endMs: number,
  busyRanges: Array<{ startMs: number; endMs: number }>,
): boolean {
  return busyRanges.some((range) => startMs < range.endMs && endMs > range.startMs);
}

export function generateAvailableSlotsForType(params: {
  now: Date;
  timeZone: string;
  windowRule: AppointmentWindowRule;
  busyRanges: Array<{ startMs: number; endMs: number }>;
  minLeadDays?: number;
  slotMinutes?: number;
  limit?: number;
  lookaheadDays?: number;
}): string[] {
  const {
    now,
    timeZone,
    windowRule,
    busyRanges,
    minLeadDays = 0,
    slotMinutes = 30,
    limit = 8,
    lookaheadDays = 14,
  } = params;

  const startMinutes = parseHHMMToMinutes(windowRule.start);
  const endMinutes = parseHHMMToMinutes(windowRule.end);
  if (startMinutes < 0 || endMinutes <= startMinutes) return [];

  const results: string[] = [];
  const seen = new Set<string>();
  const nowMs = now.getTime();
  const nowZoned = getZonedDateParts(now, timeZone);
  const localTodayNoonUtc = zonedDateTimeToUtc(
    nowZoned.year,
    nowZoned.month,
    nowZoned.day,
    12,
    0,
    0,
    timeZone,
  );

  for (let dayOffset = 0; dayOffset <= lookaheadDays && results.length < limit; dayOffset += 1) {
    if (dayOffset < minLeadDays) continue;

    const dayProbeUtc = new Date(localTodayNoonUtc.getTime() + (dayOffset * 24 * 60 * 60 * 1000));
    const dayParts = getZonedDateParts(dayProbeUtc, timeZone);
    if (!windowRule.days.includes(dayParts.weekday)) continue;

    for (let minute = startMinutes; minute + slotMinutes <= endMinutes; minute += slotMinutes) {
      const slotStartUtc = zonedDateTimeToUtc(
        dayParts.year,
        dayParts.month,
        dayParts.day,
        Math.floor(minute / 60),
        minute % 60,
        0,
        timeZone,
      );
      const slotStartMs = slotStartUtc.getTime();
      const slotEndMs = slotStartMs + (slotMinutes * 60 * 1000);

      if (slotStartMs <= nowMs) continue;
      if (overlapsBusyRange(slotStartMs, slotEndMs, busyRanges)) continue;

      const iso = slotStartUtc.toISOString();
      if (seen.has(iso)) continue;

      seen.add(iso);
      results.push(iso);
      if (results.length >= limit) break;
    }
  }

  return results;
}

export function isSlotWithinWindow(
  slotIso: string,
  type: AppointmentWindowType,
  windowConfig: AppointmentWindowConfig,
  timeZone: string,
  slotMinutes = 30,
): boolean {
  const slotDate = new Date(slotIso);
  if (Number.isNaN(slotDate.getTime())) return false;

  const windowRule = windowConfig[type] || DEFAULT_APPOINTMENT_WINDOW_CONFIG[type];
  const startMinutes = parseHHMMToMinutes(windowRule.start);
  const endMinutes = parseHHMMToMinutes(windowRule.end);
  if (startMinutes < 0 || endMinutes <= startMinutes) return false;

  const parts = getZonedDateParts(slotDate, timeZone);
  if (!windowRule.days.includes(parts.weekday)) return false;

  const slotStartMinutes = (parts.hour * 60) + parts.minute;
  return slotStartMinutes >= startMinutes && (slotStartMinutes + slotMinutes) <= endMinutes;
}