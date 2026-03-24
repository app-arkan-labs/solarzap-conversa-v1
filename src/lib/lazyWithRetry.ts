import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const LAZY_RETRY_PREFIX = 'szap:lazy-retry:';

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Loading chunk',
  'ChunkLoadError',
  'dynamically imported module',
];

function normalizeErrorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || '';

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function getStorageValue(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageValue(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore storage errors (private mode / blocked storage)
  }
}

function removeStorageValue(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage errors (private mode / blocked storage)
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(normalizeErrorMessage(error) || 'Erro ao carregar módulo dinâmico.');
}

export function isLikelyDynamicImportError(error: unknown): boolean {
  const message = normalizeErrorMessage(error).toLowerCase();
  if (!message) return false;
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern.toLowerCase()));
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  key: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = `${LAZY_RETRY_PREFIX}${key}`;

    try {
      const module = await importer();
      if (typeof window !== 'undefined') {
        removeStorageValue(storageKey);
      }
      return module;
    } catch (error) {
      if (typeof window !== 'undefined' && isLikelyDynamicImportError(error)) {
        const alreadyRetried = getStorageValue(storageKey) === '1';
        if (!alreadyRetried) {
          setStorageValue(storageKey, '1');
          window.location.reload();
          return new Promise<never>(() => {});
        }
        removeStorageValue(storageKey);
      }
      throw toError(error);
    }
  });
}
