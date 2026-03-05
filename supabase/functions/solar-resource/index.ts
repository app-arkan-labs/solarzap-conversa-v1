import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = (Deno.env.get("ALLOWED_ORIGIN") || "").trim();

const buildCorsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowed = !ALLOWED_ORIGIN
    ? "*"
    : (origin === ALLOWED_ORIGIN || isLocalhost) ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

const CACHE_TTL_DAYS = 30;
const FETCH_TIMEOUT_MS = 15_000;
const PVGIS_TIMEOUT_MS = 25_000;

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

const toFinite = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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

type SolarResourceSource = "pvgis" | "pvgis_cache_degraded";

type SolarResourceErrorCode =
  | "unauthorized"
  | "geocode_failed"
  | "pvgis_unavailable"
  | "upstream_rate_limited"
  | "upstream_timeout"
  | "upstream_http_error"
  | "unexpected_error";

type SolarResourceDebug = {
  phase?: "auth" | "geocode" | "pvgis" | "cache" | "unexpected";
  upstreamStatus?: number | null;
  attempts?: number;
  lat?: number | null;
  lon?: number | null;
  cacheKeyTried?: string[];
  message?: string;
};

type SolarResourcePayload = {
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
};

// jsonResponse and errorResponse are defined inside the handler to access dynamic CORS headers

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

async function geocodeCity(
  city: string,
  uf: string,
  addressLine = "",
  zip = "",
  googleApiKeyOverride = "",
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

  const googleApiKey = String(
    googleApiKeyOverride
    || Deno.env.get("GEOCODING_API_KEY")
    || Deno.env.get("GOOGLE_GEOCODING_API_KEY")
    || Deno.env.get("GOOGLE_MAPS_API_KEY")
    || "",
  ).trim();
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

async function geocodeZip(zipRaw: string, googleApiKeyOverride = ""): Promise<{ lat: number; lon: number } | null> {
  const zip = String(zipRaw || "").replace(/\D/g, "").slice(0, 8);
  if (zip.length !== 8) return null;

  const googleApiKey = String(
    googleApiKeyOverride
    || Deno.env.get("GEOCODING_API_KEY")
    || Deno.env.get("GOOGLE_GEOCODING_API_KEY")
    || Deno.env.get("GOOGLE_MAPS_API_KEY")
    || "",
  ).trim();

  if (googleApiKey) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", `${zip}, Brasil`);
      url.searchParams.set("components", `postal_code:${zip}|country:BR`);
      url.searchParams.set("region", "br");
      url.searchParams.set("language", "pt-BR");
      url.searchParams.set("key", googleApiKey);

      const googleResponse = await fetchWithTimeout(url.toString());
      if (googleResponse.ok) {
        const data = await googleResponse.json().catch(() => null);
        if ((data as any)?.status === "OK") {
          const result = Array.isArray((data as any)?.results) ? (data as any).results[0] : null;
          const lat = toFinite(result?.geometry?.location?.lat, NaN);
          const lon = toFinite(result?.geometry?.location?.lng, NaN);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return { lat, lon };
          }
        }
      }
    } catch {
      // continue on fallback providers
    }
  }

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

type PvgisFetchErrorCode = Extract<
  SolarResourceErrorCode,
  "pvgis_unavailable" | "upstream_rate_limited" | "upstream_timeout" | "upstream_http_error"
>;

type PvgisFetchResult =
  | {
    ok: true;
    annual: number;
    monthlyDaily: number[];
    referenceYear: number | null;
    attempts: number;
  }
  | {
    ok: false;
    errorCode: PvgisFetchErrorCode;
    attempts: number;
    upstreamStatus: number | null;
    message?: string;
  };

async function fetchPvgisMonthly(lat: number, lon: number): Promise<PvgisFetchResult> {
  const pvgisBases = [
    "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc",
    "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc",
  ];

  let data: any = null;
  let attempts = 0;
  let sawRateLimit = false;
  let sawTimeout = false;
  let sawHttpError = false;
  let upstreamStatus: number | null = null;
  let lastMessage = "";

  for (const base of pvgisBases) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      attempts += 1;
      const url = new URL(base);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("peakpower", "1");
      url.searchParams.set("loss", "20");
      url.searchParams.set("optimalangles", "1");
      url.searchParams.set("outputformat", "json");
      url.searchParams.set("browser", "0");

      let response: Response | null = null;
      let fetchError: unknown = null;
      try {
        response = await fetchWithTimeout(url.toString(), PVGIS_TIMEOUT_MS);
      } catch (error) {
        fetchError = error;
      }

      if (!response) {
        const errorName = fetchError instanceof Error ? fetchError.name : "";
        if (errorName === "AbortError") {
          sawTimeout = true;
          lastMessage = "timeout";
        } else {
          lastMessage = fetchError ? String(fetchError) : "network_error";
        }
        await sleep(250 + (attempt * 250));
        continue;
      }

      if (!response.ok) {
        upstreamStatus = response.status;
        if (response.status === 429 || response.status === 529 || response.status >= 500) {
          if (response.status === 429 || response.status === 529) {
            sawRateLimit = true;
          } else {
            sawHttpError = true;
          }
          await sleep(300 + (attempt * 300));
          continue;
        }
        sawHttpError = true;
        console.error(`PVGIS PVcalc non-retryable HTTP ${response.status} for lat=${lat}, lon=${lon} base=${base}`);
        break;
      }

      const candidate = await response.json().catch(() => null);
      const monthlyRows = Array.isArray((candidate as any)?.outputs?.monthly?.fixed)
        ? (candidate as any).outputs.monthly.fixed
        : [];
      if (monthlyRows.length > 0) {
        data = candidate;
        break;
      }

      sawHttpError = true;
      lastMessage = "invalid_monthly_payload";
      await sleep(200 + (attempt * 200));
    }

    if (data) break;
  }

  if (!data) {
    const errorCode: PvgisFetchErrorCode = sawRateLimit
      ? "upstream_rate_limited"
      : sawTimeout
        ? "upstream_timeout"
        : sawHttpError || upstreamStatus !== null
          ? "upstream_http_error"
          : "pvgis_unavailable";

    console.error(
      `PVGIS PVcalc unavailable for lat=${lat}, lon=${lon}, code=${errorCode}, status=${upstreamStatus ?? "none"}, attempts=${attempts}, msg=${lastMessage || "n/a"}`,
    );
    return {
      ok: false,
      errorCode,
      attempts,
      upstreamStatus,
      ...(lastMessage ? { message: lastMessage } : {}),
    };
  }

  const monthlyRows = Array.isArray((data as any)?.outputs?.monthly?.fixed)
    ? (data as any).outputs.monthly.fixed
    : [];
  if (monthlyRows.length === 0) {
    console.error("PVGIS PVcalc: no monthly rows in response");
    return {
      ok: false,
      errorCode: "upstream_http_error",
      attempts,
      upstreamStatus,
      message: "no_monthly_rows",
    };
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
    return {
      ok: false,
      errorCode: "upstream_http_error",
      attempts,
      upstreamStatus,
      message: `insufficient_valid_months_${validCount}`,
    };
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
    ok: true,
    annual: Number(annual.toFixed(4)),
    monthlyDaily: patchedMonthlyDaily.map((value) => Number(value.toFixed(4))),
    referenceYear,
    attempts,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  const jsonResponse = (body: unknown, status = 200, extraHeaders?: Record<string, string>): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...(extraHeaders || {}) },
    });

  const errorResponse = (
    status: number,
    errorCode: SolarResourceErrorCode,
    debug?: SolarResourceDebug,
  ): Response => jsonResponse({
    error: errorCode,
    errorCode,
    ...(debug ? { debug } : {}),
  }, status);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
      return errorResponse(500, "unexpected_error", {
        phase: "unexpected",
        message: "missing_supabase_env",
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return errorResponse(401, "unauthorized", {
        phase: "auth",
        message: authError?.message || "missing_user",
      });
    }

    const body = await req.json().catch(() => ({}));
    const city = String((body as any)?.city || "").trim();
    const uf = String((body as any)?.uf || "").trim().toUpperCase();
    const addressLine = String((body as any)?.addressLine || "").trim();
    const zip = String((body as any)?.zip || "").trim();
    const geocodingApiKey = String((body as any)?.geocodingApiKey || "").trim();
    const strictPvgisOnly = Boolean((body as any)?.strictPvgisOnly ?? true);
    const normalizedZip = String(zip || "").replace(/\D/g, "").slice(0, 8);

    console.log(`[solar-resource] REQ zip=${normalizedZip} city=${city} uf=${uf} addr=${addressLine.slice(0, 30)} strictPvgis=${strictPvgisOnly}`);
    let lat = toFinite((body as any)?.lat, NaN);
    let lon = toFinite((body as any)?.lon, NaN);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const geocodedFromZip = await geocodeZip(normalizedZip, geocodingApiKey).catch(() => null);
      if (geocodedFromZip) {
        lat = geocodedFromZip.lat;
        lon = geocodedFromZip.lon;
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const geocoded = await geocodeCity(city, uf, addressLine, zip, geocodingApiKey).catch(() => null);
      if (geocoded) {
        lat = geocoded.lat;
        lon = geocoded.lon;
      }
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRole);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.error(`[solar-resource] GEOCODE_FAILED zip=${normalizedZip} city=${city} uf=${uf}`);
      return errorResponse(422, "geocode_failed", {
        phase: "geocode",
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        cacheKeyTried: [],
      });
    }

    console.log(`[solar-resource] GEOCODE_OK lat=${lat} lon=${lon}`);

    const latRounded = Number(lat.toFixed(5));
    const lonRounded = Number(lon.toFixed(5));
    const legacyLatRounded = Number(lat.toFixed(4));
    const legacyLonRounded = Number(lon.toFixed(4));
    const primaryCacheKey = `${latRounded}:${lonRounded}`;
    const legacyCacheKey = `${legacyLatRounded}:${legacyLonRounded}`;
    const cacheKeys = Array.from(new Set([primaryCacheKey, legacyCacheKey]));
    const minFetchedAtIso = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const buildCachePayload = (cacheRow: any): SolarResourcePayload | null => {
      const cachedMonthlyIrr = Array.isArray((cacheRow as any).monthly_irradiance_kwh_m2_day)
        ? ((cacheRow as any).monthly_irradiance_kwh_m2_day as unknown[]).slice(0, 12).map((v) => Math.max(0, toFinite(v, 0)))
        : [];
      const cachedFactors = Array.isArray((cacheRow as any).monthly_generation_factors)
        ? ((cacheRow as any).monthly_generation_factors as unknown[]).slice(0, 12).map((v) => Math.max(0, toFinite(v, 0)))
        : [];
      if (cachedMonthlyIrr.length !== 12 || cachedFactors.length !== 12) return null;

      return {
        source: "pvgis",
        lat: toFinite((cacheRow as any).latitude, latRounded),
        lon: toFinite((cacheRow as any).longitude, lonRounded),
        annualIrradianceKwhM2Day: Math.max(0.01, toFinite((cacheRow as any).annual_irradiance_kwh_m2_day, 4.5)),
        monthlyIrradianceKwhM2Day: cachedMonthlyIrr,
        monthlyGenerationFactors: cachedFactors,
        referenceYear: Number.isFinite(Number((cacheRow as any).reference_year)) ? Number((cacheRow as any).reference_year) : null,
        cached: true,
      };
    };

    const getCachePayload = async (allowStale: boolean): Promise<SolarResourcePayload | null> => {
      let query = serviceClient
        .from("solar_resource_cache")
        .select("cache_key,latitude,longitude,annual_irradiance_kwh_m2_day,monthly_irradiance_kwh_m2_day,monthly_generation_factors,reference_year,fetched_at")
        .in("cache_key", cacheKeys)
        .order("fetched_at", { ascending: false })
        .limit(1);

      if (!allowStale) {
        query = query.gte("fetched_at", minFetchedAtIso);
      }

      const { data: cacheRow } = await query.maybeSingle();
      if (!cacheRow) return null;
      return buildCachePayload(cacheRow);
    };

    const pvgis = await fetchPvgisMonthly(latRounded, lonRounded);
    if (pvgis.ok) {
      const factors = normalizeFactors(pvgis.monthlyDaily);
      const payload: SolarResourcePayload = {
        source: "pvgis",
        lat: latRounded,
        lon: lonRounded,
        annualIrradianceKwhM2Day: pvgis.annual,
        monthlyIrradianceKwhM2Day: pvgis.monthlyDaily,
        monthlyGenerationFactors: factors.map((factor) => Number(factor.toFixed(6))),
        referenceYear: pvgis.referenceYear,
        cached: false,
      };
      await serviceClient.from("solar_resource_cache").upsert({
        cache_key: primaryCacheKey,
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

      console.log(`[solar-resource] PVGIS_OK lat=${latRounded} lon=${lonRounded} annual=${pvgis.annual} attempts=${pvgis.attempts}`);
      return jsonResponse(payload, 200, { "X-Solar-Source": "pvgis" });
    }

    const pvgisDebug: SolarResourceDebug = {
      phase: "pvgis",
      upstreamStatus: pvgis.upstreamStatus,
      attempts: pvgis.attempts,
      lat: latRounded,
      lon: lonRounded,
      cacheKeyTried: cacheKeys,
      ...(pvgis.message ? { message: pvgis.message } : {}),
    };

    if (pvgis.errorCode === "upstream_rate_limited" || pvgis.errorCode === "upstream_timeout") {
      const staleCache = await getCachePayload(true);
      if (staleCache) {
        const degradedPayload: SolarResourcePayload = {
          ...staleCache,
          source: "pvgis_cache_degraded",
          cached: true,
          degraded: true,
          errorCode: pvgis.errorCode,
          debug: pvgisDebug,
        };
        return jsonResponse(degradedPayload, 200);
      }
    }

    const status = pvgis.errorCode === "upstream_http_error" ? 502 : 503;
    if (strictPvgisOnly) {
      return errorResponse(status, pvgis.errorCode, pvgisDebug);
    }

    return errorResponse(status, pvgis.errorCode, pvgisDebug);
  } catch (error) {
    return errorResponse(500, "unexpected_error", {
      phase: "unexpected",
      message: String(error),
    });
  }
});
