/**
 * Regression tests for useSolarResource hook.
 *
 * Key regression: failure MUST NOT clear previously resolved data.
 * This was the root cause of the recurring "proposal generator stopped working" bug.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Mocks ----

const mockInvoke = vi.fn();
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null });
const mockRefreshSession = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: {
      getSession: () => mockGetSession(),
      refreshSession: () => mockRefreshSession(),
    },
  },
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { useSolarResource, isStrictPvgisSource } from '../../src/hooks/useSolarResource';
import type { UseSolarResourceReturn } from '../../src/hooks/useSolarResource';

// ---- Helpers ----

function buildSuccessResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      source: 'pvgis',
      lat: -23.5505,
      lon: -46.6333,
      annualIrradianceKwhM2Day: 4.85,
      monthlyIrradianceKwhM2Day: [4.1, 4.3, 4.5, 4.7, 4.9, 5.0, 5.1, 5.2, 5.0, 4.8, 4.5, 4.2],
      monthlyGenerationFactors: [1.0, 1.02, 1.05, 1.08, 1.1, 1.12, 1.14, 1.12, 1.1, 1.06, 1.02, 1.0],
      referenceYear: 2023,
      cached: false,
      degraded: false,
      requestId: 'req-123',
      ...overrides,
    },
    error: null,
  };
}

function buildErrorResponse(errorCode: string) {
  return {
    data: { errorCode },
    error: null,
  };
}

const defaultLocationParams = {
  cidade: 'Sao Paulo',
  estado: 'SP',
  endereco: 'Av Paulista 1000',
  cep: '01310100',
};

// ---- Tests ----

describe('useSolarResource', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockToast.mockReset();
  });

  it('starts in idle state with no data', () => {
    const { result } = renderHook(() => useSolarResource());
    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.errorCode).toBeNull();
  });

  it('resolves successfully and sets data + status', async () => {
    mockInvoke.mockResolvedValueOnce(buildSuccessResponse());

    const { result } = renderHook(() => useSolarResource());

    let resolveResult: unknown;
    await act(async () => {
      resolveResult = await result.current.resolve(defaultLocationParams);
    });

    expect(resolveResult).not.toBeNull();
    expect(result.current.status).toBe('resolved');
    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.source).toBe('pvgis');
    expect(result.current.data!.annualIrradianceKwhM2Day).toBe(4.85);
    expect(result.current.data!.monthlyIrradianceKwhM2Day).toHaveLength(12);
    expect(result.current.data!.monthlyGenerationFactors).toHaveLength(12);
    expect(result.current.data!.resolvedAt).toBeTruthy();
    expect(result.current.loading).toBe(false);
    expect(result.current.errorCode).toBeNull();
    expect(mockToast).not.toHaveBeenCalled();
  });

  // ── KEY REGRESSION TEST ──
  it('NEVER clears existing data on subsequent failure', async () => {
    // First: resolve successfully
    mockInvoke.mockResolvedValueOnce(buildSuccessResponse());
    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      await result.current.resolve(defaultLocationParams);
    });

    const previousData = result.current.data;
    expect(previousData).not.toBeNull();
    expect(previousData!.source).toBe('pvgis');

    // Second: resolve fails — data MUST persist
    mockInvoke.mockResolvedValueOnce(buildErrorResponse('pvgis_unavailable'));

    await act(async () => {
      const failResult = await result.current.resolve({
        ...defaultLocationParams,
        endereco: 'Rua Diferente 200', // different address to avoid dedup
      });
      expect(failResult).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('pvgis_unavailable');
    // THE CRITICAL ASSERTION: data from first resolve MUST still be there
    expect(result.current.data).toBe(previousData);
    expect(result.current.data!.source).toBe('pvgis');
    expect(result.current.data!.annualIrradianceKwhM2Day).toBe(4.85);
  });

  it('shows toast on error', async () => {
    mockInvoke.mockResolvedValueOnce(buildErrorResponse('pvgis_unavailable'));

    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      await result.current.resolve(defaultLocationParams);
    });

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        title: 'PVGIS indisponivel',
      }),
    );
  });

  it('shows specific toast for geocode_low_confidence', async () => {
    mockInvoke.mockResolvedValueOnce(buildErrorResponse('geocode_low_confidence'));

    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      await result.current.resolve(defaultLocationParams);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Endereco com baixa confianca',
        variant: 'destructive',
      }),
    );
  });

  it('shows specific toast for unauthorized', async () => {
    mockInvoke.mockResolvedValueOnce(buildErrorResponse('unauthorized'));

    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      await result.current.resolve(defaultLocationParams);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sessao invalida' }),
    );
  });

  it('shows generic toast for unexpected_error', async () => {
    mockInvoke.mockResolvedValueOnce(buildErrorResponse('unexpected_error'));

    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      await result.current.resolve(defaultLocationParams);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Falha ao buscar dados solares' }),
    );
  });

  it('rejects non-pvgis source as pvgis_unavailable', async () => {
    mockInvoke.mockResolvedValueOnce(
      buildSuccessResponse({ source: 'cache_local' }),
    );

    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      const res = await result.current.resolve(defaultLocationParams);
      expect(res).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('pvgis_unavailable');
  });

  it('reset() clears all state', async () => {
    mockInvoke.mockResolvedValueOnce(buildSuccessResponse());

    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      await result.current.resolve(defaultLocationParams);
    });

    expect(result.current.data).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.data).toBeNull();
    expect(result.current.errorCode).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('restoreFromContact with pvgis source sets resolved status', () => {
    const { result } = renderHook(() => useSolarResource());

    act(() => {
      result.current.restoreFromContact({
        latitude: -23.5,
        longitude: -46.6,
        irradianceSource: 'pvgis',
        irradianceRefAt: new Date().toISOString(),
      });
    });

    expect(result.current.status).toBe('resolved');
  });

  it('restoreFromContact with non-pvgis source does NOT set resolved', () => {
    const { result } = renderHook(() => useSolarResource());

    act(() => {
      result.current.restoreFromContact({
        latitude: -23.5,
        longitude: -46.6,
        irradianceSource: 'cache',
      });
    });

    expect(result.current.status).toBe('idle');
  });

  it('deduplicates identical in-flight requests', async () => {
    let resolvePromise!: (v: unknown) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result } = renderHook(() => useSolarResource());

    // Fire two identical requests simultaneously
    let p1: Promise<unknown>;
    let p2: Promise<unknown>;
    act(() => {
      p1 = result.current.resolve(defaultLocationParams);
      p2 = result.current.resolve(defaultLocationParams);
    });

    // Resolve the single underlying promise
    await act(async () => {
      resolvePromise(buildSuccessResponse());
      await p1!;
      await p2!;
    });

    // invoke should have been called only ONCE
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('resolved');
  });

  it('passes strictPvgisOnly:true in the request', async () => {
    mockInvoke.mockResolvedValueOnce(buildSuccessResponse());

    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      await result.current.resolve(defaultLocationParams);
    });

    expect(mockInvoke).toHaveBeenCalledWith('solar-resource', {
      body: expect.objectContaining({ strictPvgisOnly: true }),
    });
  });

  it('handles supabase-js FunctionsHttpError shape', async () => {
    const httpError = new Error('FunctionsHttpError');
    (httpError as any).context = {
      clone() {
        return this;
      },
      async json() {
        return { errorCode: 'upstream_timeout', requestId: 'req-timeout' };
      },
    };
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError });

    const { result } = renderHook(() => useSolarResource());

    await act(async () => {
      const res = await result.current.resolve(defaultLocationParams);
      expect(res).toBeNull();
    });

    expect(result.current.errorCode).toBe('upstream_timeout');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'PVGIS indisponivel' }),
    );
  });
});

describe('isStrictPvgisSource', () => {
  it('returns true only for "pvgis"', () => {
    expect(isStrictPvgisSource('pvgis')).toBe(true);
  });

  it('returns false for other sources', () => {
    expect(isStrictPvgisSource('cache')).toBe(false);
    expect(isStrictPvgisSource('fallback')).toBe(false);
    expect(isStrictPvgisSource('')).toBe(false);
    expect(isStrictPvgisSource(undefined)).toBe(false);
    expect(isStrictPvgisSource(null)).toBe(false);
  });
});
