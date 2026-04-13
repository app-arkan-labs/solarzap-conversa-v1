export const BROADCAST_MIN_INTERVAL_SECONDS = 60;
export const BROADCAST_MAX_INTERVAL_SECONDS = 86_400;
export const BROADCAST_JITTER_RATIO = 0.3;

export function clampBroadcastIntervalSeconds(
  value: unknown,
  fallback = BROADCAST_MIN_INTERVAL_SECONDS,
): number {
  const candidate = Number(value);
  const safeFallback = Number.isFinite(Number(fallback))
    ? Math.round(Number(fallback))
    : BROADCAST_MIN_INTERVAL_SECONDS;

  if (!Number.isFinite(candidate)) {
    return Math.min(
      BROADCAST_MAX_INTERVAL_SECONDS,
      Math.max(BROADCAST_MIN_INTERVAL_SECONDS, safeFallback),
    );
  }

  return Math.min(
    BROADCAST_MAX_INTERVAL_SECONDS,
    Math.max(BROADCAST_MIN_INTERVAL_SECONDS, Math.round(candidate)),
  );
}

export function sanitizeBroadcastMessages(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((entry) => String(entry ?? '').trim())
    .filter((entry) => entry.length > 0);
}

export function computeBroadcastJitteredDelaySeconds(
  baseIntervalSeconds: unknown,
  randomValue = Math.random(),
): number {
  const baseSeconds = clampBroadcastIntervalSeconds(baseIntervalSeconds);
  const safeRandom = Math.min(1, Math.max(0, Number.isFinite(randomValue) ? randomValue : 0.5));
  const multiplier = 1 + ((safeRandom * 2 - 1) * BROADCAST_JITTER_RATIO);
  return Math.max(
    BROADCAST_MIN_INTERVAL_SECONDS,
    Math.round(baseSeconds * multiplier),
  );
}

export function selectRotatingBroadcastMessage(
  messages: unknown,
  dispatchOrder: unknown,
  fallbackMessage?: string,
): string {
  const pool = sanitizeBroadcastMessages(messages);
  if (pool.length === 0) {
    const fallback = String(fallbackMessage || '').trim();
    if (fallback) return fallback;
    throw new Error('campaign_messages_empty');
  }

  const normalizedDispatchOrder = Math.max(0, Math.floor(Number(dispatchOrder) || 0));
  const index = normalizedDispatchOrder % pool.length;
  return pool[index];
}
