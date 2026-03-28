const DEFAULT_ADMIN_HOSTNAMES = ['admin.solarzap.com.br', 'adm.solarzap.com.br'] as const;
const DEFAULT_PUBLIC_APP_HOSTNAMES = [
  'app.solarzap.com.br',
  'crm.solarzap.com.br',
  'solarzap.arkanlabs.com.br',
] as const;

const NORMALIZED_ADMIN_HOSTS = new Set<string>(DEFAULT_ADMIN_HOSTNAMES);
const NORMALIZED_PUBLIC_APP_HOSTS = new Set<string>(DEFAULT_PUBLIC_APP_HOSTNAMES);

const ADMIN_SAFE_PUBLIC_PATHS = [
  '/login',
  '/update-password',
  '/select-organization',
  '/qr/call',
  '/privacidade',
  '/termos',
  '/pricing',
  '/billing',
  '/welcome',
  '/onboarding',
];

const CANONICAL_ADMIN_ORIGIN = 'https://admin.solarzap.com.br';

function normalizeHostname(hostname: string): string {
  return String(hostname || '').trim().toLowerCase();
}

export function isAdminHost(hostname: string = window.location.hostname): boolean {
  return NORMALIZED_ADMIN_HOSTS.has(normalizeHostname(hostname));
}

export function isKnownPublicAppHost(hostname: string = window.location.hostname): boolean {
  return NORMALIZED_PUBLIC_APP_HOSTS.has(normalizeHostname(hostname));
}

export function shouldAllowPublicPathOnAdminHost(pathname: string): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/admin')) return true;
  return ADMIN_SAFE_PUBLIC_PATHS.some((allowedPath) => pathname === allowedPath);
}

export function resolveHostAwareRedirect(locationLike: Pick<Location, 'origin' | 'hostname' | 'pathname' | 'search' | 'hash'>): string | null {
  const { hostname, pathname, search, hash } = locationLike;

  if (isAdminHost(hostname)) {
    if (pathname === '/') {
      return '/admin';
    }

    if (!shouldAllowPublicPathOnAdminHost(pathname)) {
      return '/admin';
    }

    return null;
  }

  if (isKnownPublicAppHost(hostname) && pathname.startsWith('/admin')) {
    return `${CANONICAL_ADMIN_ORIGIN}${pathname}${search}${hash}`;
  }

  return null;
}
