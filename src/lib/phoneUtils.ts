export function onlyPhoneDigits(phone: string | undefined | null): string {
    return String(phone || '').replace(/\D/g, '');
}

/**
 * Normalizes a phone number to E.164-like digits-only format.
 * Default behavior assumes BR local numbers (10/11 digits) should receive country code 55.
 *
 * Returns null when the number is outside expected bounds (<10 or >15 digits).
 */
export function normalizePhoneE164(phone: string | undefined | null): string | null {
    const digits = onlyPhoneDigits(phone);
    if (!digits) return null;
    if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
    if (digits.length < 10 || digits.length > 15) return null;
    return digits;
}

/**
 * Returns a storage-safe phone value:
 * - E.164-like normalized digits when valid
 * - fallback to digits-only when invalid (so caller can still validate/report)
 */
export function normalizePhoneForStorage(phone: string | undefined | null): string {
    return normalizePhoneE164(phone) || onlyPhoneDigits(phone);
}

/**
 * Format a phone number for display.
 * Strips the '55' Brazil country code prefix if present and formats as (DD) XXXXX-XXXX.
 */
export function formatPhoneForDisplay(phone: string | undefined | null): string {
    if (!phone) return '';

    let digits = onlyPhoneDigits(phone);

    // 55 + 2 digit DDD + 8/9 number digits = 12/13 total.
    if (digits.startsWith('55') && digits.length >= 12) {
        digits = digits.substring(2);
    }

    if (digits.length === 11) {
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
    }
    if (digits.length === 10) {
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
    }

    return digits;
}

export function cleanPhoneInput(phone: string): string {
    return onlyPhoneDigits(phone);
}
