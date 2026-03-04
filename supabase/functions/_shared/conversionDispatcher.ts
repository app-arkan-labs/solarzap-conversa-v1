import { TRACKING_BACKOFF_SECONDS, TRACKING_MAX_ATTEMPTS } from './tracking.ts';

export type DispatcherPlatform = 'meta' | 'google_ads' | 'ga4';

export type DeliveryLike = {
  id: string;
  platform: DispatcherPlatform;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  updated_at?: string | null;
};

export type GoogleClickIdResult =
  | {
      type: 'gclid' | 'gbraid' | 'wbraid';
      value: string;
    }
  | null;

export type DeliveryDispatchResult =
  | {
      status: 'sent';
      response?: unknown;
    }
  | {
      status: 'skipped' | 'disabled';
      reason: string;
      response?: unknown;
    }
  | {
      status: 'failed';
      error: string;
      response?: unknown;
    };

export type DeliveryUpdatePatch = {
  status: 'sent' | 'failed' | 'skipped' | 'disabled';
  attempt_count?: number;
  next_attempt_at?: string;
  last_error?: string | null;
  sent_at?: string | null;
  platform_response?: unknown;
};

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveGoogleClickId(payload: {
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
}): GoogleClickIdResult {
  const gclid = cleanString(payload.gclid);
  if (gclid) return { type: 'gclid', value: gclid };

  const gbraid = cleanString(payload.gbraid);
  if (gbraid) return { type: 'gbraid', value: gbraid };

  const wbraid = cleanString(payload.wbraid);
  if (wbraid) return { type: 'wbraid', value: wbraid };

  return null;
}

export function backoffSecondsForAttempt(attemptCount: number): number {
  const boundedAttempt = Math.max(1, Math.min(TRACKING_MAX_ATTEMPTS, Math.floor(attemptCount || 1)));
  const index = boundedAttempt - 1;
  return TRACKING_BACKOFF_SECONDS[index] || TRACKING_BACKOFF_SECONDS[TRACKING_BACKOFF_SECONDS.length - 1];
}

export function computeNextAttemptAtIso(attemptCount: number, nowMs = Date.now()): string {
  const seconds = backoffSecondsForAttempt(attemptCount);
  return new Date(nowMs + seconds * 1000).toISOString();
}

export function shouldRequeueStaleDelivery(updatedAtIso: string | null | undefined, nowMs = Date.now()): boolean {
  if (!updatedAtIso) return true;
  const updatedAtMs = new Date(updatedAtIso).getTime();
  if (!Number.isFinite(updatedAtMs)) return true;
  return updatedAtMs < nowMs - 3 * 60 * 1000;
}

export function buildDeliveryUpdatePatch(
  delivery: Pick<DeliveryLike, 'attempt_count' | 'max_attempts'>,
  result: DeliveryDispatchResult,
  nowMs = Date.now(),
): DeliveryUpdatePatch {
  if (result.status === 'sent') {
    return {
      status: 'sent',
      sent_at: new Date(nowMs).toISOString(),
      last_error: null,
      platform_response: result.response || null,
    };
  }

  if (result.status === 'skipped' || result.status === 'disabled') {
    return {
      status: result.status,
      last_error: result.reason,
      platform_response: result.response || null,
    };
  }

  const nextAttemptCount = Math.max(0, Number(delivery.attempt_count || 0)) + 1;
  const maxAttempts = Math.max(1, Number(delivery.max_attempts || TRACKING_MAX_ATTEMPTS));
  const exhausted = nextAttemptCount >= maxAttempts;

  return {
    status: 'failed',
    attempt_count: nextAttemptCount,
    next_attempt_at: exhausted ? new Date(nowMs).toISOString() : computeNextAttemptAtIso(nextAttemptCount, nowMs),
    last_error: result.error,
    platform_response: result.response || null,
  };
}

export function claimDeliveriesInMemory<T extends DeliveryLike>(
  deliveries: T[],
  batchSize: number,
  nowMs = Date.now(),
): T[] {
  const limit = Math.max(1, Math.min(200, Math.floor(batchSize || 50)));
  const candidates = deliveries
    .filter((delivery) => {
      const status = String(delivery.status || '').toLowerCase();
      const canRetry = Number(delivery.attempt_count || 0) < Number(delivery.max_attempts || TRACKING_MAX_ATTEMPTS);
      const eligibleStatus = status === 'pending' || status === 'failed';
      const nextAttemptAtMs = new Date(delivery.next_attempt_at).getTime();
      const due = Number.isFinite(nextAttemptAtMs) ? nextAttemptAtMs <= nowMs : true;
      return eligibleStatus && canRetry && due;
    })
    .sort((a, b) => {
      const aMs = new Date(a.next_attempt_at).getTime();
      const bMs = new Date(b.next_attempt_at).getTime();
      return aMs - bMs;
    })
    .slice(0, limit);

  candidates.forEach((delivery) => {
    delivery.status = 'processing';
    delivery.updated_at = new Date(nowMs).toISOString();
  });

  return candidates;
}

export function createInMemoryDeliveryClaimer<T extends DeliveryLike>(deliveries: T[]) {
  let lock = Promise.resolve();

  return async function claim(batchSize: number, nowMs = Date.now()): Promise<T[]> {
    const previousLock = lock;
    let release: (() => void) | null = null;
    lock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previousLock;
    try {
      return claimDeliveriesInMemory(deliveries, batchSize, nowMs);
    } finally {
      if (release) release();
    }
  };
}

