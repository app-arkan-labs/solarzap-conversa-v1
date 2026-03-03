import { useEffect, useState } from 'react';

/**
 * Local cover image galleries by project type.
 * Stored in /public/proposal-covers to avoid runtime CORS/network issues.
 */
const COVER_IMAGE_GALLERIES: Record<string, string[]> = {
  residencial: [
    '/proposal-covers/residencial-1.jpg?v=20260302-beauty4',
    '/proposal-covers/residencial-2.jpg?v=20260302-beauty4',
    '/proposal-covers/residencial-3.jpg?v=20260302-beauty4',
  ],
  comercial: [
    '/proposal-covers/comercial-1.jpg?v=20260302-beauty2',
    '/proposal-covers/comercial-2.jpg?v=20260302-beauty2',
    '/proposal-covers/comercial-3.jpg?v=20260302-beauty2',
  ],
  industrial: [
    '/proposal-covers/industrial-1.jpg?v=20260302-beauty2',
    '/proposal-covers/industrial-2.jpg?v=20260302-beauty2',
    '/proposal-covers/industrial-3.jpg?v=20260302-beauty2',
  ],
  rural: [
    '/proposal-covers/rural-1.jpg?v=20260302-beauty2',
    '/proposal-covers/rural-2.jpg?v=20260302-beauty2',
    '/proposal-covers/rural-3.jpg?v=20260302-beauty2',
  ],
  usina: [
    '/proposal-covers/usina-1.jpg?v=20260302-beauty2',
    '/proposal-covers/usina-2.jpg?v=20260302-beauty2',
    '/proposal-covers/usina-3.jpg?v=20260302-beauty2',
  ],
};

/** Default fallback gallery */
const DEFAULT_COVER_GALLERY = COVER_IMAGE_GALLERIES.residencial;

// ── Module-level cache to avoid re-fetching ──
const _cache = new Map<string, string>();
const _inflight = new Map<string, Promise<string | null>>();

function keyFor(tipoCliente: string): string {
  return (tipoCliente || 'residencial').toLowerCase().trim();
}

function resolveGallery(tipoCliente: string): string[] {
  const key = keyFor(tipoCliente);
  return COVER_IMAGE_GALLERIES[key] || DEFAULT_COVER_GALLERY;
}

function toAbsoluteAssetUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (typeof window === 'undefined') return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${window.location.origin}${normalizedPath}`;
}

/**
 * Fetch a remote image URL and convert it to a base64 data URL.
 * Uses Image+Canvas first (CORS), falls back to fetch+FileReader.
 */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const absoluteUrl = toAbsoluteAssetUrl(url);

  // Approach 1: Image + Canvas
  try {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d')!.drawImage(img, 0, 0);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      setTimeout(() => resolve(null), 12_000);
      img.src = absoluteUrl;
    });
    if (dataUrl) return dataUrl;
  } catch {
    /* fall through */
  }

  // Approach 2: fetch + FileReader
  try {
    const res = await fetch(absoluteUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Pre-fetch the cover image for a given client type and cache the data URL.
 * Safe to call multiple times — deduplicates in-flight requests.
 */
export function prefetchCoverImage(tipoCliente: string): Promise<string | null> {
  const url = resolveGallery(tipoCliente)[0] || DEFAULT_COVER_GALLERY[0];
  const cached = _cache.get(url);
  if (cached) return Promise.resolve(cached);

  const existing = _inflight.get(url);
  if (existing) return existing;

  const promise = fetchImageAsDataUrl(url).then((dataUrl) => {
    _inflight.delete(url);
    if (dataUrl) {
      _cache.set(url, dataUrl);
    }
    return dataUrl;
  });
  _inflight.set(url, promise);
  return promise;
}

/**
 * Pre-fetch multiple cover images for mosaic-style covers.
 */
export async function prefetchCoverImages(tipoCliente: string, limit = 3): Promise<string[]> {
  const urls = resolveGallery(tipoCliente).slice(0, Math.max(1, limit));
  const results = await Promise.all(urls.map((url) => {
    const cached = _cache.get(url);
    if (cached) return Promise.resolve(cached);

    const existing = _inflight.get(url);
    if (existing) {
      return existing.then((value) => value || '');
    }

    const request = fetchImageAsDataUrl(url).then((dataUrl) => {
      _inflight.delete(url);
      if (dataUrl) _cache.set(url, dataUrl);
      return dataUrl;
    });
    _inflight.set(url, request);
    return request.then((value) => value || '');
  }));

  return results.filter((value): value is string => Boolean(value));
}

/**
 * Synchronously get the cached cover image data URL (or null if not yet fetched).
 */
export function getCoverImageDataUrl(tipoCliente: string): string | null {
  const url = resolveGallery(tipoCliente)[0] || DEFAULT_COVER_GALLERY[0];
  return _cache.get(url) || null;
}

/**
 * Synchronously get all cached cover images for a given segment.
 */
export function getCoverImageDataUrls(tipoCliente: string, limit = 3): string[] {
  return resolveGallery(tipoCliente)
    .slice(0, Math.max(1, limit))
    .map((url) => _cache.get(url) || null)
    .filter((value): value is string => Boolean(value));
}

/**
 * React hook that pre-fetches the cover image for the given client type.
 * Returns the base64 data URL when ready, or null while loading / on failure.
 */
export function useProposalCoverImage(tipoCliente: string | undefined) {
  const [coverImageDataUrl, setCoverImageDataUrl] = useState<string | null>(() =>
    getCoverImageDataUrl(tipoCliente || 'residencial'),
  );
  const [coverImageDataUrls, setCoverImageDataUrls] = useState<string[]>(() =>
    getCoverImageDataUrls(tipoCliente || 'residencial'),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const segment = keyFor(tipoCliente || 'residencial');
    const cachedList = getCoverImageDataUrls(segment);
    if (cachedList.length > 0) {
      setCoverImageDataUrls(cachedList);
      setCoverImageDataUrl(cachedList[0] || null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    prefetchCoverImages(segment, 3).then((dataUrls) => {
      if (!cancelled) {
        setCoverImageDataUrls(dataUrls);
        setCoverImageDataUrl(dataUrls[0] || null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tipoCliente]);

  return { coverImageDataUrl, coverImageDataUrls, loading };
}
