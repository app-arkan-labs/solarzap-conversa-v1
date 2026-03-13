export type InvocationAuthResult =
  | {
    ok: true;
    mode: 'service_role' | 'internal_key';
  }
  | {
    ok: false;
    status: 401 | 403;
    code: 'missing_auth' | 'forbidden' | 'internal_key_not_configured' | 'invalid_authorization';
    reason: string;
    hasAuthorization: boolean;
    hasInternalHeader: boolean;
    hasApiKey: boolean;
  };

const extractBearerToken = (authorizationHeader: string): string => {
  const trimmed = authorizationHeader.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const decoded = atob(payload);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const isServiceRoleBearerToken = (token: string): boolean => {
  const payload = decodeJwtPayload(token);
  const role = String(payload?.role || '');
  return role === 'service_role';
};

export const validateServiceInvocationAuth = (
  req: Request,
  input: {
    serviceRoleKey: string;
    internalApiKey: string;
  },
): InvocationAuthResult => {
  const authorizationHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const apikeyHeader = (req.headers.get('apikey') || '').trim();
  const internalHeader = (req.headers.get('x-internal-api-key') || '').trim();
  const bearerToken = extractBearerToken(authorizationHeader);

  const hasAuthorization = authorizationHeader.trim().length > 0;
  const hasApiKey = apikeyHeader.length > 0;
  const hasInternalHeader = internalHeader.length > 0;

  if (bearerToken) {
    if (input.serviceRoleKey && bearerToken === input.serviceRoleKey) {
      return { ok: true, mode: 'service_role' };
    }
    if (isServiceRoleBearerToken(bearerToken)) {
      return { ok: true, mode: 'service_role' };
    }
  }

  if (input.serviceRoleKey && hasApiKey && apikeyHeader === input.serviceRoleKey) {
    return { ok: true, mode: 'service_role' };
  }

  if (hasInternalHeader) {
    if (!input.internalApiKey) {
      return {
        ok: false,
        status: 403,
        code: 'internal_key_not_configured',
        reason: 'EDGE_INTERNAL_API_KEY is not configured',
        hasAuthorization,
        hasInternalHeader,
        hasApiKey,
      };
    }

    if (internalHeader === input.internalApiKey) {
      return { ok: true, mode: 'internal_key' };
    }
  }

  if (!hasAuthorization && !hasInternalHeader && !hasApiKey) {
    return {
      ok: false,
      status: 401,
      code: 'missing_auth',
      reason: 'Missing Authorization, apikey, or x-internal-api-key',
      hasAuthorization,
      hasInternalHeader,
      hasApiKey,
    };
  }

  if (hasAuthorization && !bearerToken) {
    return {
      ok: false,
      status: 401,
      code: 'invalid_authorization',
      reason: 'Invalid Authorization header format',
      hasAuthorization,
      hasInternalHeader,
      hasApiKey,
    };
  }

  return {
    ok: false,
    status: 403,
    code: 'forbidden',
    reason: 'Provided credentials are not allowed for this endpoint',
    hasAuthorization,
    hasInternalHeader,
    hasApiKey,
  };
};
