type ErrorRecord = Record<string, unknown>;

const AUTH_INVALID_PATTERNS = [
  'jwt expired',
  'invalid jwt',
  'invalid token',
  'token is expired',
  'session expired',
  'refresh token',
  'invalid refresh token',
  'refresh_token',
  'auth session missing',
  'session_not_found',
  'token has expired',
  'expired_token',
];

const AUTH_ERROR_NAMES = ['authapierror', 'authretryablefetcherror'];

const asRecord = (value: unknown): ErrorRecord | null => {
  if (typeof value !== 'object' || value === null) return null;
  return value as ErrorRecord;
};

export type AuthErrorMetadata = {
  message: string;
  status?: number;
  code?: string;
  name?: string;
};

export const extractAuthErrorMetadata = (error: unknown): AuthErrorMetadata => {
  const record = asRecord(error);
  const message =
    (error instanceof Error && error.message) ||
    (record && typeof record.message === 'string' ? record.message : '') ||
    '';

  const status =
    record && typeof record.status === 'number'
      ? record.status
      : record && typeof record.statusCode === 'number'
        ? record.statusCode
        : undefined;

  const code = record && typeof record.code === 'string' ? record.code : undefined;
  const name =
    (error instanceof Error && error.name) ||
    (record && typeof record.name === 'string' ? record.name : undefined);

  return {
    message,
    status,
    code,
    name,
  };
};

const hasAuthInvalidMessage = (message: string) => {
  const normalized = message.toLowerCase();
  return AUTH_INVALID_PATTERNS.some((pattern) => normalized.includes(pattern));
};

export const shouldAttemptAuthRecovery = (error: unknown): boolean => {
  const { message, status, code, name } = extractAuthErrorMetadata(error);
  const normalizedName = name?.toLowerCase() ?? '';
  const normalizedCode = code?.toLowerCase() ?? '';

  if (normalizedCode === 'pgrst301' || normalizedCode === '42501') return false;

  if (hasAuthInvalidMessage(message)) return true;

  if (status === 401 && AUTH_ERROR_NAMES.includes(normalizedName)) return true;
  if (status === 401 && normalizedCode.includes('jwt')) return true;

  return false;
};
