import type { AdminApiErrorCode, SystemRole } from '@/hooks/useAdminApi';

export type AdminGuardState =
  | 'unauthenticated'
  | 'checking_access'
  | 'role_denied'
  | 'mfa_setup_required'
  | 'mfa_verify_required'
  | 'allowed'
  | 'session_error'
  | 'origin_error'
  | 'admin_api_error';

export type ResolveAdminGuardStateInput = {
  authLoading: boolean;
  hasUser: boolean;
  whoamiLoading: boolean;
  whoamiHasError: boolean;
  whoamiErrorCode?: AdminApiErrorCode;
  systemRole?: SystemRole;
  isAal2: boolean;
  mfaResolved: boolean;
  mfaLoading: boolean;
  mfaError: boolean;
  hasEnrolledFactor: boolean;
};

export function resolveAdminGuardState(
  input: ResolveAdminGuardStateInput,
): AdminGuardState {
  if (input.authLoading) {
    return 'checking_access';
  }

  if (!input.hasUser) {
    return 'unauthenticated';
  }

  if (input.whoamiLoading) {
    return 'checking_access';
  }

  if (input.whoamiHasError) {
    switch (input.whoamiErrorCode) {
      case 'not_system_admin':
      case 'insufficient_role':
        return 'role_denied';
      case 'mfa_required':
        if (input.isAal2) {
          return 'checking_access';
        }
        if (input.mfaLoading || !input.mfaResolved) {
          return 'checking_access';
        }
        if (input.mfaError) {
          return 'admin_api_error';
        }
        return input.hasEnrolledFactor ? 'mfa_verify_required' : 'mfa_setup_required';
      case 'missing_auth':
      case 'unauthorized':
      case 'gateway_auth_error':
        return 'session_error';
      case 'forbidden_origin':
        return 'origin_error';
      case 'admin_lookup_failed':
      case 'network_error':
      case 'unknown_admin_error':
      default:
        return 'admin_api_error';
    }
  }

  if (!input.systemRole) {
    return 'role_denied';
  }

  return 'allowed';
}
