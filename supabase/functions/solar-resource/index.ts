import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
if (!ALLOWED_ORIGIN) {
  throw new Error("Missing ALLOWED_ORIGIN env");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CACHE_TTL_DAYS = 30;
const FETCH_TIMEOUT_MS = 15_000;

const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const UF_TO_STATE_NAME: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapa",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceara",
  DF: "Distrito Federal",
  ES: "Espirito Santo",
  GO: "Goias",
  MA: "Maranhao",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Para",
  PB: "Paraiba",
  PR: "Parana",
  PE: "Pernambuco",
  PI: "Piaui",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondonia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "Sao Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const BRAZIL_STATES_IRRADIANCE: Record<string, number> = {
  AC: 4.5,
  AL: 5.3,
  AP: 4.8,
  AM: 4.4,
  BA: 5.5,
  CE: 5.5,
  DF: 5.0,
  ES: 4.8,
  GO: 5.2,
  MA: 5.2,
  MT: 5.0,
  MS: 5.0,
  MG: 5.2,
  PA: 4.6,
  PB: 5.5,
  PR: 4.6,
  PE: 5.4,
  PI: 5.7,
  RJ: 4.7,
  RN: 5.5,
  RS: 4.3,
  RO: 4.6,
  RR: 4.7,
  SC: 4.3,
  SP: 4.7,
  SE: 5.3,
  TO: 5.2,
};

const LEGACY_SEASONAL_PROFILE = [
  1.18, 1.15, 1.08, 0.95, 0.78, 0.70,
  0.74, 0.88, 0.96, 1.07, 1.16, 1.23,
];

const toFinite = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const normalizeText = (value: string): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeFactors = (factors: number[]): number[] => {
  const safe = factors.map((v) => Math.max(0, toFinite(v, 0)));
  const avg = safe.reduce((acc, v) => acc + v, 0) / safe.length;
  if (!Number.isFinite(avg) || avg <= 0) return new Array(12).fill(1);
  return safe.map((v) => v / avg);
};

const LEGACY_FACTORS = normalizeFactors(LEGACY_SEASONAL_PROFILE);

type SolarResourcePayload = {
  source: "pvgis" | "open_meteo" | "cache" | "uf_fallback";
  lat: number | null;
  lon: number | null;
  annualIrradianceKwhM2Day: number;
  monthlyIrradianceKwhM2Day: number[];
  monthlyGenerationFactors: number[];
  referenceYear: number | null;
  cached: boolean;
};

async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildFallbackFromUF(ufRaw: unknown, lat: number | null, lon: number | null): SolarResourcePayload {
  const uf = String(ufRaw || "").trim().toUpperCase();
  const annual = BRAZIL_STATES_IRRADIANCE[uf] ?? 4.5;
  const monthly = LEGACY_FACTORS.map((factor) => Number((annual * factor).toFixed(4)));
  return {
    source: "uf_fallback",
    lat,
    lon,
    annualIrradianceKwhM2Day: annual,
    monthlyIrradianceKwhM2Day: monthly,
    monthlyGenerationFactors: LEGACY_FACTORS.map((factor) => Number(factor.toFixed(6))),
    referenceYear: null,
    cached: false,
  };
}

async function geocodeCity(
  city: string,
  uf: string,
  addressLine = "",
  zip = "",
): Promise<{ lat: number; lon: number } | null> {
  const name = city.trim();
  const normalizedAddress = String(addressLine || "").trim();
  if (!name && !normalizedAddress) return null;
  const normalizedUf = uf.trim().toUpperCase();
  const normalizedZip = String(zip || "").replace(/\D/g, "").slice(0, 8);

  const extractUfFromGoogleResult = (result: any): string => {
    const components = Array.isArray(result?.address_components) ? result.address_components : [];
    const stateComponent = components.find((component: any) =>
      Array.isArray(component?.types) && component.types.includes("administrative_area_level_1"));

    const shortName = String(stateComponent?.short_name || "").trim().toUpperCase();
    if (shortName.length === 2) return shortName;

    const longNameNormalized = normalizeText(String(stateComponent?.long_name || ""));
    if (!longNameNormalized) return "";
    const byLongName = Object.entries(UF_TO_STATE_NAME).find(([, state]) =>
      normalizeText(state) === longNameNormalized);
    return byLongName?.[0] || "";
  };

  const geocodeWithGoogle = async (apiKey: string): Promise<{ lat: number; lon: number } | null> => {
    if (!apiKey) return null;
    const stateLabel = UF_TO_STATE_NAME[normalizedUf] || normalizedUf;
    const address = [
      normalizedAddress,
      name,
      stateLabel,
      normalizedZip || undefined,
      "Brasil",
    ].filter(Boolean).join(", ");
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("components", "country:BR");
    url.searchParams.set("region", "br");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", apiKey);

    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) return null;

    const data = await response.json().catch(() => null);
    if ((data as any)?.status !== "OK") return null;
    const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
    if (results.length === 0) return null;

    const ufMatch = normalizedUf
      ? results.find((row: any) => extractUfFromGoogleResult(row) === normalizedUf)
      : null;
    const selected = ufMatch || results[0];

    const lat = toFinite(selected?.geometry?.location?.lat, NaN);
    const lon = toFinite(selected?.geometry?.location?.lng, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  };

  const googleApiKey = (Deno.env.get("GEOCODING_API_KEY") || Deno.env.get("GOOGLE_GEOCODING_API_KEY") || "").trim();
  if (googleApiKey) {
    const googleResult = await geocodeWithGoogle(googleApiKey).catch(() => null);
    if (googleResult) return googleResult;
  }

  if (normalizedAddress) {
    const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
    nominatimUrl.searchParams.set(
      "q",
      [
        normalizedAddress,
        name || undefined,
        UF_TO_STATE_NAME[normalizedUf] || normalizedUf || undefined,
        normalizedZip || undefined,
        "Brasil",
      ].filter(Boolean).join(", "),
    );
    nominatimUrl.searchParams.set("format", "jsonv2");
    nominatimUrl.searchParams.set("limit", "5");
    nominatimUrl.searchParams.set("countrycodes", "br");
    nominatimUrl.searchParams.set("addressdetails", "1");

    const nominatimResponse = await fetchWithTimeout(
      nominatimUrl.toString(),
      FETCH_TIMEOUT_MS,
      {
        headers: {
          "User-Agent": "SolarZap/1.0 (contact@arkanlabs.com.br)",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      },
    );
    if (nominatimResponse.ok) {
      const nominatimData = await nominatimResponse.json().catch(() => null);
      const nominatimRows = Array.isArray(nominatimData) ? nominatimData : [];
      const ufMatch = normalizedUf
        ? nominatimRows.find((row: any) => {
          const stateCode = String((row as any)?.address?.state_code || "").trim().toUpperCase();
          if (stateCode.length === 2) return stateCode === normalizedUf;
          const stateName = normalizeText(String((row as any)?.address?.state || ""));
          const expected = normalizeText(UF_TO_STATE_NAME[normalizedUf] || "");
          return stateName.length > 0 && stateName === expected;
        })
        : null;
      const selected = ufMatch || nominatimRows[0];
      if (selected) {
        const lat = toFinite((selected as any)?.lat, NaN);
        const lon = toFinite((selected as any)?.lon, NaN);
        if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
      }
    }
  }

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name || normalizedAddress);
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "pt");
  url.searchParams.set("format", "json");
  url.searchParams.set("countryCode", "BR");
  const openMeteoApiKey = (Deno.env.get("OPEN_METEO_API_KEY") || "").trim();
  if (openMeteoApiKey) {
    url.searchParams.set("apikey", openMeteoApiKey);
  }

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  if (results.length === 0) return null;

  const withUf = normalizedUf
    ? results.find((row: any) => String(row?.admin1 || "").toUpperCase().includes(normalizedUf))
    : null;
  const selected = withUf || results[0];

  const lat = toFinite(selected?.latitude, NaN);
  const lon = toFinite(selected?.longitude, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocodeZip(zipRaw: string): Promise<{ lat: number; lon: number } | null> {
  const zip = String(zipRaw || "").replace(/\D/g, "").slice(0, 8);
  if (zip.length !== 8) return null;

  try {
    const brasilApiResponse = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v2/${zip}`);
    if (brasilApiResponse.ok) {
      const brasilApiData = await brasilApiResponse.json().catch(() => null);
      const lat = toFinite((brasilApiData as any)?.location?.coordinates?.latitude, NaN);
      const lon = toFinite((brasilApiData as any)?.location?.coordinates?.longitude, NaN);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  } catch {
    // non-blocking fallback to other geocoders
  }

  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
  nominatimUrl.searchParams.set("q", `${zip}, Brasil`);
  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("limit", "1");
  nominatimUrl.searchParams.set("countrycodes", "br");
  const nominatimResponse = await fetchWithTimeout(
    nominatimUrl.toString(),
    FETCH_TIMEOUT_MS,
    {
      headers: {
        "User-Agent": "SolarZap/1.0 (contact@arkanlabs.com.br)",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    },
  ).catch(() => null);

  if (nominatimResponse?.ok) {
    const nominatimData = await nominatimResponse.json().catch(() => null);
    const first = Array.isArray(nominatimData) ? nominatimData[0] : null;
    if (first) {
      const lat = toFinite((first as any)?.lat, NaN);
      const lon = toFinite((first as any)?.lon, NaN);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }

  return null;
}

async function fetchPvgisMonthly(lat: number, lon: number): Promise<{
  annual: number;
  monthlyDaily: number[];
  referenceYear: number | null;
} | null> {
  // ── Use PVcalc v5_3 with optimalangles to get irradiance on the optimal tilt plane ──
  // This matches professional tools (IBS, PVSol, etc.) that use tilted-plane irradiance.
  // MRcalc with selectrad=1 + angle=0 gives HORIZONTAL irradiance which underestimates by ~15-20%.
  // PVcalc peakpower=1 + loss=20 + optimalangles=1 gives monthly H(i)_d on the optimal plane.
  const url = new URL("https://re.jrc.ec.europa.eu/api/v5_3/PVcalc");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("peakpower", "1");
  url.searchParams.set("loss", "20");
  url.searchParams.set("optimalangles", "1");
  url.searchParams.set("outputformat", "json");
  url.searchParams.set("browser", "0");

  const response = await fetchWithTimeout(url.toString(), 25_000);
  if (!response.ok) {
    console.error(`PVGIS PVcalc failed: HTTP ${response.status} for lat=${lat}, lon=${lon}`);
    return null;
  }

  const data = await response.json().catch(() => null);
  const monthlyRows = Array.isArray((data as any)?.outputs?.monthly?.fixed)
    ? (data as any).outputs.monthly.fixed
    : [];
  if (monthlyRows.length === 0) {
    console.error("PVGIS PVcalc: no monthly rows in response");
    return null;
  }

  // Extract H(i)_d (daily irradiance on tilted plane, kWh/m²/day) for each month
  const monthlyDaily: number[] = new Array(12).fill(0);
  for (const row of monthlyRows) {
    const monthIndex = clamp(Math.round(toFinite((row as any)?.month, 0)) - 1, 0, 11);
    const dailyIrradiance = Math.max(0, toFinite((row as any)?.["H(i)_d"], 0));
    monthlyDaily[monthIndex] = dailyIrradiance;
  }

  const validCount = monthlyDaily.filter((value) => value > 0.01).length;
  if (validCount < 8) {
    console.error(`PVGIS PVcalc: only ${validCount}/12 valid months`);
    return null;
  }

  const knownAvg = monthlyDaily.filter((v) => v > 0).reduce((acc, v) => acc + v, 0) / validCount;
  const patchedMonthlyDaily = monthlyDaily.map((value) => (value > 0 ? value : knownAvg));

  // Annual average: use the totals H(i)_d if available, otherwise compute weighted average
  const totalsHiD = toFinite((data as any)?.outputs?.totals?.fixed?.["H(i)_d"], 0);
  const annual = totalsHiD > 0
    ? totalsHiD
    : patchedMonthlyDaily.reduce((acc, value, idx) => acc + value * DAYS_IN_MONTH[idx], 0) / 365.25;

  const referenceYear = Number.isFinite(Number((data as any)?.inputs?.meteo_data?.year_max))
    ? Number((data as any)?.inputs?.meteo_data?.year_max)
    : null;

  return {
    annual: Number(annual.toFixed(4)),
    monthlyDaily: patchedMonthlyDaily.map((value) => Number(value.toFixed(4))),
    referenceYear,
  };
}

async function fetchOpenMeteoMonthly(lat: number, lon: number): Promise<{
  annual: number;
  monthlyDaily: number[];
  referenceYear: number | null;
} | null> {
  const referenceYear = 2020;
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("start_date", `${referenceYear}-01-01`);
  url.searchParams.set("end_date", `${referenceYear}-12-31`);
  url.searchParams.set("daily", "shortwave_radiation_sum");
  url.searchParams.set("timezone", "UTC");

  const response = await fetchWithTimeout(url.toString(), 25_000);
  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  const days = Array.isArray((data as any)?.daily?.time) ? (data as any).daily.time : [];
  const shortwave = Array.isArray((data as any)?.daily?.shortwave_radiation_sum)
    ? (data as any).daily.shortwave_radiation_sum
    : [];
  if (days.length === 0 || shortwave.length === 0 || days.length !== shortwave.length) return null;

  const monthlySumKwh = new Array<number>(12).fill(0);
  const monthlyCount = new Array<number>(12).fill(0);

  for (let i = 0; i < days.length; i += 1) {
    const isoDate = String(days[i] || "");
    const monthRaw = Number(isoDate.slice(5, 7));
    const monthIndex = clamp(monthRaw - 1, 0, 11);
    const mjPerM2 = Math.max(0, toFinite(shortwave[i], 0));
    if (mjPerM2 <= 0) continue;
    // Open-Meteo daily shortwave_radiation_sum is MJ/m²/day.
    const kwhPerM2Day = mjPerM2 / 3.6;
    monthlySumKwh[monthIndex] += kwhPerM2Day;
    monthlyCount[monthIndex] += 1;
  }

  const monthlyDaily = monthlySumKwh.map((sum, idx) => (
    monthlyCount[idx] > 0 ? (sum / monthlyCount[idx]) : 0
  ));
  const validCount = monthlyDaily.filter((value) => value > 0.01).length;
  if (validCount < 8) return null;

  const knownAvg = monthlyDaily.filter((v) => v > 0).reduce((acc, v) => acc + v, 0) / validCount;
  const patchedMonthlyDaily = monthlyDaily.map((value) => (value > 0 ? value : knownAvg));
  const annual = patchedMonthlyDaily.reduce((acc, value, idx) => acc + value * DAYS_IN_MONTH[idx], 0) / 365.25;

  return {
    annual: Number(annual.toFixed(4)),
    monthlyDaily: patchedMonthlyDaily.map((value) => Number(value.toFixed(4))),
    referenceYear,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
      return new Response(JSON.stringify({ error: "missing_supabase_env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const city = String((body as any)?.city || "").trim();
    const uf = String((body as any)?.uf || "").trim().toUpperCase();
    const addressLine = String((body as any)?.addressLine || "").trim();
    const zip = String((body as any)?.zip || "").trim();
    const normalizedZip = String(zip || "").replace(/\D/g, "").slice(0, 8);
    let lat = toFinite((body as any)?.lat, NaN);
    let lon = toFinite((body as any)?.lon, NaN);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const geocodedFromZip = await geocodeZip(normalizedZip).catch(() => null);
      if (geocodedFromZip) {
        lat = geocodedFromZip.lat;
        lon = geocodedFromZip.lon;
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const geocoded = await geocodeCity(city, uf, addressLine, zip).catch(() => null);
      if (geocoded) {
        lat = geocoded.lat;
        lon = geocoded.lon;
      }
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRole);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const latRounded = Number(lat.toFixed(4));
      const lonRounded = Number(lon.toFixed(4));
      const cacheKey = `${latRounded}:${lonRounded}`;
      const minFetchedAtIso = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { data: cacheRow } = await serviceClient
        .from("solar_resource_cache")
        .select("latitude,longitude,annual_irradiance_kwh_m2_day,monthly_irradiance_kwh_m2_day,monthly_generation_factors,reference_year")
        .eq("cache_key", cacheKey)
        .gte("fetched_at", minFetchedAtIso)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cacheRow) {
        const payload: SolarResourcePayload = {
          source: "cache",
          lat: toFinite((cacheRow as any).latitude, latRounded),
          lon: toFinite((cacheRow as any).longitude, lonRounded),
          annualIrradianceKwhM2Day: Math.max(0.01, toFinite((cacheRow as any).annual_irradiance_kwh_m2_day, 4.5)),
          monthlyIrradianceKwhM2Day: Array.isArray((cacheRow as any).monthly_irradiance_kwh_m2_day)
            ? ((cacheRow as any).monthly_irradiance_kwh_m2_day as unknown[]).slice(0, 12).map((v) => Math.max(0, toFinite(v, 0)))
            : buildFallbackFromUF(uf, latRounded, lonRounded).monthlyIrradianceKwhM2Day,
          monthlyGenerationFactors: Array.isArray((cacheRow as any).monthly_generation_factors)
            ? ((cacheRow as any).monthly_generation_factors as unknown[]).slice(0, 12).map((v) => Math.max(0, toFinite(v, 0)))
            : LEGACY_FACTORS,
          referenceYear: Number.isFinite(Number((cacheRow as any).reference_year)) ? Number((cacheRow as any).reference_year) : null,
          cached: true,
        };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pvgis = await fetchPvgisMonthly(latRounded, lonRounded).catch(() => null);
      const openMeteo = pvgis ? null : await fetchOpenMeteoMonthly(latRounded, lonRounded).catch(() => null);
      const resource = pvgis
        ? { source: "pvgis" as const, ...pvgis }
        : (openMeteo ? { source: "open_meteo" as const, ...openMeteo } : null);

      if (resource) {
        const factors = normalizeFactors(resource.monthlyDaily);
        const payload: SolarResourcePayload = {
          source: resource.source,
          lat: latRounded,
          lon: lonRounded,
          annualIrradianceKwhM2Day: resource.annual,
          monthlyIrradianceKwhM2Day: resource.monthlyDaily,
          monthlyGenerationFactors: factors.map((factor) => Number(factor.toFixed(6))),
          referenceYear: resource.referenceYear,
          cached: false,
        };

        if (payload.source === "pvgis") {
          await serviceClient.from("solar_resource_cache").upsert({
            cache_key: cacheKey,
            city: city || null,
            uf: uf || null,
            latitude: latRounded,
            longitude: lonRounded,
            source: "pvgis",
            annual_irradiance_kwh_m2_day: payload.annualIrradianceKwhM2Day,
            monthly_irradiance_kwh_m2_day: payload.monthlyIrradianceKwhM2Day,
            monthly_generation_factors: payload.monthlyGenerationFactors,
            reference_year: payload.referenceYear,
            fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "cache_key" });
        }

        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const fallback = buildFallbackFromUF(uf, Number.isFinite(lat) ? Number(lat.toFixed(4)) : null, Number.isFinite(lon) ? Number(lon.toFixed(4)) : null);
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "unexpected_error", details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
