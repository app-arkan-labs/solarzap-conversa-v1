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

const FETCH_TIMEOUT_MS = 15_000;
const PVGIS_TIMEOUT_MS = 25_000;
const MAX_PVGIS_ATTEMPTS_PER_BASE = 3;
const HANDLER_DEADLINE_MS = 120_000;

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
const normalizeZip = (value: unknown): string => String(value || "").replace(/\D/g, "").slice(0, 8);
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

const isValidCoordinatePair = (lat: number, lon: number): boolean =>
  Number.isFinite(lat)
  && Number.isFinite(lon)
  && lat >= -90
  && lat <= 90
  && lon >= -180
  && lon <= 180;

type SolarResourceSource = "pvgis";

type SolarResourceErrorCode =
  | "unauthorized"
  | "geocode_failed"
  | "geocode_provider_unavailable"
  | "geocode_low_confidence"
  | "pvgis_unavailable"
  | "upstream_rate_limited"
  | "upstream_timeout"
  | "upstream_http_error"
  | "unexpected_error";

type SolarResourceDebug = {
  phase?: "auth" | "geocode" | "pvgis" | "cache" | "unexpected";
  upstreamStatus?: number | null;
  pvgisBaseTried?: string[];
  totalAttempts?: number;
  latencyMs?: number;
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
  pvgisBaseUsed?: string;
  pvgisAttempts?: number;
  errorCode?: SolarResourceErrorCode;
  debug?: SolarResourceDebug;
};

type GeocodeErrorCode = Extract<SolarResourceErrorCode, "geocode_failed" | "geocode_provider_unavailable" | "geocode_low_confidence">;

type ResolveCoordinatesResult =
  | {
    ok: true;
    lat: number;
    lon: number;
    city: string;
    uf: string;
    message?: string;
  }
  | {
    ok: false;
    errorCode: GeocodeErrorCode;
    upstreamStatus: number | null;
    message?: string;
    lat?: number;
    lon?: number;
  };

type ViaCepResult = {
  zip: string;
  city: string;
  uf: string;
  street: string;
  neighborhood: string;
};

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
    totalAttempts: number;
    latencyMs: number;
    pvgisBaseTried: string[];
    pvgisBaseUsed: string;
  }
  | {
    ok: false;
    errorCode: PvgisFetchErrorCode;
    totalAttempts: number;
    upstreamStatus: number | null;
    latencyMs: number;
    pvgisBaseTried: string[];
    message?: string;
  };

type SolarResourceEventPayload = {
  requestId: string;
  leadId: number | null;
  orgId: string | null;
  errorCode: SolarResourceErrorCode | null;
  phase: "auth" | "geocode" | "pvgis" | "cache" | "unexpected";
  zip: string | null;
  city: string | null;
  uf: string | null;
  lat: number | null;
  lon: number | null;
  pvgisBase: string | null;
  upstreamStatus: number | null;
  latencyMs: number | null;
};

type GoogleGeocodeOutcome =
  | {
    kind: "success";
    lat: number;
    lon: number;
    city: string;
    uf: string;
    zip: string;
    partialMatch: boolean;
    locationType: string;
    upstreamStatus: number | null;
  }
  | {
    kind: "not_found";
    upstreamStatus: number | null;
    message?: string;
  }
  | {
    kind: "provider_unavailable";
    upstreamStatus: number | null;
    message?: string;
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

const resolveGoogleApiKey = (override = ""): string =>
  String(
    override
    || Deno.env.get("GEOCODING_API_KEY")
    || Deno.env.get("GOOGLE_GEOCODING_API_KEY")
    || Deno.env.get("GOOGLE_MAPS_API_KEY")
    || "",
  ).trim();

const extractAddressComponent = (result: any, type: string): any | null => {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];
  return components.find((component: any) =>
    Array.isArray(component?.types) && component.types.includes(type)) || null;
};

const extractUfFromGoogleResult = (result: any): string => {
  const stateComponent = extractAddressComponent(result, "administrative_area_level_1");
  const shortName = String(stateComponent?.short_name || "").trim().toUpperCase();
  if (shortName.length === 2) return shortName;

  const longName = normalizeText(String(stateComponent?.long_name || ""));
  if (!longName) return "";
  const match = Object.entries(UF_TO_STATE_NAME).find(([, stateName]) => normalizeText(stateName) === longName);
  return match?.[0] || "";
};

const extractCityFromGoogleResult = (result: any): string => {
  const locality = extractAddressComponent(result, "locality");
  if (locality) {
    return String(locality.long_name || locality.short_name || "").trim();
  }
  const level2 = extractAddressComponent(result, "administrative_area_level_2");
  if (level2) {
    return String(level2.long_name || level2.short_name || "").trim();
  }
  const sublocality = extractAddressComponent(result, "sublocality");
  if (sublocality) {
    return String(sublocality.long_name || sublocality.short_name || "").trim();
  }
  return "";
};

const extractZipFromGoogleResult = (result: any): string => {
  const zipComponent = extractAddressComponent(result, "postal_code");
  return normalizeZip(zipComponent?.long_name || zipComponent?.short_name || "");
};

async function geocodeWithGoogle(
  address: string,
  components: string | null,
  apiKey: string,
): Promise<GoogleGeocodeOutcome> {
  if (!apiKey) {
    return {
      kind: "provider_unavailable",
      upstreamStatus: null,
      message: "missing_google_api_key",
    };
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    if (components) {
      url.searchParams.set("components", components);
    }
    url.searchParams.set("region", "br");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", apiKey);

    const response = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS);
    if (!response.ok) {
      return {
        kind: "provider_unavailable",
        upstreamStatus: response.status,
        message: `google_http_${response.status}`,
      };
    }

    const data = await response.json().catch(() => null);
    const googleStatus = String((data as any)?.status || "").toUpperCase();

    if (googleStatus === "ZERO_RESULTS") {
      return {
        kind: "not_found",
        upstreamStatus: response.status,
        message: "zero_results",
      };
    }

    if (googleStatus !== "OK") {
      return {
        kind: "provider_unavailable",
        upstreamStatus: response.status,
        message: `google_status_${googleStatus || "unknown"}`,
      };
    }

    const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
    if (results.length === 0) {
      return {
        kind: "not_found",
        upstreamStatus: response.status,
        message: "no_results",
      };
    }

    const selected = results[0];
    const lat = toFinite(selected?.geometry?.location?.lat, NaN);
    const lon = toFinite(selected?.geometry?.location?.lng, NaN);
    if (!isValidCoordinatePair(lat, lon)) {
      return {
        kind: "not_found",
        upstreamStatus: response.status,
        message: "invalid_coordinates",
      };
    }

    return {
      kind: "success",
      lat,
      lon,
      city: extractCityFromGoogleResult(selected),
      uf: extractUfFromGoogleResult(selected),
      zip: extractZipFromGoogleResult(selected),
      partialMatch: Boolean(selected?.partial_match),
      locationType: String(selected?.geometry?.location_type || ""),
      upstreamStatus: response.status,
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      kind: "provider_unavailable",
      upstreamStatus: null,
      message: isAbort ? "google_timeout" : `google_fetch_error_${String(error)}`,
    };
  }
}

async function fetchViaCep(zip: string): Promise<ViaCepResult | null> {
  const normalizedZip = normalizeZip(zip);
  if (normalizedZip.length !== 8) return null;
  try {
    const response = await fetchWithTimeout(`https://viacep.com.br/ws/${normalizedZip}/json/`, FETCH_TIMEOUT_MS);
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if ((payload as any)?.erro) return null;

    const uf = String((payload as any)?.uf || "").trim().toUpperCase();
    const city = String((payload as any)?.localidade || "").trim();
    if (!uf || !city) return null;

    return {
      zip: normalizedZip,
      uf,
      city,
      street: String((payload as any)?.logradouro || "").trim(),
      neighborhood: String((payload as any)?.bairro || "").trim(),
    };
  } catch {
    return null;
  }
}

const cityMatches = (expectedCity: string, geocodedCity: string): boolean => {
  const expected = normalizeText(expectedCity);
  const actual = normalizeText(geocodedCity);
  if (!expected || !actual) return true;
  return expected === actual || expected.includes(actual) || actual.includes(expected);
};

async function resolveCoordinatesWithGoogle(params: {
  city: string;
  uf: string;
  addressLine: string;
  zip: string;
  googleApiKey: string;
}): Promise<ResolveCoordinatesResult> {
  const normalizedZip = normalizeZip(params.zip);
  let city = String(params.city || "").trim();
  let uf = String(params.uf || "").trim().toUpperCase();
  let addressLine = String(params.addressLine || "").trim();
  const googleApiKey = resolveGoogleApiKey(params.googleApiKey);

  if (!googleApiKey) {
    return {
      ok: false,
      errorCode: "geocode_provider_unavailable",
      upstreamStatus: null,
      message: "missing_google_api_key",
    };
  }

  const viaCep = normalizedZip.length === 8 ? await fetchViaCep(normalizedZip) : null;
  if (viaCep) {
    city = city || viaCep.city;
    uf = uf || viaCep.uf;
    if (!addressLine) {
      addressLine = [viaCep.street, viaCep.neighborhood].filter(Boolean).join(", ");
    }
  }

  const queries: Array<{ address: string; components: string | null; label: string }> = [];
  if (normalizedZip.length === 8) {
    queries.push({
      address: `${normalizedZip}, Brasil`,
      components: `postal_code:${normalizedZip}|country:BR`,
      label: "zip_only",
    });
  }

  const stateLabel = UF_TO_STATE_NAME[uf] || uf;
  const fullAddress = [addressLine, city, stateLabel, normalizedZip || undefined, "Brasil"]
    .filter(Boolean)
    .join(", ");
  if (fullAddress) {
    queries.push({
      address: fullAddress,
      components: "country:BR",
      label: "address_full",
    });
  }

  if (queries.length === 0) {
    return {
      ok: false,
      errorCode: "geocode_failed",
      upstreamStatus: null,
      message: "missing_location_fields",
    };
  }

  let lastNotFoundMessage = "";
  for (const query of queries) {
    const geocode = await geocodeWithGoogle(query.address, query.components, googleApiKey);
    if (geocode.kind === "provider_unavailable") {
      return {
        ok: false,
        errorCode: "geocode_provider_unavailable",
        upstreamStatus: geocode.upstreamStatus,
        message: geocode.message || `google_unavailable_${query.label}`,
      };
    }

    if (geocode.kind === "not_found") {
      lastNotFoundMessage = geocode.message || `not_found_${query.label}`;
      continue;
    }

    const expectedUf = String(uf || "").trim().toUpperCase();
    if (expectedUf && geocode.uf && geocode.uf !== expectedUf) {
      return {
        ok: false,
        errorCode: "geocode_low_confidence",
        upstreamStatus: geocode.upstreamStatus,
        message: `uf_mismatch_expected_${expectedUf}_got_${geocode.uf}`,
        lat: geocode.lat,
        lon: geocode.lon,
      };
    }

    if (city && geocode.city && !cityMatches(city, geocode.city)) {
      return {
        ok: false,
        errorCode: "geocode_low_confidence",
        upstreamStatus: geocode.upstreamStatus,
        message: `city_mismatch_expected_${normalizeText(city)}_got_${normalizeText(geocode.city)}`,
        lat: geocode.lat,
        lon: geocode.lon,
      };
    }

    return {
      ok: true,
      lat: geocode.lat,
      lon: geocode.lon,
      city: city || geocode.city,
      uf: uf || geocode.uf,
      message: geocode.partialMatch
        ? `partial_match_location_type_${geocode.locationType || "unknown"}`
        : undefined,
    };
  }

  return {
    ok: false,
    errorCode: "geocode_failed",
    upstreamStatus: null,
    message: lastNotFoundMessage || "google_zero_results",
  };
}

const isAmericasCoordinate = (lat: number, lon: number): boolean =>
  lat >= -60
  && lat <= 85
  && lon >= -170
  && lon <= -30;

type PvgisBasePlan = {
  baseUrl: string;
  label: string;
  raddatabase?: string;
};

const buildPvgisBasePlans = (lat: number, lon: number): PvgisBasePlan[] => {
  if (isAmericasCoordinate(lat, lon)) {
    // Keep PVGIS-only flow, but prioritize databases with wider coverage in Brazil/Americas.
    return [
      {
        baseUrl: "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc",
        label: "v5_2/PVcalc",
        raddatabase: "PVGIS-ERA5",
      },
      {
        baseUrl: "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc",
        label: "v5_2/PVcalc",
        raddatabase: "PVGIS-SARAH2",
      },
      {
        baseUrl: "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc",
        label: "v5_2/PVcalc_default_db",
      },
      {
        baseUrl: "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc",
        label: "v5_3/PVcalc",
      },
    ];
  }

  return [
    {
      baseUrl: "https://re.jrc.ec.europa.eu/api/v5_3/PVcalc",
      label: "v5_3/PVcalc",
    },
    {
      baseUrl: "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc",
      label: "v5_2/PVcalc",
    },
  ];
};

const computeRetryDelayMs = (attempt: number): number => {
  const baseDelay = Math.min(4_000, 400 * (2 ** attempt));
  const jitter = Math.floor(Math.random() * 250);
  return baseDelay + jitter;
};

async function fetchPvgisMonthly(lat: number, lon: number, deadlineMs?: number): Promise<PvgisFetchResult> {
  const startedAt = Date.now();
  const pvgisBasePlans = buildPvgisBasePlans(lat, lon);
  const pvgisBaseTried: string[] = [];

  let data: any = null;
  let totalAttempts = 0;
  let sawRateLimit = false;
  let sawTimeout = false;
  let sawHttpError = false;
  let upstreamStatus: number | null = null;
  let lastMessage = "";
  let pvgisBaseUsed: string | null = null;

  for (const basePlan of pvgisBasePlans) {
    const planLabel = basePlan.raddatabase
      ? `${basePlan.label}?raddatabase=${basePlan.raddatabase}`
      : basePlan.label;
    pvgisBaseTried.push(planLabel);

    for (let attempt = 0; attempt < MAX_PVGIS_ATTEMPTS_PER_BASE; attempt += 1) {
      if (deadlineMs !== undefined && Date.now() > deadlineMs - 15_000) {
        sawTimeout = true;
        lastMessage = "handler_deadline_approaching";
        break;
      }

      totalAttempts += 1;

      const url = new URL(basePlan.baseUrl);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("peakpower", "1");
      url.searchParams.set("loss", "20");
      url.searchParams.set("optimalangles", "1");
      url.searchParams.set("outputformat", "json");
      url.searchParams.set("browser", "0");
      if (basePlan.raddatabase) {
        url.searchParams.set("raddatabase", basePlan.raddatabase);
      }

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
        console.warn(
          `[solar-resource] PVGIS_FETCH_ERR base=${planLabel} attempt=${attempt + 1} totalAttempts=${totalAttempts} message=${lastMessage}`,
        );
        await sleep(computeRetryDelayMs(attempt));
        continue;
      }

      if (!response.ok) {
        upstreamStatus = response.status;
        console.warn(
          `[solar-resource] PVGIS_HTTP_ERR base=${planLabel} attempt=${attempt + 1} status=${response.status}`,
        );
        if (response.status === 429 || response.status === 529 || response.status >= 500) {
          if (response.status === 429 || response.status === 529) {
            sawRateLimit = true;
          } else {
            sawHttpError = true;
          }
          lastMessage = `retryable_http_${response.status}`;
          await sleep(computeRetryDelayMs(attempt));
          continue;
        }

        sawHttpError = true;
        lastMessage = `non_retryable_http_${response.status}`;
        break;
      }

      const candidate = await response.json().catch(() => null);
      const monthlyRows = Array.isArray((candidate as any)?.outputs?.monthly?.fixed)
        ? (candidate as any).outputs.monthly.fixed
        : [];
      if (monthlyRows.length > 0) {
        data = candidate;
        pvgisBaseUsed = planLabel;
        break;
      }

      sawHttpError = true;
      lastMessage = "invalid_monthly_payload";
      await sleep(computeRetryDelayMs(attempt));
    }

    if (data) break;
  }

  const latencyMs = Date.now() - startedAt;

  if (!data) {
    const errorCode: PvgisFetchErrorCode = sawRateLimit
      ? "upstream_rate_limited"
      : sawTimeout
        ? "upstream_timeout"
        : sawHttpError || upstreamStatus !== null
          ? "upstream_http_error"
          : "pvgis_unavailable";

    return {
      ok: false,
      errorCode,
      totalAttempts,
      upstreamStatus,
      latencyMs,
      pvgisBaseTried,
      ...(lastMessage ? { message: lastMessage } : {}),
    };
  }

  const monthlyRows = Array.isArray((data as any)?.outputs?.monthly?.fixed)
    ? (data as any).outputs.monthly.fixed
    : [];
  if (monthlyRows.length === 0) {
    return {
      ok: false,
      errorCode: "upstream_http_error",
      totalAttempts,
      upstreamStatus,
      latencyMs,
      pvgisBaseTried,
      message: "no_monthly_rows",
    };
  }

  const monthlyDaily: number[] = new Array(12).fill(0);
  for (const row of monthlyRows) {
    const monthIndex = clamp(Math.round(toFinite((row as any)?.month, 0)) - 1, 0, 11);
    const dailyIrradiance = Math.max(0, toFinite((row as any)?.["H(i)_d"], 0));
    monthlyDaily[monthIndex] = dailyIrradiance;
  }

  const validCount = monthlyDaily.filter((value) => value > 0.01).length;
  if (validCount < 8) {
    return {
      ok: false,
      errorCode: "upstream_http_error",
      totalAttempts,
      upstreamStatus,
      latencyMs,
      pvgisBaseTried,
      message: `insufficient_valid_months_${validCount}`,
    };
  }

  const knownAvg = monthlyDaily.filter((v) => v > 0).reduce((acc, v) => acc + v, 0) / validCount;
  const patchedMonthlyDaily = monthlyDaily.map((value) => (value > 0 ? value : knownAvg));

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
    totalAttempts,
    latencyMs,
    pvgisBaseTried,
    pvgisBaseUsed: pvgisBaseUsed || pvgisBaseTried[pvgisBaseTried.length - 1] || "unknown",
  };
}

async function logSolarResourceEvent(client: ReturnType<typeof createClient>, payload: SolarResourceEventPayload): Promise<void> {
  try {
    await client.from("solar_resource_events").insert({
      request_id: payload.requestId,
      lead_id: payload.leadId,
      org_id: payload.orgId,
      error_code: payload.errorCode,
      phase: payload.phase,
      zip: payload.zip,
      city: payload.city,
      uf: payload.uf,
      lat: payload.lat,
      lon: payload.lon,
      pvgis_base: payload.pvgisBase,
      upstream_status: payload.upstreamStatus,
      latency_ms: payload.latencyMs,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[solar-resource] EVENT_LOG_FAIL requestId=${payload.requestId} err=${String(error)}`);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const requestId = crypto.randomUUID();
  const requestStartedAt = Date.now();

  const toResponseBody = (body: unknown): Record<string, unknown> => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return {
        requestId,
        ...(body as Record<string, unknown>),
      };
    }
    return {
      requestId,
      data: body,
    };
  };

  const jsonResponse = (body: unknown, status = 200, extraHeaders?: Record<string, string>): Response =>
    new Response(JSON.stringify(toResponseBody(body)), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...(extraHeaders || {}),
      },
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
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "X-Request-Id": requestId,
      },
    });
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

    const serviceClient = createClient(supabaseUrl, supabaseServiceRole);
    const bodyRaw = await req.json().catch(() => ({}));
    const body = (bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw))
      ? bodyRaw as Record<string, unknown>
      : {};

    const leadIdRaw = Number(body.leadId);
    const leadId = Number.isFinite(leadIdRaw) ? Math.trunc(leadIdRaw) : null;
    const orgIdValue = String(body.orgId || "").trim();
    const orgId = orgIdValue || null;

    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      await logSolarResourceEvent(serviceClient, {
        requestId,
        leadId,
        orgId,
        errorCode: "unauthorized",
        phase: "auth",
        zip: normalizeZip(body.zip),
        city: String(body.city || "").trim() || null,
        uf: String(body.uf || "").trim().toUpperCase() || null,
        lat: null,
        lon: null,
        pvgisBase: null,
        upstreamStatus: null,
        latencyMs: Date.now() - requestStartedAt,
      });
      return errorResponse(401, "unauthorized", {
        phase: "auth",
        message: authError?.message || "missing_user",
      });
    }

    let city = String(body.city || "").trim();
    let uf = String(body.uf || "").trim().toUpperCase();
    let addressLine = String(body.addressLine || "").trim();
    const zip = normalizeZip(body.zip);
    const geocodingApiKey = String(body.geocodingApiKey || "").trim();

    let lat = toFinite(body.lat, NaN);
    let lon = toFinite(body.lon, NaN);

    console.log(`[solar-resource] REQ requestId=${requestId} zip=${zip} city=${city} uf=${uf} addr=${addressLine.slice(0, 40)}`);

    if (!isValidCoordinatePair(lat, lon)) {
      const geocode = await resolveCoordinatesWithGoogle({
        city,
        uf,
        addressLine,
        zip,
        googleApiKey: geocodingApiKey,
      });

      if (!geocode.ok) {
        const geocodeDebug: SolarResourceDebug = {
          phase: "geocode",
          upstreamStatus: geocode.upstreamStatus,
          totalAttempts: 1,
          latencyMs: Date.now() - requestStartedAt,
          lat: Number.isFinite(geocode.lat) ? geocode.lat : null,
          lon: Number.isFinite(geocode.lon) ? geocode.lon : null,
          message: geocode.message,
        };
        await logSolarResourceEvent(serviceClient, {
          requestId,
          leadId,
          orgId,
          errorCode: geocode.errorCode,
          phase: "geocode",
          zip: zip || null,
          city: city || null,
          uf: uf || null,
          lat: Number.isFinite(geocode.lat) ? geocode.lat : null,
          lon: Number.isFinite(geocode.lon) ? geocode.lon : null,
          pvgisBase: null,
          upstreamStatus: geocode.upstreamStatus,
          latencyMs: Date.now() - requestStartedAt,
        });
        const status = geocode.errorCode === "geocode_provider_unavailable" ? 503 : 422;
        return errorResponse(status, geocode.errorCode, geocodeDebug);
      }

      lat = geocode.lat;
      lon = geocode.lon;
      city = city || geocode.city;
      uf = uf || geocode.uf;
    }

    if (!isValidCoordinatePair(lat, lon)) {
      await logSolarResourceEvent(serviceClient, {
        requestId,
        leadId,
        orgId,
        errorCode: "geocode_failed",
        phase: "geocode",
        zip: zip || null,
        city: city || null,
        uf: uf || null,
        lat: null,
        lon: null,
        pvgisBase: null,
        upstreamStatus: null,
        latencyMs: Date.now() - requestStartedAt,
      });
      return errorResponse(422, "geocode_failed", {
        phase: "geocode",
        message: "invalid_coordinate_pair_after_geocode",
      });
    }

    const latRounded = Number(lat.toFixed(5));
    const lonRounded = Number(lon.toFixed(5));
    const cacheKey = `${latRounded}:${lonRounded}`;
    const handlerDeadline = Date.now() + HANDLER_DEADLINE_MS;

    const pvgis = await fetchPvgisMonthly(latRounded, lonRounded, handlerDeadline);
    if (!pvgis.ok) {
      const pvgisDebug: SolarResourceDebug = {
        phase: "pvgis",
        upstreamStatus: pvgis.upstreamStatus,
        pvgisBaseTried: pvgis.pvgisBaseTried,
        totalAttempts: pvgis.totalAttempts,
        latencyMs: pvgis.latencyMs,
        lat: latRounded,
        lon: lonRounded,
        cacheKeyTried: [cacheKey],
        ...(pvgis.message ? { message: pvgis.message } : {}),
      };

      await logSolarResourceEvent(serviceClient, {
        requestId,
        leadId,
        orgId,
        errorCode: pvgis.errorCode,
        phase: "pvgis",
        zip: zip || null,
        city: city || null,
        uf: uf || null,
        lat: latRounded,
        lon: lonRounded,
        pvgisBase: pvgis.pvgisBaseTried.join(" -> ") || null,
        upstreamStatus: pvgis.upstreamStatus,
        latencyMs: pvgis.latencyMs,
      });

      const status = pvgis.errorCode === "upstream_http_error" ? 502 : 503;
      return errorResponse(status, pvgis.errorCode, pvgisDebug);
    }

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
      pvgisBaseUsed: pvgis.pvgisBaseUsed,
      pvgisAttempts: pvgis.totalAttempts,
    };

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

    await logSolarResourceEvent(serviceClient, {
      requestId,
      leadId,
      orgId,
      errorCode: null,
      phase: "pvgis",
      zip: zip || null,
      city: city || null,
      uf: uf || null,
      lat: latRounded,
      lon: lonRounded,
      pvgisBase: pvgis.pvgisBaseUsed || null,
      upstreamStatus: null,
      latencyMs: pvgis.latencyMs,
    });

    console.log(
      `[solar-resource] PVGIS_OK requestId=${requestId} lat=${latRounded} lon=${lonRounded} annual=${pvgis.annual} base=${pvgis.pvgisBaseUsed} attempts=${pvgis.totalAttempts} latencyMs=${pvgis.latencyMs}`,
    );
    return jsonResponse(payload, 200, {
      "X-Solar-Source": "pvgis",
      "X-PVGIS-Base": pvgis.pvgisBaseUsed,
      "X-PVGIS-Attempts": String(pvgis.totalAttempts),
    });
  } catch (error) {
    return errorResponse(500, "unexpected_error", {
      phase: "unexpected",
      message: String(error),
      latencyMs: Date.now() - requestStartedAt,
    });
  }
});
