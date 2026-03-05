export type SolarResourceSource =
  | 'pvgis'
  | 'pvgis_cache_degraded'
  | 'open_meteo'
  | 'cache'
  | 'uf_fallback';

export type SolarResourceErrorCode =
  | 'unauthorized'
  | 'geocode_failed'
  | 'pvgis_unavailable'
  | 'upstream_rate_limited'
  | 'upstream_timeout'
  | 'upstream_http_error'
  | 'unexpected_error';

export interface SolarResourceDebug {
  phase?: 'auth' | 'geocode' | 'pvgis' | 'cache' | 'unexpected';
  upstreamStatus?: number | null;
  attempts?: number;
  lat?: number | null;
  lon?: number | null;
  cacheKeyTried?: string[];
  message?: string;
}

export interface SolarResourceRequest {
  city?: string;
  uf?: string;
  lat?: number;
  lon?: number;
}

export interface SolarResourceResponse {
  source: SolarResourceSource;
  lat: number | null;
  lon: number | null;
  annualIrradianceKwhM2Day: number;
  monthlyIrradianceKwhM2Day: number[];
  monthlyGenerationFactors: number[];
  referenceYear: number | null;
  cached: boolean;
  degraded?: boolean;
  errorCode?: SolarResourceErrorCode;
  debug?: SolarResourceDebug;
}

export interface SolarResourceErrorPayload {
  error: string;
  errorCode: SolarResourceErrorCode;
  debug?: SolarResourceDebug;
}
