type LocationLike = {
  origin: string;
  pathname: string;
  search: string;
  hash: string;
};

const normalizePathname = (pathname: string): string => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : '/';
};

const parseHashParams = (hash: string): URLSearchParams => {
  if (!hash) return new URLSearchParams();

  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryIndex = withoutHash.indexOf('?');
  const queryLike = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : withoutHash;

  return new URLSearchParams(queryLike);
};

const getRecoveryType = (locationLike: Pick<LocationLike, 'search' | 'hash'>): string | null => {
  const searchParams = new URLSearchParams(locationLike.search);
  const searchType = searchParams.get('type');
  if (searchType) return searchType;

  const hashParams = parseHashParams(locationLike.hash);
  return hashParams.get('type');
};

const hasRecoveryMarker = (locationLike: Pick<LocationLike, 'search' | 'hash'>): boolean => {
  const searchParams = new URLSearchParams(locationLike.search);
  const searchMarker = searchParams.get('password_recovery');
  if (searchMarker === '1' || searchMarker === 'true') return true;

  const hashParams = parseHashParams(locationLike.hash);
  const hashMarker = hashParams.get('password_recovery');
  return hashMarker === '1' || hashMarker === 'true';
};

export const getPasswordRecoveryRedirectTarget = (locationLike: LocationLike): string | null => {
  const isRecoveryType = getRecoveryType(locationLike) === 'recovery';
  const hasMarker = hasRecoveryMarker(locationLike);

  if (!isRecoveryType && !hasMarker) {
    return null;
  }

  const normalizedPath = normalizePathname(locationLike.pathname);
  if (normalizedPath === '/update-password' || normalizedPath.endsWith('/update-password')) {
    return null;
  }

  const targetUrl = new URL('/update-password', locationLike.origin);
  targetUrl.search = locationLike.search;
  targetUrl.hash = locationLike.hash;

  return targetUrl.toString();
};
