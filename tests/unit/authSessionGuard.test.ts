import { describe, expect, it } from 'vitest';
import { extractAuthErrorMetadata, shouldAttemptAuthRecovery } from '@/lib/authSessionGuard';

describe('authSessionGuard', () => {
  it('attempts recovery when jwt expired message appears', () => {
    const error = new Error('JWT expired');
    expect(shouldAttemptAuthRecovery(error)).toBe(true);
  });

  it('attempts recovery for AuthApiError 401', () => {
    const error = {
      name: 'AuthApiError',
      status: 401,
      message: 'Unauthorized',
    };
    expect(shouldAttemptAuthRecovery(error)).toBe(true);
  });

  it('does not attempt recovery for RLS forbidden errors', () => {
    const error = {
      code: '42501',
      status: 403,
      message: 'permission denied for table organization_members',
    };
    expect(shouldAttemptAuthRecovery(error)).toBe(false);
  });

  it('does not attempt recovery for generic 401 without auth invalid signal', () => {
    const error = {
      status: 401,
      message: 'request failed',
      name: 'PostgrestError',
    };
    expect(shouldAttemptAuthRecovery(error)).toBe(false);
  });

  it('extracts metadata from unknown error-like objects', () => {
    const error = {
      statusCode: 401,
      code: 'token_expired',
      message: 'token has expired',
      name: 'CustomError',
    };
    expect(extractAuthErrorMetadata(error)).toEqual({
      status: 401,
      code: 'token_expired',
      message: 'token has expired',
      name: 'CustomError',
    });
  });
});
