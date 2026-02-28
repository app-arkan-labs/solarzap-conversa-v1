export type SolarResourceSource = 'pvgis' | 'open_meteo' | 'cache' | 'uf_fallback';

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
}
