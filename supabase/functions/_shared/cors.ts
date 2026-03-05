const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

type ResolveCorsOptions = {
  allowMethods?: string;
  allowHeaders?: string;
  allowLocalhost?: boolean;
};

type ResolvedCorsPolicy = {
  allowedOrigins: string[];
  allowLocalhost: boolean;
};

export type ResolvedRequestCors = {
  corsHeaders: Record<string, string>;
  requestOrigin: string | null;
  originAllowed: boolean;
  missingAllowedOriginConfig: boolean;
};

const DEFAULT_ALLOW_METHODS = 'POST, OPTIONS';
const DEFAULT_ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

const normalizeOrigin = (value: string): string => value.trim().replace(/\/+$/, '');

const parseBoolean = (value: string | undefined | null): boolean => String(value || '').trim().toLowerCase() === 'true';

const parseOriginsCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter((item) => item.length > 0);

const dedupe = (items: string[]): string[] => Array.from(new Set(items));

const resolveCorsPolicy = (allowLocalhostOverride?: boolean): ResolvedCorsPolicy => {
  const allowedOriginsCsv = String(Deno.env.get('ALLOWED_ORIGINS') || '').trim();
  const legacyAllowedOrigin = normalizeOrigin(String(Deno.env.get('ALLOWED_ORIGIN') || ''));
  const allowLocalhostEnv = parseBoolean(Deno.env.get('ALLOW_LOCALHOST_CORS'));

  const parsed = allowedOriginsCsv ? parseOriginsCsv(allowedOriginsCsv) : [];
  if (legacyAllowedOrigin) {
    parsed.push(legacyAllowedOrigin);
  }

  return {
    allowedOrigins: dedupe(parsed),
    allowLocalhost: typeof allowLocalhostOverride === 'boolean' ? allowLocalhostOverride : allowLocalhostEnv,
  };
};

export const resolveRequestCors = (
  req: Request,
  options?: ResolveCorsOptions,
): ResolvedRequestCors => {
  const policy = resolveCorsPolicy(options?.allowLocalhost);
  const allowMethods = options?.allowMethods || DEFAULT_ALLOW_METHODS;
  const allowHeaders = options?.allowHeaders || DEFAULT_ALLOW_HEADERS;
  const requestOriginRaw = String(req.headers.get('origin') || '').trim();
  const requestOrigin = requestOriginRaw ? normalizeOrigin(requestOriginRaw) : null;

  const hasAllowlistConfigured = policy.allowedOrigins.length > 0 || policy.allowLocalhost;
  const isLocalhostOrigin = Boolean(requestOrigin && LOCALHOST_ORIGIN_REGEX.test(requestOrigin));
  const isListedOrigin = Boolean(requestOrigin && policy.allowedOrigins.includes(requestOrigin));
  const originAllowed = !requestOrigin || isListedOrigin || (policy.allowLocalhost && isLocalhostOrigin);

  const responseOrigin = requestOrigin || policy.allowedOrigins[0] || null;

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': allowMethods,
    Vary: 'Origin',
  };

  if (responseOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = responseOrigin;
  }

  return {
    corsHeaders,
    requestOrigin,
    originAllowed,
    missingAllowedOriginConfig: !hasAllowlistConfigured,
  };
};
