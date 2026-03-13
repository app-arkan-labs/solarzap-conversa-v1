import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { buildAgentResultEnvelope } from "../_shared/aiPipelineOutcome.ts";
import { validateServiceInvocationAuth } from "../_shared/invocationAuth.ts";

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
    throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- STAGE TRANSITION MAP (Strict Logic) ---
const STAGE_TRANSITION_MAP: Record<string, string[]> = {
    'novo_lead': ['respondeu', 'perdido'],
    'respondeu': ['chamada_agendada', 'visita_agendada', 'perdido', 'respondeu'], // Can stay
    'chamada_agendada': ['chamada_realizada', 'nao_compareceu', 'perdido'],
    'nao_compareceu': ['chamada_agendada', 'visita_agendada', 'perdido'], // Added visita_agendada
    'chamada_realizada': ['aguardando_proposta', 'perdido'],
    'aguardando_proposta': ['proposta_pronta', 'visita_agendada', 'perdido'],
    'proposta_pronta': ['proposta_negociacao', 'perdido'],
    'visita_agendada': ['visita_realizada', 'nao_compareceu', 'perdido'],
    'visita_realizada': ['proposta_negociacao', 'perdido'],
    'proposta_negociacao': ['financiamento', 'aprovou_projeto', 'contrato_assinado', 'perdido'],
    'financiamento': ['aprovou_projeto', 'contrato_assinado', 'perdido'],
    'aprovou_projeto': ['contrato_assinado', 'perdido'],
    // ... others assume logical linear types
};

const TERMINAL_STAGES = new Set([
    'perdido',
    'contato_futuro',
    'projeto_instalado',
    'coletar_avaliacao',
]);

type FollowUpStepRule = {
    step: 1 | 2 | 3 | 4 | 5;
    enabled: boolean;
    delay_minutes: number;
};

const FOLLOW_UP_STEP_KEYS: Array<FollowUpStepRule['step']> = [1, 2, 3, 4, 5];
const FOLLOW_UP_MIN_DELAY_MINUTES = 5;
const FOLLOW_UP_MAX_DELAY_MINUTES = 365 * 24 * 60;
const DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG: { steps: FollowUpStepRule[] } = {
    steps: [
        { step: 1, enabled: true, delay_minutes: 180 },
        { step: 2, enabled: true, delay_minutes: 1440 },
        { step: 3, enabled: true, delay_minutes: 2880 },
        { step: 4, enabled: true, delay_minutes: 4320 },
        { step: 5, enabled: true, delay_minutes: 10080 },
    ],
};

function isValidTransition(current: string, target: string): boolean {
    if (current === target) return true; // Staying is always valid
    const allowed = STAGE_TRANSITION_MAP[current];
    return allowed ? allowed.includes(target) : false; // If not mapped, block strict moves
}

function normalizeStage(str: string | null | undefined): string {
    if (!str) return ''
    return str
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s-]/g, '_')
        .replace(/[^a-z0-9_]/g, '')
}

type AppointmentWindowType = 'call' | 'visit' | 'meeting' | 'installation';
type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
type AppointmentWindowRule = {
    start: string;
    end: string;
    days: DayKey[];
};
type AppointmentWindowConfig = Record<AppointmentWindowType, AppointmentWindowRule>;
type FollowUpWindowConfig = {
    start: string;
    end: string;
    days: DayKey[];
    preferred_time: string | null;
};

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DEFAULT_APPOINTMENT_WINDOW_CONFIG: AppointmentWindowConfig = {
    call: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    visit: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    meeting: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    installation: { start: '09:00', end: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
};
const DEFAULT_FOLLOW_UP_WINDOW_CONFIG: FollowUpWindowConfig = {
    start: '09:00',
    end: '18:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    preferred_time: null,
};

type AutoScheduleMode = 'both_on' | 'call_only' | 'visit_only' | 'both_off';
type AutoSchedulePolicy = {
    mode: AutoScheduleMode;
    callEnabled: boolean;
    visitEnabled: boolean;
    callMinDays: number;
    visitMinDays: number;
};

const DEFAULT_AUTO_SCHEDULE_POLICY: AutoSchedulePolicy = {
    mode: 'both_on',
    callEnabled: true,
    visitEnabled: true,
    callMinDays: 0,
    visitMinDays: 0,
};

function normalizeBooleanSetting(raw: any, fallback: boolean): boolean {
    return typeof raw === 'boolean' ? raw : fallback;
}

function normalizeNonNegativeInt(raw: any, fallback = 0, max = 60): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(max, Math.round(parsed)));
}

function resolveAutoSchedulePolicy(settings: any): AutoSchedulePolicy {
    const callEnabled = normalizeBooleanSetting(
        settings?.auto_schedule_call_enabled,
        DEFAULT_AUTO_SCHEDULE_POLICY.callEnabled
    );
    const visitEnabled = normalizeBooleanSetting(
        settings?.auto_schedule_visit_enabled,
        DEFAULT_AUTO_SCHEDULE_POLICY.visitEnabled
    );
    const callMinDays = normalizeNonNegativeInt(
        settings?.auto_schedule_call_min_days,
        DEFAULT_AUTO_SCHEDULE_POLICY.callMinDays
    );
    const visitMinDays = normalizeNonNegativeInt(
        settings?.auto_schedule_visit_min_days,
        DEFAULT_AUTO_SCHEDULE_POLICY.visitMinDays
    );

    let mode: AutoScheduleMode = 'both_on';
    if (callEnabled && visitEnabled) mode = 'both_on';
    else if (callEnabled) mode = 'call_only';
    else if (visitEnabled) mode = 'visit_only';
    else mode = 'both_off';

    return {
        mode,
        callEnabled,
        visitEnabled,
        callMinDays,
        visitMinDays,
    };
}

function buildSchedulePolicyPromptBlock(policy: AutoSchedulePolicy, isAfterHoursForCall: boolean): string {
    const modeLine =
        policy.mode === 'both_on'
            ? 'MODO_AGENDAMENTO: ambos ativos, a IA pode escolher entre ligacao ou visita.'
            : policy.mode === 'call_only'
                ? 'MODO_AGENDAMENTO: apenas ligacao ativa, NAO oferecer visita automatica.'
                : policy.mode === 'visit_only'
                    ? 'MODO_AGENDAMENTO: apenas visita ativa, NAO oferecer ligacao automatica.'
                    : 'MODO_AGENDAMENTO: ambos desativados, NAO fazer agendamento automatico.';

    const cutoffLine = isAfterHoursForCall
        ? 'REGRA_HORARIO_ATIVA: agora eh apos 18h no timezone operacional. Nao convide para ligacao; continue no WhatsApp.'
        : 'REGRA_HORARIO_ATIVA: dentro da janela para convite de ligacao.';

    return `
POLITICA_DE_AGENDAMENTO_RUNTIME:
- ${modeLine}
- MIN_DIAS_LIGACAO: ${policy.callMinDays}
- MIN_DIAS_VISITA: ${policy.visitMinDays}
- ${cutoffLine}
`;
}

function textContainsCallSchedulingIntent(text: string | null | undefined): boolean {
    const normalized = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    return /(ligacao|ligar|chamada|telefonema|call)/i.test(normalized)
        && /(agendar|marcar|horario|horarios|posso|podemos|confirmar)/i.test(normalized);
}

function textContainsVisitSchedulingIntent(text: string | null | undefined): boolean {
    const normalized = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    return /(visita|visita tecnica|ir ate|presencial)/i.test(normalized)
        && /(agendar|marcar|horario|horarios|posso|podemos|confirmar)/i.test(normalized);
}

function normalizeDayKey(raw: any): DayKey | null {
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

function normalizeHHMM(value: any, fallback: string): string {
    const parsed = String(value || '').trim();
    const match = parsed.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseHHMMToMinutes(value: string): number {
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return -1;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return (hour * 60) + minute;
}

function normalizeAppointmentWindowConfig(raw: any): AppointmentWindowConfig {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, any> : {};
    const normalized = { ...DEFAULT_APPOINTMENT_WINDOW_CONFIG };
    const keys: AppointmentWindowType[] = ['call', 'visit', 'meeting', 'installation'];

    for (const key of keys) {
        const incoming = source[key];
        if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) continue;
        const start = normalizeHHMM(incoming.start, DEFAULT_APPOINTMENT_WINDOW_CONFIG[key].start);
        const end = normalizeHHMM(incoming.end, DEFAULT_APPOINTMENT_WINDOW_CONFIG[key].end);
        const incomingDays = Array.isArray(incoming.days) ? incoming.days : [];
        const normalizedDays = Array.from(
            new Set(
                incomingDays
                    .map((day: any) => normalizeDayKey(day))
                    .filter((day): day is DayKey => !!day)
            )
        );
        normalized[key] = {
            start,
            end,
            days: normalizedDays.length > 0 ? normalizedDays : DEFAULT_APPOINTMENT_WINDOW_CONFIG[key].days,
        };
    }

    return normalized;
}

function normalizeFollowUpWindowConfig(raw: any): FollowUpWindowConfig {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, any> : {};
    const start = normalizeHHMM(source.start, DEFAULT_FOLLOW_UP_WINDOW_CONFIG.start);
    const end = normalizeHHMM(source.end, DEFAULT_FOLLOW_UP_WINDOW_CONFIG.end);
    const incomingDays = Array.isArray(source.days) ? source.days : [];
    const normalizedDays = Array.from(
        new Set(
            incomingDays
                .map((day: any) => normalizeDayKey(day))
                .filter((day): day is DayKey => !!day)
        )
    );
    const preferredRaw = String(source.preferred_time || '').trim();
    const preferred = preferredRaw ? normalizeHHMM(preferredRaw, '') : '';

    return {
        start,
        end,
        days: normalizedDays.length > 0 ? normalizedDays : DEFAULT_FOLLOW_UP_WINDOW_CONFIG.days,
        preferred_time: preferred || null,
    };
}

function getZonedDateParts(date: Date, timeZone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    weekday: DayKey;
} {
    const datePartFormatter = new Intl.DateTimeFormat('en-CA', {
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

    const parts = datePartFormatter.formatToParts(date);
    const year = Number(parts.find((p) => p.type === 'year')?.value || '0');
    const month = Number(parts.find((p) => p.type === 'month')?.value || '0');
    const day = Number(parts.find((p) => p.type === 'day')?.value || '0');
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0');
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0');
    const second = Number(parts.find((p) => p.type === 'second')?.value || '0');
    const weekdayRaw = String(weekdayFormatter.format(date) || '').toLowerCase().slice(0, 3);
    const weekday = (DAY_KEYS.includes(weekdayRaw as DayKey) ? weekdayRaw : 'mon') as DayKey;

    return { year, month, day, hour, minute, second, weekday };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const parts = getZonedDateParts(date, timeZone);
    const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return localAsUtc - date.getTime();
}

function zonedDateTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timeZone: string
): Date {
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
    return new Date(utcGuess.getTime() - offset);
}

function resolveFollowUpScheduledAt(params: {
    baseDate: Date;
    timeZone: string;
    windowConfig: FollowUpWindowConfig;
}): { scheduledAt: Date; adjusted: boolean } {
    const { baseDate, timeZone, windowConfig } = params;
    const base = new Date(baseDate.getTime());
    if (isNaN(base.getTime())) {
        return { scheduledAt: new Date(Date.now() + (3 * 60 * 60 * 1000)), adjusted: true };
    }

    const startMinutes = parseHHMMToMinutes(windowConfig.start);
    const endMinutes = parseHHMMToMinutes(windowConfig.end);
    if (startMinutes < 0 || endMinutes <= startMinutes) {
        return { scheduledAt: base, adjusted: false };
    }

    const preferredMinutesRaw = windowConfig.preferred_time ? parseHHMMToMinutes(windowConfig.preferred_time) : -1;
    const preferredMinutes = preferredMinutesRaw >= startMinutes && preferredMinutesRaw < endMinutes
        ? preferredMinutesRaw
        : -1;

    const allowedDays = Array.isArray(windowConfig.days) && windowConfig.days.length > 0
        ? windowConfig.days
        : DEFAULT_FOLLOW_UP_WINDOW_CONFIG.days;

    const baseParts = getZonedDateParts(base, timeZone);
    const baseLocalNoon = zonedDateTimeToUtc(baseParts.year, baseParts.month, baseParts.day, 12, 0, 0, timeZone);
    const baseMinutesOfDay = (baseParts.hour * 60) + baseParts.minute + (baseParts.second > 0 ? 1 : 0);

    for (let dayOffset = 0; dayOffset <= 30; dayOffset++) {
        const dayProbe = new Date(baseLocalNoon.getTime() + (dayOffset * 24 * 60 * 60 * 1000));
        const dayParts = getZonedDateParts(dayProbe, timeZone);
        if (!allowedDays.includes(dayParts.weekday)) continue;

        let candidateMinutes = preferredMinutes >= 0 ? preferredMinutes : startMinutes;

        if (dayOffset === 0) {
            if (preferredMinutes >= 0 && preferredMinutes < baseMinutesOfDay) {
                continue;
            }
            if (preferredMinutes < 0) {
                candidateMinutes = Math.max(startMinutes, baseMinutesOfDay);
            }
        }

        if (candidateMinutes >= endMinutes) continue;

        const candidateUtc = zonedDateTimeToUtc(
            dayParts.year,
            dayParts.month,
            dayParts.day,
            Math.floor(candidateMinutes / 60),
            candidateMinutes % 60,
            0,
            timeZone
        );

        if (candidateUtc.getTime() < base.getTime()) continue;

        return {
            scheduledAt: candidateUtc,
            adjusted: candidateUtc.getTime() !== base.getTime(),
        };
    }

    return { scheduledAt: base, adjusted: false };
}

function inferAppointmentWindowType(rawType: any, targetStage: string | null | undefined, currentStage: string): AppointmentWindowType {
    const type = String(rawType || '').toLowerCase();
    if (type.includes('visit') || type.includes('visita')) return 'visit';
    if (type.includes('meet') || type.includes('reun')) return 'meeting';
    if (type.includes('instal')) return 'installation';
    const target = normalizeStage(targetStage);
    if (target === 'visita_agendada') return 'visit';
    if (target === 'chamada_agendada') return 'call';
    return currentStage === 'nao_compareceu' ? 'call' : 'call';
}

function overlapsBusyRange(
    startMs: number,
    endMs: number,
    busyRanges: Array<{ startMs: number; endMs: number }>
): boolean {
    return busyRanges.some((range) => startMs < range.endMs && endMs > range.startMs);
}

function generateAvailableSlotsForType(params: {
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
        timeZone
    );

    for (let dayOffset = 0; dayOffset <= lookaheadDays && results.length < limit; dayOffset++) {
        if (dayOffset < minLeadDays) continue;
        const dayProbeUtc = new Date(localTodayNoonUtc.getTime() + (dayOffset * 24 * 60 * 60 * 1000));
        const dayParts = getZonedDateParts(dayProbeUtc, timeZone);
        if (!windowRule.days.includes(dayParts.weekday)) continue;

        for (let minute = startMinutes; minute + slotMinutes <= endMinutes; minute += slotMinutes) {
            const hour = Math.floor(minute / 60);
            const minutePart = minute % 60;
            const slotStartUtc = zonedDateTimeToUtc(
                dayParts.year,
                dayParts.month,
                dayParts.day,
                hour,
                minutePart,
                0,
                timeZone
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

function isSlotRespectingMinLeadDays(
    slotIso: string,
    minLeadDays: number,
    timeZone: string,
    now: Date
): boolean {
    if (minLeadDays <= 0) return true;
    const slotDate = new Date(slotIso);
    if (isNaN(slotDate.getTime())) return false;

    const nowParts = getZonedDateParts(now, timeZone);
    const slotParts = getZonedDateParts(slotDate, timeZone);
    const nowLocalNoon = zonedDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day, 12, 0, 0, timeZone).getTime();
    const slotLocalNoon = zonedDateTimeToUtc(slotParts.year, slotParts.month, slotParts.day, 12, 0, 0, timeZone).getTime();
    const diffDays = Math.floor((slotLocalNoon - nowLocalNoon) / (24 * 60 * 60 * 1000));
    return diffDays >= minLeadDays;
}

function formatSlotLabel(slotIso: string, timeZone: string, now: Date): string {
    const slotDate = new Date(slotIso);
    if (isNaN(slotDate.getTime())) return slotIso;
    const nowParts = getZonedDateParts(now, timeZone);
    const slotParts = getZonedDateParts(slotDate, timeZone);
    const slotTime = `${String(slotParts.hour).padStart(2, '0')}:${String(slotParts.minute).padStart(2, '0')}`;

    if (slotParts.year === nowParts.year && slotParts.month === nowParts.month && slotParts.day === nowParts.day) {
        return `hoje ${slotTime}`;
    }

    const tomorrowProbe = zonedDateTimeToUtc(nowParts.year, nowParts.month, nowParts.day, 12, 0, 0, timeZone);
    const tomorrow = getZonedDateParts(new Date(tomorrowProbe.getTime() + (24 * 60 * 60 * 1000)), timeZone);
    if (slotParts.year === tomorrow.year && slotParts.month === tomorrow.month && slotParts.day === tomorrow.day) {
        return `amanhã ${slotTime}`;
    }

    return `${String(slotParts.day).padStart(2, '0')}/${String(slotParts.month).padStart(2, '0')} ${slotTime}`;
}

function buildSlotCatalogText(
    slotsByType: Record<AppointmentWindowType, string[]>,
    timeZone: string,
    now: Date
): string {
    const entries: Array<{ key: AppointmentWindowType; label: string }> = [
        { key: 'call', label: 'chamada_ligacao' },
        { key: 'visit', label: 'visita_tecnica' },
        { key: 'meeting', label: 'reuniao_meeting' },
        { key: 'installation', label: 'instalacao' },
    ];
    const lines: string[] = [];
    for (const entry of entries) {
        const formatted = (slotsByType[entry.key] || [])
            .slice(0, 5)
            .map((slot) => `${formatSlotLabel(slot, timeZone, now)} (${slot})`);
        lines.push(`- ${entry.label}: ${formatted.length > 0 ? formatted.join(' | ') : '(sem slots livres)'}`);
    }
    return lines.join('\n');
}

function buildScheduleRetryContent(
    typeKey: AppointmentWindowType,
    slotsByType: Record<AppointmentWindowType, string[]>,
    timeZone: string,
    now: Date
): string {
    const labelsByType: Record<AppointmentWindowType, string> = {
        call: 'chamada',
        visit: 'visita',
        meeting: 'reuniao',
        installation: 'instalacao',
    };
    const available = (slotsByType[typeKey] || []).slice(0, 2).map((slot) => formatSlotLabel(slot, timeZone, now));
    if (available.length >= 2) {
        return `Esse horario nao esta disponivel. Posso te oferecer ${available[0]} ou ${available[1]} para ${labelsByType[typeKey]}?`;
    }
    if (available.length === 1) {
        return `Esse horario nao esta disponivel. Tenho ${available[0]} para ${labelsByType[typeKey]}. Pode ser?`;
    }
    return `Esse horario nao esta disponivel no momento. Me diga outro periodo (manha, tarde ou noite) para eu te sugerir opcoes livres.`;
}

function isImplicitScheduleConfirmation(text: string): boolean {
    const normalized = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (!normalized.trim()) return false;
    if (!/(beleza|blz|perfeito|fechado|combinado|ta bom|tudo certo|ok|pode ser|fiquei no aguardo|fico no aguardo|no aguardo|aguardo|confirmado|confirmo)/i.test(normalized)) {
        return false;
    }
    if (/(duvida|qual|quando|que horas|horario\?|horario\.)/i.test(normalized)) {
        return false;
    }
    return true;
}

function extractSlotsFromAssistantText(text: string, timeZone: string, now: Date): string[] {
    const content = String(text || '');
    if (!content) return [];
    const searchable = content
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const slots: string[] = [];
    const seen = new Set<string>();
    const base = getZonedDateParts(now, timeZone);
    const nowMs = now.getTime();

    const pushSlot = (year: number, month: number, day: number, hour: number, minute: number) => {
        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return;
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return;
        const utc = zonedDateTimeToUtc(year, month, day, hour, minute, 0, timeZone);
        if (isNaN(utc.getTime())) return;
        if (utc.getTime() <= nowMs) return;
        const iso = utc.toISOString();
        if (seen.has(iso)) return;
        seen.add(iso);
        slots.push(iso);
    };

    const relativeRegex = /\b(hoje|amanha)\s*(?:as|a)?\s*(\d{1,2})(?::(\d{2}))?\s*h?\b/gi;
    let relativeMatch: RegExpExecArray | null;
    while ((relativeMatch = relativeRegex.exec(searchable)) !== null) {
        const dayWord = String(relativeMatch[1] || '').toLowerCase();
        const hour = Number(relativeMatch[2]);
        const minute = Number(relativeMatch[3] || '0');
        const baseNoon = zonedDateTimeToUtc(base.year, base.month, base.day, 12, 0, 0, timeZone);
        const offsetDays = dayWord.startsWith('amanh') ? 1 : 0;
        const targetDayParts = getZonedDateParts(new Date(baseNoon.getTime() + (offsetDays * 24 * 60 * 60 * 1000)), timeZone);
        pushSlot(targetDayParts.year, targetDayParts.month, targetDayParts.day, hour, minute);
    }

    const absoluteRegex = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:as|a)?\s*(\d{1,2})(?::(\d{2}))?\s*h?\b/gi;
    let absoluteMatch: RegExpExecArray | null;
    while ((absoluteMatch = absoluteRegex.exec(searchable)) !== null) {
        const day = Number(absoluteMatch[1]);
        const month = Number(absoluteMatch[2]);
        const yearRaw = absoluteMatch[3];
        const hour = Number(absoluteMatch[4]);
        const minute = Number(absoluteMatch[5] || '0');
        let year = base.year;
        if (yearRaw) {
            const parsedYear = Number(yearRaw);
            if (Number.isFinite(parsedYear)) {
                year = parsedYear < 100 ? (2000 + parsedYear) : parsedYear;
            }
        }
        pushSlot(year, month, day, hour, minute);
    }

    return slots;
}

function isSlotWithinWindow(
    startUtcIso: string,
    typeKey: AppointmentWindowType,
    config: AppointmentWindowConfig,
    timeZone: string
): boolean {
    const start = new Date(startUtcIso);
    if (isNaN(start.getTime())) return false;
    const rule = config[typeKey] || DEFAULT_APPOINTMENT_WINDOW_CONFIG[typeKey];
    const slotParts = getZonedDateParts(start, timeZone);
    if (!rule.days.includes(slotParts.weekday)) return false;
    const startMin = parseHHMMToMinutes(rule.start);
    const endMin = parseHHMMToMinutes(rule.end);
    if (startMin < 0 || endMin <= startMin) return false;
    const slotMinuteOfDay = (slotParts.hour * 60) + slotParts.minute;
    const slotEndMinuteOfDay = slotMinuteOfDay + 30;
    return slotMinuteOfDay >= startMin && slotEndMinuteOfDay <= endMin;
}

function isMissingOrgIdColumnError(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || '');
    if (code === '42703' || code === 'PGRST204') return true;
    return String(error.message || '').toLowerCase().includes('org_id');
}

async function tableHasOrgIdColumn(supabase: any, table: string): Promise<boolean> {
    const { error } = await supabase.from(table).select('org_id').limit(1);
    if (!error) return true;
    if (isMissingOrgIdColumnError(error)) return false;
    throw error;
}

function injectOrgIdIntoInsertPayload(payload: any, orgId: string | null): any {
    if (!orgId) {
        throw new Error('Missing org_id for AI insert payload');
    }
    if (Array.isArray(payload)) {
        return payload.map((row) => (row && typeof row === 'object' && !('org_id' in row)) ? { ...row, org_id: orgId } : row);
    }
    if (payload && typeof payload === 'object' && !('org_id' in payload)) {
        return { ...payload, org_id: orgId };
    }
    return payload;
}

function createOrgAwareSupabaseClient(
    supabase: any,
    getOrgId: () => string | null,
    aiActionLogsHasOrgId: boolean
) {
    return new Proxy(supabase, {
        get(target, prop, receiver) {
            if (prop !== 'from') return Reflect.get(target, prop, receiver);
            return (table: string) => {
                const query = target.from(table);
                return new Proxy(query, {
                    get(queryTarget, queryProp, queryReceiver) {
                        if (queryProp !== 'insert') return Reflect.get(queryTarget, queryProp, queryReceiver);
                        return (values: any, ...rest: any[]) => {
                            const shouldInject =
                                table === 'ai_agent_runs' ||
                                (table === 'ai_action_logs' && aiActionLogsHasOrgId);
                            const patchedValues = shouldInject
                                ? injectOrgIdIntoInsertPayload(values, getOrgId())
                                : values;
                            return queryTarget.insert(patchedValues, ...rest);
                        };
                    }
                });
            };
        }
    });
}

// --- INCREMENT 12: SOLAR BR PACK ---
const SOLAR_BR_PACK = `
CONTEXTO SOLAR BRASIL (LEI 14.300 & FLUXO REAL):
1. LEI 14.300: O "direito adquirido" (isenção total) acabou em 2023. Hoje pagamos o "Fio B" progressivo sobre a energia injetada na rede. AINDA ASSIM vale muito a pena: a economia na conta chega a 90%, blindando contra aumentos (inflação energética).
2. FLUXO REAL:
   - Análise de consumo/fatura -> Proposta -> Assinatura -> Engenharia/Projeto.
   - Instalação (Rápida: 1-3 dias).
   - Homologação: Depende da Concessionária (Enel, CPFL, Cemig, etc). Envolve vistoria e troca de medidor.
   - Início da compensação: Só após o medidor bidirecional estar ativo.
3. PRAZOS:
   - "Semanas" é o termo seguro. Instalar é rápido, mas a burocracia da distribuidora pode levar 15-45 dias ou mais.
   - NUNCA prometa data exata de ligação sem saber cidade/UF e concessionária.
4. DIMENSIONAMENTO:
   - Depende estritamente do consumo médio (kWh) e local (irradiação).
   - "Quantas placas?" é impossível responder sem saber o consumo e a potência dos módulos (450W, 550W, etc).
5. GARANTIAS:
   - Inversor: geralmente 5-10 anos (fabricante).
   - Módulos: 10-12 anos (produto) + 25 anos (performance linear).
   - Instalação: oferecemos garantia de serviço (ex: 1 ano).
`;

// --- INCREMENT 12: SAFETY GATE ---
function detectSolarIntentAndMissing(lastUserText: string, lead: any) {
    const text = lastUserText.toLowerCase();

    // Intents
    const isPrazo = /(prazo|demora|tempo|homolog|medid|vistoria|liga[çc])/i.test(text);
    const isDimensionamento = /(placa|pain|modul|tamanho|cust|pre[çc]|or[çc]a|gerar|pot[êe]ncia)/i.test(text);

    // Context Data
    const hasLocation = (lead.city && lead.city.length > 2) || (lead.meta && lead.meta.city);
    const hasUtility = (lead.meta && lead.meta.utility_company);
    const hasConsumption = (lead.consumo_kwh && lead.consumo_kwh > 0) || (lead.valor_estimado && lead.valor_estimado > 0);

    // Missing checks
    const missing = [];
    let directive = null;

    if (isPrazo) {
        if (!hasLocation) missing.push('cidade/uf');
        // Utility is secondary (can often infer from city), but good to ask if totally unknown
        // We focus on location as primary blocker for "prazo".
        if (missing.length > 0) {
            directive = "FALTAM DADOS ESSENCIAIS (PRAZO): O cliente perguntou de prazos/homologação mas não sabemos a Cidade/UF. PEÇA A CIDADE/UF e CONCESSIONÁRIA. Não dê prazos em dias sem isso. Diga que depende da região.";
            return { intent: 'prazos', missing, directive };
        }
    }

    if (isDimensionamento) {
        if (!hasConsumption) missing.push('consumo_kwh');
        // Location also affects sizing (irradiation), but consumption is the big blocker.
        if (!hasLocation) missing.push('cidade/uf');

        if (missing.includes('consumo_kwh')) {
            directive = "FALTAM DADOS ESSENCIAIS (DIMENSIONAMENTO): O cliente quer saber tamanho/preço/placas, mas não sabemos o consumo. PEÇA O CONSUMO MENSAL (kWh) OU VALOR DA CONTA. Não chute número de placas.";
            return { intent: 'dimensionamento', missing, directive };
        }
    }

    return { intent: null, missing: [], directive: null };
}

function buildFallbackCommentFromText(agg: string): { text: string; type: 'summary' } | null {
    const text = String(agg || '');
    const kwh = text.match(/(\d{2,4})\s*kwh/i)?.[1];
    const bill =
        text.match(/(\d{2,5})\s*reais/i)?.[1] ||
        text.match(/r\$\s*(\d{2,5})/i)?.[1];
    const city = text.match(/moro em\s*([^,.\n]+)/i)?.[1]?.trim();
    const roof = text.match(/telhado\s*([^,.\n]+)/i)?.[0]?.trim();

    const parts: string[] = [];
    if (kwh) parts.push(`consumo de ${kwh} kWh/mês`);
    if (bill) parts.push(`conta de luz de R$${bill}`);
    if (city) parts.push(`cidade: ${city}`);
    if (roof) parts.push(roof);
    if (parts.length < 2) return null;

    return {
        text: `Cliente informou ${parts.join(', ')}.`,
        type: 'summary'
    };
}

function normalizeQuestionKey(raw: string | null | undefined): string | null {
    const normalized = String(raw || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || null;
}

function mergeQuestionKeys(...sources: any[]): string[] {
    const merged = new Set<string>();
    for (const source of sources) {
        if (!Array.isArray(source)) continue;
        for (const item of source) {
            const key = normalizeQuestionKey(item);
            if (key) merged.add(key);
        }
    }
    return Array.from(merged);
}

function inferQuestionKeyFromText(text: string | null | undefined): string | null {
    const normalized = String(text || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (!normalized) return null;
    if (/(casa|empresa|agronegocio|agro|fazenda|usina|investimento|tipo do (seu )?projeto|tipo de projeto|tipo de instalacao|instalar para casa|instalar para empresa)/i.test(normalized)) {
        return 'project_type';
    }
    if (/(quanto (voce )?paga|valor da conta|conta de luz|media da conta|qual a faixa|quantos reais|r\\$|reais)/i.test(normalized)) {
        return 'bill_value';
    }
    if (/(consumo|kwh|quilowatt)/i.test(normalized)) {
        return 'consumption_kwh';
    }
    if (/(cidade|uf|bairro|endereco|rua|avenida|logradouro|cep|onde fica|local da instalacao)/i.test(normalized)) {
        return 'location';
    }
    if (/(concessionaria|distribuidora|cpfl|cemig|enel|energisa|neoenergia)/i.test(normalized)) {
        return 'utility_company';
    }
    if (/(telhado|laje|fibrocimento|ceramica|metalica|colonial)/i.test(normalized)) {
        return 'roof_type';
    }
    if (/(sim|nao|pode ser|bora|vamos|fechado|quero agendar|confirmo)/i.test(normalized)) {
        return 'confirmation';
    }

    return null;
}

function extractLocationSignal(text: string): string | null {
    const normalized = String(text || '').trim();
    if (!normalized) return null;

    const addressLike = normalized.match(/(?:rua|r\.|avenida|av\.|travessa|trav\.|alameda|estrada|rodovia)\s+[^,\n]+/i)?.[0]?.trim();
    if (addressLike) return addressLike;

    const cityLike = normalized.match(/(?:moro em|sou de|cidade[: ]|em)\s+([a-zA-Z\u00c0-\u017f\s'-]{3,})/i)?.[1]?.trim();
    return cityLike || null;
}

function extractDeterministicLeadSignals(
    aggregatedText: string,
    currentStage: string,
    lastAssistantText: string,
    lead: any
): {
    fields: Record<string, FieldCandidate>;
    stageData: Record<string, any>;
    answeredKeys: string[];
    lastQuestionKey: string | null;
} {
    const text = String(aggregatedText || '').trim();
    const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const fields: Record<string, FieldCandidate> = {};
    const stageData: Record<string, any> = {};
    const stageSnapshot = getStageNamespaceSnapshot(lead, currentStage);
    const historicalAnswered = Array.isArray(stageSnapshot.answered_keys)
        ? stageSnapshot.answered_keys
        : [];
    const answeredKeys = new Set<string>(mergeQuestionKeys(historicalAnswered));
    const lastQuestionKey = inferQuestionKeyFromText(lastAssistantText);

    const customerType = normalizeCustomerType(text);
    if (customerType && ['residencial', 'comercial', 'agro', 'industrial'].includes(customerType)) {
        fields.customer_type = { value: customerType, confidence: 'high', source: 'user' };
        answeredKeys.add('project_type');
        if (currentStage === 'respondeu') {
            stageData.segment = customerType;
        }
    }

    const billMatch = normalized.match(/(?:r\\$\\s*|)(\\d{2,5})(?:\\s*reais?)\\b/i);
    const billValue = billMatch?.[1] ? normalizeMoneyBRL(billMatch[1]) : normalizeMoneyBRL(text);
    if (billValue && billValue > 0) {
        fields.estimated_value_brl = { value: billValue, confidence: 'high', source: 'user' };
        answeredKeys.add('bill_value');
    }

    const kwhMatch = normalized.match(/(\\d{2,5})\\s*kwh\\b/i);
    const kwhValue = kwhMatch?.[1] ? normalizeKwh(kwhMatch[1]) : null;
    if (kwhValue && kwhValue > 0) {
        fields.consumption_kwh_month = { value: kwhValue, confidence: 'high', source: 'user' };
        answeredKeys.add('consumption_kwh');
    }

    const locationSignal = extractLocationSignal(text);
    if (locationSignal) {
        fields.city = { value: locationSignal, confidence: 'medium', source: 'user' };
        answeredKeys.add('location');
        if (currentStage === 'respondeu' && /(?:rua|avenida|travessa|alameda|estrada|rodovia)/i.test(locationSignal)) {
            stageData.address = locationSignal;
        }
    } else if (lead?.cidade) {
        answeredKeys.add('location');
    }

    if (/(cpfl|cemig|enel|energisa|neoenergia|equatorial|celesc|copel|light)/i.test(normalized)) {
        const utility = text.match(/(cpfl|cemig|enel|energisa|neoenergia|equatorial|celesc|copel|light)/i)?.[1] || '';
        fields.utility_company = { value: utility, confidence: 'high', source: 'user' };
        answeredKeys.add('utility_company');
    }

    if (/(sim|pode|vamos|bora|fechado|ok|pode ser|esse|essa|quero)/i.test(normalized)) {
        answeredKeys.add('confirmation');
    }

    const collected: Record<string, any> = {};
    if (fields.customer_type) collected.customer_type = fields.customer_type.value;
    if (fields.estimated_value_brl) collected.estimated_value_brl = fields.estimated_value_brl.value;
    if (fields.consumption_kwh_month) collected.consumption_kwh_month = fields.consumption_kwh_month.value;
    if (fields.city) collected.city = fields.city.value;
    if (fields.utility_company) collected.utility_company = fields.utility_company.value;
    if (Object.keys(collected).length > 0) {
        stageData.collected = collected;
    }
    const mergedAnsweredKeys = Array.from(answeredKeys);
    if (mergedAnsweredKeys.length > 0) {
        stageData.answered_keys = mergedAnsweredKeys;
    }
    const previousLastQuestion = normalizeQuestionKey(stageSnapshot.last_question_key);
    stageData.last_question_key = lastQuestionKey || previousLastQuestion || null;

    return {
        fields,
        stageData,
        answeredKeys: Array.from(answeredKeys),
        lastQuestionKey,
    };
}

function getStageNamespaceSnapshot(lead: any, currentStage: string): Record<string, any> {
    const namespace = getStageDataNamespace(currentStage);
    if (!namespace) return {};
    const root = normalizeLeadStageDataRoot(lead?.lead_stage_data);
    const value = root[namespace];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, any>;
}

function buildStructuredLeadSnapshot(lead: any, currentStage: string): Record<string, any> {
    const stageSnapshot = getStageNamespaceSnapshot(lead, currentStage);
    const meta = parseLeadMeta(lead?.observacoes || '');
    const answeredKeys = Array.isArray(stageSnapshot.answered_keys)
        ? stageSnapshot.answered_keys.map((item: any) => normalizeQuestionKey(item)).filter(Boolean)
        : [];

    return {
        nome_confirmado: lead?.nome || null,
        tipo_projeto: lead?.tipo_cliente || stageSnapshot.segment || null,
        cidade_ou_endereco: lead?.cidade || stageSnapshot.address || null,
        valor_medio_conta_brl: lead?.valor_estimado || stageSnapshot.collected?.estimated_value_brl || null,
        consumo_kwh_mes: lead?.consumo_kwh || stageSnapshot.collected?.consumption_kwh_month || null,
        concessionaria: meta.utility_company || stageSnapshot.collected?.utility_company || null,
        lead_stage_data: stageSnapshot,
        ultima_pergunta_chave: normalizeQuestionKey(stageSnapshot.last_question_key),
        slots_respondidos: answeredKeys,
    };
}

type QualificationMissingKey =
    | 'project_type'
    | 'consumption_or_bill'
    | 'location'
    | 'utility_company'
    | 'timing'
    | 'need_reason'
    | 'budget_fit'
    | 'decision_makers'
    | 'address'
    | 'decision_makers_present';

const QUALIFICATION_QUESTION_BY_KEY: Record<QualificationMissingKey, string> = {
    project_type: 'Pra eu seguir certo: e para casa, empresa, agronegocio ou usina/investimento?',
    consumption_or_bill: 'Perfeito. Quanto voce paga, em media, na conta de luz ou quantos kWh por mes?',
    location: 'Agora me confirma so a cidade da instalacao.',
    utility_company: 'Me confirma tambem qual e a concessionaria de energia ai da sua regiao.',
    timing: 'Qual o prazo ideal para voce implementar isso: imediato, 30 dias ou mais para frente?',
    need_reason: 'Qual e o principal objetivo desse projeto agora: economizar, previsibilidade da conta ou valorizacao do imovel?',
    budget_fit: 'Para eu montar a melhor opcao, hoje voce pretende investir com entrada, parcelar ou financiamento?',
    decision_makers: 'Quem participa da decisao com voce para aprovar o projeto?',
    address: 'Para visita tecnica, me confirma o endereco completo da instalacao.',
    decision_makers_present: 'No dia da visita, os decisores conseguem estar presentes no local?',
};

function getRespondeuStageSnapshot(lead: any): Record<string, any> {
    const root = normalizeLeadStageDataRoot(lead?.lead_stage_data);
    const respondeu = root?.respondeu;
    if (!respondeu || typeof respondeu !== 'object' || Array.isArray(respondeu)) return {};
    return respondeu as Record<string, any>;
}

function getRespondeuQualificationState(lead: any): {
    missingKeys: QualificationMissingKey[];
    visitMissingKeys: QualificationMissingKey[];
    checklist: Record<string, boolean>;
} {
    const stageData = getRespondeuStageSnapshot(lead);
    const meta = parseLeadMeta(lead?.observacoes || '');
    const collected = stageData?.collected && typeof stageData.collected === 'object' ? stageData.collected : {};

    const hasProjectType = Boolean(String(lead?.tipo_cliente || stageData?.segment || '').trim());
    const hasConsumptionOrBill = Boolean(
        Number(lead?.valor_estimado || 0) > 0
        || Number(lead?.consumo_kwh || 0) > 0
        || Number((collected as any)?.estimated_value_brl || 0) > 0
        || Number((collected as any)?.consumption_kwh_month || 0) > 0
    );
    const hasLocation = Boolean(String(lead?.cidade || (collected as any)?.city || stageData?.address || '').trim());
    const hasUtilityCompany = Boolean(String(meta?.utility_company || (collected as any)?.utility_company || '').trim());
    const hasTiming = Boolean(String(stageData?.timing || '').trim());
    const hasNeedReason = Boolean(String(stageData?.need_reason || '').trim());
    const hasBudgetFit = Boolean(String(stageData?.budget_fit || '').trim());
    const hasDecisionMakers = Array.isArray(stageData?.decision_makers)
        ? stageData.decision_makers.length > 0
        : Boolean(String(stageData?.decision_makers || '').trim());
    const derivedBantComplete = hasTiming && hasNeedReason && hasBudgetFit && hasDecisionMakers;
    const hasBantComplete = stageData?.bant_complete === true || derivedBantComplete;
    const hasAddressForVisit = Boolean(String(stageData?.address || '').trim());
    const decisionMakersPresent = stageData?.decision_makers_present;
    const hasDecisionMakersPresent = typeof decisionMakersPresent === 'boolean' ? decisionMakersPresent : null;

    const missingKeys: QualificationMissingKey[] = [];
    if (!hasProjectType) missingKeys.push('project_type');
    if (!hasConsumptionOrBill) missingKeys.push('consumption_or_bill');
    if (!hasLocation) missingKeys.push('location');
    if (!hasUtilityCompany) missingKeys.push('utility_company');
    if (!hasTiming) missingKeys.push('timing');
    if (!hasNeedReason) missingKeys.push('need_reason');
    if (!hasBudgetFit) missingKeys.push('budget_fit');
    if (!hasDecisionMakers) missingKeys.push('decision_makers');
    if (!hasBantComplete && !missingKeys.includes('decision_makers')) {
        // Keep deterministic flow asking one missing key at a time before considering BANT complete.
        if (!hasTiming) missingKeys.push('timing');
        if (!hasNeedReason) missingKeys.push('need_reason');
        if (!hasBudgetFit) missingKeys.push('budget_fit');
    }

    const visitMissingKeys: QualificationMissingKey[] = [];
    if (!hasAddressForVisit) visitMissingKeys.push('address');
    if (hasDecisionMakersPresent === false || hasDecisionMakersPresent === null) {
        visitMissingKeys.push('decision_makers_present');
    }

    return {
        missingKeys,
        visitMissingKeys,
        checklist: {
            project_type: hasProjectType,
            consumption_or_bill: hasConsumptionOrBill,
            location: hasLocation,
            utility_company: hasUtilityCompany,
            timing: hasTiming,
            need_reason: hasNeedReason,
            budget_fit: hasBudgetFit,
            decision_makers: hasDecisionMakers,
            bant_complete: hasBantComplete,
            visit_address: hasAddressForVisit,
            decision_makers_present: hasDecisionMakersPresent === true,
        },
    };
}

function buildDeterministicNextQuestionFallback(
    currentStage: string,
    lead: any,
    options?: {
        preferredMissingKeys?: QualificationMissingKey[];
        manualReturnMode?: boolean;
        afterHoursCallBlocked?: boolean;
    }
): string | null {
    if (options?.manualReturnMode) {
        return 'Perfeito. Vou verificar com o time o melhor horario para ligacao e te retorno por aqui, combinado?';
    }

    if (options?.afterHoursCallBlocked) {
        return 'Agora ja passou das 18h por aqui. Vamos seguir por WhatsApp e eu te proponho ligacao em horario comercial, tudo bem?';
    }

    if (currentStage === 'respondeu') {
        const qualificationState = getRespondeuQualificationState(lead);
        const missingKeys = options?.preferredMissingKeys && options.preferredMissingKeys.length > 0
            ? options.preferredMissingKeys
            : qualificationState.missingKeys;

        if (missingKeys.length > 0) {
            return QUALIFICATION_QUESTION_BY_KEY[missingKeys[0]] || QUALIFICATION_QUESTION_BY_KEY.project_type;
        }

        return 'Com esses dados eu sigo melhor. Prefere que eu te passe uma simulacao inicial ou avancamos para o proximo passo?';
    }

    if (currentStage === 'nao_compareceu') {
        return 'Sem problema. Me diz qual periodo fica melhor para retomarmos esse atendimento.';
    }

    return 'Perfeito, recebi aqui. Vou seguir com seu atendimento e te orientar no proximo passo.';
}

type CompanyProfileFacts = {
    company_name?: string | null;
    headquarters_city?: string | null;
    headquarters_state?: string | null;
    headquarters_address?: string | null;
    service_area_summary?: string | null;
    business_hours_text?: string | null;
    public_phone?: string | null;
    public_whatsapp?: string | null;
    technical_visit_is_free?: boolean | null;
    technical_visit_fee_notes?: string | null;
    supports_financing?: boolean | null;
    supports_card_installments?: boolean | null;
    payment_policy_summary?: string | null;
};

function buildCompanyFactualReply(
    userText: string,
    companyProfile: CompanyProfileFacts | null,
    currentStage: string,
    lead: any
): string | null {
    const text = String(userText || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (!text.trim()) return null;

    const companyName = String(companyProfile?.company_name || 'a empresa').trim() || 'a empresa';
    const city = String(companyProfile?.headquarters_city || '').trim();
    const state = String(companyProfile?.headquarters_state || '').trim();
    const address = String(companyProfile?.headquarters_address || '').trim();
    const serviceArea = String(companyProfile?.service_area_summary || '').trim();
    const businessHours = String(companyProfile?.business_hours_text || '').trim();
    const publicPhone = String(companyProfile?.public_phone || '').trim();
    const publicWhatsApp = String(companyProfile?.public_whatsapp || '').trim();

    const locationQuestion = /(onde|localiz|sede|endereco|cidade da empresa|empresa fica)/i.test(text);
    const contactQuestion = /(telefone|whatsapp|contato|numero|falar com voces)/i.test(text);
    const visitCostQuestion = /(visita|orcamento presencial|vistoria).*(custo|preco|valor|cobram|pago|gratuit)/i.test(text);
    const financingQuestion = /(financiamento|financia|parcelamento|cartao|parcela)/i.test(text);
    const hoursQuestion = /(horario|atendimento|funcionamento|abrem|fecham)/i.test(text);

    let factualReply: string | null = null;

    if (locationQuestion) {
        if (address || city || state) {
            const cityState = [city, state].filter(Boolean).join('/');
            const addressPart = address ? ` Endereco: ${address}.` : '';
            factualReply = `A ${companyName} fica em ${cityState || 'localizacao cadastrada'}.${
                addressPart
            }`;
            if (!address && serviceArea) factualReply += ` Area de atendimento: ${serviceArea}.`;
        } else if (serviceArea) {
            factualReply = `A ${companyName} atende ${serviceArea}. Se quiser, eu confirmo o endereco exato da base para voce.`;
        } else {
            factualReply = `Ainda nao tenho o endereco completo da ${companyName} cadastrado aqui. Posso confirmar com o time e te retornar por aqui.`;
        }
    } else if (hoursQuestion) {
        if (businessHours) {
            factualReply = `Nosso horario comercial e: ${businessHours}.`;
        } else {
            factualReply = 'Ainda nao tenho o horario comercial detalhado cadastrado aqui. Posso confirmar e te retorno por aqui.';
        }
    } else if (contactQuestion) {
        const contactParts = [];
        if (publicWhatsApp) contactParts.push(`WhatsApp: ${publicWhatsApp}`);
        if (publicPhone) contactParts.push(`Telefone: ${publicPhone}`);
        if (contactParts.length > 0) {
            factualReply = `${contactParts.join(' | ')}.`;
        } else {
            factualReply = 'Ainda nao tenho um numero publico cadastrado aqui. Posso confirmar o melhor canal e te retornar.';
        }
    } else if (visitCostQuestion) {
        if (typeof companyProfile?.technical_visit_is_free === 'boolean') {
            if (companyProfile.technical_visit_is_free) {
                factualReply = 'A visita tecnica e gratuita.';
            } else {
                factualReply = 'A visita tecnica pode ter custo conforme a politica comercial.';
            }
            const feeNotes = String(companyProfile?.technical_visit_fee_notes || '').trim();
            if (feeNotes) factualReply += ` ${feeNotes}`;
        } else {
            factualReply = 'Nao tenho a politica de custo da visita cadastrada aqui com precisao. Posso confirmar com o time e te retorno agora.';
        }
    } else if (financingQuestion) {
        const financing = companyProfile?.supports_financing;
        const card = companyProfile?.supports_card_installments;
        const policySummary = String(companyProfile?.payment_policy_summary || '').trim();

        const parts: string[] = [];
        if (typeof financing === 'boolean') parts.push(financing ? 'Temos opcao de financiamento.' : 'No momento nao trabalhamos com financiamento.');
        if (typeof card === 'boolean') parts.push(card ? 'Tambem temos parcelamento no cartao.' : 'Parcelamento no cartao nao esta disponivel.');
        if (policySummary) parts.push(policySummary);

        if (parts.length > 0) factualReply = parts.join(' ');
        else factualReply = 'Ainda nao tenho as regras de financiamento/parcelamento detalhadas cadastradas aqui. Posso confirmar e te retorno.';
    }

    if (!factualReply) return null;
    const fallbackNextQuestion = buildDeterministicNextQuestionFallback(currentStage, lead);
    if (fallbackNextQuestion && currentStage === 'respondeu') {
        return `${factualReply}\n\n${fallbackNextQuestion}`;
    }
    return factualReply;
}

// --- HELPER: Safe Stage Update (Increment 10) ---
async function updateLeadStageSafe(
    supabase: any,
    leadId: string | number,
    targetStage: string,
    runId: string
): Promise<{ success: boolean; error?: string }> {
    const isSchemaMismatch = (code: string | undefined) => code === '42703' || code === 'PGRST204';
    const timestamp = new Date().toISOString();
    // 1. Try updating everything (status_pipeline + pipeline_stage + stage_changed_at)
    // This maintains compatibility with older schemas that use pipeline_stage
    const { error: err1 } = await supabase.from('leads').update({
        status_pipeline: targetStage,
        pipeline_stage: targetStage,
        stage_changed_at: timestamp
    }).eq('id', leadId);

    if (!err1) {
        console.log(`✅ [${runId}] Stage updated (dual write): ${targetStage}`);
        return { success: true };
    }

    // 2. Fallback: If schema mismatch (42703 / PGRST204), retry with canonical 'status_pipeline' only
    // This happens if 'pipeline_stage' was removed or 'stage_changed_at' is missing
    if (isSchemaMismatch(err1.code)) {
        console.warn(`⚠️ [${runId}] Stage update schema mismatch (${err1.code}). Retrying safe update.`);

        // Try without pipeline_stage but keep stage_changed_at
        const { error: err2 } = await supabase.from('leads').update({
            status_pipeline: targetStage,
            stage_changed_at: timestamp
        }).eq('id', leadId);

        if (!err2) {
            console.log(`✅ [${runId}] Stage updated (status_pipeline + date): ${targetStage}`);
            return { success: true };
        }

        // 3. Final Fallback: bare minimum
        if (isSchemaMismatch(err2.code)) {
            const { error: err3 } = await supabase.from('leads').update({
                status_pipeline: targetStage
            }).eq('id', leadId);

            if (err3) {
                console.error(`❌ [${runId}] Failed strict backup update:`, err3);
                return { success: false, error: err3?.message || 'bare_update_failed' };
            }
            console.log(`✅ [${runId}] Stage updated (bare status_pipeline): ${targetStage}`);
            return { success: true };
        } else {
            console.error(`❌ [${runId}] Failed backup update:`, err2);
            return { success: false, error: err2?.message || 'backup_update_failed' };
        }
    } else {
        console.error(`❌ [${runId}] Stage update failed (unknown error):`, err1);
        return { success: false, error: err1?.message || 'unknown_error' };
    }
}

// --- HELPER: Typing Indicator ---
async function sendTypingIndicator(instanceName: string, remoteJid: string, durationMs: number) {
    const evoUrl = Deno.env.get('EVOLUTION_API_URL');
    const evoKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evoUrl || !evoKey) return;

    try {
        // Start Typing
        await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: remoteJid.replace('@s.whatsapp.net', ''), presence: 'composing', delay: 0 })
        });

        // Wait
        await new Promise(r => setTimeout(r, durationMs));

        // Stop Typing
        await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: remoteJid.replace('@s.whatsapp.net', ''), presence: 'available', delay: 0 })
        });
    } catch (e) {
        console.error('Typing indicator failed:', e);
    }
}

// --- HELPER: Sanitize query for web search (remove PII) ---
function sanitizeQuery(text: string): string {
    return text
        .replace(/\b\d{8,}\b/g, '')           // Remove long digit sequences (phones, CPF)
        .replace(/\b\d{2,3}\.\d{3}\.\d{3}[-/]\d{1,2}\b/g, '') // CPF/CNPJ patterns
        .replace(/[+]\d{10,}/g, '')            // International phone numbers
        .trim()
        .substring(0, 200);
}

// Fix common UTF-8 mojibake patterns like "vocÃª", "mÃ©dia".
function repairMojibake(text: string): string {
    if (!text) return text;
    if (!/[ÃÂ]/.test(text)) return text;
    const replacements: Array<[string, string]> = [
        ['Ã¡', 'á'], ['Ã¢', 'â'], ['Ã£', 'ã'], ['Ã¤', 'ä'],
        ['Ã©', 'é'], ['Ãª', 'ê'], ['Ã«', 'ë'],
        ['Ã­', 'í'], ['Ã®', 'î'], ['Ã¯', 'ï'],
        ['Ã³', 'ó'], ['Ã´', 'ô'], ['Ãµ', 'õ'], ['Ã¶', 'ö'],
        ['Ãº', 'ú'], ['Ã»', 'û'], ['Ã¼', 'ü'],
        ['Ã§', 'ç'], ['Ã±', 'ñ'],
        ['Ã', 'Á'], ['Ã‚', 'Â'], ['Ãƒ', 'Ã'], ['Ã„', 'Ä'],
        ['Ã‰', 'É'], ['ÃŠ', 'Ê'], ['Ã‹', 'Ë'],
        ['Ã', 'Í'], ['ÃŽ', 'Î'], ['Ã', 'Ï'],
        ['Ã“', 'Ó'], ['Ã”', 'Ô'], ['Ã•', 'Õ'], ['Ã–', 'Ö'],
        ['Ãš', 'Ú'], ['Ã›', 'Û'], ['Ãœ', 'Ü'],
        ['Ã‡', 'Ç'], ['Ã‘', 'Ñ'],
        ['â€™', '’'], ['â€œ', '“'], ['â€', '”'], ['â€“', '–'], ['â€”', '—'],
        ['Â', '']
    ];
    let repaired = text;
    for (const [from, to] of replacements) {
        repaired = repaired.replaceAll(from, to);
    }
    return repaired;
}

// --- HELPER: Check if message looks like a real question ---
function looksLikeQuestion(text: string): boolean {
    if (!text || text.length < 8) return false;
    const lower = text.toLowerCase();
    const questionStarters = ['como', 'quanto', 'qual', 'quando', 'onde', 'por que', 'porque',
        'tempo', 'prazo', 'vale a pena', 'funciona', 'demora', 'custa', 'economia',
        'economizar', 'instalar', 'instalação', 'homologação', 'medidor', 'concessionária'];
    return lower.includes('?') || questionStarters.some(s => lower.includes(s));
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./i, '');
    } catch (_) {
        return '';
    }
}

function extractTextFromMessageContent(content: any): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .map((part: any) => {
            if (!part || typeof part !== 'object') return '';
            if (part.type === 'text' && typeof part.text === 'string') return part.text;
            if (part.type === 'input_text' && typeof part.text === 'string') return part.text;
            return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
}

function normalizeHistoryText(message: any, attachmentUrl: string | null): string {
    let text = String(message || '').trim();
    if (attachmentUrl && text.includes(attachmentUrl)) {
        text = text.replace(attachmentUrl, '').trim();
    }
    return text;
}

async function isLeadAiEnabledNow(supabase: any, leadId: string | number): Promise<boolean> {
    const { data, error } = await supabase
        .from('leads')
        .select('ai_enabled')
        .eq('id', leadId)
        .maybeSingle();

    // FAIL-SAFE: on DB error, assume AI is disabled to prevent unwanted outbound messages
    if (error) {
        console.error('[isLeadAiEnabledNow] DB error — defaulting to DISABLED for safety:', error.message);
        return false;
    }
    if (!data) return false;
    return data.ai_enabled !== false;
}

async function isLeadFollowUpEnabledNow(supabase: any, leadId: string | number): Promise<boolean> {
    const { data, error } = await supabase
        .from('leads')
        .select('follow_up_enabled')
        .eq('id', leadId)
        .maybeSingle();

    // FAIL-SAFE: on DB error, assume follow-up is disabled.
    if (error) {
        console.error('[isLeadFollowUpEnabledNow] DB error - defaulting to DISABLED for safety:', error.message);
        return false;
    }
    if (!data) return false;
    return data.follow_up_enabled !== false;
}

async function isOrgStageAgentActive(supabase: any, orgId: string, stageKey: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('ai_stage_config')
        .select('is_active')
        .eq('org_id', orgId)
        .eq('pipeline_stage', stageKey)
        .maybeSingle();

    if (error) {
        console.error(`[isOrgStageAgentActive] Failed to load stage config for ${stageKey}:`, error.message);
        return false;
    }
    return data?.is_active === true;
}

function normalizeFollowUpSequenceConfig(raw: any): { steps: FollowUpStepRule[] } {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, any> : {};
    const incomingSteps = Array.isArray(source.steps) ? source.steps : [];
    const fallbackMap = new Map(
        DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG.steps.map((step) => [step.step, step] as const),
    );

    const steps: FollowUpStepRule[] = FOLLOW_UP_STEP_KEYS.map((stepKey) => {
        const fallback = fallbackMap.get(stepKey)!;
        const incoming = incomingSteps.find((entry: any) => Number(entry?.step) === stepKey) || {};
        const enabled = typeof incoming?.enabled === 'boolean' ? Boolean(incoming.enabled) : fallback.enabled;
        const delayRaw = Number(incoming?.delay_minutes);
        const delayMinutes = Number.isFinite(delayRaw)
            ? Math.max(
                FOLLOW_UP_MIN_DELAY_MINUTES,
                Math.min(FOLLOW_UP_MAX_DELAY_MINUTES, Math.round(delayRaw)),
            )
            : fallback.delay_minutes;

        return {
            step: stepKey,
            enabled,
            delay_minutes: delayMinutes,
        };
    });

    return { steps };
}

async function loadFollowUpRuntimeSettings(
    supabase: any,
    orgId: string
): Promise<{ sequenceConfig: { steps: FollowUpStepRule[] }; windowConfig: FollowUpWindowConfig; timeZone: string }> {
    const { data, error } = await supabase
        .from('ai_settings')
        .select('follow_up_sequence_config, follow_up_window_config, timezone')
        .eq('org_id', orgId)
        .maybeSingle();

    if (error) {
        console.warn('[loadFollowUpRuntimeSettings] falling back to defaults:', error.message);
        return {
            sequenceConfig: DEFAULT_FOLLOW_UP_SEQUENCE_CONFIG,
            windowConfig: DEFAULT_FOLLOW_UP_WINDOW_CONFIG,
            timeZone: 'America/Sao_Paulo',
        };
    }

    return {
        sequenceConfig: normalizeFollowUpSequenceConfig((data as any)?.follow_up_sequence_config),
        windowConfig: normalizeFollowUpWindowConfig((data as any)?.follow_up_window_config),
        timeZone: String((data as any)?.timezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo',
    };
}

function getFirstEnabledFollowUpStep(config: { steps: FollowUpStepRule[] }): FollowUpStepRule | null {
    const ordered = config.steps
        .filter((step) => step.enabled)
        .sort((a, b) => a.step - b.step);
    return ordered[0] || null;
}

function formatElapsedSince(iso: string | null | undefined): string {
    const raw = String(iso || '').trim();
    if (!raw) return 'tempo não informado';
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) return 'tempo não informado';
    const deltaMs = Math.max(0, Date.now() - ts);
    const totalMinutes = Math.floor(deltaMs / 60000);
    if (totalMinutes < 1) return 'menos de 1 minuto';
    if (totalMinutes < 60) return `${totalMinutes} minuto(s)`;
    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) return `${totalHours} hora(s)`;
    const totalDays = Math.floor(totalHours / 24);
    return `${totalDays} dia(s)`;
}

async function cancelAndScheduleFollowUp(params: {
    supabase: any;
    leadId: string | number;
    orgId: string;
    currentStage: string | null | undefined;
    instanceName: string | null | undefined;
    runId: string;
}): Promise<{ scheduled: boolean; skippedReason?: string; scheduledStep?: number }> {
    const { supabase, leadId, orgId, currentStage, instanceName, runId } = params;
    const normalizedStage = normalizeStage(currentStage);

    if (TERMINAL_STAGES.has(normalizedStage)) {
        return { scheduled: false, skippedReason: 'terminal_stage' };
    }

    const leadFuEnabled = await isLeadFollowUpEnabledNow(supabase, leadId);
    if (!leadFuEnabled) {
        return { scheduled: false, skippedReason: 'lead_fu_disabled' };
    }

    const orgFollowUpActive = await isOrgStageAgentActive(supabase, orgId, 'follow_up');
    if (!orgFollowUpActive) {
        return { scheduled: false, skippedReason: 'org_agent_disabled' };
    }

    const followUpRuntime = await loadFollowUpRuntimeSettings(supabase, orgId);
    const firstEnabledStep = getFirstEnabledFollowUpStep(followUpRuntime.sequenceConfig);
    if (!firstEnabledStep) {
        return { scheduled: false, skippedReason: 'fu_sequence_empty' };
    }

    const nowIso = new Date().toISOString();
    const baseScheduleDate = new Date(Date.now() + (firstEnabledStep.delay_minutes * 60_000));
    const followUpScheduleResolution = resolveFollowUpScheduledAt({
        baseDate: baseScheduleDate,
        timeZone: followUpRuntime.timeZone,
        windowConfig: followUpRuntime.windowConfig,
    });
    const leadIdNum = Number(leadId);

    const { error: cancelErr } = await supabase
        .from('scheduled_agent_jobs')
        .update({
            status: 'cancelled',
            cancelled_reason: 'new_outbound_superseded',
            executed_at: nowIso,
        })
        .eq('lead_id', leadIdNum)
        .eq('agent_type', 'follow_up')
        .eq('status', 'pending');
    if (cancelErr) throw cancelErr;

    const insertPayload = {
        org_id: orgId,
        lead_id: leadIdNum,
        agent_type: 'follow_up',
        scheduled_at: followUpScheduleResolution.scheduledAt.toISOString(),
        status: 'pending',
        guard_stage: normalizedStage || null,
        payload: {
            fu_step: firstEnabledStep.step,
            last_outbound_at: nowIso,
            original_stage: normalizedStage || null,
            instance_name: instanceName || null,
            follow_up_schedule_timezone: followUpRuntime.timeZone,
        },
    };

    const tryInsert = async () => {
        const { error } = await supabase
            .from('scheduled_agent_jobs')
            .insert(insertPayload);
        return error;
    };

    let insertErr = await tryInsert();
    if (insertErr && insertErr.code === '23505') {
        // Race safety for unique pending follow_up per lead.
        const { error: recancelErr } = await supabase
            .from('scheduled_agent_jobs')
            .update({
                status: 'cancelled',
                cancelled_reason: 'new_outbound_superseded',
                executed_at: nowIso,
            })
            .eq('lead_id', leadIdNum)
            .eq('agent_type', 'follow_up')
            .eq('status', 'pending');
        if (recancelErr) throw recancelErr;
        insertErr = await tryInsert();
    }
    if (insertErr) throw insertErr;

    const { error: leadUpdateErr } = await supabase
        .from('leads')
        .update({ follow_up_step: 0 })
        .eq('id', leadIdNum);
    if (leadUpdateErr) throw leadUpdateErr;

    try {
        await supabase.from('ai_action_logs').insert({
            org_id: orgId,
            lead_id: leadIdNum,
            action_type: 'follow_up_sequence_scheduled',
            details: JSON.stringify({
                runId,
                trigger: 'bot_outbound',
                stage: normalizedStage || null,
                step: firstEnabledStep.step,
                scheduled_in_minutes: firstEnabledStep.delay_minutes,
                scheduled_at: followUpScheduleResolution.scheduledAt.toISOString(),
                schedule_timezone: followUpRuntime.timeZone,
                window_adjusted: followUpScheduleResolution.adjusted,
                window_start: followUpRuntime.windowConfig.start,
                window_end: followUpRuntime.windowConfig.end,
                window_days: followUpRuntime.windowConfig.days.join(','),
                preferred_time: followUpRuntime.windowConfig.preferred_time || null,
            }),
            success: true,
        });
    } catch (logErr) {
        console.warn(`[${runId}] follow_up_sequence_scheduled log failed (non-blocking):`, logErr);
    }

    return { scheduled: true, scheduledStep: firstEnabledStep.step };
}

async function performOpenAIWebSearch(openAIApiKey: string, query: string): Promise<{ ok: boolean; text: string; error?: string }> {
    try {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openAIApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                tools: [{ type: 'web_search_preview' }],
                input: `Pesquise na web e retorne no máximo 3 fatos curtos e práticos sobre energia solar no Brasil para responder: ${query}`
            })
        });

        if (!response.ok) {
            return { ok: false, text: '', error: `openai_http_${response.status}` };
        }

        const data: any = await response.json();
        const outputText = String(data?.output_text || '').trim();
        if (!outputText) {
            return { ok: false, text: '', error: 'openai_empty_output' };
        }

        return { ok: true, text: outputText };
    } catch (error: any) {
        return { ok: false, text: '', error: error?.message || String(error) };
    }
}

// --- V6: NORMALIZERS for lead field extraction ---
function normalizeMoneyBRL(raw: any): number | null {
    if (typeof raw === 'number') return raw > 0 ? raw : null;
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[R$\s.]/g, '').replace(',', '.').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}

function normalizeKwh(raw: any): number | null {
    if (typeof raw === 'number') return raw > 0 ? raw : null;
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[^0-9.,]/g, '').replace(',', '.').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) || n <= 0 ? null : Math.round(n);
}

function normalizeRoofType(raw: any): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes('ceramic') || lower.includes('ceramica')) return 'ceramica';
    if (lower.includes('fibro') || lower.includes('amianto') || lower.includes('eternit')) return 'fibrocimento';
    if (lower.includes('metal') || lower.includes('zinco') || lower.includes('galvan')) return 'metalica';
    if (lower.includes('laje') || lower.includes('concreto')) return 'laje';
    if (lower.includes('colonial')) return 'colonial';
    return 'outro';
}

function normalizeGridType(raw: any): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes('mono') || lower.includes('monofas')) return 'mono';
    if (lower.includes('bi') || lower.includes('bifas')) return 'bi';
    if (lower.includes('tri') || lower.includes('trifas')) return 'tri';
    return null;
}

function normalizeCustomerType(raw: any): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes('resid') || lower.includes('casa')) return 'residencial';
    if (lower.includes('comerc') || lower.includes('empresa') || lower.includes('loja')) return 'comercial';
    if (lower.includes('agro') || lower.includes('rural') || lower.includes('fazend')) return 'agro';
    if (lower.includes('indust')) return 'industrial';
    return raw.trim().toLowerCase();
}

// --- V6: LEAD_META_JSON idempotent helper (edge-function mini version) ---
const META_TAG = '[[LEAD_META_JSON]]';

function parseLeadMeta(obs: string | null | undefined): Record<string, any> {
    if (!obs || !obs.includes(META_TAG)) return {};
    try {
        const parts = obs.split(META_TAG);
        if (parts.length < 2) return {};
        const jsonStr = parts[1].trim();
        // Handle both ":{ ... }" and "{ ... }" formats
        const cleaned = jsonStr.startsWith(':') ? jsonStr.substring(1).trim() : jsonStr;
        return JSON.parse(cleaned) || {};
    } catch { return {}; }
}

function packLeadMeta(currentObs: string | null | undefined, newData: Record<string, any>): string {
    const baseObs = currentObs && currentObs.includes(META_TAG)
        ? currentObs.split(META_TAG)[0].trim()
        : (currentObs || '').trim();
    const existingMeta = parseLeadMeta(currentObs);
    const merged = { ...existingMeta, ...newData };
    const hasData = Object.values(merged).some(v => v !== undefined && v !== null && v !== '');
    if (!hasData) return baseObs;
    return `${baseObs}\n\n${META_TAG}:${JSON.stringify(merged)}`;
}

// --- Lead stage_data JSONB helpers (structured agent fields by stage) ---
const STAGE_DATA_NAMESPACE_BY_STAGE: Record<string, string> = {
    'respondeu': 'respondeu',
    'nao_compareceu': 'nao_compareceu',
    'proposta_negociacao': 'negociacao',
    'negociacao': 'negociacao',
    'financiamento': 'financiamento',
};

const STAGE_DATA_ALLOWED_FIELDS: Record<string, Set<string>> = {
    respondeu: new Set([
        'segment',
        'timing',
        'budget_fit',
        'need_reason',
        'decision_makers',
        'decision_makers_present',
        'visit_datetime',
        'address',
        'reference_point',
        'bant_complete',
        'last_question_key',
        'answered_keys',
        'collected',
    ]),
    nao_compareceu: new Set([
        'no_show_reason',
        'recovery_path',
        'next_step_choice',
        'next_step',
        'attempt_count',
        'call_datetime',
        'visit_datetime',
        'address',
        'reference_point',
        'last_question_key',
        'answered_keys',
        'collected',
    ]),
    negociacao: new Set([
        'payment_track',
        'payment_method',
        'main_objection',
        'chosen_condition',
        'explicit_approval',
        'negotiation_status',
        'last_question_key',
        'answered_keys',
        'collected',
    ]),
    financiamento: new Set([
        'financing_status',
        'missing_docs',
        'last_update_at',
        'next_followup_at',
        'fear_reason',
        'profile_type',
        'approved_at',
        'bank_notes',
        'last_question_key',
        'answered_keys',
        'collected',
    ]),
};

function toSnakeCaseKey(raw: string): string {
    return String(raw || '')
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s\-./]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function parseBooleanLike(value: any): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        return null;
    }
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['true', '1', 'yes', 'y', 'sim'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'nao'].includes(normalized)) return false;
    return null;
}

function parseNumberLike(value: any): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/[^0-9.,-]/g, '').trim();
    if (!cleaned) return null;
    const normalized = cleaned.includes(',') && !cleaned.includes('.')
        ? cleaned.replace(',', '.')
        : cleaned.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringArray(value: any): string[] | null {
    if (Array.isArray(value)) {
        const items = value
            .map((item) => typeof item === 'string' ? item.trim() : String(item ?? '').trim())
            .filter(Boolean)
            .slice(0, 20);
        return items.length > 0 ? items : null;
    }
    if (typeof value === 'string') {
        const parts = value
            .split(/[;,|]/)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 20);
        if (parts.length > 0) return parts;
        const single = value.trim();
        return single ? [single] : null;
    }
    return null;
}

function normalizeStageDataValue(fieldName: string, value: any): any {
    if (value === undefined) return undefined;
    if (value === null) return null;

    switch (fieldName) {
        case 'decision_makers':
        case 'missing_docs':
            return normalizeStringArray(value);
        case 'attempt_count':
            return parseNumberLike(value);
        case 'bant_complete':
        case 'decision_makers_present':
        case 'explicit_approval':
            return parseBooleanLike(value);
        default:
            break;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
        const items = value
            .map((item) => typeof item === 'string' ? item.trim() : item)
            .filter((item) => item !== '' && item !== null && item !== undefined)
            .slice(0, 20);
        return items.length > 0 ? items : null;
    }
    if (typeof value === 'object') {
        return value;
    }

    return null;
}

function getStageDataNamespace(stage: string | null | undefined): string | null {
    const normalized = normalizeStage(stage);
    return STAGE_DATA_NAMESPACE_BY_STAGE[normalized] || null;
}

function resolveStageDataInput(rawStageData: any, namespace: string): Record<string, any> {
    if (!rawStageData || typeof rawStageData !== 'object' || Array.isArray(rawStageData)) return {};
    const obj = rawStageData as Record<string, any>;
    if (namespace === 'negociacao') {
        if (obj.negociacao && typeof obj.negociacao === 'object' && !Array.isArray(obj.negociacao)) return obj.negociacao;
        if (obj.proposta_negociacao && typeof obj.proposta_negociacao === 'object' && !Array.isArray(obj.proposta_negociacao)) return obj.proposta_negociacao;
    }
    const namespaced = obj[namespace];
    if (namespaced && typeof namespaced === 'object' && !Array.isArray(namespaced)) return namespaced;
    return obj;
}

function normalizeStageDataPayload(rawStageData: any, namespace: string): Record<string, any> {
    const allowed = STAGE_DATA_ALLOWED_FIELDS[namespace];
    if (!allowed) return {};

    const input = resolveStageDataInput(rawStageData, namespace);
    const normalized: Record<string, any> = {};

    for (const [rawKey, rawValue] of Object.entries(input)) {
        const key = toSnakeCaseKey(rawKey);
        if (!key || key === 'updated_at') continue;
        if (!allowed.has(key)) continue;

        const normalizedValue = normalizeStageDataValue(key, rawValue);
        if (normalizedValue === undefined || normalizedValue === null) continue;
        if (typeof normalizedValue === 'string' && normalizedValue.trim() === '') continue;
        if (Array.isArray(normalizedValue) && normalizedValue.length === 0) continue;

        normalized[key] = normalizedValue;
    }

    return normalized;
}

function normalizeLeadStageDataRoot(raw: any): Record<string, any> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, any>;
}

function extractStageDataCandidate(aiRes: any): Record<string, any> | null {
    const stageData = aiRes?.stage_data;
    if (stageData && typeof stageData === 'object' && !Array.isArray(stageData)) return stageData;
    const leadStageData = aiRes?.lead_stage_data;
    if (leadStageData && typeof leadStageData === 'object' && !Array.isArray(leadStageData)) return leadStageData;
    return null;
}

async function executeLeadStageDataUpdate(
    supabase: any,
    leadId: string | number,
    currentStage: string,
    rawStageData: Record<string, any>,
    lead: any,
    runId: string
): Promise<{
    candidateCount: number;
    writtenCount: number;
    namespace: string | null;
    skippedReason: string | null;
}> {
    const namespace = getStageDataNamespace(currentStage);
    if (!namespace) {
        return { candidateCount: 0, writtenCount: 0, namespace: null, skippedReason: 'stage_not_supported' };
    }

    const payload = normalizeStageDataPayload(rawStageData, namespace);
    const existingNamespaceData =
        (normalizeLeadStageDataRoot(lead?.lead_stage_data)[namespace] as Record<string, any> | undefined) || {};
    const mergedAnsweredKeys = mergeQuestionKeys(existingNamespaceData.answered_keys, payload.answered_keys);
    if (mergedAnsweredKeys.length > 0) {
        payload.answered_keys = mergedAnsweredKeys;
    } else if (payload.answered_keys) {
        delete payload.answered_keys;
    }

    if (!payload.last_question_key) {
        const existingLastQuestion = normalizeQuestionKey(
            existingNamespaceData.last_question_key
        );
        if (existingLastQuestion) {
            payload.last_question_key = existingLastQuestion;
        }
    } else {
        payload.last_question_key = normalizeQuestionKey(payload.last_question_key);
    }

    const payloadKeys = Object.keys(payload);
    if (payloadKeys.length === 0) {
        return { candidateCount: 0, writtenCount: 0, namespace, skippedReason: 'no_supported_fields' };
    }

    const currentRoot = normalizeLeadStageDataRoot(lead?.lead_stage_data);
    const currentNamespaceData =
        currentRoot[namespace] && typeof currentRoot[namespace] === 'object' && !Array.isArray(currentRoot[namespace])
            ? (currentRoot[namespace] as Record<string, any>)
            : {};

    const nowIso = new Date().toISOString();
    const mergedRoot = {
        ...currentRoot,
        [namespace]: {
            ...currentNamespaceData,
            ...payload,
            updated_at: nowIso,
        },
    };

    try {
        const { error } = await supabase
            .from('leads')
            .update({ lead_stage_data: mergedRoot })
            .eq('id', leadId);

        if (error) {
            if (error.code === '42703' || error.code === 'PGRST204') {
                console.warn(`⚠️ [${runId}] Stage data column unavailable (lead_stage_data). Skipping structured write.`);
                return { candidateCount: payloadKeys.length, writtenCount: 0, namespace, skippedReason: 'column_missing' };
            }
            console.error(`❌ [${runId}] Stage data write failed:`, error.message);
            return { candidateCount: payloadKeys.length, writtenCount: 0, namespace, skippedReason: `db_error:${error.code || 'unknown'}` };
        }

        try {
            await supabase.from('ai_action_logs').insert({
                lead_id: Number(leadId),
                action_type: 'lead_stage_data_updated',
                details: JSON.stringify({
                    stage_namespace: namespace,
                    fields_written_count: payloadKeys.length,
                    fields_written: payload,
                    updated_at: nowIso,
                }),
                success: true,
            });
        } catch (logErr: any) {
            console.warn(`⚠️ [${runId}] Stage data audit log failed (non-blocking):`, logErr?.message || logErr);
        }

        console.log(`📦 [${runId}] Stage data updated (${namespace}): ${payloadKeys.join(', ')}`);
        return { candidateCount: payloadKeys.length, writtenCount: payloadKeys.length, namespace, skippedReason: null };
    } catch (err: any) {
        console.error(`❌ [${runId}] executeLeadStageDataUpdate error (non-blocking):`, err?.message || err);
        return { candidateCount: payloadKeys.length, writtenCount: 0, namespace, skippedReason: `exception:${err?.message || 'unknown'}` };
    }
}

// Columns that exist directly on leads table
const LEAD_DIRECT_COLUMNS: Record<string, (v: any) => any> = {
    'consumption_kwh_month': normalizeKwh,    // maps to consumo_kwh
    'estimated_value_brl': normalizeMoneyBRL, // maps to valor_estimado
    'customer_type': normalizeCustomerType,   // maps to tipo_cliente
    'city': (v: any) => typeof v === 'string' ? v.trim() : null,
    'zip': (v: any) => typeof v === 'string' ? v.replace(/[^0-9-]/g, '').trim() : null,
};

// Column name mapping: extraction field -> DB column
const FIELD_TO_COLUMN: Record<string, string> = {
    'consumption_kwh_month': 'consumo_kwh',
    'estimated_value_brl': 'valor_estimado',
    'customer_type': 'tipo_cliente',
    'city': 'cidade',
    'zip': 'cep',
};

const V6_NUMERIC_FIELDS = new Set(['consumption_kwh_month', 'estimated_value_brl']);

function isHedged(text: string | null | undefined): boolean {
    if (!text) return false;
    const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return /\b(acho|acho que|acredito|creio|talvez|deve ser|por volta|mais ou menos|aprox(?:imadamente)?\.?|cerca de|na faixa de|chutando|imagino|algo em torno|tipo)\b/.test(normalized)
        || /\buns?\b/.test(normalized)
        || /\bumas?\b/.test(normalized);
}

// Fields stored in meta JSON
const META_FIELDS: Record<string, (v: any) => any> = {
    'roof_type': normalizeRoofType,
    'utility_company': (v: any) => typeof v === 'string' ? v.trim().toUpperCase() : null,
    'grid_connection_type': normalizeGridType,
    'financing_interest': (v: any) => {
        if (typeof v === 'boolean') return v ? 'sim' : 'nao';
        if (typeof v !== 'string') return null;
        const l = v.toLowerCase();
        if (l.includes('sim') || l.includes('yes') || l === 'true') return 'sim';
        if (l.includes('nao') || l.includes('não') || l.includes('no') || l === 'false') return 'nao';
        return null;
    },
    'installation_site_type': (v: any) => typeof v === 'string' ? v.trim().toLowerCase() : null,
    'average_bill_context': (v: any) => typeof v === 'string' ? v.trim() : null,
};

// --- V6: Safe update evaluator ---
interface FieldCandidate {
    value: any;
    confidence: 'high' | 'medium' | 'low';
    source: 'user' | 'inferred' | 'confirmed';
}

function shouldWriteField(
    fieldName: string,
    candidate: FieldCandidate,
    currentValue: any
): { write: boolean; reason: string } {
    const hasExisting = currentValue !== null && currentValue !== undefined && currentValue !== '' && currentValue !== 0;

    // Rule: Never save low confidence
    if (candidate.confidence === 'low') {
        return { write: false, reason: 'confidence_too_low' };
    }

    // Rule: Existing value present — only overwrite if high confidence AND user/confirmed source
    if (hasExisting) {
        if (candidate.confidence === 'high' && (candidate.source === 'user' || candidate.source === 'confirmed')) {
            return { write: true, reason: 'high_conf_user_overwrite' };
        }
        return { write: false, reason: 'existing_value_protected' };
    }

    // Rule: Field empty — allow medium if source=user
    if (candidate.confidence === 'medium' && candidate.source === 'user') {
        return { write: true, reason: 'empty_field_medium_user' };
    }
    if (candidate.confidence === 'high') {
        return { write: true, reason: 'empty_field_high_conf' };
    }
    if (candidate.confidence === 'medium' && candidate.source === 'inferred') {
        return { write: false, reason: 'medium_inferred_blocked' };
    }

    return { write: false, reason: 'default_blocked' };
}

// --- V6: Execute lead field update (non-blocking, safe) ---
async function executeLeadFieldUpdate(
    supabase: any,
    leadId: string | number,
    fields: Record<string, FieldCandidate>,
    lead: any,
    runId: string,
    aggregatedText?: string
): Promise<{ candidateCount: number; writtenCount: number; skipped: Array<{ field: string; reason: string }> }> {
    const result = { candidateCount: 0, writtenCount: 0, skipped: [] as Array<{ field: string; reason: string }> };
    const dbUpdate: Record<string, any> = {};
    const metaUpdate: Record<string, any> = {};
    const hedgedInput = isHedged(aggregatedText);

    const existingMeta = parseLeadMeta(lead.observacoes || '');

    for (const [fieldName, candidate] of Object.entries(fields)) {
        result.candidateCount++;

        // Determine if direct column or meta
        const isDirect = fieldName in LEAD_DIRECT_COLUMNS;
        const isMeta = fieldName in META_FIELDS;

        if (!isDirect && !isMeta) {
            result.skipped.push({ field: fieldName, reason: 'unknown_field' });
            continue;
        }

        // Normalize value
        const normalizer = isDirect ? LEAD_DIRECT_COLUMNS[fieldName] : META_FIELDS[fieldName];
        const normalizedValue = normalizer(candidate.value);
        if (normalizedValue === null || normalizedValue === undefined) {
            result.skipped.push({ field: fieldName, reason: 'normalization_failed' });
            continue;
        }

        // Get current value
        let currentValue: any;
        if (isDirect) {
            const dbCol = FIELD_TO_COLUMN[fieldName] || fieldName;
            currentValue = lead[dbCol];
        } else {
            currentValue = existingMeta[fieldName];
        }

        const hasExisting = currentValue !== null && currentValue !== undefined && currentValue !== '' && currentValue !== 0;
        const isNumericField = V6_NUMERIC_FIELDS.has(fieldName);
        const candidateForDecision: FieldCandidate = {
            ...candidate,
            value: normalizedValue,
            confidence: hedgedInput && isNumericField && candidate.confidence === 'high'
                ? 'medium'
                : candidate.confidence,
        };

        // Hedge-protection: never overwrite existing numeric value from uncertain phrasing.
        if (hedgedInput && isNumericField && hasExisting) {
            result.skipped.push({ field: fieldName, reason: 'hedged_existing_value_protected' });
            continue;
        }

        // Evaluate write safety
        const decision = shouldWriteField(fieldName, candidateForDecision, currentValue);
        if (!decision.write) {
            result.skipped.push({ field: fieldName, reason: decision.reason });
            continue;
        }

        // Queue write
        if (isDirect) {
            const dbCol = FIELD_TO_COLUMN[fieldName] || fieldName;
            dbUpdate[dbCol] = normalizedValue;
        } else {
            metaUpdate[fieldName] = normalizedValue;
        }
        result.writtenCount++;
    }

    // Execute DB writes
    try {
        // Direct columns update
        if (Object.keys(dbUpdate).length > 0) {
            const { error: colErr } = await supabase.from('leads').update(dbUpdate).eq('id', leadId);
            if (colErr) {
                console.error(`❌ [${runId}] V6: Direct column update failed:`, colErr.message);
                // If column doesn't exist (42703), try meta fallback for those fields
                if (colErr.code === '42703') {
                    console.warn(`⚠️ [${runId}] V6: Column missing, falling back to meta for direct fields`);
                    for (const [col, val] of Object.entries(dbUpdate)) {
                        // Reverse-map column to field name
                        const fieldName = Object.entries(FIELD_TO_COLUMN).find(([, c]) => c === col)?.[0] || col;
                        metaUpdate[fieldName] = val;
                    }
                }
            }
        }

        // Meta JSON update
        if (Object.keys(metaUpdate).length > 0) {
            const currentObs = lead.observacoes || '';
            const newObs = packLeadMeta(currentObs, metaUpdate);
            const { error: metaErr } = await supabase.from('leads').update({ observacoes: newObs }).eq('id', leadId);
            if (metaErr) {
                console.error(`❌ [${runId}] V6: Meta JSON update failed:`, metaErr.message);
            }
        }

        // Audit log
        const hasHedgeBlock = result.skipped.some(s => s.reason === 'hedged_existing_value_protected');
        if (result.writtenCount > 0 || hasHedgeBlock) {
            await supabase.from('ai_action_logs').insert({
                lead_id: leadId,
                action_type: 'lead_fields_updated',
                details: JSON.stringify({
                    lead_fields_candidate_count: result.candidateCount,
                    lead_fields_written_count: result.writtenCount,
                    lead_fields_skipped_reason: result.skipped,
                    fields_written: { ...dbUpdate, ...metaUpdate },
                    hedged_input: hedgedInput,
                    hedge_text_preview: hedgedInput ? (aggregatedText || '').substring(0, 180) : null,
                }),
                success: true,
            });
        }

        console.log(`📋 [${runId}] V6: Lead fields update: ${result.writtenCount}/${result.candidateCount} written. Skipped: ${result.skipped.map(s => `${s.field}(${s.reason})`).join(', ') || 'none'}`);
    } catch (err: any) {
        console.error(`❌ [${runId}] V6: executeLeadFieldUpdate error (non-blocking):`, err?.message || err);
    }

    return result;
}

async function isAnchorLatestInbound(
    supabase: any,
    leadId: string | number,
    anchorInteractionId: string | number | null
): Promise<{ ok: boolean; latestId: any; latestCreatedAt: string | null }> {
    const { data: latestInbound, error } = await supabase
        .from('interacoes')
        .select('id, created_at')
        .eq('lead_id', leadId)
        .eq('wa_from_me', false)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    const latestId = latestInbound?.id ?? null;
    const latestCreatedAt = latestInbound?.created_at ?? null;
    const ok = !!anchorInteractionId && latestId !== null && String(latestId) === String(anchorInteractionId);

    return { ok, latestId, latestCreatedAt };
}

// --- V7: ADD COMMENT executor (idempotente via ai_action_logs) ---
async function executeAddComment(
    supabase: any,
    leadId: string | number,
    content: string,
    commentType: string,
    authorName: string,
    runId: string,
    anchorCreatedAt: string | null,
    anchorInteractionId: string | number | null
): Promise<{ written: boolean; skippedReason: string | null }> {
    const trimmed = (content || '').trim().substring(0, 1200);
    if (!trimmed) return { written: false, skippedReason: 'empty_content' };

    // Dedup check: same anchor should not produce duplicate comments
    const dedupKey = anchorCreatedAt || anchorInteractionId || runId;
    try {
        const { data: existing } = await supabase
            .from('ai_action_logs')
            .select('id')
            .eq('lead_id', leadId)
            .eq('action_type', 'lead_comment_added')
            .filter('details', 'ilike', `%${dedupKey}%`)
            .limit(1)
            .maybeSingle();

        if (existing) {
            console.log(`⏭️ [${runId}] V7: Comment skipped (duplicate for anchor ${dedupKey})`);
            return { written: false, skippedReason: 'skipped_duplicate' };
        }
    } catch (dedupErr: any) {
        console.warn(`⚠️ [${runId}] V7: Dedup check failed (non-blocking):`, dedupErr?.message);
    }

    const persistLeadCommentSafe = async (): Promise<{ ok: boolean; err: any | null }> => {
        const isSchemaMismatch = (code: string | undefined) => code === '42703' || code === 'PGRST204';
        const safeType = (commentType || 'note').trim().substring(0, 40) || 'note';
        const basePayload = {
            lead_id: Number(leadId),
            texto: `[${safeType}] ${trimmed}`,
            autor: 'AI',
        };
        const payloads = [
            { ...basePayload, categoria: safeType },
            { ...basePayload, tipo: safeType },
            basePayload,
        ];

        let lastErr: any = null;
        for (const payload of payloads) {
            const { error } = await supabase.from('comentarios_leads').insert(payload);
            if (!error) return { ok: true, err: null };
            lastErr = error;
            if (!isSchemaMismatch(error.code)) break;
        }
        return { ok: false, err: lastErr };
    };

    try {
        const persisted = await persistLeadCommentSafe();
        if (!persisted.ok) {
            console.error(`❌ [${runId}] V7: Comment insert error:`, persisted.err?.message || persisted.err);
            return { written: false, skippedReason: `db_error: ${persisted.err?.message || 'insert_failed'}` };
        }

        // Audit log
        await supabase.from('ai_action_logs').insert({
            lead_id: Number(leadId),
            action_type: 'lead_comment_added',
            details: JSON.stringify({
                anchorCreatedAt: anchorCreatedAt || null,
                interactionId: anchorInteractionId || null,
                runId,
                comment_type: commentType || 'note',
                comment_preview: trimmed.substring(0, 120),
                author_name: authorName || null,
                source: 'ai',
            }),
            success: true,
        });

        console.log(`💬 [${runId}] V7: Comment added (type=${commentType || 'note'}, ${trimmed.length} chars)`);
        return { written: true, skippedReason: null };
    } catch (err: any) {
        console.error(`❌ [${runId}] V7: executeAddComment error:`, err?.message || err);
        return { written: false, skippedReason: `exception: ${err?.message}` };
    }
}

// --- V7/V8: CREATE FOLLOWUP executor (real, inserts into lead_tasks) ---
async function executeCreateFollowup(
    supabase: any,
    leadId: string | number,
    task: any,
    runId: string,
    anchorCreatedAt: string | null,
    anchorInteractionId: string | number | null,
    orgId: string,
    userId: string
): Promise<{ written: boolean; skippedReason: string | null; taskId: string | null }> {
    // Validate title
    const title = (task?.title || '').trim().substring(0, 200);
    if (title.length < 3) {
        console.warn(`⚠️ [${runId}] V8: Followup skipped (title too short: "${title}")`);
        return { written: false, skippedReason: 'title_too_short', taskId: null };
    }

    const notes = (task?.notes || '').trim().substring(0, 1500) || null;

    // Validate due_at
    let dueAt: string | null = null;
    if (task?.due_at) {
        try {
            const d = new Date(task.due_at);
            if (!isNaN(d.getTime())) dueAt = d.toISOString();
        } catch (_) { /* invalid date, keep null */ }
    }

    // Normalize priority
    const validPriorities = ['low', 'medium', 'high'];
    const priority = validPriorities.includes(task?.priority) ? task.priority : 'medium';

    // Normalize channel
    const validChannels = ['whatsapp', 'call', 'email', 'other'];
    const channel = validChannels.includes(task?.channel) ? task.channel : null;

    // Dedup check
    const dedupKey = String(anchorInteractionId || anchorCreatedAt || runId);
    try {
        const { data: existing } = await supabase
            .from('ai_action_logs')
            .select('id')
            .eq('lead_id', leadId)
            .eq('action_type', 'followup_created')
            .filter('details', 'ilike', `%${dedupKey}%`)
            .limit(1)
            .maybeSingle();

        if (existing) {
            console.log(`⏭️ [${runId}] V8: Followup skipped (duplicate for anchor ${dedupKey})`);
            return { written: false, skippedReason: 'skipped_duplicate', taskId: null };
        }
    } catch (dedupErr: any) {
        console.warn(`⚠️ [${runId}] V8: Dedup check failed (non-blocking):`, dedupErr?.message);
    }

    try {
        const { data: inserted, error: insertErr } = await supabase.from('lead_tasks').insert({
            org_id: orgId,
            user_id: userId,
            lead_id: Number(leadId),
            title,
            notes,
            due_at: dueAt,
            status: 'open',
            priority,
            channel,
            created_by: 'ai',
        }).select('id').single();

        if (insertErr) {
            console.error(`❌ [${runId}] V8: lead_tasks insert error:`, insertErr.message);
            return { written: false, skippedReason: `db_error: ${insertErr.message}`, taskId: null };
        }

        const taskId = inserted?.id || null;

        // Audit log
        await supabase.from('ai_action_logs').insert({
            lead_id: Number(leadId),
            action_type: 'followup_created',
            details: JSON.stringify({
                anchorCreatedAt: anchorCreatedAt || null,
                interactionId: anchorInteractionId || null,
                runId,
                task_id: taskId,
                title,
                due_at: dueAt,
                priority,
                channel,
                source: 'ai',
            }),
            success: true,
        });

        console.log(`📝 [${runId}] V8: Followup created (id=${taskId}, title="${title}", due=${dueAt || 'none'}, priority=${priority})`);
        return { written: true, skippedReason: null, taskId };
    } catch (err: any) {
        console.error(`❌ [${runId}] V8: executeCreateFollowup error:`, err?.message || err);
        return { written: false, skippedReason: `exception: ${err?.message}`, taskId: null };
    }
}

// --- FALLBACK PROMPT for inactive/missing stages ---
const STAGE_FALLBACK_PROMPT = `Você é um consultor de energia solar (Brasil). O cliente falou fora de um fluxo ativo. Responda com qualidade e profundidade.
Nunca invente. Se faltar dado, diga que depende e peça 1 dado por vez.
Foque em explicar processo real (dimensionamento, homologação, instalação, troca de medidor, prazos por distribuidora, garantias, manutenção, economia e fatores).
Se o cliente perguntar "quanto tempo pra economizar", explique o fluxo real: instalação (1-3 dias), depois projeto/homologação na distribuidora, vistoria, troca de medidor (pode levar semanas), e só depois começa a compensação.
Peça cidade/UF e concessionária para estimar prazos.`;

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
    const internalApiKey = String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim();
    if (!serviceRoleKey) {
        return new Response(JSON.stringify({ error: 'missing_runtime_env' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    const invocationAuth = validateServiceInvocationAuth(req, {
        serviceRoleKey,
        internalApiKey,
    });
    if (!invocationAuth.ok) {
        return new Response(JSON.stringify({
            error: invocationAuth.code,
            reason: invocationAuth.reason,
        }), {
            status: invocationAuth.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    let payload: any = null;
    let runId: string | null = null;
    let leadId: string | number | null = null;
    let instanceName: string | null = null;
    let leadOrgId: string | null = null;
    let supabase: any = null;
    let latestAiResponse: Record<string, any> | null = null;
    let structuredLeadSnapshot: Record<string, any> | null = null;
    let leadUpdatesSummary: Record<string, unknown> | null = null;
    let currentStage = '';
    let configStageKey = '';
    let effectiveAgentType: 'standard' | 'disparos' | 'follow_up' = 'standard';

    try {
        try {
            payload = await req.json();
        } catch (_invalidJsonErr) {
            return new Response(JSON.stringify({ error: 'invalid_json_payload' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 0. GENERATE RUN ID
        runId = crypto.randomUUID();
        const triggerType = String(payload?.triggerType || 'incoming_message').trim() || 'incoming_message';
        const isFollowUpTrigger = triggerType === 'follow_up';
        const isScheduledPostCallTrigger = triggerType === 'scheduled_post_call';
        const isScheduledTrigger = isScheduledPostCallTrigger || isFollowUpTrigger;

        // --- CONSTANTS ---
        const QUIET_WINDOW_MS = 3500;   // min silence before responding
        const MAX_WAIT_MS = 18000;  // hard stop total per run
        const BURST_LOOKBACK_S = 90;   // max age of burst msgs to aggregate

        // Tracking variables for structured logging
        let decision = 'proceed';
        let stageFallbackUsed = false;
        let kbHitsCount = 0;
        let kbChars = 0;
        let kbError: string | null = null;
        let webUsed = false;
        let webResultsCount = 0;
        let webError: string | null = null;
        let webSearchStatus: string | null = null;
        let webSearchPerformedThisRun = false;
        let evolutionSendStatus: number | null = null;
        let anchorCreatedAt: string | null = null;
        let lastOutboundCreatedAt: string | null = null;
        let aggregatedBurstCount = 0;
        let aggregatedChars = 0;
        let lastInboundAgeMs: number | null = null;
        let transportMode: 'live' | 'simulated' | 'blocked' = 'live';
        let transportSimReason: string | null = null;
        // V6 tracking
        let v6FieldsCandidateCount = 0;
        let v6FieldsWrittenCount = 0;
        // V11 tracking (stage_data JSONB)
        let v11StageDataCandidateCount = 0;
        let v11StageDataWrittenCount = 0;
        let v11StageDataNamespace: string | null = null;
        let v11StageDataSkippedReason: string | null = null;
        // V7 tracking
        let v7CommentWritten = false;
        let v7CommentSkippedReason: string | null = null;
        let v7FollowupWritten = false;
        let v7FollowupSkippedReason: string | null = null;
        // Stage move tracking (Tarefa 2)
        let stageMoveResult: string | null = null;
        // Tracks whether the agent actually sent an outbound reply this run (Tarefa 1)
        let didSendOutbound = false;
        let followUpScheduleStatus: string | null = null;
        // Scheduling / appointment observability
        let scheduleTimezone = 'America/Sao_Paulo';
        let scheduleCatalogText = '';
        let scheduleWindowConfigNormalized: AppointmentWindowConfig = normalizeAppointmentWindowConfig(null);
        let autoSchedulePolicy: AutoSchedulePolicy = { ...DEFAULT_AUTO_SCHEDULE_POLICY };
        let schedulePolicyMode: AutoScheduleMode = 'both_on';
        let scheduleCallMinDays = 0;
        let scheduleVisitMinDays = 0;
        let isAfterHoursForCall = false;
        let afterHoursCallBlocked = false;
        let manualReturnModeUsed = false;
        let qualificationGateBlocked = false;
        let qualificationMissingKeysForLog: string[] = [];
        let noOutboundFallbackUsed = false;
        let availableSlotsByType: Record<AppointmentWindowType, string[]> = {
            call: [],
            visit: [],
            meeting: [],
            installation: [],
        };
        let scheduleBusyCount = 0;
        let appointmentPrecheckBlockedReason: string | null = null;
        let stageGateBlockReason: string | null = null;
        let implicitConfirmationUsed = false;
        let lastAssistantMessageText = '';
        let slotSelectionEvent: string | null = null;
        let slotSelectionStartAt: string | null = null;
        let slotSelectionType: AppointmentWindowType | null = null;
        let companyProfileFacts: CompanyProfileFacts | null = null;

        // 1. STRICT INSTANCE CHECK
        leadId = payload?.leadId ?? null;
        instanceName = payload?.instanceName ?? null;
        const inputInteractionId = payload.interactionId;
        let interactionId = payload.interactionId;
        let adoptedLatestOnce = false;
        let adoptedFromInteractionId: string | number | null = null;
        let adoptedToInteractionId: string | number | null = null;
        const forceSimulatedTransport = String(Deno.env.get('FORCE_SIMULATED_TRANSPORT') || '').toLowerCase() === 'true';
        const parsedMaxOutboundPerLeadPerMin = Number.parseInt(Deno.env.get('MAX_OUTBOUND_PER_LEAD_PER_MIN') || '3', 10);
        const maxOutboundPerLeadPerMin =
            Number.isFinite(parsedMaxOutboundPerLeadPerMin) && parsedMaxOutboundPerLeadPerMin > 0
                ? parsedMaxOutboundPerLeadPerMin
                : 3;

        const persistAgentOutcome = async (envelope: Record<string, any>) => {
            if (!supabase || !leadId) return;

            try {
                await supabase.from('ai_action_logs').insert({
                    org_id: leadOrgId || null,
                    lead_id: Number(leadId) || null,
                    action_type: 'agent_run_outcome',
                    details: JSON.stringify({
                        runId,
                        triggerType,
                        outcome: envelope.outcome,
                        reason_code: envelope.reason_code,
                        message_sent: envelope.message_sent,
                        should_retry: envelope.should_retry,
                        next_retry_seconds: envelope.next_retry_seconds,
                        decision,
                        current_stage: currentStage || null,
                        config_stage_key: configStageKey || null,
                        effective_agent_type: effectiveAgentType || null,
                        lead_updates: envelope.lead_updates || null,
                    }),
                    success: envelope.outcome === 'sent' || envelope.outcome === 'terminal_skip',
                });
            } catch (logErr: any) {
                console.warn(`[${runId}] agent_run_outcome log failed (non-blocking):`, logErr?.message || logErr);
            }

            try {
                await supabase.from('ai_agent_runs').insert({
                    org_id: leadOrgId,
                    lead_id: leadId,
                    trigger_type: payload?.triggerType || 'incoming_message',
                    status: envelope.outcome === 'sent' || envelope.outcome === 'terminal_skip' ? 'success' : 'failed',
                    error_message: envelope.outcome === 'sent' ? null : envelope.reason_code,
                    llm_output: latestAiResponse || envelope.ai_response || envelope,
                    actions_executed: latestAiResponse?.action ? [latestAiResponse.action] : [],
                    input_snapshot: {
                        runId,
                        decision,
                        trigger_type: triggerType,
                        current_stage: currentStage || null,
                        config_stage_key: configStageKey || null,
                        effective_agent_type: effectiveAgentType || null,
                        structured_lead_snapshot: structuredLeadSnapshot,
                        lead_updates: envelope.lead_updates || null,
                        outcome: envelope.outcome,
                        reason_code: envelope.reason_code,
                        message_sent: envelope.message_sent,
                    }
                });
            } catch (logErr: any) {
                console.warn(`[${runId}] ai_agent_runs insert failed (non-blocking):`, logErr?.message || logErr);
            }
        };

        const respondNoSend = async (
            body: Record<string, any>,
            reason: string,
            mode: 'simulated' | 'blocked' = 'blocked',
            status = 200
        ) => {
            transportMode = mode;
            transportSimReason = reason;
            const envelope = buildAgentResultEnvelope({
                reasonCode: reason,
                messageSent: false,
                runId,
                triggerType,
                scheduledJobId: payload?.scheduledJobId ? String(payload.scheduledJobId) : null,
                effectiveAgentType,
                transportMode: mode,
                transportReason: reason,
                leadUpdates: leadUpdatesSummary,
                aiResponse: latestAiResponse,
                extras: body,
            });
            await persistAgentOutcome(envelope);
            return new Response(JSON.stringify(envelope), {
                status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        };

        console.log(`🚀 [${runId}] START Agent. Instance: ${instanceName}, Lead: ${leadId}, Interaction: ${interactionId}`);

        if (!instanceName) {
            console.error('🛑 Missing instanceName in payload');
            return respondNoSend({ skipped: "missing_instanceName" }, 'missing_instanceName');
        }

        const supabaseBase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        const aiActionLogsHasOrgId = await tableHasOrgIdColumn(supabaseBase, 'ai_action_logs');
        if (!aiActionLogsHasOrgId) {
            throw new Error('Schema hardening violation: ai_action_logs.org_id column is required');
        }
        supabase = createOrgAwareSupabaseClient(
            supabaseBase,
            () => leadOrgId,
            aiActionLogsHasOrgId
        );

        const logRateLimitedOutbound = async (recentCount: number, anchorInteractionId: string | number | null) => {
            try {
                await supabase.from('ai_action_logs').insert({
                    lead_id: Number(leadId),
                    action_type: 'send_message_rate_limited',
                    details: JSON.stringify({
                        runId,
                        lead_id: Number(leadId),
                        instanceName,
                        window_sec: 60,
                        max_allowed: maxOutboundPerLeadPerMin,
                        recent_count: recentCount,
                        interactionId: anchorInteractionId || interactionId || null
                    }),
                    success: false
                });
            } catch (rateLogErr) {
                console.warn(`[${runId}] send_message_rate_limited log failed (non-blocking):`, rateLogErr);
            }
        };

        const logWebSearch = async (
            actionType: 'web_search_performed' | 'web_search_skipped',
            details: Record<string, any>
        ) => {
            try {
                await supabase.from('ai_action_logs').insert({
                    lead_id: Number(leadId),
                    action_type: actionType,
                    details: JSON.stringify({
                        runId,
                        ...details
                    }),
                    success: actionType === 'web_search_performed'
                });
            } catch (webLogErr) {
                console.warn(`[${runId}] ${actionType} log failed (non-blocking):`, webLogErr);
            }
        };

        // 2. CHECK IF AI IS ENABLED FOR THIS INSTANCE
        const { data: instanceData, error: instError } = await supabase
            .from('whatsapp_instances')
            .select('ai_enabled')
            .eq('instance_name', instanceName)
            .maybeSingle();

        if (instError || !instanceData || !instanceData.ai_enabled) {
            console.log(`🛑 AI disabled for instance: ${instanceName} (or instance not found)`);
            return respondNoSend({ skipped: "instance_ai_disabled" }, 'instance_ai_disabled');
        }

        // 3. LOAD LEAD & SETTINGS (org-scoped)
        const { data: lead, error: leadErr } = await supabase
            .from('leads')
            .select('*')
            .eq('id', leadId)
            .single();
        if (leadErr || !lead) {
            console.log(`🛑 Lead not found: ${leadId}`);
            return respondNoSend({ skipped: "lead_not_found" }, 'lead_not_found');
        }

        leadOrgId = lead.org_id ? String(lead.org_id) : null;
        if (!leadOrgId) {
            console.error(`🛑 [${runId}] lead_without_org_id`, { leadId, instanceName, interactionId });
            return respondNoSend(
                {
                    error: 'lead_without_org_id',
                    runId,
                    leadId,
                    instanceName,
                    interactionId
                },
                'lead_without_org_id',
                'blocked'
            );
        }

        const { data: settings, error: settingsErr } = await supabase
            .from('ai_settings')
            .select('*')
            .eq('org_id', leadOrgId)
            .order('id', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (settingsErr) {
            console.warn(`⚠️ [${runId}] Failed to load ai_settings for org ${leadOrgId}:`, settingsErr);
            return respondNoSend({ skipped: "settings_query_failed" }, 'settings_query_failed');
        }
        if (!settings) {
            return respondNoSend({ skipped: "settings_not_found_for_org" }, 'settings_not_found_for_org');
        }

        if (!settings?.is_active) {
            return respondNoSend({ skipped: "System Inactive" }, 'system_inactive');
        }

        // 3a. Lead-level gate
        if (isFollowUpTrigger) {
            if (lead.follow_up_enabled === false) {
                console.log(`🛑 Follow-up disabled for lead: ${leadId}`);
                return respondNoSend({ skipped: "lead_follow_up_disabled" }, 'lead_follow_up_disabled');
            }
        } else if (lead.ai_enabled === false) {
            console.log(`🛑 AI disabled for specific LEAD: ${leadId}`);
            return respondNoSend({ skipped: "lead_ai_disabled" }, 'lead_ai_disabled');
        }

        // 4. QUIET-WINDOW DEBOUNCE (wait for real silence)
        // Stage 1: short rapid checks (1500ms) to detect burst-in-progress
        // Stage 2: longer checks (4-7s) for natural human pauses
        let anchorInteractionId = interactionId;
        let stabilized = false;
        let anchorMsgCreatedAt: number | null = null;
        const debounceStart = Date.now();
        const RAPID_CHECK_MS = 1500;
        const RAPID_CHECKS = 3; // first 3 checks are rapid
        let loopCount = 0;

        if (isScheduledTrigger) {
            decision = 'scheduled_trigger_skip_debounce';
            stabilized = true;
            anchorInteractionId = interactionId || null;
            anchorMsgCreatedAt = null;
            anchorCreatedAt = null;
            console.log(`⏭️ [${runId}] Scheduled trigger (${triggerType}) - skipping quiet-window/yield/burst guards.`);
        } else {
            while (true) {
            loopCount++;
            // Stage 1 (first 3 loops): rapid 1.5s checks to catch burst
            // Stage 2 (after): slower 4-7s checks for human pacing
            const sleepMs = loopCount <= RAPID_CHECKS
                ? RAPID_CHECK_MS
                : Math.floor(Math.random() * (7000 - 4000 + 1) + 4000);
            const elapsed = Date.now() - debounceStart;
            console.log(`⏳ [${runId}] Quiet-window loop #${loopCount} sleep ${sleepMs}ms (elapsed ${elapsed}ms/${MAX_WAIT_MS}ms)`);
            await new Promise(r => setTimeout(r, sleepMs));

            // Fetch latest client message for this lead+instance
            const { data: latestMsg } = await supabase
                .from('interacoes')
                .select('id, created_at')
                .eq('lead_id', leadId)
                .eq('instance_name', instanceName)
                .eq('tipo', 'mensagem_cliente')
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!latestMsg) {
                stabilized = true;
                break;
            }

            const inboundTime = new Date(latestMsg.created_at).getTime();
            lastInboundAgeMs = Date.now() - inboundTime;

            console.log(`Yield Debug: latest=${latestMsg.id}, anchor=${anchorInteractionId}, input=${interactionId}`);

            // YIELD CHECK: if a newer inbound exists, adopt it once; on second hop abort (loop guard)
            if (interactionId && String(latestMsg.id) !== String(interactionId)) {
                // If user is still typing (burst active), do NOT adopt/wait from an older run.
                // Yield immediately and let a later call (after quiet window) handle the latest inbound deterministically.
                if (lastInboundAgeMs !== null && lastInboundAgeMs < QUIET_WINDOW_MS) {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding: newer msg ${latestMsg.id} exists (ours was ${interactionId}) while burst active (age ${lastInboundAgeMs}ms < ${QUIET_WINDOW_MS}ms). Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsg.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }

                // If this run started before the latest inbound existed, it must not adopt/respond after quiet.
                // Yield so a newer call (triggered after the latest inbound) can handle deterministically.
                if (debounceStart < inboundTime) {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding: newer msg ${latestMsg.id} exists (ours was ${interactionId}); run started before latest inbound (runStart<inbound). Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsg.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }

                // If the newest inbound is part of a tight burst (very close to the previous inbound),
                // do NOT adopt from an older run even if it's quiet now. Let the latest inbound call handle it.
                // This prevents TEST 7 mid-burst leaks caused by late-start runs adopting and responding.
                try {
                    const { data: lastTwoInbounds } = await supabase
                        .from('interacoes')
                        .select('id, created_at')
                        .eq('lead_id', leadId)
                        .eq('instance_name', instanceName)
                        .eq('tipo', 'mensagem_cliente')
                        .order('id', { ascending: false })
                        .limit(2);

                    if (lastTwoInbounds && lastTwoInbounds.length >= 2) {
                        const latestTs = new Date(lastTwoInbounds[0].created_at).getTime();
                        const prevTs = new Date(lastTwoInbounds[1].created_at).getTime();
                        const deltaMs = latestTs - prevTs;

                        if (Number.isFinite(deltaMs) && deltaMs < QUIET_WINDOW_MS) {
                            decision = 'yield_to_newer';
                            console.log(`🔄 [${runId}] Yielding: newer msg ${latestMsg.id} exists (ours was ${interactionId}); quiet now but burst detected (delta ${deltaMs}ms < ${QUIET_WINDOW_MS}ms). Aborting this run.`);
                            return respondNoSend({
                                aborted: "yield_to_newer",
                                runId,
                                debug: {
                                    latest: latestMsg.id,
                                    anchor: anchorInteractionId,
                                    input: interactionId,
                                    adopted_from: adoptedFromInteractionId,
                                    adopted_to: adoptedToInteractionId,
                                    burst_delta_ms: deltaMs,
                                    burst_latest_id: lastTwoInbounds[0]?.id,
                                    burst_prev_id: lastTwoInbounds[1]?.id
                                }
                            }, 'yield_to_newer');
                        }
                    }
                } catch (burstDeltaErr) {
                    console.warn(`[${runId}] Burst delta check failed (non-blocking):`, burstDeltaErr);
                }

                if (!adoptedLatestOnce) {
                    adoptedLatestOnce = true;
                    adoptedFromInteractionId = interactionId;
                    adoptedToInteractionId = latestMsg.id;

                    interactionId = latestMsg.id;
                    anchorInteractionId = latestMsg.id;
                    anchorCreatedAt = latestMsg.created_at || null;
                    anchorMsgCreatedAt = inboundTime;

                    console.log(`🔄 [${runId}] Yield guard adopted latest inbound ${latestMsg.id} (from ${adoptedFromInteractionId}). Continuing this run.`);

                    try {
                        await supabase.from('ai_action_logs').insert({
                            lead_id: Number(leadId),
                            action_type: 'yield_adopt_latest',
                            details: JSON.stringify({
                                runId,
                                from: adoptedFromInteractionId,
                                to: adoptedToInteractionId,
                                anchor: anchorInteractionId,
                                latest: latestMsg.id
                            }),
                            success: true
                        });
                    } catch (yieldAdoptLogErr) {
                        console.warn(`[${runId}] yield_adopt_latest log failed (non-blocking):`, yieldAdoptLogErr);
                    }

                    // Burst is already quiet here (see guard above), so we can stabilize and proceed immediately.
                    stabilized = true;
                    console.log(`✅ [${runId}] Stabilized after adopting latest (quiet ${lastInboundAgeMs}ms >= ${QUIET_WINDOW_MS}ms). Anchor: ${anchorInteractionId}`);
                    break;
                }

                // A newer msg arrived again after one-hop adoption → abort to avoid infinite loops
                decision = 'yield_to_newer';
                console.log(`🔄 [${runId}] Yielding: newer msg ${latestMsg.id} exists (ours was ${interactionId}) after adopt hop. Aborting this run.`);
                return respondNoSend({
                    aborted: "yield_to_newer",
                    runId,
                    debug: {
                        latest: latestMsg.id,
                        anchor: anchorInteractionId,
                        input: interactionId,
                        adopted_from: adoptedFromInteractionId,
                        adopted_to: adoptedToInteractionId
                    }
                }, 'yield_to_newer');
            }

            anchorInteractionId = latestMsg.id;

            if (lastInboundAgeMs >= QUIET_WINDOW_MS) {
                // Silence detected — user stopped typing
                stabilized = true;
                anchorMsgCreatedAt = inboundTime;
                anchorCreatedAt = latestMsg.created_at;
                console.log(`✅ [${runId}] Stabilized (quiet ${lastInboundAgeMs}ms >= ${QUIET_WINDOW_MS}ms). Anchor: ${anchorInteractionId}`);
                break;
            }

            // Still receiving messages — check hard stop
            if (Date.now() - debounceStart > MAX_WAIT_MS) {
                decision = 'quiet_window_timeout';
                console.warn(`🛑 [${runId}] Aborted: quiet-window timeout after ${MAX_WAIT_MS}ms. User still typing.`);
                return respondNoSend({ aborted: "quiet_window_timeout", runId }, 'quiet_window_timeout');
            }

            console.log(`🔄 [${runId}] Still typing (lastInboundAge=${lastInboundAgeMs}ms < ${QUIET_WINDOW_MS}ms). Waiting...`);
            }

            if (!stabilized) {
                decision = 'not_stabilized';
                return respondNoSend({ aborted: "not_stabilized", runId }, 'not_stabilized');
            }

            // Post-stabilize recheck: avoid responding from an older run if a newer inbound became visible after we broke
            // (e.g., DB visibility lag). This is critical for TEST 7 (No Response Mid-Burst).
            try {
                const { data: latestMsgPost } = await supabase
                    .from('interacoes')
                    .select('id, created_at')
                    .eq('lead_id', leadId)
                    .eq('instance_name', instanceName)
                    .eq('tipo', 'mensagem_cliente')
                    .order('id', { ascending: false })
                    .limit(1)
                    .maybeSingle();

            if (latestMsgPost?.id && anchorInteractionId && String(latestMsgPost.id) !== String(anchorInteractionId)) {
                const postInboundTime = latestMsgPost.created_at ? new Date(latestMsgPost.created_at).getTime() : NaN;
                const postAgeMs = Number.isFinite(postInboundTime) ? Date.now() - postInboundTime : NaN;
                if (Number.isFinite(postAgeMs)) lastInboundAgeMs = postAgeMs;

                // Burst still active -> do NOT adopt/wait; yield immediately.
                if (Number.isFinite(postAgeMs) && postAgeMs < QUIET_WINDOW_MS) {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding (post-stabilize): newer msg ${latestMsgPost.id} exists (ours was ${interactionId}) while burst active (age ${postAgeMs}ms < ${QUIET_WINDOW_MS}ms). Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsgPost.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }

                // If this run started before the latest inbound existed, it must not adopt/respond after quiet.
                if (Number.isFinite(postInboundTime) && debounceStart < postInboundTime) {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding (post-stabilize): newer msg ${latestMsgPost.id} exists (ours was ${interactionId}); run started before latest inbound (runStart<inbound). Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsgPost.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }

                // If the newest inbound is part of a tight burst, do NOT adopt from an older run even if quiet now.
                try {
                    const { data: lastTwoInbounds } = await supabase
                        .from('interacoes')
                        .select('id, created_at')
                        .eq('lead_id', leadId)
                        .eq('instance_name', instanceName)
                        .eq('tipo', 'mensagem_cliente')
                        .order('id', { ascending: false })
                        .limit(2);

                    if (lastTwoInbounds && lastTwoInbounds.length >= 2) {
                        const latestTs = new Date(lastTwoInbounds[0].created_at).getTime();
                        const prevTs = new Date(lastTwoInbounds[1].created_at).getTime();
                        const deltaMs = latestTs - prevTs;

                        if (Number.isFinite(deltaMs) && deltaMs < QUIET_WINDOW_MS) {
                            decision = 'yield_to_newer';
                            console.log(`🔄 [${runId}] Yielding (post-stabilize): newer msg ${latestMsgPost.id} exists (ours was ${interactionId}); quiet now but burst detected (delta ${deltaMs}ms < ${QUIET_WINDOW_MS}ms). Aborting this run.`);
                            return respondNoSend({
                                aborted: "yield_to_newer",
                                runId,
                                debug: {
                                    latest: latestMsgPost.id,
                                    anchor: anchorInteractionId,
                                    input: interactionId,
                                    adopted_from: adoptedFromInteractionId,
                                    adopted_to: adoptedToInteractionId,
                                    burst_delta_ms: deltaMs,
                                    burst_latest_id: lastTwoInbounds[0]?.id,
                                    burst_prev_id: lastTwoInbounds[1]?.id
                                }
                            }, 'yield_to_newer');
                        }
                    }
                } catch (burstDeltaErr) {
                    console.warn(`[${runId}] Burst delta check failed (non-blocking):`, burstDeltaErr);
                }

                // Quiet -> allow one-hop adoption.
                if (!adoptedLatestOnce) {
                    adoptedLatestOnce = true;
                    adoptedFromInteractionId = interactionId;
                    adoptedToInteractionId = latestMsgPost.id;

                    interactionId = latestMsgPost.id;
                    anchorInteractionId = latestMsgPost.id;
                    anchorCreatedAt = latestMsgPost.created_at || null;
                    if (Number.isFinite(postInboundTime)) anchorMsgCreatedAt = postInboundTime;

                    console.log(`🔄 [${runId}] Yield guard adopted latest inbound ${latestMsgPost.id} (from ${adoptedFromInteractionId}) post-stabilize. Continuing this run.`);

                    try {
                        await supabase.from('ai_action_logs').insert({
                            lead_id: Number(leadId),
                            action_type: 'yield_adopt_latest',
                            details: JSON.stringify({
                                runId,
                                from: adoptedFromInteractionId,
                                to: adoptedToInteractionId,
                                anchor: anchorInteractionId,
                                latest: latestMsgPost.id
                            }),
                            success: true
                        });
                    } catch (yieldAdoptLogErr) {
                        console.warn(`[${runId}] yield_adopt_latest log failed (non-blocking):`, yieldAdoptLogErr);
                    }
                } else {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding (post-stabilize): newer msg ${latestMsgPost.id} exists (ours was ${interactionId}) after adopt hop. Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsgPost.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }
            }
            } catch (postStabilizeErr) {
                console.warn(`[${runId}] Post-stabilize latest inbound check failed (fail-open):`, postStabilizeErr);
            }

            // If this run was invoked for an older interactionId than the stabilized anchor, yield.
            // This keeps burst handling deterministic: only the call for the latest inbound should proceed.
            if (!adoptedLatestOnce && inputInteractionId && anchorInteractionId && String(inputInteractionId) !== String(anchorInteractionId)) {
                decision = 'yield_to_newer';
                console.log(`🔄 [${runId}] Yielding: stabilized anchor ${anchorInteractionId} is newer than input ${inputInteractionId}. Aborting this run.`);
                return respondNoSend({
                    aborted: "yield_to_newer",
                    runId,
                    debug: {
                        latest: anchorInteractionId,
                        anchor: anchorInteractionId,
                        input: inputInteractionId,
                        adopted_from: adoptedFromInteractionId,
                        adopted_to: adoptedToInteractionId
                    }
                }, 'yield_to_newer');
            }

            // 4a. Ensure anchorMsgCreatedAt is set
            if (!anchorMsgCreatedAt && anchorInteractionId) {
                const { data: anchorRow } = await supabase
                    .from('interacoes')
                    .select('created_at')
                    .eq('id', anchorInteractionId)
                    .single();
                if (anchorRow) {
                    anchorMsgCreatedAt = new Date(anchorRow.created_at).getTime();
                    anchorCreatedAt = anchorRow.created_at;
                }
            }
        }

        // 5. RESOLVE REMOTE JID (Scoped to Instance)
        let resolvedRemoteJid = (payload.remoteJid || payload.remote_jid || null);

        if (!resolvedRemoteJid && anchorInteractionId) {
            const { data: anchorRow } = await supabase
                .from('interacoes')
                .select('remote_jid, instance_name')
                .eq('id', anchorInteractionId)
                .maybeSingle();

            // Only use if instance matches (safety check)
            if (anchorRow?.remote_jid && anchorRow.instance_name === instanceName) {
                resolvedRemoteJid = anchorRow.remote_jid;
            }
        }

        if (!resolvedRemoteJid) {
            // Fallback: Last valid remote_jid for this lead ON THIS INSTANCE
            const { data: lastValid } = await supabase.from('interacoes')
                .select('id, remote_jid')
                .eq('lead_id', leadId)
                .eq('instance_name', instanceName) // STRICT FILTER
                .not('remote_jid', 'is', null)
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (lastValid?.remote_jid) resolvedRemoteJid = lastValid.remote_jid;
        }

        console.log(`🎯 [${runId}] Resolved RemoteJid: ${resolvedRemoteJid || 'MISSING'} for Instance: ${instanceName}`);

        if (!resolvedRemoteJid) {
            console.error(`🛑 [${runId}] Aborting: No remoteJid found for this instance.`);
            return respondNoSend({ skipped: "missing_remoteJid" }, 'missing_remoteJid');
        }

        // --- CHECK #1: ANTI-SPAM (FIXED: anchor-based, not 60s cooldown) ---
        if (!isScheduledTrigger) {
            try {
                const { data: lastOutbound, error: lastOutError } = await supabase
                    .from('interacoes')
                    .select('id, created_at')
                    .eq('instance_name', instanceName)
                    .eq('remote_jid', resolvedRemoteJid)
                    .eq('wa_from_me', true)
                    .order('id', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (!lastOutError && lastOutbound) {
                    const lastTime = new Date(lastOutbound.created_at).getTime();
                    const nowTime = Date.now();
                    lastOutboundCreatedAt = lastOutbound.created_at;

                    // A) ALREADY REPLIED: outbound is NEWER than anchor -> duplicate run
                    if (anchorMsgCreatedAt && lastTime > anchorMsgCreatedAt) {
                        decision = 'already_replied';
                        console.warn(`🛑 [${runId}] Skipped: Already replied after anchor. lastOut=${lastOutbound.created_at} > anchor=${anchorCreatedAt}`);
                        return respondNoSend({ skipped: "already_replied", runId }, 'already_replied');
                    }

                    // B) TIGHT LOOP GUARD: block only true re-entry (no newer inbound than last outbound)
                    const TIGHT_LOOP_GUARD_MS = 5000;
                    const lastOutboundAtMs = Date.parse(lastOutbound.created_at);
                    const anchorAtMs = anchorCreatedAt ? Date.parse(anchorCreatedAt) : NaN;
                    const ageMs = nowTime - lastOutboundAtMs;

                    if (ageMs < TIGHT_LOOP_GUARD_MS) {
                        if (anchorCreatedAt && Number.isFinite(anchorAtMs) && anchorAtMs > lastOutboundAtMs) {
                            console.log(`[${runId}] Tight-loop bypass: inbound(${anchorCreatedAt}) is newer than last outbound(${lastOutbound.created_at}).`);
                        } else {
                            decision = 'tight_loop_guard';
                            console.warn(`🛑 [${runId}] Skipped: Tight loop guard. Last sent ${ageMs / 1000}s ago.`);
                            return respondNoSend({ skipped: "tight_loop_guard", runId }, 'tight_loop_guard');
                        }
                    }

                    // C) ANCHOR IS NEWER -> new inbound after bot reply -> ALLOW
                    decision = 'allowed_new_inbound';
                    console.log(`✅ [${runId}] Allowed: anchor is newer than last outbound. Responding to follow-up.`);
                }
            } catch (err) {
                console.error(`⚠️ [${runId}] Anti-Spam Check #1 failed (non-blocking):`, err);
                // Fail open - continue
            }
        } else {
            decision = 'scheduled_trigger_skip_anti_spam';
        }

        // 6. BUILD CONTEXT (Scoped History)
        currentStage = normalizeStage(lead.status_pipeline) || lead.pipeline_stage || 'novo_lead';
        configStageKey = isFollowUpTrigger ? 'follow_up' : currentStage;
        effectiveAgentType = isFollowUpTrigger ? 'follow_up' : 'standard';

        let { data: stageConfig } = await supabase
            .from('ai_stage_config')
            .select('*')
            .eq('org_id', leadOrgId)
            .eq('pipeline_stage', configStageKey)
            .maybeSingle();

        // Disparos routing only applies to stage "respondeu" outside follow_up trigger.
        if (!isFollowUpTrigger && currentStage === 'respondeu') {
            try {
                const { data: latestBroadcast, error: broadcastLookupErr } = await supabase
                    .from('broadcast_recipients')
                    .select('id, sent_at, created_at')
                    .eq('lead_id', Number(leadId))
                    .eq('status', 'sent')
                    .order('sent_at', { ascending: false, nullsFirst: false })
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (broadcastLookupErr) {
                    console.warn(`⚠️ [${runId}] Failed broadcast_recipients lookup (non-blocking):`, broadcastLookupErr.message);
                } else if (latestBroadcast) {
                    const broadcastSentAt = String(latestBroadcast.sent_at || latestBroadcast.created_at || '').trim() || null;
                    let outboundAfterBroadcast = false;
                    let isFirstInboundAfterBroadcast = false;

                    if (broadcastSentAt) {
                        const { count: outboundCount, error: outboundLookupErr } = await supabase
                            .from('interacoes')
                            .select('id', { count: 'exact', head: true })
                            .eq('lead_id', leadId)
                            .eq('instance_name', instanceName)
                            .eq('wa_from_me', true)
                            .gt('created_at', broadcastSentAt);

                        if (outboundLookupErr) {
                            console.warn(`⚠️ [${runId}] Failed outbound-after-broadcast lookup (non-blocking):`, outboundLookupErr.message);
                        } else {
                            outboundAfterBroadcast = Number(outboundCount || 0) > 0;
                        }

                        if (anchorInteractionId) {
                            const { data: firstInboundAfterBroadcast, error: inboundLookupErr } = await supabase
                                .from('interacoes')
                                .select('id, created_at')
                                .eq('lead_id', leadId)
                                .eq('instance_name', instanceName)
                                .eq('wa_from_me', false)
                                .eq('tipo', 'mensagem_cliente')
                                .gt('created_at', broadcastSentAt)
                                .order('id', { ascending: true })
                                .limit(1)
                                .maybeSingle();

                            if (inboundLookupErr) {
                                console.warn(`⚠️ [${runId}] Failed first-inbound-after-broadcast lookup (non-blocking):`, inboundLookupErr.message);
                            } else {
                                isFirstInboundAfterBroadcast = !!firstInboundAfterBroadcast
                                    && String(firstInboundAfterBroadcast.id) === String(anchorInteractionId);
                            }
                        }
                    }

                    if (!outboundAfterBroadcast && isFirstInboundAfterBroadcast) {
                        const { data: disparosConfig, error: disparosErr } = await supabase
                            .from('ai_stage_config')
                            .select('*')
                            .eq('org_id', leadOrgId)
                            .eq('pipeline_stage', 'agente_disparos')
                            .maybeSingle();

                        if (disparosErr) {
                            console.warn(`⚠️ [${runId}] Failed to load agente_disparos config (non-blocking):`, disparosErr.message);
                        } else if (disparosConfig?.is_active) {
                            stageConfig = disparosConfig;
                            effectiveAgentType = 'disparos';
                            console.log(`🎯 [${runId}] Routed to Agente de Disparos (first inbound after active broadcast)`);
                            try {
                                await supabase.from('ai_action_logs').insert({
                                    org_id: leadOrgId,
                                    lead_id: Number(leadId),
                                    action_type: 'agent_routed_to_disparos',
                                    details: JSON.stringify({
                                        runId,
                                        lead_id: Number(leadId),
                                        lead_canal: lead?.canal || null,
                                        broadcast_recipient_found: true,
                                        broadcast_sent_at: broadcastSentAt,
                                        outbound_after_broadcast: false,
                                        first_inbound_after_broadcast: true,
                                        anchor_interaction_id: anchorInteractionId || null,
                                        effective_agent: 'disparos',
                                    }),
                                    success: true,
                                });
                            } catch (routeLogErr) {
                                console.warn(`[${runId}] agent_routed_to_disparos log failed (non-blocking):`, routeLogErr);
                            }
                        }
                    }
                }
            } catch (routingErr) {
                console.warn(`⚠️ [${runId}] Disparos routing exception (non-blocking):`, routingErr);
            }
        }

        if (!stageConfig && !isFollowUpTrigger) {
            const { data: fallback } = await supabase
                .from('ai_stage_config')
                .select('*')
                .eq('org_id', leadOrgId)
                .eq('pipeline_stage', 'novo_lead')
                .maybeSingle();
            stageConfig = fallback;
        }

        // FIX: Stage Inactive → use fallback prompt instead of skipping
        let stagePromptText = '';
        if (!stageConfig?.is_active) {
            stageFallbackUsed = true;
            try {
                const { data: supportStageConfig, error: supportStageErr } = await supabase
                    .from('ai_stage_config')
                    .select('is_active, prompt_override, default_prompt')
                    .eq('org_id', leadOrgId)
                    .eq('pipeline_stage', 'assistente_geral')
                    .maybeSingle();

                if (supportStageErr) {
                    console.warn(`[${runId}] Support prompt lookup failed (non-blocking):`, supportStageErr.message);
                }

                const supportPromptCandidate =
                    supportStageConfig?.is_active !== false
                        ? String(supportStageConfig?.prompt_override || supportStageConfig?.default_prompt || '').trim()
                        : '';

                if (supportPromptCandidate) {
                    stagePromptText = supportPromptCandidate;
                    console.log(`[${runId}] Stage '${configStageKey}' inactive/missing. Using 'assistente_geral' prompt. stageFallbackUsed=true`);
                } else {
                    stagePromptText = STAGE_FALLBACK_PROMPT;
                    console.log(`[${runId}] Stage '${configStageKey}' inactive/missing. Using FAQ fallback prompt. stageFallbackUsed=true`);
                }
            } catch (supportPromptErr: any) {
                stagePromptText = STAGE_FALLBACK_PROMPT;
                console.warn(`[${runId}] Support prompt fallback exception (using hardcoded fallback):`, supportPromptErr?.message || supportPromptErr);
            }
        } else {
            stagePromptText = stageConfig.prompt_override || stageConfig.default_prompt || '';
            console.log(`📝 [${runId}] Stage '${configStageKey}' prompt source: ${stageConfig.prompt_override ? 'OVERRIDE' : 'DEFAULT'}. Length: ${stagePromptText.length}. Agent=${effectiveAgentType}`);
            if (stagePromptText.length > 0 && stagePromptText.length < 200) {
                console.warn(`🚨 [${runId}] CRITICAL: Stage prompt for '${configStageKey}' is suspiciously short (${stagePromptText.length} chars). Likely a placeholder seed. Check ai_stage_config.default_prompt for org_id=${leadOrgId}.`);
            }
        }

        if (!isScheduledTrigger && anchorInteractionId) {
            const mediaWaitMaxRaw = Number.parseInt(Deno.env.get('MEDIA_WAIT_MAX_MS') || '15000', 10);
            const mediaWaitIntervalRaw = Number.parseInt(Deno.env.get('MEDIA_WAIT_INTERVAL_MS') || '1500', 10);
            const mediaWaitMaxMs = Number.isFinite(mediaWaitMaxRaw)
                ? Math.max(1000, Math.min(mediaWaitMaxRaw, 30000))
                : 15000;
            const mediaWaitIntervalMs = Number.isFinite(mediaWaitIntervalRaw)
                ? Math.max(300, Math.min(mediaWaitIntervalRaw, 5000))
                : 1500;

            const mediaWaitStartedAt = Date.now();
            let mediaPending = false;

            while (true) {
                const { data: anchorInteraction, error: anchorInteractionError } = await supabase
                    .from('interacoes')
                    .select('id, attachment_type, attachment_ready')
                    .eq('id', Number(anchorInteractionId))
                    .eq('lead_id', leadId)
                    .eq('instance_name', instanceName)
                    .eq('tipo', 'mensagem_cliente')
                    .maybeSingle();

                if (anchorInteractionError) {
                    console.warn(`⚠️ [${runId}] Media wait check failed (non-blocking):`, anchorInteractionError.message);
                    break;
                }

                const hasAttachment = Boolean(anchorInteraction?.attachment_type);
                const isReady = anchorInteraction?.attachment_ready === true;
                mediaPending = hasAttachment && !isReady;

                if (!mediaPending) {
                    if (Date.now() - mediaWaitStartedAt >= mediaWaitIntervalMs) {
                        console.log(`✅ [${runId}] Media wait finished in ${Date.now() - mediaWaitStartedAt}ms for interaction ${anchorInteractionId}.`);
                    }
                    break;
                }

                const elapsedMs = Date.now() - mediaWaitStartedAt;
                if (elapsedMs >= mediaWaitMaxMs) {
                    console.warn(`⏱️ [${runId}] Media wait timeout after ${elapsedMs}ms (interaction ${anchorInteractionId}). Proceeding without ready attachment.`);
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, mediaWaitIntervalMs));
            }
        }

        // HISTORY SCOPED TO INSTANCE
        const { data: history } = await supabase
            .from('interacoes')
            .select('*')
            .eq('lead_id', leadId)
            .eq('instance_name', instanceName) // STRICT FILTER
            .order('id', { ascending: false })
            .limit(30); // Use 30 for context aggregation

        // BURST AGGREGATION: collect consecutive client msgs since last outbound (within 90s)
        let chatHistory = (history || []).reverse().map((m: any) => {
            const role = m.tipo === 'mensagem_cliente' ? 'user' : 'assistant';
            const attachmentType = String(m?.attachment_type || '').toLowerCase();
            const attachmentUrl = m?.attachment_url ? String(m.attachment_url) : null;
            const normalizedText = normalizeHistoryText(m?.mensagem, attachmentUrl);

            if (role === 'user' && attachmentType === 'image' && attachmentUrl) {
                return {
                    role,
                    content: [
                        { type: 'text', text: normalizedText || 'Imagem enviada pelo cliente.' },
                        { type: 'image_url', image_url: { url: attachmentUrl } }
                    ],
                    created_at: m.created_at
                };
            }

            return {
                role,
                content: normalizedText,
                created_at: m.created_at
            };
        });

        // Build aggregated burst block from raw history (walk backward from newest)
        const burstMsgs: string[] = [];
        const anchorTs = anchorMsgCreatedAt || Date.now();
        const cutoffTs = anchorTs - (BURST_LOOKBACK_S * 1000); // 90s lookback
        if (history && history.length > 0) {
            // history is desc order (newest first) — walk forward = newest to oldest
            for (const m of history) {
                if (m.wa_from_me || m.tipo !== 'mensagem_cliente') break; // hit an outbound → stop
                const mTs = new Date(m.created_at).getTime();
                if (mTs < cutoffTs) break; // too old
                burstMsgs.push(m.mensagem);
            }
        }
        burstMsgs.reverse(); // chronological order
        const lastUserTextAggregated = burstMsgs.join('\n');
        aggregatedBurstCount = burstMsgs.length;
        aggregatedChars = lastUserTextAggregated.length;
        if (aggregatedBurstCount > 1) {
            console.log(`🧩 [${runId}] Burst aggregated: ${aggregatedBurstCount} msgs, ${aggregatedChars} chars.`);
        }

        // Replace the last user block in chatHistory with the burst-aggregated text
        if (chatHistory.length > 0 && aggregatedBurstCount > 0) {
            // Remove all trailing user messages
            let idx = chatHistory.length - 1;
            while (idx >= 0 && chatHistory[idx].role === 'user') idx--;
            const trailingUserMessages = chatHistory.slice(idx + 1);
            const trailingImageParts = trailingUserMessages.flatMap((m: any) => {
                if (!Array.isArray(m?.content)) return [];
                return m.content.filter((part: any) => part?.type === 'image_url' && part?.image_url?.url);
            });

            chatHistory = chatHistory.slice(0, idx + 1);

            // Push single aggregated block
            if (trailingImageParts.length > 0) {
                chatHistory.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: lastUserTextAggregated || 'Imagem enviada pelo cliente.' },
                        ...trailingImageParts
                    ]
                });
            } else {
                chatHistory.push({ role: 'user', content: lastUserTextAggregated });
            }
        }

        // Strip created_at from chatHistory before sending to LLM
        chatHistory = chatHistory.map((m: any) => ({ role: m.role, content: m.content }));

        // Extract last user text for KB/web search
        const lastUserText = lastUserTextAggregated || (
            chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user'
                ? extractTextFromMessageContent(chatHistory[chatHistory.length - 1].content)
                : ''
        );

        if (history && history.length > 0) {
            for (const interaction of history) {
                const role = interaction?.tipo === 'mensagem_cliente' ? 'user' : 'assistant';
                if (role !== 'assistant') continue;
                const attachmentUrl = interaction?.attachment_url ? String(interaction.attachment_url) : null;
                const normalizedText = normalizeHistoryText(interaction?.mensagem, attachmentUrl);
                if (!normalizedText) continue;
                lastAssistantMessageText = normalizedText;
                break;
            }
        }

        const deterministicSignals = extractDeterministicLeadSignals(
            lastUserTextAggregated || '',
            currentStage,
            lastAssistantMessageText,
            lead
        );
        if (Object.keys(deterministicSignals.fields).length > 0) {
            const deterministicFieldResult = await executeLeadFieldUpdate(
                supabase,
                leadId,
                deterministicSignals.fields,
                lead,
                runId,
                lastUserTextAggregated || ''
            );
            if (deterministicFieldResult.writtenCount > 0) {
                if (deterministicSignals.fields.customer_type) {
                    lead.tipo_cliente = normalizeCustomerType(deterministicSignals.fields.customer_type.value) || lead.tipo_cliente;
                }
                if (deterministicSignals.fields.estimated_value_brl) {
                    lead.valor_estimado = normalizeMoneyBRL(deterministicSignals.fields.estimated_value_brl.value) || lead.valor_estimado;
                }
                if (deterministicSignals.fields.consumption_kwh_month) {
                    lead.consumo_kwh = normalizeKwh(deterministicSignals.fields.consumption_kwh_month.value) || lead.consumo_kwh;
                }
                if (deterministicSignals.fields.city) {
                    lead.cidade = String(deterministicSignals.fields.city.value || '').trim() || lead.cidade;
                }
            }

            leadUpdatesSummary = {
                ...(leadUpdatesSummary || {}),
                deterministic_fields: Object.fromEntries(
                    Object.entries(deterministicSignals.fields).map(([key, value]) => [key, value?.value ?? null])
                ),
            };
        }

        if (Object.keys(deterministicSignals.stageData).length > 0) {
            const deterministicStageResult = await executeLeadStageDataUpdate(
                supabase,
                leadId,
                currentStage,
                deterministicSignals.stageData,
                lead,
                runId
            );
            if (deterministicStageResult.writtenCount > 0) {
                const namespace = getStageDataNamespace(currentStage);
                if (namespace) {
                    const currentRoot = normalizeLeadStageDataRoot(lead?.lead_stage_data);
                    const currentNamespaceData =
                        currentRoot[namespace] && typeof currentRoot[namespace] === 'object' && !Array.isArray(currentRoot[namespace])
                            ? currentRoot[namespace] as Record<string, any>
                            : {};
                    lead.lead_stage_data = {
                        ...currentRoot,
                        [namespace]: {
                            ...currentNamespaceData,
                            ...normalizeStageDataPayload(deterministicSignals.stageData, namespace),
                            updated_at: new Date().toISOString(),
                        }
                    };
                }
            }

            leadUpdatesSummary = {
                ...(leadUpdatesSummary || {}),
                deterministic_stage_data: deterministicSignals.stageData,
            };
        }

        structuredLeadSnapshot = buildStructuredLeadSnapshot(lead, currentStage);

        scheduleTimezone = String(settings?.timezone || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
        scheduleWindowConfigNormalized = normalizeAppointmentWindowConfig((settings as any)?.appointment_window_config);
        autoSchedulePolicy = resolveAutoSchedulePolicy(settings);
        schedulePolicyMode = autoSchedulePolicy.mode;
        scheduleCallMinDays = autoSchedulePolicy.callMinDays;
        scheduleVisitMinDays = autoSchedulePolicy.visitMinDays;
        const busyRanges: Array<{ startMs: number; endMs: number }> = [];

        try {
            const nowIso = new Date().toISOString();
            const { data: busyAppointments, error: busyErr } = await supabase
                .from('appointments')
                .select('start_at, end_at, status, type')
                .eq('org_id', leadOrgId)
                .eq('user_id', lead.user_id)
                .in('status', ['scheduled', 'confirmed'])
                .gte('end_at', nowIso)
                .order('start_at', { ascending: true })
                .limit(500);

            if (busyErr) {
                console.warn(`⚠️ [${runId}] Scheduling busy appointments load failed (non-blocking):`, busyErr.message);
            } else {
                for (const appt of (busyAppointments || [])) {
                    const start = new Date(appt.start_at);
                    const end = new Date(appt.end_at);
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
                    busyRanges.push({ startMs: start.getTime(), endMs: end.getTime() });
                }
                scheduleBusyCount = busyRanges.length;
            }
        } catch (busyLoadErr: any) {
            console.warn(`⚠️ [${runId}] Scheduling busy appointments exception (non-blocking):`, busyLoadErr?.message || busyLoadErr);
        }

        const nowForSlots = new Date();
        const localNowParts = getZonedDateParts(nowForSlots, scheduleTimezone);
        isAfterHoursForCall = localNowParts.hour >= 18;
        availableSlotsByType = {
            call: generateAvailableSlotsForType({
                now: nowForSlots,
                timeZone: scheduleTimezone,
                windowRule: scheduleWindowConfigNormalized.call,
                busyRanges,
                minLeadDays: scheduleCallMinDays,
            }),
            visit: generateAvailableSlotsForType({
                now: nowForSlots,
                timeZone: scheduleTimezone,
                windowRule: scheduleWindowConfigNormalized.visit,
                busyRanges,
                minLeadDays: scheduleVisitMinDays,
            }),
            meeting: generateAvailableSlotsForType({
                now: nowForSlots,
                timeZone: scheduleTimezone,
                windowRule: scheduleWindowConfigNormalized.meeting,
                busyRanges,
            }),
            installation: generateAvailableSlotsForType({
                now: nowForSlots,
                timeZone: scheduleTimezone,
                windowRule: scheduleWindowConfigNormalized.installation,
                busyRanges,
            }),
        };
        if (isAfterHoursForCall) {
            availableSlotsByType.call = [];
        }
        scheduleCatalogText = buildSlotCatalogText(availableSlotsByType, scheduleTimezone, nowForSlots);

        const openAIApiKey = Deno.env.get('OPENAI_API_KEY') || '';
        const openai = openAIApiKey ? new OpenAI({ apiKey: openAIApiKey }) : null;

        // --- CRM COMMENTS CONTEXT ---
        let crmCommentsBlock = '';
        let crmCommentsCount = 0;
        try {
            const { data: crmComments, error: crmCommentsErr } = await supabase
                .from('comentarios_leads')
                .select('texto, autor, created_at')
                .eq('lead_id', Number(leadId))
                .order('created_at', { ascending: false })
                .limit(12);

            if (crmCommentsErr) {
                console.warn(`⚠️ [${runId}] CRM comments load error (non-blocking):`, crmCommentsErr.message);
            } else if (crmComments && crmComments.length > 0) {
                crmCommentsCount = crmComments.length;
                crmCommentsBlock = crmComments
                    .slice()
                    .reverse()
                    .map((c: any) => {
                        const author = String(c?.autor || 'CRM').trim();
                        const text = String(c?.texto || '').replace(/\s+/g, ' ').trim().substring(0, 220);
                        const at = c?.created_at ? String(c.created_at).substring(0, 19) : 'sem_data';
                        return `- [${at}] ${author}: ${text}`;
                    })
                    .join('\n');
                console.log(`🗂️ [${runId}] CRM comments loaded: ${crmCommentsCount}`);
            }
        } catch (crmCommentErr: any) {
            console.warn(`⚠️ [${runId}] CRM comments exception (non-blocking):`, crmCommentErr?.message || crmCommentErr);
        }

        // --- LATEST PROPOSAL SNAPSHOT (avoid repeated asks / preserve continuity) ---
        let latestProposalBlock = '';
        try {
            const { data: latestProposal, error: latestProposalErr } = await supabase
                .from('propostas')
                .select('id, status, valor_projeto, consumo_kwh, potencia_kw, paineis_qtd, economia_mensal, payback_anos, created_at')
                .eq('lead_id', Number(leadId))
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestProposalErr) {
                console.warn(`⚠️ [${runId}] Latest proposal load error (non-blocking):`, latestProposalErr.message);
            } else if (latestProposal) {
                latestProposalBlock =
                    `id=${latestProposal.id}, status=${latestProposal.status}, valor_projeto=${latestProposal.valor_projeto}, ` +
                    `consumo_kwh=${latestProposal.consumo_kwh}, potencia_kw=${latestProposal.potencia_kw}, ` +
                    `paineis_qtd=${latestProposal.paineis_qtd}, economia_mensal=${latestProposal.economia_mensal}, ` +
                    `payback_anos=${latestProposal.payback_anos}, created_at=${latestProposal.created_at}`;
            }
        } catch (latestProposalErr: any) {
            console.warn(`⚠️ [${runId}] Latest proposal exception (non-blocking):`, latestProposalErr?.message || latestProposalErr);
        }

        // --- RAG: INTERNAL KB SEARCH ---
        let kbBlock = '';
        let companyNameForPrompt = '';

        // M7.2: strict org source (no silent fallback to user_id/user metadata).
        let kbOrgId = leadOrgId;
        let kbOrgIdSource = 'lead.org_id';

        if (settings.org_id && leadOrgId && String(settings.org_id) !== String(leadOrgId)) {
            console.warn(`⚠️ [${runId}] ai_settings.org_id (${settings.org_id}) differs from lead.org_id (${leadOrgId}). Using lead.org_id.`);
            kbOrgId = leadOrgId;
            kbOrgIdSource = 'lead.org_id';
        }

        try {
            if (kbOrgId) {
                const { data: companyProfileForName, error: companyNameErr } = await supabase
                    .from('company_profile')
                    .select('company_name, headquarters_city, headquarters_state, headquarters_address, service_area_summary, business_hours_text, public_phone, public_whatsapp, technical_visit_is_free, technical_visit_fee_notes, supports_financing, supports_card_installments, payment_policy_summary')
                    .eq('org_id', kbOrgId)
                    .maybeSingle();

                if (!companyNameErr) {
                    companyNameForPrompt = String(companyProfileForName?.company_name || '').trim();
                    companyProfileFacts = {
                        company_name: companyProfileForName?.company_name || null,
                        headquarters_city: companyProfileForName?.headquarters_city || null,
                        headquarters_state: companyProfileForName?.headquarters_state || null,
                        headquarters_address: companyProfileForName?.headquarters_address || null,
                        service_area_summary: companyProfileForName?.service_area_summary || null,
                        business_hours_text: companyProfileForName?.business_hours_text || null,
                        public_phone: companyProfileForName?.public_phone || null,
                        public_whatsapp: companyProfileForName?.public_whatsapp || null,
                        technical_visit_is_free: typeof companyProfileForName?.technical_visit_is_free === 'boolean'
                            ? companyProfileForName.technical_visit_is_free
                            : null,
                        technical_visit_fee_notes: companyProfileForName?.technical_visit_fee_notes || null,
                        supports_financing: typeof companyProfileForName?.supports_financing === 'boolean'
                            ? companyProfileForName.supports_financing
                            : null,
                        supports_card_installments: typeof companyProfileForName?.supports_card_installments === 'boolean'
                            ? companyProfileForName.supports_card_installments
                            : null,
                        payment_policy_summary: companyProfileForName?.payment_policy_summary || null,
                    };
                }
            }
        } catch (companyNameFetchErr: any) {
            console.warn(`⚠️ [${runId}] Company name load exception (non-blocking):`, companyNameFetchErr?.message || companyNameFetchErr);
        }

        try {
            if (lastUserText && kbOrgId) {
                const { data: kbResults, error: kbErr } = await supabase.rpc('knowledge_search_v3', {
                    p_org_id: kbOrgId,
                    p_query_text: lastUserText,
                    p_limit: 6
                });

                if (kbErr) {
                    kbError = kbErr.message;
                    console.warn(`⚠️ [${runId}] KB search error (non-blocking):`, kbErr.message);
                } else if (kbResults && kbResults.length > 0) {
                    kbHitsCount = kbResults.length;
                    const kbLines: string[] = [];
                    if (companyNameForPrompt) {
                        kbLines.push(`[empresa_nome] ${companyNameForPrompt}`);
                    }
                    for (const item of kbResults) {
                        const snippet = (item.content_snippet || '').substring(0, 400);
                        if (item.item_type === 'company_info') {
                            kbLines.push(`[empresa] ${item.content_snippet}`);
                        } else if (item.item_type === 'objection') {
                            kbLines.push(`[objecao] P: ${item.title_or_name} R: ${snippet}`);
                        } else if (item.item_type === 'testimonial') {
                            kbLines.push(`[depoimento] ${item.title_or_name}: ${snippet}`);
                        } else {
                            kbLines.push(`[${item.item_type}] ${item.title_or_name}: ${snippet}`);
                        }
                    }
                    kbBlock = kbLines.join('\n');
                    kbChars = kbBlock.length;
                    console.log(`📚 [${runId}] KB search (Org: ${kbOrgId} | Src: ${kbOrgIdSource}) returned ${kbHitsCount} hits, ${kbChars} chars.`);
                }
            }
        } catch (err: any) {
            kbError = err?.message || String(err);
            console.warn(`⚠️ [${runId}] KB search exception (non-blocking):`, kbError);
        }

        if (!kbBlock && companyNameForPrompt) {
            kbBlock = `[empresa_nome] ${companyNameForPrompt}`;
            kbChars = kbBlock.length;
        }

        // --- WEB SEARCH FALLBACK (OpenAI Web Search -> Serper) ---
        let webBlock = '';
        let webNoKeyFallbackResponse: { action: string; content: string; _web_search: string } | null = null;
        const serperKey = Deno.env.get('SERPER_API_KEY') || Deno.env.get('GOOGLE_SERPER_API_KEY');
        const webSearchEnabled = String(Deno.env.get('AI_WEB_SEARCH_ENABLED') || 'true').toLowerCase() !== 'false';
        const missingEssentialContext = detectSolarIntentAndMissing(lastUserText || '', lead).missing.length > 0;
        const shouldTryWebSearch = webSearchEnabled && kbChars < 400 && looksLikeQuestion(lastUserText) && !missingEssentialContext;
        const sanitizedWebQuery = sanitizeQuery(lastUserText);
        const webQuery = sanitizedWebQuery.length > 5 ? `energia solar Brasil ${sanitizedWebQuery}` : '';

        try {
            if (shouldTryWebSearch && webQuery) {
                if (webSearchPerformedThisRun) {
                    webSearchStatus = 'already_performed_this_run';
                    await logWebSearch('web_search_skipped', {
                        query: webQuery,
                        results_count: 0,
                        reason: 'already_performed_this_run',
                        latency_ms: 0
                    });
                } else {
                    const nowMinus60sIso = new Date(Date.now() - 60_000).toISOString();
                    const { count: recentWebSearchCount, error: webRateErr } = await supabase
                        .from('ai_action_logs')
                        .select('id', { count: 'exact', head: true })
                        .eq('lead_id', Number(leadId))
                        .eq('action_type', 'web_search_performed')
                        .gte('created_at', nowMinus60sIso);

                    if (webRateErr) {
                        webSearchStatus = 'rate_limit_check_error';
                        webError = webRateErr.message;
                        await logWebSearch('web_search_skipped', {
                            query: webQuery,
                            results_count: 0,
                            reason: 'rate_limit_check_error',
                            latency_ms: 0
                        });
                    } else if ((recentWebSearchCount || 0) > 0) {
                        webSearchStatus = 'rate_limited';
                        await logWebSearch('web_search_skipped', {
                            query: webQuery,
                            results_count: 0,
                            reason: 'recent_search_60s',
                            latency_ms: 0
                        });
                    } else {
                        console.log(`🌐 [${runId}] Web search triggered. Query: "${webQuery}"`);
                        const webStart = Date.now();

                        if (openAIApiKey) {
                            const openAiSearch = await performOpenAIWebSearch(openAIApiKey, webQuery);
                            if (openAiSearch.ok) {
                                webUsed = true;
                                webResultsCount = 1;
                                webSearchStatus = 'performed_openai';
                                webSearchPerformedThisRun = true;
                                webBlock = `- ${openAiSearch.text.substring(0, 1200)}`;
                                await logWebSearch('web_search_performed', {
                                    query: webQuery,
                                    results_count: webResultsCount,
                                    latency_ms: Date.now() - webStart,
                                    provider: 'openai'
                                });
                            } else {
                                webError = openAiSearch.error || 'openai_search_failed';
                                console.warn(`⚠️ [${runId}] OpenAI web search failed, fallback to Serper: ${webError}`);
                            }
                        }

                        if (!webUsed) {
                            if (!serperKey) {
                                webSearchStatus = 'skipped_no_key';
                                webError = webError || 'missing_serper_key';
                                webNoKeyFallbackResponse = {
                                    action: 'send_message',
                                    content: 'Posso te orientar com base no fluxo padrão. Para te passar algo mais preciso, me confirma sua cidade/UF e concessionária de energia.',
                                    _web_search: 'skipped_no_key'
                                };
                                await logWebSearch('web_search_skipped', {
                                    query: webQuery,
                                    results_count: 0,
                                    reason: webError,
                                    latency_ms: Date.now() - webStart
                                });
                            } else {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 8000);
                                let serperResp: Response;
                                try {
                                    serperResp = await fetch('https://google.serper.dev/search', {
                                        method: 'POST',
                                        headers: {
                                            'X-API-KEY': serperKey,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({ q: webQuery, gl: 'br', hl: 'pt', num: 3 }),
                                        signal: controller.signal
                                    });
                                } finally {
                                    clearTimeout(timeoutId);
                                }

                                const latencyMs = Date.now() - webStart;
                                if (serperResp.ok) {
                                    const serperData = await serperResp.json();
                                    const organic = Array.isArray(serperData?.organic) ? serperData.organic : [];
                                    const topResults = organic.slice(0, 3).map((r: any) => {
                                        const title = String(r?.title || '').trim().substring(0, 120);
                                        const snippet = String(r?.snippet || '').replace(/\s+/g, ' ').trim().substring(0, 200);
                                        const domain = extractDomain(String(r?.link || ''));
                                        return { title, snippet, domain };
                                    }).filter((r: any) => r.title || r.snippet);

                                    webUsed = true;
                                    webResultsCount = topResults.length;
                                    webSearchStatus = 'performed_serper';
                                    webSearchPerformedThisRun = true;

                                    const webLines: string[] = [];
                                    for (const r of topResults) {
                                        const source = r.domain ? ` (fonte: ${r.domain})` : '';
                                        webLines.push(`- ${r.title || 'Sem título'}: ${r.snippet || '(sem resumo)'}${source}`);
                                    }
                                    webBlock = webLines.join('\n');

                                    await logWebSearch('web_search_performed', {
                                        query: webQuery,
                                        results_count: webResultsCount,
                                        latency_ms: latencyMs,
                                        provider: 'serper'
                                    });
                                    console.log(`🌐 [${runId}] Serper web search returned ${webResultsCount} results.`);
                                } else {
                                    webSearchStatus = 'http_error';
                                    webError = `Serper HTTP ${serperResp.status}`;
                                    await logWebSearch('web_search_skipped', {
                                        query: webQuery,
                                        results_count: 0,
                                        reason: `http_${serperResp.status}`,
                                        latency_ms: latencyMs,
                                        provider: 'serper'
                                    });
                                    console.warn(`⚠️ [${runId}] Serper API error: ${serperResp.status}`);
                                }
                            }
                        }
                    }
                }
            }
        } catch (err: any) {
            webSearchStatus = err?.name === 'AbortError' ? 'timeout' : 'error';
            webError = err?.message || String(err);
            await logWebSearch('web_search_skipped', {
                query: webQuery || null,
                results_count: 0,
                reason: webSearchStatus,
                latency_ms: 0
            });
            console.warn(`⚠️ [${runId}] Web search exception (non-blocking):`, webError);
        }


        // Initialize gate (scoped outside for post-processing)
        let gate: { intent: string | null; missing: string[]; directive: string | null; } = { intent: null, missing: [], directive: null };

        // 7. OPENAI CALL
        let aiRes: AIResponse | null = null;

        const deterministicCompanyReply = !isScheduledTrigger
            ? buildCompanyFactualReply(lastUserTextAggregated || lastUserText || '', companyProfileFacts, currentStage, lead)
            : null;
        if (deterministicCompanyReply) {
            aiRes = {
                action: 'send_message',
                content: deterministicCompanyReply,
            } as any;
            console.log(`🏢 [${runId}] company_factual_reply_used`);
        }

        // --- TEST 11: DETERMINISTIC FOLLOWUP TRIGGER ---
        console.log(`Debug Aggregated: ${JSON.stringify(lastUserTextAggregated)}`);
        if (lastUserTextAggregated.includes('[[SMOKE_FOLLOWUP_TEST__9f3c1a]]')) {
            console.log(`🧪 [${runId}] Test 11 Triggered: Forcing create_followup`);
            aiRes = {
                action: 'send_message',
                content: 'Ok! Vou criar a tarefa de follow-up agora.',
                task: {
                    title: 'SMOKE_FOLLOWUP_OK - Aguardar conta de luz',
                    notes: 'Teste determinístico do follow-up.',
                    due_at: '2026-02-10T12:00:00-03:00',
                    priority: 'medium',
                    channel: 'whatsapp'
                }
            };
        }

        // --- TEST 14: DETERMINISTIC PROPOSAL TRIGGER ---
        if (!aiRes && (lastUserTextAggregated.includes('PROPOSAL_TEST_A') || lastUserTextAggregated.includes('PROPOSAL_TEST_B'))) {
            console.log(`🧪 [${runId}] Test 14 Triggered: Forcing create_proposal_draft`);
            aiRes = {
                action: 'create_proposal_draft',
                content: 'Preparei um rascunho de proposta com base nos dados informados.',
                proposal: {
                    valor_projeto: { value: 25000, confidence: 'high', source: 'user' },
                    consumo_kwh: { value: 350, confidence: 'high', source: 'user' },
                    potencia_kw: { value: 4.5, confidence: 'medium', source: 'estimated' },
                    paineis_qtd: { value: 10, confidence: 'medium', source: 'estimated' },
                    economia_mensal: { value: 300, confidence: 'medium', source: 'estimated' },
                    payback_anos: { value: 5, confidence: 'medium', source: 'estimated' },
                    assumptions: 'Telhado colonial, orientação norte, sem sombreamento.'
                }
            };
        }

        // --- TEST 18: HUMANIZATION FAIL TRIGGER ---
        if (!aiRes && lastUserTextAggregated.includes('[[TEST_HUMANIZATION_FAIL]]')) {
            console.log(`🧪 [${runId}] Test 18 Triggered: Forcing UNCANNY response`);
            aiRes = {
                action: 'send_message',
                // Long text, specific forbidden emoji, no split
                content: 'Oi tudo bem? 😊 Eu sou um robô corporativo e gostaria de saber se você quer energia solar. Se for solar, posso te ajudar! 😊 Isso aqui é um texto muito longo propositalmente para testar o auto-splitter que deve quebrar em várias mensagens quando detecta que o texto ficou gigante e chato de ler no WhatsApp. Espero que funcione! 😊'
            };
        }

        if (!aiRes && webNoKeyFallbackResponse) {
            aiRes = webNoKeyFallbackResponse as any;
        }

        if (!aiRes) {
            if (!openai) {
                return respondNoSend({ skipped: 'missing_openai_api_key' }, 'missing_openai_api_key');
            }

            // --- INCREMENT 12: SOLAR GATE EXECUTION ---
            gate = detectSolarIntentAndMissing(lastUserTextAggregated || '', lead);
            if (gate.directive) {
                console.log(`🛡️ [${runId}] Solar Gate Triggered: ${gate.intent} missing [${gate.missing.join(',')}]`);
            }

            const postCallCommentText = isScheduledPostCallTrigger
                ? String(payload?.extraContext?.comment_text || '').trim()
                : '';
            if (isScheduledPostCallTrigger && !postCallCommentText) {
                return respondNoSend({ skipped: 'empty_comment', runId }, 'empty_comment');
            }

            const followUpStepRaw = Number(payload?.extraContext?.fu_step || 0);
            const followUpStep = Number.isInteger(followUpStepRaw) && followUpStepRaw >= 1 && followUpStepRaw <= 5
                ? followUpStepRaw
                : null;
            const followUpElapsedText = formatElapsedSince(
                isFollowUpTrigger ? (payload?.extraContext?.last_outbound_at || null) : null
            );

            const postCallContextBlock = isScheduledPostCallTrigger
                ? `
=== CONTEXTO DA LIGACAO (PRIORIDADE MAXIMA) ===
O vendedor realizou uma ligacao com o lead ha 5 minutos e registrou:
"${postCallCommentText}"

INSTRUCOES:
- Sua mensagem DEVE referenciar o que foi conversado na ligacao.
- Use o feedback acima como dado PRINCIPAL do contexto.
- Conduza para o proximo passo (agendar visita, gerar proposta, ou pedir dado faltante).
- NAO invente o que foi conversado. Use APENAS o feedback registrado.
=== FIM DO CONTEXTO DA LIGACAO ===
`
                : '';

            const followUpContextBlock = isFollowUpTrigger
                ? `
=== FOLLOW UP (STEP ${followUpStep || '?'}/5) ===
O lead nao responde ha ${followUpElapsedText}.
Este e o follow-up ${followUpStep || '?'} de 5.

INSTRUCOES POR STEP:
- Step 1: toque leve, pergunta curta.
- Step 2: trazer dado novo ou beneficio.
- Step 3: micro-urgencia sem pressao.
- Step 4: empatia e validacao.
- Step 5: ultima mensagem, tom de despedida leve.

OBRIGATORIO:
- Cada follow-up deve ser DIFERENTE dos anteriores.
- Referenciar a ultima conversa com base no historico real.
- 1-2 frases no maximo.
- Nao repetir perguntas ja feitas.
=== FIM DO FOLLOW UP ===
`
                : '';

            const systemPrompt = `
IDENTIDADE: ${settings.assistant_identity_name || 'Consultor Solar'}. Consultor de energia solar no Brasil.
Ao se apresentar, use explicitamente o nome "${settings.assistant_identity_name || 'Consultor Solar'}". Evite apresentações genéricas como "assistente da empresa".
TIMEZONE_OPERACIONAL: ${scheduleTimezone}
AGORA_UTC_ISO: ${new Date().toISOString()}

${buildSchedulePolicyPromptBlock(autoSchedulePolicy, isAfterHoursForCall)}

${SOLAR_BR_PACK}

${gate.directive ? `\n🚨 ***SOLAR_SAFETY_GATE ATIVADO*** 🚨\n${gate.directive}\n(Obedeça esta diretiva acima de todas as outras de estilo)\n` : ''}

REGRAS DE VERDADE E QUALIDADE (OBRIGATÓRIO):
- NUNCA invente dados, prazos, percentuais ou garantias. Se não tiver certeza, diga "isso depende de [X]" e peça o dado.
- Responda com PROFUNDIDADE PRÁTICA: 3–8 linhas úteis. NÃO seja raso.
- Energia solar no Brasil — fluxo real que você deve conhecer:
  1. Análise da conta de luz / dimensionamento do sistema
  2. Proposta comercial / negociação
  3. Contrato e (se aplicável) financiamento
  4. Projeto de engenharia
  5. Homologação na distribuidora / concessionária (prazos variam por região: CEMIG, CPFL, Enel, Energisa, etc.)
  6. Instalação física (geralmente 1–3 dias para residencial)
  7. Vistoria / troca do medidor pela distribuidora (pode levar de dias a semanas)
  8. Liberação e início da compensação de créditos de energia
- Para perguntas sobre PRAZOS/ECONOMIA: explique que a instalação é rápida, mas o início da economia real depende de homologação + troca de medidor + liberação da concessionária. Dê faixa típica e peça cidade/UF e concessionária para estimar melhor.
- NUNCA prometa economia garantida. Use linguagem condicional ("pode reduzir", "tende a", "a simulação indica…").
- Peça UM dado por vez quando precisar (cidade/UF, concessionária, tipo de telhado, consumo mensal, etc.).

ESTILO WHATSAPP (MODO HUMANO OBRIGATÓRIO):
- Escreva como humano no WhatsApp: direto, curto, natural. Sem texto corporativo.
- NÃO repetir saudação ("Oi tudo bem...") em toda mensagem. Cumprimente só no começo ou depois de longo silêncio.
- Responder em 2–4 mensagens curtas quando houver mais de 1 ideia.
  Use "||" para separar as mensagens (o sistema já envia em sequência).
  Regra: 1–2 frases por mensagem, preferir <= 140 caracteres por parte.
- Emojis: por padrão ZERO. Se usar, no máximo 1 e NUNCA use 😊.
  Só use emoji se o lead usou antes OU em confirmação (variar: ✅👍👌). Não repetir o mesmo.
- Perguntas: no máximo 1 pergunta por mensagem. Se precisar de 2, separar em mensagens diferentes.
- Off-topic (lead manda algo fora do contexto):
  1) reconhecer em 1 linha (sem "resposta inválida")
  2) fazer uma pergunta humana de clarificação
  3) só então puxar de volta com leveza para ENERGIA SOLAR
  Exemplos (use como padrão, sem soar script):
   - "Entendi. Isso é sobre o atendimento de energia solar ou foi outra coisa que você mandou aqui?"
   - "Saquei. Me diz só: você quer falar de energia solar agora ou prefere que eu te chame mais tarde?"
   - "Beleza. Sobre energia solar: sua conta de luz fica mais ou menos em qual faixa?"

PROIBIÇÕES ABSOLUTAS:
- Proibido: "Ops, resposta inválida..."
- Proibido: "se for solar..."
- Proibido: emoji 😊

REGRA DE AGENDAMENTO:
- Se o cliente confirma agendamento (diz "sim", "pode", "vamos", "bora", "quero agendar"), ofereça 2 slots reais disponíveis.
- NUNCA sugira horário passado.
- Use APENAS os horários de SLOTS_DISPONIVEIS_REAIS.
- Se o horário solicitado estiver indisponível/conflitado, peça nova escolha.
- Para efetivar agendamento no CRM, inclua appointment.start_at em ISO.
- Só mova para chamada_agendada/visita_agendada quando houver appointment válido.

${postCallContextBlock}

${followUpContextBlock}

PROTOCOLO DA ETAPA:
${stagePromptText}

DADOS_JA_CONFIRMADOS:
${structuredLeadSnapshot ? JSON.stringify(structuredLeadSnapshot, null, 2) : '(sem dados estruturados confirmados)'}

COMENTARIOS_CRM_RECENTES:
${crmCommentsBlock || '(sem comentários internos disponíveis)'}

RESUMO_PROPOSTA_ATUAL:
${latestProposalBlock || '(sem proposta registrada)'}

CONHECIMENTO_INTERNO:
${kbBlock || '(sem dados internos disponíveis)'}

PESQUISA_WEB:
${webBlock || '(sem pesquisa web)'}

SLOTS_DISPONIVEIS_REAIS:
${scheduleCatalogText || '(sem slots livres no momento)'}

EXTRAÇÃO DE DADOS DO LEAD (OBRIGATÓRIO):
Sempre que o lead informar dados úteis (conta de luz, consumo, telha, concessionária, cidade, CEP, tipo de instalação, padrão de energia, financiamento), extraia e inclua "fields" no JSON de resposta.
Nunca invente dados; se não tiver certeza, pergunte 1 coisa por vez.
Confidence: "high" se o usuário disse explicitamente, "medium" se inferido claramente, "low" se duvidoso.
Source: "user" se veio direto do que o cliente escreveu, "inferred" se você deduziu, "confirmed" se o cliente confirmou algo que você perguntou.
Campos possíveis: consumption_kwh_month, estimated_value_brl, customer_type, city, zip, roof_type, utility_company, grid_connection_type, financing_interest, installation_site_type, average_bill_context.

DADOS ESTRUTURADOS POR ETAPA (OPCIONAL, quando houver alta/medio confianca):
- Quando a conversa trouxer dados estruturados relevantes da etapa atual, inclua "stage_data" no JSON.
- Use chaves em snake_case.
- Para currentStage="proposta_negociacao", use namespace "negociacao" (ou "proposta_negociacao" se preferir) dentro de "stage_data".
- Nunca invente; omita campos sem certeza.

INCREMENTO_CIRURGICO_V2_20260306_GLOBAL:
- Se currentStage for "respondeu" ou "nao_compareceu", nao incluir "proposal" no JSON e nao usar acao de proposta.
- Se currentStage for "respondeu" ou "nao_compareceu", continuar qualificacao ate agendamento (chamada_agendada ou visita_agendada).
- Ao tratar promocao, nunca inventar valores/condicoes; usar apenas dados explicitamente presentes no contexto.

COMENTÁRIOS INTERNOS E FOLLOW-UPS (V7):
- Antes de perguntar qualquer coisa, consulte DADOS_JA_CONFIRMADOS. Se um dado já estiver confirmado, NÃO peça de novo.
- Antes de pedir dados novamente, confira COMENTARIOS_CRM_RECENTES e RESUMO_PROPOSTA_ATUAL para não repetir perguntas já respondidas pelo lead.
- Após coletar uma informação importante ou definir próximo passo, registre um comentário interno via add_comment. Use comment_type: "summary" para resumos, "next_step" para próximo passo, "note" para observações gerais.
- Quando houver ação pendente (documentos, retorno, confirmação do cliente), crie um follow-up via create_followup com título claro e due_at se possível.
- Nunca crie tarefas/comentários duplicados no mesmo contexto; um por burst/âncora.
- Você pode combinar: action="send_message" + "comment":{"text":"...","type":"next_step"} para responder E registrar comentário ao mesmo tempo.

FORMATO DE SAÍDA (JSON ESTRITO, sem markdown, sem explicação fora do JSON):
{"action": "send_message"|"move_stage"|"update_lead_fields"|"add_comment"|"create_followup"|"create_appointment"|"none", "content": "Texto humano aqui...", "target_stage": "next_stage_id", "fields": {"campo": {"value": "...", "confidence": "high"|"medium"|"low", "source": "user"|"inferred"|"confirmed"}}, "stage_data": {"campo_ou_namespace": "valor"}, "comment": {"text": "Resumo/nota interna", "type": "summary|note|next_step"}, "task": {"title": "Título do follow-up", "notes": "Detalhes", "due_at": "ISO", "priority": "low|medium|high", "channel": "whatsapp|call|email"}, "appointment": {"type": "call|visit|meeting|installation", "title": "Título curto", "start_at": "ISO", "end_at": "ISO opcional", "location": "Opcional", "notes": "Opcional"}}

Se action for "move_stage", DEVE incluir "target_stage".
Se currentStage for "novo_lead" e action for "send_message", DEVE incluir "target_stage": "respondeu" (obrigatorio - lead respondeu pela primeira vez).
Se action for "send_message", "content" é obrigatório.
Se houver confirmação de agendamento, inclua "appointment.start_at" obrigatoriamente.
Se action for "create_appointment", inclua "appointment" com "start_at".
Você pode combinar: action="send_message" + "fields" para responder E extrair dados ao mesmo tempo.
Você pode combinar: action="send_message" + "stage_data" para responder E salvar dados estruturados da etapa.
Se action for "add_comment", inclua "content" com o texto do comentário.
Se action for "create_followup", inclua "task" com título obrigatório.
Se APENAS dados foram detectados e não há resposta necessária, use action="update_lead_fields" (sem content).
`;

            let completion;
            try {
                completion = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
                    max_tokens: 900,
                    response_format: { type: "json_object" }
                });
            } catch (openaiErr: any) {
                console.error(`❌ [${runId}] OpenAI API call failed:`, openaiErr?.message || openaiErr);
                try {
                    await supabase.from('ai_action_logs').insert({
                        org_id: leadOrgId,
                        lead_id: Number(leadId),
                        action_type: 'openai_call_failed',
                        details: JSON.stringify({
                            runId,
                            error: openaiErr?.message || String(openaiErr),
                            status: openaiErr?.status || null,
                            interactionId: anchorInteractionId || null
                        }),
                        success: false
                    });
                } catch (_logErr) { /* non-blocking */ }
                return respondNoSend({ skipped: 'openai_call_failed', runId, error: openaiErr?.message }, 'openai_call_failed');
            }

            // Do not redeclare aiRes!
            aiRes = {};
            const rawContent = completion.choices[0]?.message?.content || '{}';

            try {
                const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
                aiRes = JSON.parse(cleaned);
            } catch (err) {
                console.error('⚠️ JSON Parse Failed. Fallback to raw text.', err);
                aiRes = { action: 'send_message', content: rawContent };
            }
        } // End if (!aiRes)

        if (typeof aiRes.content === 'string') aiRes.content = aiRes.content.substring(0, 2000);
        else if (aiRes.content) aiRes.content = String(aiRes.content).substring(0, 2000);
        else aiRes.content = '';

        // --- INCREMENT 12: POST-PROCESSING GUARDRAIL ---
        // Verify if AI actually obeyed the gate. If not, force the question.
        let gateApplied = false;
        if (gate.directive && aiRes.content) {
            const botText = aiRes.content.toLowerCase();

            // 1. Check if AI asked the missing info
            const missing = gate.missing; // ['cidade/uf'] or ['consumo_kwh', 'cidade/uf']
            let asked = false;

            if (gate.intent === 'prazos') {
                asked = /(cidade|qual.*lugar|onde.*mora|concession|distribuidora)/i.test(botText);

                // Anti-hallucination for specific deadlines (Broader Regex)
                // Matches: "5 dias", "10 a 15 dias", "um dia", "3 dias uteis"
                const daysRegex = /(\d+|um|dois|tr[êe]s|quatro|cinco)(\s*(?:a|e|ou|-|–)\s*\d+)?\s*(dias|dia)/gi;
                if (daysRegex.test(botText)) {
                    // AI hallucinated a specific day count ("5 dias") without knowing city. Sanitize.
                    aiRes.content = aiRes.content.replace(daysRegex, "algumas semanas (varia por região)");
                    console.warn(`🛡️ [${runId}] Gate Sanitized: Removed specific days from deadline response. Match found.`);
                }
            }

            if (gate.intent === 'dimensionamento') {
                asked = /(conta|fatura|energia|consumo|kwh|quais.*gasto|quanto.*paga)/i.test(botText);

                // Anti-hallucination for specific plates
                if (/\b(\d+)\s*(placas|pain[eé]is|m[óo]dulos)\b/i.test(botText)) {
                    aiRes.content = aiRes.content.replace(/\b(\d+)\s*(placas|pain[eé]is|m[óo]dulos)\b/gi, "um número exato de painéis");
                    console.warn(`🛡️ [${runId}] Gate Sanitized: Removed specific plate count.`);
                }
            }

            // Force append if not asked
            if (!asked) {
                gateApplied = true;
                const append = gate.intent === 'dimensionamento'
                    ? "\n\n(Para eu te responder com precisão: qual é o valor médio da sua conta de luz ou consumo em kWh?)"
                    : "\n\n(Para eu te dar uma estimativa real: qual é sua cidade e concessionária?)";
                aiRes.content += append;
                console.log(`🛡️ [${runId}] Gate Enforced: Appended missing question.`);
            }
        }

        // --- INCREMENT 13: HUMANIZATION POST-PROCESSING ---
        if (aiRes.content) {
            let text = aiRes.content;

            // 1. Strip Banned Emoji (😊)
            if (text.includes('😊')) {
                text = text.replace(/😊/g, '');
                console.warn(`🎨 [${runId}] Humanizer: Stripped '😊' emoji.`);
            }

            // 2. Auto-Split Long Messages (> 220 chars) if no "||" present
            if (text.length > 220 && !text.includes('||')) {
                const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g);
                if (sentences && sentences.length > 1) {
                    const blocks: string[] = [];
                    let currentBlock = "";

                    for (const s of sentences) {
                        if ((currentBlock.length + s.length) < 160) {
                            currentBlock += s;
                        } else {
                            if (currentBlock.length > 0) blocks.push(currentBlock.trim());
                            currentBlock = s;
                        }
                    }
                    if (currentBlock.length > 0) blocks.push(currentBlock.trim());

                    if (blocks.length > 1) {
                        text = blocks.join('||');
                        console.log(`🎨 [${runId}] Humanizer: Auto-split long text (${aiRes.content.length} chars) into ${blocks.length} parts.`);
                    }
                }
            }

            // 3. Final Assignment
            aiRes.content = text;
        }

        const answeredQuestionKeys = Array.isArray(structuredLeadSnapshot?.slots_respondidos)
            ? structuredLeadSnapshot.slots_respondidos.map((item: any) => normalizeQuestionKey(item)).filter(Boolean)
            : [];
        const draftedQuestionKey = inferQuestionKeyFromText(aiRes?.content || '');
        const likelyAsksForSlot = typeof aiRes?.content === 'string'
            && (
                aiRes.content.includes('?')
                || /(qual|quanto|me confirma|prefere|e para|é para|tipo de projeto|tipo do projeto)/i.test(aiRes.content)
            );

        if (
            aiRes?.action === 'send_message'
            && likelyAsksForSlot
            && draftedQuestionKey
            && answeredQuestionKeys.includes(draftedQuestionKey)
        ) {
            console.warn(`[${runId}] Duplicate question guard triggered for key=${draftedQuestionKey}.`);

            if (openai) {
                try {
                    const duplicateCorrectionPrompt = `${systemPrompt}

CORRECAO OBRIGATORIA:
- A resposta abaixo tentou perguntar novamente um dado já confirmado pelo lead.
- NAO repita a pergunta de chave "${draftedQuestionKey}".
- Use DADOS_JA_CONFIRMADOS como verdade.
- Gere a proxima melhor pergunta faltante ou avance para o proximo passo.
`;

                    const retryCompletion = await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [{ role: "system", content: duplicateCorrectionPrompt }, ...chatHistory],
                        max_tokens: 900,
                        response_format: { type: "json_object" }
                    });

                    const retryRawContent = retryCompletion.choices[0]?.message?.content || '{}';
                    const retryCleaned = retryRawContent.replace(/```json/g, '').replace(/```/g, '').trim();
                    const retryParsed = JSON.parse(retryCleaned);
                    if (retryParsed && typeof retryParsed === 'object') {
                        aiRes = {
                            ...aiRes,
                            ...retryParsed,
                        };
                    }
                } catch (duplicateRetryErr: any) {
                    console.warn(`[${runId}] Duplicate question regeneration failed (non-blocking):`, duplicateRetryErr?.message || duplicateRetryErr);
                }
            }

            const duplicateAfterRetry = inferQuestionKeyFromText(aiRes?.content || '');
            const stillRepeats = typeof aiRes?.content === 'string'
                && duplicateAfterRetry
                && answeredQuestionKeys.includes(duplicateAfterRetry)
                && (
                    aiRes.content.includes('?')
                    || /(qual|quanto|me confirma|prefere|e para|é para|tipo de projeto|tipo do projeto)/i.test(aiRes.content)
                );

            if (stillRepeats) {
                const fallbackContent = buildDeterministicNextQuestionFallback(currentStage, lead);
                if (fallbackContent) {
                    aiRes.action = 'send_message';
                    aiRes.content = fallbackContent;
                }
            }
        }

        latestAiResponse = aiRes as any;

        // DEBUG: Attach aggregated text
        aiRes._debug_aggregated = lastUserTextAggregated;
        if (adoptedLatestOnce) {
            (aiRes as any)._debug_yield_adopted = {
                from: adoptedFromInteractionId,
                to: adoptedToInteractionId
            };
        }
        if (webSearchStatus && !(aiRes as any)?._web_search) {
            (aiRes as any)._web_search = webSearchStatus;
        }

        if (!aiRes?.comment?.text || !String(aiRes.comment.text).trim()) {
            const fallbackComment = buildFallbackCommentFromText(lastUserTextAggregated || '');
            if (fallbackComment) {
                aiRes.comment = fallbackComment;
            }
        }

        const qualificationState = currentStage === 'respondeu'
            ? getRespondeuQualificationState(lead)
            : { missingKeys: [], visitMissingKeys: [], checklist: {} as Record<string, boolean> };
        qualificationMissingKeysForLog = qualificationState.missingKeys;

        const normalizedTargetStagePrePolicy = normalizeStage(aiRes?.target_stage);
        const hasScheduleTargetStagePrePolicy = normalizedTargetStagePrePolicy === 'chamada_agendada' || normalizedTargetStagePrePolicy === 'visita_agendada';
        const hasAppointmentObjectPrePolicy = aiRes?.appointment && typeof aiRes.appointment === 'object' && !Array.isArray(aiRes.appointment);
        const inferredTypePrePolicy = inferAppointmentWindowType(
            hasAppointmentObjectPrePolicy ? aiRes?.appointment?.type : null,
            aiRes?.target_stage,
            currentStage
        );
        const textCallIntent = textContainsCallSchedulingIntent(aiRes?.content || '');
        const textVisitIntent = textContainsVisitSchedulingIntent(aiRes?.content || '');
        const hasSchedulingIntentPrePolicy =
            hasScheduleTargetStagePrePolicy ||
            hasAppointmentObjectPrePolicy ||
            aiRes?.action === 'create_appointment' ||
            textCallIntent ||
            textVisitIntent;

        if (hasSchedulingIntentPrePolicy) {
            if (autoSchedulePolicy.mode === 'both_off') {
                manualReturnModeUsed = true;
                stageGateBlockReason = stageGateBlockReason || 'manual_return_mode';
                delete aiRes.appointment;
                delete aiRes.target_stage;
                aiRes.action = 'send_message';
                aiRes.content = buildDeterministicNextQuestionFallback(currentStage, lead, { manualReturnMode: true }) || aiRes.content;
            } else {
                const scheduleIntentType = inferredTypePrePolicy;
                const forcingCall = autoSchedulePolicy.mode === 'call_only' && (scheduleIntentType === 'visit' || textVisitIntent);
                const forcingVisit = autoSchedulePolicy.mode === 'visit_only' && (scheduleIntentType === 'call' || textCallIntent);

                if (forcingCall || forcingVisit) {
                    const forcedType: AppointmentWindowType = forcingVisit ? 'visit' : 'call';
                    const forcedTarget = forcedType === 'visit' ? 'visita_agendada' : 'chamada_agendada';
                    const fallbackContent = buildScheduleRetryContent(
                        forcedType,
                        availableSlotsByType,
                        scheduleTimezone,
                        new Date()
                    );

                    stageGateBlockReason = stageGateBlockReason || `forced_${forcedType}_policy`;
                    delete aiRes.appointment;
                    aiRes.target_stage = forcedTarget;
                    aiRes.action = 'send_message';
                    aiRes.content = fallbackContent;
                }

                const callSchedulingAttempt =
                    inferredTypePrePolicy === 'call'
                    && (hasScheduleTargetStagePrePolicy || hasAppointmentObjectPrePolicy || aiRes?.action === 'create_appointment');
                if (isAfterHoursForCall && (callSchedulingAttempt || textCallIntent)) {
                    afterHoursCallBlocked = true;
                    stageGateBlockReason = stageGateBlockReason || 'after_hours_call_blocked';
                    delete aiRes.appointment;
                    if (normalizeStage(aiRes?.target_stage) === 'chamada_agendada') delete aiRes.target_stage;
                    aiRes.action = 'send_message';
                    aiRes.content = buildDeterministicNextQuestionFallback(currentStage, lead, { afterHoursCallBlocked: true }) || aiRes.content;
                }
            }

            if (currentStage === 'respondeu' && qualificationState.missingKeys.length > 0) {
                qualificationGateBlocked = true;
                stageGateBlockReason = stageGateBlockReason || `qualification_incomplete:${qualificationState.missingKeys[0]}`;
                appointmentPrecheckBlockedReason = appointmentPrecheckBlockedReason || `qualification_incomplete:${qualificationState.missingKeys[0]}`;
                delete aiRes.appointment;
                delete aiRes.target_stage;
                aiRes.action = 'send_message';
                aiRes.content = buildDeterministicNextQuestionFallback(currentStage, lead, {
                    preferredMissingKeys: qualificationState.missingKeys,
                }) || aiRes.content;
                console.log(`🧭 [${runId}] qualification_gate_blocked: ${qualificationState.missingKeys.join(',')}`);
            }
        }

        const normalizedTargetStage = normalizeStage(aiRes?.target_stage);
        const hasScheduleTargetStage = normalizedTargetStage === 'chamada_agendada' || normalizedTargetStage === 'visita_agendada';
        const hasAppointmentObject = aiRes?.appointment && typeof aiRes.appointment === 'object' && !Array.isArray(aiRes.appointment);
        const currentAppointmentStartRaw = hasAppointmentObject ? String(aiRes.appointment.start_at || '').trim() : '';
        const implicitConfirmationDetected = isImplicitScheduleConfirmation(lastUserTextAggregated || '');

        if (!currentAppointmentStartRaw && implicitConfirmationDetected && lastAssistantMessageText) {
            const inferredTypeFromContext = inferAppointmentWindowType(
                hasAppointmentObject ? aiRes.appointment.type : null,
                aiRes?.target_stage,
                currentStage
            );
            const offeredSlots = extractSlotsFromAssistantText(lastAssistantMessageText, scheduleTimezone, new Date());
            let selectedImplicitSlot: string | null = null;

            for (const offeredSlot of offeredSlots) {
                const slotStart = new Date(offeredSlot);
                if (isNaN(slotStart.getTime())) continue;
                const slotEndMs = slotStart.getTime() + (30 * 60 * 1000);
                if (inferredTypeFromContext === 'call' && isAfterHoursForCall) continue;
                const minDaysForType = inferredTypeFromContext === 'visit' ? scheduleVisitMinDays : inferredTypeFromContext === 'call' ? scheduleCallMinDays : 0;
                if (!isSlotRespectingMinLeadDays(offeredSlot, minDaysForType, scheduleTimezone, new Date())) continue;
                if (!isSlotWithinWindow(offeredSlot, inferredTypeFromContext, scheduleWindowConfigNormalized, scheduleTimezone)) continue;
                if (overlapsBusyRange(slotStart.getTime(), slotEndMs, busyRanges)) continue;
                selectedImplicitSlot = slotStart.toISOString();
                break;
            }

            if (selectedImplicitSlot) {
                implicitConfirmationUsed = true;
                slotSelectionEvent = 'implicit_confirmation_used';
                slotSelectionStartAt = selectedImplicitSlot;
                slotSelectionType = inferredTypeFromContext;
                aiRes.appointment = {
                    ...(hasAppointmentObject ? aiRes.appointment : {}),
                    type: hasAppointmentObject && aiRes.appointment.type ? aiRes.appointment.type : inferredTypeFromContext,
                    title: hasAppointmentObject && aiRes.appointment.title
                        ? aiRes.appointment.title
                        : (inferredTypeFromContext === 'visit' ? 'Visita tecnica' : 'Chamada comercial'),
                    start_at: selectedImplicitSlot,
                    end_at: hasAppointmentObject ? aiRes.appointment.end_at : undefined,
                };
                if (!aiRes.target_stage && (currentStage === 'respondeu' || currentStage === 'nao_compareceu')) {
                    aiRes.target_stage = inferredTypeFromContext === 'visit' ? 'visita_agendada' : 'chamada_agendada';
                }
                if (!aiRes.content) {
                    aiRes.content = `Perfeito, ficou confirmado para ${formatSlotLabel(selectedImplicitSlot, scheduleTimezone, new Date())}.`;
                }
                console.log(`📅 [${runId}] slot_selection: implicit_confirmation_used (${selectedImplicitSlot})`);
            } else {
                appointmentPrecheckBlockedReason = 'implicit_confirmation_no_valid_slot';
                slotSelectionEvent = 'slot_selection_missing';
                if (!aiRes.content || hasScheduleTargetStage || aiRes.action === 'create_appointment') {
                    aiRes.content = buildScheduleRetryContent(
                        inferredTypeFromContext,
                        availableSlotsByType,
                        scheduleTimezone,
                        new Date()
                    );
                }
            }
        }

        const shouldValidateAppointment =
            hasScheduleTargetStage ||
            aiRes?.action === 'create_appointment' ||
            (aiRes?.appointment && typeof aiRes.appointment === 'object' && !Array.isArray(aiRes.appointment));

        if (shouldValidateAppointment) {
            const rawAppointment = (aiRes?.appointment && typeof aiRes.appointment === 'object' && !Array.isArray(aiRes.appointment))
                ? { ...aiRes.appointment }
                : {};
            const inferredType = inferAppointmentWindowType(rawAppointment.type, aiRes?.target_stage, currentStage);
            const startRaw = String(rawAppointment.start_at || '').trim();

            if (!startRaw) {
                appointmentPrecheckBlockedReason = appointmentPrecheckBlockedReason || 'missing_start_at';
            } else {
                const nowForValidation = new Date();
                const startDate = new Date(startRaw);
                if (isNaN(startDate.getTime())) {
                    appointmentPrecheckBlockedReason = 'invalid_dates';
                } else {
                    const startIso = startDate.toISOString();
                    if (startDate.getTime() <= nowForValidation.getTime()) {
                        appointmentPrecheckBlockedReason = 'past_slot';
                    } else if (inferredType === 'call' && isAfterHoursForCall) {
                        appointmentPrecheckBlockedReason = 'after_hours_call_blocked';
                    } else if (
                        !isSlotRespectingMinLeadDays(
                            startIso,
                            inferredType === 'visit' ? scheduleVisitMinDays : inferredType === 'call' ? scheduleCallMinDays : 0,
                            scheduleTimezone,
                            nowForValidation
                        )
                    ) {
                        appointmentPrecheckBlockedReason = 'min_days_blocked';
                    } else if (!isSlotWithinWindow(startIso, inferredType, scheduleWindowConfigNormalized, scheduleTimezone)) {
                        appointmentPrecheckBlockedReason = 'outside_window';
                    } else {
                        let endDate = rawAppointment.end_at ? new Date(rawAppointment.end_at) : new Date(startDate.getTime() + (30 * 60 * 1000));
                        if (isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
                            endDate = new Date(startDate.getTime() + (30 * 60 * 1000));
                        }
                        if (overlapsBusyRange(startDate.getTime(), endDate.getTime(), busyRanges)) {
                            appointmentPrecheckBlockedReason = 'slot_conflict';
                        } else {
                            aiRes.appointment = {
                                ...rawAppointment,
                                type: rawAppointment.type || inferredType,
                                title: String(rawAppointment.title || (inferredType === 'visit' ? 'Visita tecnica' : 'Chamada comercial')).trim().substring(0, 200),
                                start_at: startIso,
                                end_at: endDate.toISOString(),
                            };
                            slotSelectionEvent = slotSelectionEvent || 'slot_selection';
                            slotSelectionStartAt = startIso;
                            slotSelectionType = inferredType;
                            if (!aiRes.target_stage && (currentStage === 'respondeu' || currentStage === 'nao_compareceu')) {
                                aiRes.target_stage = inferredType === 'visit' ? 'visita_agendada' : 'chamada_agendada';
                            }
                        }
                    }
                }
            }

            if (appointmentPrecheckBlockedReason) {
                const typeForRetry = inferAppointmentWindowType(rawAppointment.type, aiRes?.target_stage, currentStage);
                const hasScheduleTargetNow = ['chamada_agendada', 'visita_agendada'].includes(normalizeStage(aiRes?.target_stage));
                const reasonForLog = appointmentPrecheckBlockedReason;
                if (reasonForLog === 'outside_window') {
                    slotSelectionEvent = 'outside_window';
                    console.log(`📅 [${runId}] outside_window: appointment rejected`);
                } else if (reasonForLog === 'slot_conflict') {
                    slotSelectionEvent = 'slot_conflict';
                    console.log(`📅 [${runId}] slot_conflict: appointment rejected`);
                } else if (reasonForLog === 'after_hours_call_blocked') {
                    slotSelectionEvent = 'after_hours_call_blocked';
                    console.log(`📵 [${runId}] after_hours_call_blocked: appointment rejected`);
                } else {
                    slotSelectionEvent = slotSelectionEvent || 'slot_selection_blocked';
                    console.log(`📅 [${runId}] slot_selection_blocked: ${reasonForLog}`);
                }

                delete aiRes.appointment;
                if (aiRes.action === 'create_appointment') {
                    aiRes.action = 'send_message';
                }
                if (
                    !aiRes.content ||
                    hasScheduleTargetNow ||
                    aiRes.action === 'send_message' ||
                    aiRes.action === 'move_stage' ||
                    aiRes.action === 'create_appointment'
                ) {
                    if (reasonForLog === 'after_hours_call_blocked') {
                        aiRes.content = buildDeterministicNextQuestionFallback(currentStage, lead, {
                            afterHoursCallBlocked: true,
                        }) || aiRes.content;
                    } else if (reasonForLog === 'min_days_blocked') {
                        const minDays = typeForRetry === 'visit' ? scheduleVisitMinDays : scheduleCallMinDays;
                        aiRes.content = `Para ${typeForRetry === 'visit' ? 'visita' : 'ligacao'}, trabalhamos com antecedencia minima de ${minDays} dia(s). Posso te sugerir opcoes dentro dessa regra?`;
                    } else {
                        aiRes.content = buildScheduleRetryContent(
                            typeForRetry,
                            availableSlotsByType,
                            scheduleTimezone,
                            new Date()
                        );
                    }
                }
            }
        }

        const hasOutboundCandidateAfterGuards = (
            (aiRes.action === 'send_message' && String(aiRes.content || '').trim().length > 0) ||
            (aiRes.action === 'move_stage' && String(aiRes.content || '').trim().length > 0) ||
            (aiRes.action === 'create_appointment' && String(aiRes.content || '').trim().length > 0)
        );
        if (!isScheduledTrigger && !hasOutboundCandidateAfterGuards) {
            const fallbackContent = buildDeterministicNextQuestionFallback(currentStage, lead, {
                preferredMissingKeys: qualificationState.missingKeys,
                manualReturnMode: autoSchedulePolicy.mode === 'both_off',
                afterHoursCallBlocked: isAfterHoursForCall && textContainsCallSchedulingIntent(lastUserTextAggregated || ''),
            });
            if (fallbackContent) {
                noOutboundFallbackUsed = true;
                aiRes.action = 'send_message';
                aiRes.content = fallbackContent;
                if (!aiRes?.comment?.text || !String(aiRes.comment.text).trim()) {
                    const fallbackComment = buildFallbackCommentFromText(lastUserTextAggregated || '');
                    if (fallbackComment) aiRes.comment = fallbackComment;
                }
                console.log(`🧩 [${runId}] no_outbound_fallback_used`);
            }
        }

        // --- V6: EXTRACT AND SAVE LEAD FIELDS (side-effect, non-blocking) ---
        if (aiRes.fields && typeof aiRes.fields === 'object' && Object.keys(aiRes.fields).length > 0) {
            try {
                let skipV6Writes = false;
                const v6CandidateCount = Object.keys(aiRes.fields).length;

                try {
                    const anchorLatest = await isAnchorLatestInbound(supabase, leadId, anchorInteractionId);
                    if (!anchorLatest.ok) {
                        skipV6Writes = true;
                        v6FieldsCandidateCount = v6CandidateCount;
                        v6FieldsWrittenCount = 0;
                        (aiRes as any)._debug_overwrite_skipped = {
                            reason: 'stale_anchor',
                            anchor: anchorInteractionId || null,
                            latest: anchorLatest.latestId,
                            latestCreatedAt: anchorLatest.latestCreatedAt
                        };

                        console.warn(`⚠️ [${runId}] V6 overwrite skipped: stale anchor ${anchorInteractionId} (latest inbound ${anchorLatest.latestId}).`);

                        try {
                            await supabase.from('ai_action_logs').insert({
                                lead_id: Number(leadId),
                                action_type: 'lead_fields_skipped_stale_anchor',
                                details: JSON.stringify({
                                    runId,
                                    anchorInteractionId: anchorInteractionId || null,
                                    latestInboundId: anchorLatest.latestId,
                                    latestInboundCreatedAt: anchorLatest.latestCreatedAt
                                }),
                                success: false,
                            });
                        } catch (staleLogErr: any) {
                            console.warn(`⚠️ [${runId}] V6 stale-anchor skip log failed (non-blocking):`, staleLogErr?.message || staleLogErr);
                        }
                    }
                } catch (anchorCheckErr: any) {
                    console.warn(`⚠️ [${runId}] V6 stale-anchor check failed (fail-open):`, anchorCheckErr?.message || anchorCheckErr);
                    (aiRes as any)._debug_overwrite_skipped = {
                        reason: 'check_failed',
                        anchor: anchorInteractionId || null
                    };
                }

                if (!skipV6Writes) {
                    // Re-fetch lead for freshest data (avoid stale overwrite)
                    const { data: freshLead } = await supabase.from('leads').select('*').eq('id', leadId).single();
                    if (freshLead) {
                        const v6Result = await executeLeadFieldUpdate(supabase, leadId, aiRes.fields, freshLead, runId, lastUserTextAggregated);
                        v6FieldsCandidateCount = v6Result.candidateCount;
                        v6FieldsWrittenCount = v6Result.writtenCount;
                    }
                }
            } catch (v6Err: any) {
                console.error(`⚠️ [${runId}] V6: Field extraction failed (non-blocking):`, v6Err?.message || v6Err);
            }
        }

        // --- V11: EXTRACT AND SAVE STRUCTURED STAGE DATA (JSONB merge, non-blocking) ---
        const stageDataCandidate = extractStageDataCandidate(aiRes);
        if (stageDataCandidate) {
            try {
                let skipV11Writes = false;

                try {
                    const anchorLatest = await isAnchorLatestInbound(supabase, leadId, anchorInteractionId);
                    if (!anchorLatest.ok) {
                        skipV11Writes = true;
                        v11StageDataSkippedReason = 'stale_anchor';
                        console.warn(`⚠️ [${runId}] V11 stage_data write skipped: stale anchor ${anchorInteractionId} (latest inbound ${anchorLatest.latestId}).`);
                    }
                } catch (anchorCheckErr: any) {
                    console.warn(`⚠️ [${runId}] V11 stale-anchor check failed (fail-open):`, anchorCheckErr?.message || anchorCheckErr);
                }

                if (!skipV11Writes) {
                    const { data: freshLead } = await supabase.from('leads').select('*').eq('id', leadId).single();
                    if (freshLead) {
                        const v11Result = await executeLeadStageDataUpdate(
                            supabase,
                            leadId,
                            currentStage,
                            stageDataCandidate,
                            freshLead,
                            runId
                        );
                        v11StageDataCandidateCount = v11Result.candidateCount;
                        v11StageDataWrittenCount = v11Result.writtenCount;
                        v11StageDataNamespace = v11Result.namespace;
                        v11StageDataSkippedReason = v11Result.skippedReason;
                    } else {
                        v11StageDataSkippedReason = 'lead_refetch_failed';
                    }
                }
            } catch (v11Err: any) {
                v11StageDataSkippedReason = `exception:${v11Err?.message || 'unknown'}`;
                console.error(`⚠️ [${runId}] V11: Stage data extraction failed (non-blocking):`, v11Err?.message || v11Err);
            }
        }

        // V6: If action is purely update_lead_fields (no content to send), return early
        if (aiRes.action === 'update_lead_fields' && !aiRes.content) {
            console.log(`📋 [${runId}] V6: Pure field update (no message). Fields: ${v6FieldsWrittenCount}/${v6FieldsCandidateCount}`);
            // Still do structured log and run log below, skip message sending
        }

        // --- V7: COMMENT SIDE-EFFECT (non-blocking, runs alongside send_message/move_stage) ---
        const sideEffectComment = aiRes.comment && typeof aiRes.comment === 'object' && aiRes.comment.text;
        if (sideEffectComment) {
            try {
                const v7Result = await executeAddComment(
                    supabase, leadId, aiRes.comment.text, aiRes.comment.type || 'note',
                    settings.assistant_identity_name || 'IA', runId, anchorCreatedAt, anchorInteractionId
                );
                v7CommentWritten = v7Result.written;
                v7CommentSkippedReason = v7Result.skippedReason;
            } catch (v7Err: any) {
                console.error(`⚠️ [${runId}] V7: Comment side-effect failed (non-blocking):`, v7Err?.message || v7Err);
            }
        }

        // --- V7: FOLLOWUP SIDE-EFFECT (non-blocking) ---
        const sideEffectTask = aiRes.task && typeof aiRes.task === 'object' && aiRes.task.title;
        if (sideEffectTask) {
            try {
                const v7fResult = await executeCreateFollowup(
                    supabase, leadId, aiRes.task, runId, anchorCreatedAt, anchorInteractionId,
                    leadOrgId, lead.user_id
                );
                v7FollowupWritten = v7fResult.written;
                v7FollowupSkippedReason = v7fResult.skippedReason;
            } catch (v7Err: any) {
                console.error(`⚠️ [${runId}] V7: Followup side-effect failed (non-blocking):`, v7Err?.message || v7Err);
            }
        }

        // --- V9: APPOINTMENT SIDE-EFFECT (Blocking for stage move, but safe exec) ---
        let appointmentWritten = false;
        let appointmentSkippedReason: string | null = null;
        let appointmentError: string | null = null;

        const sideEffectAppointment = aiRes.appointment && typeof aiRes.appointment === 'object' && aiRes.appointment.start_at;
        const isAppointmentAction = aiRes.action === 'create_appointment';
        const hasScheduleTargetNow = ['chamada_agendada', 'visita_agendada'].includes(normalizeStage(aiRes?.target_stage));

        if (appointmentPrecheckBlockedReason && (sideEffectAppointment || isAppointmentAction || hasScheduleTargetNow)) {
            appointmentSkippedReason = appointmentPrecheckBlockedReason;
        }

        if ((sideEffectAppointment || isAppointmentAction) && !appointmentPrecheckBlockedReason) {
            try {
                const apptData = aiRes.appointment || {};
                const v9Result = await executeCreateAppointment(
                    supabase, leadId, apptData, runId, anchorCreatedAt, anchorInteractionId,
                    leadOrgId, lead.user_id
                );
                appointmentWritten = v9Result.written;
                appointmentSkippedReason = v9Result.skippedReason;
            } catch (v9Err: any) {
                appointmentError = v9Err?.message || String(v9Err);
                console.error(`⚠️ [${runId}] V9: Appointment creation failed:`, appointmentError);
            }
        } else if (sideEffectAppointment || isAppointmentAction) {
            console.warn(`🛑 [${runId}] V9: Appointment blocked by precheck (${appointmentPrecheckBlockedReason})`);
        }

        // --- V10: PROPOSAL DRAFT SIDE-EFFECT (non-blocking) ---
        let proposalWritten = false;
        let proposalSkippedReason: string | null = null;
        let proposalId: string | null = null;

        const sideEffectProposal = aiRes.proposal && typeof aiRes.proposal === 'object';
        const isProposalAction = aiRes.action === 'create_proposal_draft';

        if (sideEffectProposal || isProposalAction) {
            try {
                // If action is explicit but proposal missing, we might skip or fail.
                // But the function handles validation.
                const proposalData = aiRes.proposal || {};
                const v10Result = await executeCreateProposalDraft(
                    supabase, leadId, proposalData, runId, anchorInteractionId, lead.user_id, leadOrgId
                );
                proposalWritten = v10Result.written;
                proposalSkippedReason = v10Result.skippedReason;
                proposalId = v10Result.proposalId;
            } catch (v10Err: any) {
                console.error(`⚠️ [${runId}] V10: Proposal side-effect failed:`, v10Err?.message || v10Err);
            }
        }

        // V7: If action is purely add_comment (no outbound message)
        if (aiRes.action === 'add_comment' && !sideEffectComment) {
            try {
                const v7Result = await executeAddComment(
                    supabase, leadId, aiRes.content || '', aiRes.comment_type || 'note',
                    settings.assistant_identity_name || 'IA', runId, anchorCreatedAt, anchorInteractionId
                );
                v7CommentWritten = v7Result.written;
                v7CommentSkippedReason = v7Result.skippedReason;
            } catch (v7Err: any) {
                console.error(`⚠️ [${runId}] V7: add_comment action failed (non-blocking):`, v7Err?.message || v7Err);
            }
            console.log(`💬 [${runId}] V7: Pure add_comment action. Written: ${v7CommentWritten}`);
        }

        // V7: If action is purely create_followup (no outbound message)
        if (aiRes.action === 'create_followup') {
            try {
                const v7fResult = await executeCreateFollowup(
                    supabase, leadId, aiRes.task || {}, runId, anchorCreatedAt, anchorInteractionId,
                    leadOrgId, lead.user_id
                );
                v7FollowupWritten = v7fResult.written;
                v7FollowupSkippedReason = v7fResult.skippedReason;
            } catch (v7Err: any) {
                console.error(`⚠️ [${runId}] V7: create_followup action failed (non-blocking):`, v7Err?.message || v7Err);
            }
            console.log(`📝 [${runId}] V7: Pure create_followup action. Written: ${v7FollowupWritten}`);
        }

        // V9: Pure create_appointment (already handled in shared block above, just logging)
        if (aiRes.action === 'create_appointment') {
            console.log(`📅 [${runId}] V9: Pure create_appointment action. Written: ${appointmentWritten}, Reason: ${appointmentSkippedReason || 'OK'}`);
        }

        // 8. EXECUTE ACTIONS (INCREMENT 2: Split Support)
        if ((aiRes.action === 'send_message' || (aiRes.action === 'move_stage' && aiRes.content) || (aiRes.action === 'create_appointment' && aiRes.content)) && aiRes.content && aiRes.action !== 'update_lead_fields' && aiRes.action !== 'add_comment' && aiRes.action !== 'create_followup') {
            const sourceTag = String(payload?.source || '').toLowerCase();
            const remoteDigits = String(resolvedRemoteJid || '').replace(/\D/g, '');
            const isSmokeTransport =
                payload?.dryRun === true ||
                payload?.dry_run === true ||
                sourceTag === 'smoke' ||
                remoteDigits === '5511999990000' ||
                lead?.nome === 'SMOKE_TEST_LEAD';
            const isSimulatedTransport = forceSimulatedTransport || isSmokeTransport;

            if (isSimulatedTransport) {
                transportMode = 'simulated';
                transportSimReason = forceSimulatedTransport
                    ? 'force_simulated_transport'
                    : payload?.dryRun === true || payload?.dry_run === true
                        ? 'dry_run'
                        : sourceTag === 'smoke'
                            ? 'source_smoke'
                            : remoteDigits === '5511999990000'
                                ? 'test_remote'
                                : 'smoke_lead';
            }

            const rawParts = aiRes.content
                .split('||')
                .map((p: string) => p.trim())
                .filter(Boolean);
            const singleOutboundContent = rawParts.join('\n\n').trim();
            const burstMode = aggregatedBurstCount > 1;

            // Burst safety: never fan out multiple outbound messages for a burst response.
            const parts = isSimulatedTransport
                ? [singleOutboundContent]
                : rawParts;

            if (isSimulatedTransport) {
                console.log(`[${runId}] Simulated transport enabled (${transportSimReason || 'unknown'}).`);
            }

            for (let i = 0; i < parts.length; i++) {
                const partContent = parts[i];
                if (!partContent) continue;
                const outboundText = repairMojibake(partContent);

                const typingDuration = Math.min(6000, 2000 + (outboundText.length * 50));
                if (!isSimulatedTransport) {
                    await sendTypingIndicator(instanceName, resolvedRemoteJid, typingDuration);
                }

                // --- CHECK #2: ANTI-SPAM FINAL (First Part Only) — FIXED: anchor-based ---
                if (i === 0) {
                    try {
                        if (isFollowUpTrigger) {
                            const leadStillFollowUpEnabled = await isLeadFollowUpEnabledNow(supabase, leadId);
                            if (!leadStillFollowUpEnabled) {
                                decision = 'lead_follow_up_disabled_before_send';
                                return respondNoSend(
                                    { skipped: 'lead_follow_up_disabled_before_send', runId },
                                    'lead_follow_up_disabled_before_send'
                                );
                            }
                        } else {
                            const leadStillAiEnabled = await isLeadAiEnabledNow(supabase, leadId);
                            if (!leadStillAiEnabled) {
                                decision = 'lead_ai_disabled_before_send';
                                return respondNoSend(
                                    { skipped: 'lead_ai_disabled_before_send', runId },
                                    'lead_ai_disabled_before_send'
                                );
                            }
                        }

                        if (!isScheduledTrigger) {
                            const { data: latestClientAtSend } = await supabase
                                .from('interacoes')
                                .select('id')
                                .eq('lead_id', leadId)
                                .eq('instance_name', instanceName)
                                .eq('tipo', 'mensagem_cliente')
                                .order('id', { ascending: false })
                                .limit(1)
                                .maybeSingle();

                            // In burst mode, only the call that was invoked with the latest inbound id is allowed to send.
                            // This prevents older runs (even if they adopted latest) from winning and sending before the final quiet-window call.
                            const raceInteractionId = burstMode ? (inputInteractionId ?? interactionId) : interactionId;

                            if (latestClientAtSend?.id && String(latestClientAtSend.id) !== String(raceInteractionId)) {
                                decision = 'lost_latest_race';
                                console.warn(`[${runId}] Skipped (Final Check): interaction ${raceInteractionId} lost race to latest ${latestClientAtSend.id}.`);
                                return respondNoSend({ skipped: "lost_latest_race", runId }, 'lost_latest_race');
                            }

                            if (burstMode && latestClientAtSend?.id) {
                                const burstKey = `${instanceName}:${resolvedRemoteJid}:${latestClientAtSend.id}`;
                                try {
                                    await supabase.from('ai_action_logs').insert({
                                        lead_id: Number(leadId),
                                        action_type: 'burst_winner_claim',
                                        details: JSON.stringify({
                                            key: burstKey,
                                            runId,
                                            interactionId: latestClientAtSend.id
                                        }),
                                        success: true
                                    });

                                    const { data: winnerClaim } = await supabase
                                        .from('ai_action_logs')
                                        .select('id, details')
                                        .eq('lead_id', Number(leadId))
                                        .eq('action_type', 'burst_winner_claim')
                                        .filter('details', 'ilike', `%"key":"${burstKey}"%`)
                                        .order('id', { ascending: true })
                                        .limit(1)
                                        .maybeSingle();

                                    if (winnerClaim?.details) {
                                        let winnerRunId: string | null = null;
                                        try {
                                            winnerRunId = JSON.parse(winnerClaim.details)?.runId || null;
                                        } catch (_) {
                                            winnerRunId = null;
                                        }

                                        if (winnerRunId && winnerRunId !== runId) {
                                            decision = 'lost_burst_winner';
                                            console.warn(`[${runId}] Skipped (Burst Winner): winner is ${winnerRunId}.`);
                                            return respondNoSend({ skipped: "lost_burst_winner", runId }, 'lost_burst_winner');
                                        }
                                    }
                                } catch (winnerErr) {
                                    console.warn(`[${runId}] burst_winner_claim failed (non-blocking):`, winnerErr);
                                }
                            }
                        } else {
                            decision = 'scheduled_trigger_skip_final_race_check';
                        }

                        const { data: finalCheck, error: finalError } = await supabase
                            .from('interacoes')
                            .select('id, created_at, tipo, wa_from_me')
                            .eq('instance_name', instanceName)
                            .eq('remote_jid', resolvedRemoteJid)
                            .in('tipo', ['mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor'])
                            .order('id', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (!finalError && finalCheck) {
                            const lastTime2 = new Date(finalCheck.created_at).getTime();
                            const nowTime2 = Date.now();

                            // Already replied after anchor → abort
                            if (anchorMsgCreatedAt && lastTime2 > anchorMsgCreatedAt) {
                                decision = 'already_replied_final';
                                console.warn(`🛑 [${runId}] Skipped (Final Check): Already replied after anchor.`);
                                return respondNoSend({ skipped: "already_replied_final", runId }, 'already_replied_final');
                            }

                            // Tight loop guard check
                            if ((nowTime2 - lastTime2) < 5000) {
                                // ... existing guard ...
                            }
                        } // end of spam check 2
                    } catch (err) {
                        console.error(`⚠️ [${runId}] Anti-Spam Check #2 failed (non-blocking):`, err);
                    }
                }

                const evoUrl = Deno.env.get('EVOLUTION_API_URL');
                const evoKey = Deno.env.get('EVOLUTION_API_KEY');
                const numberToSend = resolvedRemoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');

                if (isSimulatedTransport) {
                    evolutionSendStatus = 202;
                    const { data: ins, error: insErr } = await supabase.from('interacoes').insert({
                        lead_id: leadId,
                        user_id: lead.user_id,
                        mensagem: outboundText,
                        tipo: 'mensagem_vendedor',
                        instance_name: instanceName,
                        phone_e164: numberToSend,
                        remote_jid: resolvedRemoteJid,
                        wa_from_me: true
                    }).select('id').single();

                    if (insErr) console.error('DB Insert Error (Smoke):', insErr);
                    else {
                        console.log(`Outbound inserted id (Smoke): ${ins?.id} (Instance: ${instanceName})`);
                        didSendOutbound = true; // Tarefa 1: mark reply as sent (simulated)
                        try {
                            await supabase.from('ai_action_logs').insert({
                                lead_id: Number(leadId),
                                action_type: 'simulated_outbound',
                                details: JSON.stringify({
                                    runId,
                                    interactionId: anchorInteractionId || null,
                                    source: sourceTag || null,
                                    reason: transportSimReason,
                                    remote_jid: resolvedRemoteJid,
                                    message_id: ins?.id || null,
                                    message_preview: outboundText.substring(0, 120)
                                }),
                                success: true
                            });
                        } catch (simLogErr) {
                            console.warn(`[${runId}] simulated_outbound log failed (non-blocking):`, simLogErr);
                        }
                    }
                    continue;
                }

                const nowMinus60sIso = new Date(Date.now() - 60_000).toISOString();
                const { data: recentOutboundRows, error: rateLimitErr } = await supabase
                    .from('interacoes')
                    .select('id')
                    .eq('lead_id', leadId)
                    .eq('wa_from_me', true)
                    .eq('tipo', 'mensagem_vendedor')
                    .gte('created_at', nowMinus60sIso);

                if (rateLimitErr) {
                    console.warn(`[${runId}] Rate-limit check failed (fail-open):`, rateLimitErr?.message || rateLimitErr);
                } else {
                    let recentCount = (recentOutboundRows || []).length;
                    if (recentCount > 0) {
                        const recentOutboundIds = new Set<number>();
                        for (const row of (recentOutboundRows || [])) {
                            const rowId = Number((row as any)?.id);
                            if (Number.isFinite(rowId)) recentOutboundIds.add(rowId);
                        }

                        try {
                            const { data: simulatedLogs, error: simulatedLogsErr } = await supabase
                                .from('ai_action_logs')
                                .select('details')
                                .eq('lead_id', Number(leadId))
                                .eq('action_type', 'simulated_outbound')
                                .gte('created_at', nowMinus60sIso);

                            if (simulatedLogsErr) {
                                console.warn(`[${runId}] Rate-limit simulated_outbound lookup failed (non-blocking):`, simulatedLogsErr?.message || simulatedLogsErr);
                            } else if (simulatedLogs?.length) {
                                const simulatedIds = new Set<number>();
                                for (const logRow of simulatedLogs) {
                                    try {
                                        const details = typeof (logRow as any)?.details === 'string'
                                            ? JSON.parse((logRow as any).details)
                                            : (logRow as any)?.details;
                                        const msgId = Number(details?.message_id);
                                        if (Number.isFinite(msgId) && recentOutboundIds.has(msgId)) {
                                            simulatedIds.add(msgId);
                                        }
                                    } catch (_) {
                                        // Ignore malformed details rows
                                    }
                                }

                                if (simulatedIds.size > 0) {
                                    recentCount = Math.max(0, recentCount - simulatedIds.size);
                                }
                            }
                        } catch (simLookupErr) {
                            console.warn(`[${runId}] Rate-limit simulated_outbound parse failed (non-blocking):`, simLookupErr);
                        }
                    }

                    if (recentCount >= maxOutboundPerLeadPerMin) {
                        decision = 'rate_limited';
                        await logRateLimitedOutbound(recentCount, anchorInteractionId || null);
                        return respondNoSend({ aborted: 'rate_limited', runId }, 'rate_limited', 'blocked');
                    }
                }

                if (evoUrl && evoKey) {

                    console.log(`📤 Sending Part ${i + 1}/${parts.length} to Evolution: ${instanceName} -> ${numberToSend}`);

                    const sendResp = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
                        method: 'POST',
                        headers: { 'apikey': evoKey, 'Content-Type': 'application/json; charset=utf-8' },
                        body: JSON.stringify({
                            number: numberToSend,
                            text: outboundText,
                            textMessage: { text: outboundText }
                        })
                    });

                    evolutionSendStatus = sendResp.status;
                    console.log(`📨 Evolution Send Status: ${sendResp.status}`);

                    if (sendResp.ok) {
                        // C. LOG OUTBOUND (Strictly for this instance)
                        const { data: ins, error: insErr } = await supabase.from('interacoes').insert({
                            lead_id: leadId,
                            user_id: lead.user_id,
                            mensagem: outboundText,
                            tipo: 'mensagem_vendedor',
                            instance_name: instanceName, // STRICT
                            phone_e164: numberToSend,
                            remote_jid: resolvedRemoteJid,
                            wa_from_me: true
                        }).select('id').single();

                        if (insErr) console.error('❌ DB Insert Error:', insErr);
                        else {
                            console.log(`💾 Outbound inserted id: ${ins?.id} (Instance: ${instanceName})`);
                            didSendOutbound = true; // Tarefa 1: mark reply as sent (live)
                        }

                    } else {
                        const errText = await sendResp.text();
                        console.error(`❌ Send Failed: ${sendResp.status} - ${errText}`);
                    }
                }

                // Delay between parts
                if (i < parts.length - 1) {
                    const splitDelay = Math.floor(Math.random() * 400 + 800); // 800-1200ms
                    console.log(`⏳ Split Delay: ${splitDelay}ms`);
                    await new Promise(r => setTimeout(r, splitDelay));
                }
            }
        }

        if (didSendOutbound && !isFollowUpTrigger) {
            try {
                const followUpSchedule = await cancelAndScheduleFollowUp({
                    supabase,
                    leadId,
                    orgId: leadOrgId,
                    currentStage,
                    instanceName,
                    runId,
                });
                followUpScheduleStatus = followUpSchedule.scheduled
                    ? `scheduled_step_${followUpSchedule.scheduledStep || 1}`
                    : `skipped:${followUpSchedule.skippedReason || 'unknown'}`;
            } catch (followUpScheduleErr: any) {
                followUpScheduleStatus = `error:${String(followUpScheduleErr?.message || followUpScheduleErr || 'unknown').slice(0, 120)}`;
                console.warn(`[${runId}] follow-up sequence scheduling failed (non-blocking):`, followUpScheduleErr);
            }
        } else if (isFollowUpTrigger) {
            followUpScheduleStatus = 'not_applicable_follow_up_trigger';
        }

        // 9. STAGE TRANSITION (Increment 3.1: Implicit move if target provided)
        if (aiRes.target_stage) {
            const target = normalizeStage(aiRes.target_stage);

            // --- V9 GATING LOGIC ---
            let gateCheck = true;
            if (target === 'chamada_agendada' || target === 'visita_agendada') {
                if (currentStage === 'respondeu' && qualificationState.missingKeys.length > 0) {
                    gateCheck = false;
                    qualificationGateBlocked = true;
                    stageGateBlockReason = `qualification_incomplete:${qualificationState.missingKeys[0]}`;
                    console.warn(`🛑 [${runId}] stage_gate_block: target=${target}, reason=${stageGateBlockReason}`);
                } else if (
                    target === 'visita_agendada'
                    && currentStage === 'respondeu'
                    && qualificationState.visitMissingKeys.length > 0
                ) {
                    gateCheck = false;
                    stageGateBlockReason = `visit_requirements_incomplete:${qualificationState.visitMissingKeys[0]}`;
                    console.warn(`🛑 [${runId}] stage_gate_block: target=${target}, reason=${stageGateBlockReason}`);
                } else if (appointmentWritten || appointmentSkippedReason === 'skipped_duplicate') {
                    // Gated: only move if appointment was written OR duplicate
                    gateCheck = true;
                } else {
                    gateCheck = false;
                    stageGateBlockReason = appointmentSkippedReason || appointmentError || appointmentPrecheckBlockedReason || 'missing_appointment_write';
                    console.warn(`🛑 [${runId}] stage_gate_block: target=${target}, reason=${stageGateBlockReason}`);
                }
            }

            // Verify transition (allow if valid, irrespective of action='move_stage' or 'send_message')
            if (gateCheck && target !== currentStage && isValidTransition(currentStage, target)) {

                // INCREMENT 10: Safe Update (Tarefa 3: check return value)
                const stageResult = await updateLeadStageSafe(supabase, leadId, target, runId);
                if (stageResult.success) {
                    console.log(`🚚 [${runId}] Moved stage: ${currentStage} -> ${target}`);
                    stageMoveResult = `${currentStage}_to_${target}`; // Tarefa 2
                } else {
                    console.error(`❌ [${runId}] Stage update FAILED: ${stageResult.error}`);
                    stageMoveResult = `error:${currentStage}_to_${target}:${stageResult.error}`; // Tarefa 2
                }

            } else if (target !== currentStage) {
                if (!stageGateBlockReason && !isValidTransition(currentStage, target)) {
                    stageGateBlockReason = 'invalid_transition';
                }
                console.warn(`⚠️ [${runId}] Invalid transition blocked (or Gated): ${currentStage} -> ${target}`);
                stageMoveResult = `blocked:${currentStage}_to_${target}`; // Tarefa 2
            }
        }

        // --- TAREFA 1: DETERMINISTIC FALLBACK — novo_lead → respondeu ---
        // Guarantees the stage move even when the LLM omits target_stage from its JSON response.
        // Only fires if: (a) LLM did NOT provide target_stage, (b) current stage is novo_lead,
        // (c) the agent actually sent an outbound reply this run (didSendOutbound=true).
        // Does NOT fire for aborted/yielded runs (those return via respondNoSend before reaching here).
        if (!aiRes.target_stage && currentStage === 'novo_lead' && didSendOutbound) {
            console.log(`🔧 [${runId}] Deterministic fallback: novo_lead → respondeu (LLM omitted target_stage, didSendOutbound=true)`);
            const fallbackResult = await updateLeadStageSafe(supabase, leadId, 'respondeu', runId);
            if (fallbackResult.success) {
                stageMoveResult = 'novo_lead_to_respondeu_deterministic'; // Tarefa 2
                (aiRes as any)._deterministic_stage_move = 'novo_lead_to_respondeu';
            } else {
                console.error(`❌ [${runId}] Deterministic fallback stage update FAILED: ${fallbackResult.error}`);
                stageMoveResult = `error:novo_lead_to_respondeu_deterministic:${fallbackResult.error}`; // Tarefa 2
            }
        }

        if (transportMode !== 'live') {
            aiRes._transport_mode = transportMode;
            aiRes._transport_reason = transportSimReason;
        }

        // 10. STRUCTURED LOG
        const structuredLog = {
            event: 'ai_agent_run_complete',
            runId,
            anchorInteractionId,
            anchorCreatedAt,
            lastOutboundCreatedAt,
            lastInboundAgeMs,
            aggregatedBurstCount,
            aggregatedChars,
            decision,
            trigger_type: triggerType,
            is_scheduled_trigger: isScheduledTrigger,
            config_stage_key: configStageKey,
            effective_agent_type: effectiveAgentType,
            stageFallbackUsed,
            kb_hits_count: kbHitsCount,
            kb_chars: kbChars,
            kb_error: kbError,
            kb_org_id_used: kbOrgId,
            kb_org_id_source: kbOrgIdSource,
            web_used: webUsed,
            web_results_count: webResultsCount,
            web_error: webError,
            schedule_timezone: scheduleTimezone,
            schedule_policy_mode: schedulePolicyMode,
            schedule_call_min_days: scheduleCallMinDays,
            schedule_visit_min_days: scheduleVisitMinDays,
            after_hours_for_call: isAfterHoursForCall,
            schedule_busy_count: scheduleBusyCount,
            schedule_slots_available_call: availableSlotsByType.call.length,
            schedule_slots_available_visit: availableSlotsByType.visit.length,
            schedule_slots_available_meeting: availableSlotsByType.meeting.length,
            schedule_slots_available_installation: availableSlotsByType.installation.length,
            slot_selection_event: slotSelectionEvent,
            slot_selection_start_at: slotSelectionStartAt,
            slot_selection_type: slotSelectionType,
            appointment_precheck_block_reason: appointmentPrecheckBlockedReason,
            implicit_confirmation_used: implicitConfirmationUsed,
            stage_gate_block_reason: stageGateBlockReason,
            after_hours_call_blocked: afterHoursCallBlocked,
            manual_return_mode_used: manualReturnModeUsed,
            qualification_gate_blocked: qualificationGateBlocked,
            qualification_missing_keys: qualificationMissingKeysForLog.join(',') || null,
            no_outbound_fallback_used: noOutboundFallbackUsed,
            evolutionSendStatus,
            transport_mode: transportMode,
            transport_sim_reason: transportSimReason,
            solar_gate_intent: gate?.intent || null,
            solar_gate_missing: gate?.missing?.join(',') || null,
            solar_gate_applied: gateApplied || false,
            // Stage move observability (Tarefa 2)
            stage_move_result: stageMoveResult,
            stage_current: currentStage,
            stage_target_from_llm: (aiRes as any)?.target_stage || null,
            did_send_outbound: didSendOutbound,
            follow_up_schedule_status: followUpScheduleStatus,
            // V6
            v6_fields_candidate_count: v6FieldsCandidateCount,
            v6_fields_written_count: v6FieldsWrittenCount,
            // V7
            v7_comment_written: v7CommentWritten,
            v7_comment_skipped_reason: v7CommentSkippedReason,
            v7_followup_written: v7FollowupWritten,
            v7_followup_skipped_reason: v7FollowupSkippedReason,
            // V11 stage_data JSONB
            v11_stage_data_candidate_count: v11StageDataCandidateCount,
            v11_stage_data_written_count: v11StageDataWrittenCount,
            v11_stage_data_namespace: v11StageDataNamespace,
            v11_stage_data_skipped_reason: v11StageDataSkippedReason,
            // V9
            v9_appointment_written: appointmentWritten,
            v9_appointment_skipped_reason: appointmentSkippedReason,
            v9_appointment_error: appointmentError,
            // V10
            v10_proposal_written: proposalWritten,
            v10_proposal_skipped_reason: proposalSkippedReason,
        };
        console.log(`📊 [${runId}] STRUCTURED_LOG: ${JSON.stringify(structuredLog)}`);

        leadUpdatesSummary = {
            ...(leadUpdatesSummary || {}),
            fields_written_count: v6FieldsWrittenCount,
            stage_data_written_count: v11StageDataWrittenCount,
            comment_written: v7CommentWritten,
            followup_written: v7FollowupWritten,
            appointment_written: appointmentWritten,
            proposal_written: proposalWritten,
            stage_move_result: stageMoveResult,
            qualification_gate_blocked: qualificationGateBlocked,
            qualification_missing_keys: qualificationMissingKeysForLog,
            no_outbound_fallback_used: noOutboundFallbackUsed,
            schedule_policy_mode: schedulePolicyMode,
            after_hours_call_blocked: afterHoursCallBlocked,
        };
        latestAiResponse = aiRes as any;

        const finalReasonCode = didSendOutbound
            ? 'message_sent'
            : (isScheduledTrigger ? 'scheduled_trigger_no_outbound' : 'no_outbound_action');
        const finalEnvelope = buildAgentResultEnvelope({
            reasonCode: finalReasonCode,
            messageSent: didSendOutbound,
            runId,
            triggerType,
            scheduledJobId: payload?.scheduledJobId ? String(payload.scheduledJobId) : null,
            effectiveAgentType,
            transportMode,
            transportReason: transportSimReason,
            leadUpdates: leadUpdatesSummary,
            aiResponse: aiRes as any,
            extras: {
                structured_log: structuredLog,
                did_send_outbound: didSendOutbound,
            },
        });
        await persistAgentOutcome(finalEnvelope);

        return new Response(JSON.stringify(finalEnvelope), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error("Agent Error:", error);
        try {
            if (leadId) {
                await supabase.from('ai_action_logs').insert({
                    org_id: leadOrgId || null,
                    lead_id: Number(leadId) || null,
                    action_type: 'agent_unhandled_exception',
                    details: JSON.stringify({
                        runId: runId || null,
                        error: error?.message || String(error),
                        stack: (error?.stack || '').substring(0, 500)
                    }),
                    success: false
                });
            }
        } catch (_logErr) { /* non-blocking */ }
        const errorEnvelope = buildAgentResultEnvelope({
            reasonCode: 'exception',
            messageSent: false,
            runId,
            triggerType: payload?.triggerType || null,
            scheduledJobId: payload?.scheduledJobId ? String(payload.scheduledJobId) : null,
            effectiveAgentType,
            transportMode: 'blocked',
            transportReason: 'exception',
            leadUpdates: leadUpdatesSummary,
            aiResponse: latestAiResponse,
            extras: {
                error: error.message,
            },
        });
        await persistAgentOutcome(errorEnvelope);
        return new Response(
            JSON.stringify(errorEnvelope),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

// --- V9: CREATE APPOINTMENT executor ---
async function executeCreateAppointment(
    supabase: any,
    leadId: string | number,
    appointment: any,
    runId: string,
    anchorCreatedAt: string | null,
    anchorInteractionId: string | number | null,
    orgId: string,
    userId: string
): Promise<{ written: boolean; skippedReason: string | null; appointmentId: string | null }> {
    // Validate start_at
    if (!appointment?.start_at) {
        console.warn(`⚠️ [${runId}] V9: Appointment skipped (missing start_at)`);
        return { written: false, skippedReason: 'missing_start_at', appointmentId: null };
    }

    let startAt: string;
    let endAt: string;
    try {
        const s = new Date(appointment.start_at);
        if (isNaN(s.getTime())) throw new Error("Invalid start_at");
        startAt = s.toISOString();

        if (appointment.end_at) {
            const e = new Date(appointment.end_at);
            if (!isNaN(e.getTime()) && e > s) {
                endAt = e.toISOString();
            } else {
                // Default 30 min
                endAt = new Date(s.getTime() + 30 * 60000).toISOString();
            }
        } else {
            endAt = new Date(s.getTime() + 30 * 60000).toISOString();
        }
    } catch (dErr) {
        console.warn(`⚠️ [${runId}] V9: Appointment skipped (invalid dates):`, dErr);
        return { written: false, skippedReason: 'invalid_dates', appointmentId: null };
    }

    const title = (appointment.title || 'Agendamento').trim().substring(0, 200);
    // Map to Portuguese types for safety (DB constraint might be strict)
    let type = 'chamada';
    const rawType = (appointment.type || '').toLowerCase();
    if (rawType.includes('visit') || rawType.includes('visita')) type = 'visita';
    else if (rawType.includes('meet') || rawType.includes('reunia')) type = 'reuniao';
    else if (rawType.includes('instal')) type = 'instalacao';

    const notes = (appointment.notes || '').trim().substring(0, 1000) || null;
    const location = (appointment.location || '').trim().substring(0, 500) || null;

    // Dedup check (Strict interactionId)
    // We store interactionId in ai_action_logs.details->>'interactionId'
    // User requested "match exato em details->>'interactionId'".
    const interactionIdStr = String(anchorInteractionId || '');

    if (interactionIdStr) {
        try {
            // Using .filter with arrow operator for strict JSON value matching
            const { data: existing } = await supabase
                .from('ai_action_logs')
                .select('id')
                .eq('lead_id', leadId)
                .eq('action_type', 'appointment_created')
                .filter('details->>interactionId', 'eq', interactionIdStr)
                .limit(1)
                .maybeSingle();

            if (existing) {
                console.log(`⏭️ [${runId}] V9: Appointment skipped (duplicate for interaction ${interactionIdStr})`);
                return { written: false, skippedReason: 'skipped_duplicate', appointmentId: null };
            }
        } catch (dedupErr: any) {
            console.warn(`⚠️ [${runId}] V9: Dedup check failed:`, dedupErr?.message);
        }
    }

    try {
        // Insert appointment (org-aware first; fallback only for legacy schema without org_id)
        const insertPayload: any = {
            org_id: orgId,
            user_id: userId,
            lead_id: Number(leadId),
            title,
            type,
            status: 'scheduled',
            start_at: startAt,
            end_at: endAt,
            notes,
            location
        };

        let inserted: any = null;
        let insertErr: any = null;

        {
            const resp = await supabase.from('appointments').insert(insertPayload).select('id').single();
            inserted = resp.data;
            insertErr = resp.error;
        }

        if (insertErr && isMissingOrgIdColumnError(insertErr)) {
            console.warn(`⚠️ [${runId}] V9: appointments.org_id missing, retrying legacy insert without org_id`);
            const legacyPayload = { ...insertPayload };
            delete legacyPayload.org_id;
            const retryResp = await supabase.from('appointments').insert(legacyPayload).select('id').single();
            inserted = retryResp.data;
            insertErr = retryResp.error;
        }

        if (insertErr) {
            console.error(`❌ [${runId}] V9: appointments insert error:`, insertErr.message);
            return { written: false, skippedReason: `db_error: ${insertErr.message}`, appointmentId: null };
        }

        const appointmentId = inserted?.id || null;

        // Audit Log
        await supabase.from('ai_action_logs').insert({
            lead_id: Number(leadId),
            action_type: 'appointment_created',
            details: JSON.stringify({
                interactionId: interactionIdStr, // Strict field for dedup
                runId,
                appointment_id: appointmentId,
                title,
                start_at: startAt,
                end_at: endAt,
                type
            }),
            success: true
        });

        console.log(`📅 [${runId}] V9: Appointment created (id=${appointmentId}, start=${startAt})`);
        return { written: true, skippedReason: null, appointmentId };

    } catch (err: any) {
        console.error(`❌ [${runId}] V9: executeCreateAppointment error:`, err?.message || err);
        return { written: false, skippedReason: `exception: ${err?.message}`, appointmentId: null };
    }
}

function mapCustomerTypeToSegment(customerType: string | null | undefined): 'residencial' | 'empresarial' | 'agronegocio' | 'usina' | 'indefinido' {
    const normalized = String(customerType || '').toLowerCase().trim();
    if (normalized === 'residencial') return 'residencial';
    if (normalized === 'comercial' || normalized === 'industrial') return 'empresarial';
    if (normalized === 'rural') return 'agronegocio';
    if (normalized === 'usina') return 'usina';
    return 'indefinido';
}

// --- V10: CREATE PROPOSAL DRAFT executor ---
async function executeCreateProposalDraft(
    supabase: any,
    leadId: string | number,
    proposal: any,
    runId: string,
    anchorInteractionId: string | number | null,
    userId: string,
    orgId: string
): Promise<{ written: boolean; skippedReason: string | null; proposalId: string | null }> {
    // Basic validation
    if (!proposal || typeof proposal !== 'object') {
        return { written: false, skippedReason: 'invalid_proposal_object', proposalId: null };
    }

    const valorProjeto = normalizeMoneyBRL(proposal.valor_projeto?.value);
    const consumoKwh = normalizeKwh(proposal.consumo_kwh?.value);

    // Safety: Don't save if crucial values are missing/zero
    if (!valorProjeto || !consumoKwh) {
        console.warn(`⚠️ [${runId}] V10: Draft skipped (missing valor/consumo). val=${valorProjeto}, cons=${consumoKwh}`);
        return { written: false, skippedReason: 'missing_critical_values', proposalId: null };
    }

    // Confidence Check: Never save low confidence
    if (proposal.valor_projeto?.confidence === 'low' || proposal.consumo_kwh?.confidence === 'low') {
        return { written: false, skippedReason: 'low_confidence', proposalId: null };
    }

    // Check for EXISTING proposal
    const { data: existing } = await supabase
        .from('propostas')
        .select('id, status, valor_projeto')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    // OVERWRITE PROTECTION
    if (existing) {
        if (existing.status !== 'Rascunho') {
            // Protected status -> DO NOT OVERWRITE
            // Fallback: Create a comment with the proposed values
            const parts = [`Valor R$${valorProjeto}`, `Consumo ${consumoKwh} kWh`];
            if (proposal.potencia_kw?.value) parts.push(`Potência ${proposal.potencia_kw.value} kW`);
            if (proposal.paineis_qtd?.value) parts.push(`Painéis ${proposal.paineis_qtd.value}`);
            if (proposal.economia_mensal?.value) parts.push(`Economia R$${proposal.economia_mensal.value}/mês`);
            if (proposal.payback_anos?.value) parts.push(`Payback ${proposal.payback_anos.value} anos`);
            let fallbackComment = `[Proposta Bloqueada] Proposta existente (${existing.status}) preservada. Valores sugeridos: ${parts.join(', ')}.`;
            if (proposal.assumptions && typeof proposal.assumptions === 'string') {
                fallbackComment += ` Premissas: ${proposal.assumptions}`;
            }
            fallbackComment = fallbackComment.substring(0, 1200);
            await executeAddComment(supabase, leadId, fallbackComment, 'proposal_blocked', 'IA (Sistema)', runId, null, anchorInteractionId);
            console.log(`🛡️ [${runId}] V10: Draft overwrite blocked (Status=${existing.status}). Saved as comment.`);
            return { written: false, skippedReason: 'overwrite_blocked_status', proposalId: existing.id };
        }

        // If status IS 'Rascunho', we can update logic? 
        // User rule: "atualizar somente se confidence high/user/confirmed"
        const isHighConf = (proposal.valor_projeto?.confidence === 'high' && proposal.consumo_kwh?.confidence === 'high');
        const isUserSource = (proposal.valor_projeto?.source === 'user' || proposal.valor_projeto?.source === 'confirmed');

        if (!isHighConf && !isUserSource) {
            console.log(`🛡️ [${runId}] V10: Rascunho update skipped (confidence/source check failed)`);
            return { written: false, skippedReason: 'update_confidence_low', proposalId: existing.id };
        }
    }

    // Prepare payload
    const payload = {
        lead_id: Number(leadId),
        user_id: userId,
        valor_projeto: valorProjeto,
        consumo_kwh: consumoKwh,
        potencia_kw: Number(proposal.potencia_kw?.value || 0),
        paineis_qtd: Number(proposal.paineis_qtd?.value || 0),
        economia_mensal: Number(proposal.economia_mensal?.value || 0),
        payback_anos: Number(proposal.payback_anos?.value || 0),
        status: 'Rascunho'
    };



    try {
        let proposalId = null;
        if (existing) {
            // Update
            const { error: updErr } = await supabase.from('propostas').update(payload).eq('id', existing.id);
            if (updErr) throw updErr;
            proposalId = existing.id;
        } else {
            // Insert
            const { data: ins, error: insErr } = await supabase.from('propostas').insert(payload).select('id').single();
            if (insErr) throw insErr;
            proposalId = ins.id;
        }

        // Premium/versioned proposal snapshot (non-blocking)
        try {
            const segment = mapCustomerTypeToSegment(proposal.customer_type?.value);
            const versionStatus = existing && existing.status === 'Rascunho' ? 'draft' : 'ready';
            const premiumPayload = {
                persuasion_pillars: ['custo', 'economia', 'confianca'],
                objective: 'gerar_rascunho_ia_com_contexto',
                cta: 'confirmar_dados_para_apresentacao',
                assumptions: typeof proposal.assumptions === 'string' ? proposal.assumptions : null,
            };

            const contextSnapshot = {
                generated_at: new Date().toISOString(),
                source: 'ai',
                segment,
                lead_id: Number(leadId),
                proposal_values: {
                    valor_projeto: valorProjeto,
                    consumo_kwh: consumoKwh,
                    potencia_kw: Number(proposal.potencia_kw?.value || 0),
                    paineis_qtd: Number(proposal.paineis_qtd?.value || 0),
                    economia_mensal: Number(proposal.economia_mensal?.value || 0),
                    payback_anos: Number(proposal.payback_anos?.value || 0),
                },
            };

            let nextVersionNo = 1;
            try {
                const { data: lastVersion } = await supabase
                    .from('proposal_versions')
                    .select('version_no')
                    .eq('proposta_id', proposalId)
                    .order('version_no', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (lastVersion?.version_no && Number(lastVersion.version_no) > 0) {
                    nextVersionNo = Number(lastVersion.version_no) + 1;
                }
            } catch (versionLookupErr) {
                console.warn(`[${runId}] V10: version lookup failed (non-blocking):`, versionLookupErr);
            }

            const { data: version, error: versionErr } = await supabase
                .from('proposal_versions')
                .insert({
                    proposta_id: proposalId,
                    lead_id: Number(leadId),
                    user_id: userId,
                    org_id: orgId,
                    version_no: nextVersionNo,
                    status: versionStatus,
                    segment,
                    source: 'ai',
                    premium_payload: premiumPayload,
                    context_snapshot: contextSnapshot,
                })
                .select('id')
                .single();

            if (versionErr) {
                console.warn(`[${runId}] V10: proposal_versions insert failed (non-blocking):`, versionErr);
            } else if (version?.id) {
                const { error: deliveryErr } = await supabase.from('proposal_delivery_events').insert({
                    proposal_version_id: version.id,
                    proposta_id: proposalId,
                    lead_id: Number(leadId),
                    user_id: userId,
                    channel: 'crm',
                    event_type: 'generated',
                    metadata: {
                        generated_by: 'ai',
                        proposal_status: payload.status
                    },
                });
                if (deliveryErr) {
                    console.warn(`[${runId}] V10: proposal_delivery_events insert failed (non-blocking):`, deliveryErr);
                }
            }
        } catch (premiumErr) {
            console.warn(`[${runId}] V10: premium proposal snapshot skipped (non-blocking):`, premiumErr);
        }

        // Handle Assumptions (save as comment)
        if (proposal.assumptions && typeof proposal.assumptions === 'string') {
            await executeAddComment(supabase, leadId, `[Premissas da Proposta] ${proposal.assumptions}`, 'note', 'IA', runId, null, anchorInteractionId);
        }

        // Audit Log
        await supabase.from('ai_action_logs').insert({
            lead_id: Number(leadId),
            action_type: 'proposal_draft_created',
            details: JSON.stringify({
                runId,
                proposal_id: proposalId,
                values: payload,
                operation: existing ? 'update' : 'insert'
            }),
            success: true
        });

        console.log(`📄 [${runId}] V10: Proposal Draft ${existing ? 'updated' : 'created'} (id=${proposalId}, val=${valorProjeto})`);
        return { written: true, skippedReason: null, proposalId };

    } catch (err: any) {
        console.error(`❌ [${runId}] V10: executeCreateProposalDraft error:`, err?.message || err);
        return { written: false, skippedReason: `exception: ${err?.message}`, proposalId: null };
    }
}
