type FunctionPayload = Record<string, unknown>;

export type SupabaseFunctionErrorDetails = {
  message: string;
  status: number | null;
  code: string | null;
  payload: FunctionPayload | null;
};

const GENERIC_FUNCTION_MESSAGE = 'Edge Function returned a non-2xx status code';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getResponseFromError = (error: unknown): Response | null => {
  if (!isRecord(error)) return null;
  const context = error.context;
  return context instanceof Response ? context : null;
};

const getMessageFromPayload = (payload: FunctionPayload | null): string | null => {
  if (!payload) return null;

  const errorMessage = String(payload.error || '').trim();
  if (errorMessage) return errorMessage;

  const message = String(payload.message || '').trim();
  if (message) return message;

  return null;
};

export async function resolveSupabaseFunctionErrorDetails(
  error: unknown,
  fallback: string,
): Promise<SupabaseFunctionErrorDetails> {
  if (!(error instanceof Error)) {
    return {
      message: fallback,
      status: null,
      code: null,
      payload: null,
    };
  }

  const response = getResponseFromError(error);
  let payload: FunctionPayload | null = null;

  if (response) {
    try {
      const jsonPayload = await response.clone().json();
      payload = isRecord(jsonPayload) ? jsonPayload : null;
    } catch {
      payload = null;
    }
  }

  const directMessage = String(error.message || '').trim();
  const payloadMessage = getMessageFromPayload(payload);
  const message =
    payloadMessage ||
    (directMessage && directMessage !== GENERIC_FUNCTION_MESSAGE ? directMessage : '') ||
    fallback;

  const responseCode =
    typeof response?.status === 'number' && Number.isFinite(response.status) ? response.status : null;
  const errorCode =
    String(payload?.code || (isRecord(error) ? error.code || '' : '') || '').trim() || null;

  return {
    message,
    status: responseCode,
    code: errorCode,
    payload,
  };
}

export async function resolveSupabaseFunctionErrorMessage(error: unknown, fallback: string) {
  const details = await resolveSupabaseFunctionErrorDetails(error, fallback);
  return details.message;
}
