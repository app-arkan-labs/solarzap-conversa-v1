/**
 * CPF / CNPJ — validation, formatting & cleanup utilities.
 */

/* ── CPF ─────────────────────────────────────────────────────── */

/** Remove everything except digits. */
export function cleanCpf(value: string): string {
  return value.replace(/\D/g, '');
}

/** Apply XXX.XXX.XXX-XX mask (up to 11 digits). */
export function formatCpf(value: string): string {
  const digits = cleanCpf(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Validate CPF using the check-digit algorithm. */
export function isValidCpf(value: string): boolean {
  const digits = cleanCpf(value);
  if (digits.length !== 11) return false;

  // Reject sequences where all digits are the same (e.g. 111.111.111-11)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (slice: string, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (factor - i);
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const d1 = calcDigit(digits.slice(0, 9), 10);
  if (d1 !== Number(digits[9])) return false;

  const d2 = calcDigit(digits.slice(0, 10), 11);
  return d2 === Number(digits[10]);
}

/* ── CNPJ ────────────────────────────────────────────────────── */

/** Remove everything except digits. */
export function cleanCnpj(value: string): string {
  return value.replace(/\D/g, '');
}

/** Apply XX.XXX.XXX/XXXX-XX mask (up to 14 digits). */
export function formatCnpj(value: string): string {
  const digits = cleanCnpj(value).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Validate CNPJ using the check-digit algorithm. */
export function isValidCnpj(value: string): boolean {
  const digits = cleanCnpj(value);
  if (digits.length !== 14) return false;

  // Reject sequences where all digits are the same
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcDigit = (slice: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(slice[i]) * weights[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const d1 = calcDigit(digits.slice(0, 12), weights1);
  if (d1 !== Number(digits[12])) return false;

  const d2 = calcDigit(digits.slice(0, 13), weights2);
  return d2 === Number(digits[13]);
}
