import { describe, expect, it } from 'vitest';
import { resolveAdminGuardState } from '@/components/admin/adminGuardState';

describe('adminGuardState', () => {
  it('redirects common users away from /admin', () => {
    expect(
      resolveAdminGuardState({
        authLoading: false,
        hasUser: true,
        whoamiLoading: false,
        whoamiHasError: true,
        whoamiErrorCode: 'not_system_admin',
        isAal2: false,
        mfaResolved: false,
        mfaLoading: false,
        mfaError: false,
        hasEnrolledFactor: false,
      }),
    ).toBe('role_denied');
  });

  it('routes system admin without MFA factors to setup', () => {
    expect(
      resolveAdminGuardState({
        authLoading: false,
        hasUser: true,
        whoamiLoading: false,
        whoamiHasError: true,
        whoamiErrorCode: 'mfa_required',
        isAal2: false,
        mfaResolved: true,
        mfaLoading: false,
        mfaError: false,
        hasEnrolledFactor: false,
      }),
    ).toBe('mfa_setup_required');
  });

  it('routes system admin with existing factor and aal1 to verify', () => {
    expect(
      resolveAdminGuardState({
        authLoading: false,
        hasUser: true,
        whoamiLoading: false,
        whoamiHasError: true,
        whoamiErrorCode: 'mfa_required',
        isAal2: false,
        mfaResolved: true,
        mfaLoading: false,
        mfaError: false,
        hasEnrolledFactor: true,
      }),
    ).toBe('mfa_verify_required');
  });

  it('surfaces forbidden origin as diagnostic state', () => {
    expect(
      resolveAdminGuardState({
        authLoading: false,
        hasUser: true,
        whoamiLoading: false,
        whoamiHasError: true,
        whoamiErrorCode: 'forbidden_origin',
        isAal2: false,
        mfaResolved: false,
        mfaLoading: false,
        mfaError: false,
        hasEnrolledFactor: false,
      }),
    ).toBe('origin_error');
  });

  it('surfaces auth gateway failures as session errors', () => {
    expect(
      resolveAdminGuardState({
        authLoading: false,
        hasUser: true,
        whoamiLoading: false,
        whoamiHasError: true,
        whoamiErrorCode: 'gateway_auth_error',
        isAal2: false,
        mfaResolved: false,
        mfaLoading: false,
        mfaError: false,
        hasEnrolledFactor: false,
      }),
    ).toBe('session_error');
  });
});
