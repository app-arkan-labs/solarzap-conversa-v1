/**
 * useSolarResource — Isolated hook for geocoding + PVGIS irradiance resolution.
 *
 * Extracted from useProposalForm to prevent unrelated changes from breaking
 * the coordinate/irradiance flow. This hook owns its own state and has ZERO
 * coupling to form state, financial models, PDF generation or any other concern.
 */
import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import type {
  SolarResourceDebug,
  SolarResourceErrorCode,
  SolarResourceErrorPayload,
  SolarResourceResponse,
} from '@/types/solarResource';

// ── Types ──

export type SolarResourceStatus = 'idle' | 'loading' | 'resolved' | 'error';

export interface SolarResourceData {
  source: SolarResourceResponse['source'];
  lat: number | null;
  lon: number | null;
  annualIrradianceKwhM2Day: number;
  monthlyIrradianceKwhM2Day: number[];
  monthlyGenerationFactors: number[];
  referenceYear: number | null;
  cached: boolean;
  degraded?: boolean;
  requestId?: string;
  resolvedAt: string; // ISO timestamp
}

export interface LocationParams {
  cidade?: string;
  estado?: string;
  endereco?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
}

export interface UseSolarResourceReturn {
  /** Current status of the solar resource resolution */
  status: SolarResourceStatus;
  /** Resolved data (persists until new successful resolution) */
  data: SolarResourceData | null;
  /** Whether a request is in-flight */
  loading: boolean;
  /** Last error code (null when resolved or idle) */
  errorCode: SolarResourceErrorCode | null;
  /** Resolve location: geocode + PVGIS. Never clears existing data on failure. */
  resolve: (params: LocationParams) => Promise<SolarResourceResponse | null>;
  /** Reset status back to idle (e.g., when modal closes) */
  reset: () => void;
  /** Restore previously-resolved data (e.g., when contact has stored irradiance) */
  restoreFromContact: (contactData: {
    latitude?: number;
    longitude?: number;
    irradianceSource?: string;
    irradianceRefAt?: string;
  }) => void;
}

// ── Helpers ──

const normalizeSolarResourceErrorCode = (value: unknown): SolarResourceErrorCode | null => {
  switch (String(value || '').trim()) {
    case 'unauthorized':
    case 'geocode_failed':
    case 'geocode_provider_unavailable':
    case 'geocode_low_confidence':
    case 'pvgis_unavailable':
    case 'upstream_rate_limited':
    case 'upstream_timeout':
    case 'upstream_http_error':
    case 'unexpected_error':
      return String(value) as SolarResourceErrorCode;
    default:
      return null;
  }
};

export const isStrictPvgisSource = (source: string | undefined | null): boolean =>
  source === 'pvgis';

const toFiniteOrUndefined = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const normalizeCep = (value: string) => value.replace(/\D/g, '').slice(0, 8);

// ── Error payload parsing ──

async function parseSolarResourceErrorPayload(
  rawError: unknown,
): Promise<SolarResourceErrorPayload | null> {
  const tryParseJson = (raw: unknown): any | null => {
    if (!raw || typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const extractCode = (obj: any): SolarResourceErrorPayload | null => {
    if (!obj || typeof obj !== 'object') return null;
    const code = normalizeSolarResourceErrorCode(
      obj.errorCode ?? obj.error ?? obj.code,
    );
    if (!code) return null;
    return {
      error: code,
      errorCode: code,
      debug: obj.debug as SolarResourceDebug | undefined,
      requestId: typeof obj.requestId === 'string' ? obj.requestId : undefined,
    };
  };

  // Strategy 1: supabase-js FunctionsHttpError — context is a Response object
  const ctx = (rawError as any)?.context;
  if (ctx && typeof ctx === 'object') {
    try {
      const resp = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
      if (typeof resp.json === 'function') {
        const payload = await resp.json();
        const result = extractCode(payload);
        if (result) return result;
      }
    } catch {
      /* response may be consumed or invalid */
    }

    const directCtx = extractCode(ctx);
    if (directCtx) return directCtx;

    if (typeof ctx === 'string') {
      const parsed = tryParseJson(ctx);
      const result = extractCode(parsed);
      if (result) return result;
    }
  }

  const directCode = extractCode(rawError as any);
  if (directCode) return directCode;

  const msgParsed = tryParseJson((rawError as any)?.message);
  const msgResult = extractCode(msgParsed);
  if (msgResult) return msgResult;

  const bodyResult = extractCode((rawError as any)?.body);
  if (bodyResult) return bodyResult;

  console.error('[solar-resource] could not parse error payload:', rawError);
  return null;
}

// ── In-flight deduplication ──

type InflightResult = {
  resource: SolarResourceResponse | null;
  errorCode?: SolarResourceErrorCode;
  debug?: SolarResourceDebug;
  requestId?: string;
};

function buildLocationRequestKey(params: {
  uf?: string;
  cidade?: string;
  endereco?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
}): string {
  const normalizedUf = String(params.uf || '').trim().toUpperCase();
  const normalizedCity = String(params.cidade || '').trim().toLowerCase();
  const normalizedAddress = String(params.endereco || '').trim().toLowerCase();
  const normalizedCep = normalizeCep(String(params.cep || ''));
  const normalizedLat = Number.isFinite(Number(params.latitude))
    ? Number(params.latitude).toFixed(6)
    : '';
  const normalizedLon = Number.isFinite(Number(params.longitude))
    ? Number(params.longitude).toFixed(6)
    : '';
  return [normalizedUf, normalizedCity, normalizedAddress, normalizedCep, normalizedLat, normalizedLon].join('|');
}

// ── Ensure fresh session before edge-function call ──

async function ensureFreshSession(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;
    const expiresAt = session.expires_at ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    // Refresh if token expires within 60 seconds
    if (expiresAt - nowSec < 60) {
      console.info('[solar-resource] session near-expiry, refreshing...');
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[solar-resource] session refresh failed:', error.message);
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ── Core invocation (pure function, no React deps) ──

async function callEdgeFunction(params: {
  city?: string | null;
  uf?: string | null;
  addressLine?: string | null;
  zip?: string | null;
  lat?: number;
  lon?: number;
}): Promise<{ data: unknown; error: Error | null; rawErrorCode?: SolarResourceErrorCode; rawDebug?: SolarResourceDebug; rawRequestId?: string }> {
  const geocodingApiKey =
    String((import.meta as any)?.env?.VITE_GOOGLE_GEOCODING_API_KEY || '').trim() || undefined;

  const { data, error } = await supabase.functions.invoke('solar-resource', {
    body: {
      city: params.city || undefined,
      uf: params.uf || undefined,
      addressLine: params.addressLine || undefined,
      zip: params.zip || undefined,
      lat: params.lat,
      lon: params.lon,
      strictPvgisOnly: true,
      geocodingApiKey,
    },
  });

  if (!error) return { data, error: null };

  // Extract error code from the response body
  const ctx = (error as any)?.context;
  let rawBodyText = '(no body)';
  try {
    if (ctx && typeof ctx.clone === 'function') {
      rawBodyText = await ctx.clone().text();
    }
  } catch { /* consumed or unavailable */ }

  console.error('[solar-resource] invoke error:', {
    name: error?.name,
    message: error?.message,
    status: ctx?.status,
    rawBody: rawBodyText,
  });

  const parsedError = await parseSolarResourceErrorPayload(error);

  // Fallback: try to extract errorCode directly from rawBodyText
  let fallbackCode = parsedError?.errorCode ?? null;
  if (!fallbackCode && typeof rawBodyText === 'string' && rawBodyText.includes('"errorCode"')) {
    try {
      const bodyJson = JSON.parse(rawBodyText);
      fallbackCode = normalizeSolarResourceErrorCode(bodyJson?.errorCode ?? bodyJson?.error) ?? null;
    } catch { /* not valid JSON */ }
  }

  return {
    data: null,
    error,
    rawErrorCode: fallbackCode ?? 'unexpected_error',
    rawDebug: parsedError?.debug,
    rawRequestId: parsedError?.requestId,
  };
}

async function invokeSolarResource(params: {
  city?: string | null;
  uf?: string | null;
  addressLine?: string | null;
  zip?: string | null;
  lat?: number;
  lon?: number;
}): Promise<InflightResult> {
  try {
    // Proactively refresh the session if near-expiry to avoid 401
    await ensureFreshSession();

    let result = await callEdgeFunction(params);

    // Auto-retry ONCE on 401 (expired JWT race condition)
    if (result.error && result.rawErrorCode === 'unauthorized') {
      console.warn('[solar-resource] got 401, refreshing session and retrying...');
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr) {
        result = await callEdgeFunction(params);
      } else {
        console.error('[solar-resource] session refresh for retry failed:', refreshErr.message);
      }
    }

    if (result.error) {
      console.error('[solar-resource] final error code:', result.rawErrorCode);
      return {
        resource: null,
        errorCode: result.rawErrorCode ?? 'unexpected_error',
        debug: result.rawDebug,
        requestId: result.rawRequestId,
      };
    }

    if (!result.data || typeof result.data !== 'object') {
      console.error('[solar-resource] empty or non-object data:', result.data);
      return { resource: null, errorCode: 'unexpected_error' };
    }

    const payload = result.data as Record<string, unknown>;
    console.info('[solar-resource] response payload keys:', Object.keys(payload), 'source:', payload.source, 'errorCode:', payload.errorCode);
    const payloadErrorCode = normalizeSolarResourceErrorCode(
      payload.errorCode ?? payload.error,
    );
    if (payloadErrorCode) {
      return {
        resource: null,
        errorCode: payloadErrorCode,
        debug: payload.debug as SolarResourceDebug | undefined,
        requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
      };
    }

    const source = String(payload.source || '').toLowerCase();
    if (!isStrictPvgisSource(source)) {
      return {
        resource: null,
        errorCode: 'pvgis_unavailable',
        debug: payload.debug as SolarResourceDebug | undefined,
        requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
      };
    }

    const monthlyFactors = Array.isArray(payload.monthlyGenerationFactors)
      ? (payload.monthlyGenerationFactors as unknown[])
          .slice(0, 12)
          .map((v) => Math.max(0, Number(v) || 0))
      : [];
    const monthlyIrradiance = Array.isArray(payload.monthlyIrradianceKwhM2Day)
      ? (payload.monthlyIrradianceKwhM2Day as unknown[])
          .slice(0, 12)
          .map((v) => Math.max(0, Number(v) || 0))
      : [];

    if (monthlyFactors.length !== 12 || monthlyIrradiance.length !== 12) {
      return { resource: null, errorCode: 'unexpected_error' };
    }

    return {
      resource: {
        source: source as SolarResourceResponse['source'],
        lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
        lon: Number.isFinite(Number(payload.lon)) ? Number(payload.lon) : null,
        annualIrradianceKwhM2Day: Math.max(0.01, Number(payload.annualIrradianceKwhM2Day) || 4.5),
        monthlyIrradianceKwhM2Day: monthlyIrradiance,
        monthlyGenerationFactors: monthlyFactors,
        referenceYear: Number.isFinite(Number(payload.referenceYear))
          ? Number(payload.referenceYear)
          : null,
        cached: Boolean(payload.cached),
        degraded: Boolean(payload.degraded),
        errorCode: normalizeSolarResourceErrorCode(payload.errorCode),
        debug: payload.debug as SolarResourceDebug | undefined,
        requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
      },
      requestId: typeof payload.requestId === 'string' ? payload.requestId : undefined,
    };
  } catch (err) {
    const parsedError = await parseSolarResourceErrorPayload(err);
    console.warn('solar-resource strict PVGIS request failed:', err);
    return {
      resource: null,
      errorCode: parsedError?.errorCode ?? 'unexpected_error',
      debug: parsedError?.debug,
      requestId: parsedError?.requestId,
    };
  }
}

// ── Hook ──

export function useSolarResource(): UseSolarResourceReturn {
  const [status, setStatus] = useState<SolarResourceStatus>('idle');
  const [data, setData] = useState<SolarResourceData | null>(null);
  const [errorCode, setErrorCode] = useState<SolarResourceErrorCode | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const requestSeqRef = useRef(0);
  const inFlightRef = useRef<Map<string, Promise<InflightResult>>>(new Map());

  const showErrorToast = useCallback(
    (code?: SolarResourceErrorCode, debug?: SolarResourceDebug, requestId?: string) => {
      const requestSuffix = requestId ? ` Ref: ${requestId}` : '';

      if (code === 'unauthorized') {
        toast({
          title: 'Sessão inválida',
          description: `Sua sessão expirou. Faça login novamente para calcular irradiância.${requestSuffix}`,
          variant: 'destructive',
        });
        return;
      }

      if (code === 'geocode_provider_unavailable') {
        toast({
          title: 'Geocodificação indisponível',
          description: `Serviço de geocodificação indisponível. Verifique a chave Google e tente novamente.${requestSuffix}`,
          variant: 'destructive',
        });
        return;
      }

      if (code === 'geocode_low_confidence') {
        toast({
          title: 'Endereço com baixa confiança',
          description: `Não foi possível validar coordenadas com confiança para esse CEP/endereço.${requestSuffix}`,
          variant: 'destructive',
        });
        return;
      }

      if (code === 'geocode_failed') {
        toast({
          title: 'Falha na geocodificação',
          description: `Não foi possível converter a localização em coordenadas válidas.${requestSuffix}`,
          variant: 'destructive',
        });
        return;
      }

      if (
        code === 'pvgis_unavailable' ||
        code === 'upstream_rate_limited' ||
        code === 'upstream_timeout' ||
        code === 'upstream_http_error'
      ) {
        const statusHint = Number.isFinite(Number(debug?.upstreamStatus))
          ? ` (HTTP ${Number(debug?.upstreamStatus)})`
          : '';
        toast({
          title: 'PVGIS indisponível',
          description: `PVGIS indisponível no momento${statusHint}. Tente novamente em alguns segundos.${requestSuffix}`,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Falha ao buscar dados solares',
        description: `Tente novamente em alguns segundos.${requestSuffix}`,
        variant: 'destructive',
      });
    },
    [toast],
  );

  const resolve = useCallback(
    async (params: LocationParams): Promise<SolarResourceResponse | null> => {
      const seq = ++requestSeqRef.current;
      const uf = String(params.estado || '').toUpperCase();
      const cidade = String(params.cidade || '').trim();
      const endereco = String(params.endereco || '').trim();
      const cep = normalizeCep(String(params.cep || ''));
      const hasTextualLocation = Boolean(cidade || endereco || cep);
      const overrideLat = toFiniteOrUndefined(params.latitude);
      const overrideLon = toFiniteOrUndefined(params.longitude);
      const hasOverrideCoords = overrideLat !== undefined && overrideLon !== undefined;

      // When textual location is available, force fresh geocoding (don't reuse stale coords)
      const latitude = hasOverrideCoords ? overrideLat : (!hasTextualLocation ? overrideLat : undefined);
      const longitude = hasOverrideCoords ? overrideLon : (!hasTextualLocation ? overrideLon : undefined);

      const requestKey = buildLocationRequestKey({
        uf,
        cidade,
        endereco,
        cep,
        latitude,
        longitude,
      });

      setLoading(true);
      setStatus('loading');
      setErrorCode(null);

      try {
        let inFlight = inFlightRef.current.get(requestKey);
        if (!inFlight) {
          const promise = invokeSolarResource({
            city: cidade || undefined,
            uf: uf || undefined,
            addressLine: endereco || undefined,
            zip: cep || undefined,
            lat: latitude,
            lon: longitude,
          });
          inFlightRef.current.set(requestKey, promise);
          void promise.finally(() => {
            if (inFlightRef.current.get(requestKey) === promise) {
              inFlightRef.current.delete(requestKey);
            }
          });
          inFlight = promise;
        }

        const result = await inFlight;

        // Stale response guard
        if (seq !== requestSeqRef.current) {
          console.warn('[solar-resource] stale response discarded', { seq, current: requestSeqRef.current });
          return null;
        }

        if (!result.resource) {
          setStatus('error');
          setErrorCode(result.errorCode ?? 'unexpected_error');
          // NEVER clear existing data on failure — this is the key fix
          showErrorToast(result.errorCode, result.debug, result.requestId);
          return null;
        }

        const resolvedData: SolarResourceData = {
          source: result.resource.source,
          lat: result.resource.lat,
          lon: result.resource.lon,
          annualIrradianceKwhM2Day: result.resource.annualIrradianceKwhM2Day,
          monthlyIrradianceKwhM2Day: result.resource.monthlyIrradianceKwhM2Day,
          monthlyGenerationFactors: result.resource.monthlyGenerationFactors,
          referenceYear: result.resource.referenceYear,
          cached: result.resource.cached,
          degraded: result.resource.degraded,
          requestId: result.resource.requestId ?? result.requestId,
          resolvedAt: new Date().toISOString(),
        };

        setData(resolvedData);
        setStatus('resolved');
        setErrorCode(null);
        return result.resource;
      } catch (err) {
        if (seq === requestSeqRef.current) {
          console.error('useSolarResource.resolve error:', err);
          setStatus('error');
          setErrorCode('unexpected_error');
          showErrorToast('unexpected_error');
        }
        return null;
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [showErrorToast],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setData(null);
    setErrorCode(null);
    setLoading(false);
    requestSeqRef.current += 1;
  }, []);

  const restoreFromContact = useCallback(
    (contactData: {
      latitude?: number;
      longitude?: number;
      irradianceSource?: string;
      irradianceRefAt?: string;
    }) => {
      if (isStrictPvgisSource(contactData.irradianceSource)) {
        setStatus('resolved');
        // We don't have full monthly data from contact storage,
        // but mark as resolved so the generate guard allows proceeding.
        // The full data will be populated after resolve() is called.
      }
    },
    [],
  );

  return { status, data, loading, errorCode, resolve, reset, restoreFromContact };
}
