/**
 * Format a phone number for display.
 * Strips the '55' Brazil country code prefix if present and formats as (DD) XXXXX-XXXX.
 * 
 * @param phone Raw phone number (e.g. "5561999999999" or "61999999999")
 * @returns Formatted string (e.g. "(61) 99999-9999")
 */
export function formatPhoneForDisplay(phone: string | undefined | null): string {
    if (!phone) return '';

    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');

    // Check if it starts with 55 (Brazil) and is long enough to be a full number (12 or 13 digits)
    // 55 + 2 digit DDD + 8 or 9 digit number = 12 or 13 digits
    if (digits.startsWith('55') && digits.length >= 12) {
        digits = digits.substring(2);
    }

    // Format based on length (DDD + Number)
    if (digits.length === 11) {
        // (DD) 9XXXX-XXXX
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
    } else if (digits.length === 10) {
        // (DD) XXXX-XXXX
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
    }

    // Fallback: just return digits (or original if really messy) but without 55 if stripped
    return digits;
}

/**
 * Clean a phone number for inputs (strips formatting).
 * Does NOT strip 55 automatically, as we might need it for saving? 
 * Actually, for INPUTs, we usually want to let user type raw.
 */
export function cleanPhoneInput(phone: string): string {
    return phone.replace(/\D/g, '');
}
