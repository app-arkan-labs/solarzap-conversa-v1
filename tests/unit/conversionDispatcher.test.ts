import { describe, expect, it } from 'vitest';
import {
  backoffSecondsForAttempt,
  buildDeliveryUpdatePatch,
  createInMemoryDeliveryClaimer,
  resolveGoogleClickId,
  shouldRequeueStaleDelivery,
  type DeliveryLike,
} from '../../supabase/functions/_shared/conversionDispatcher.ts';

describe('conversion dispatcher helpers', () => {
  it('resolves google click-id priority as gclid > gbraid > wbraid', () => {
    expect(
      resolveGoogleClickId({
        gclid: 'gclid_1',
        gbraid: 'gbraid_1',
        wbraid: 'wbraid_1',
      }),
    ).toEqual({ type: 'gclid', value: 'gclid_1' });

    expect(
      resolveGoogleClickId({
        gclid: null,
        gbraid: 'gbraid_1',
        wbraid: 'wbraid_1',
      }),
    ).toEqual({ type: 'gbraid', value: 'gbraid_1' });

    expect(resolveGoogleClickId({ gclid: null, gbraid: null, wbraid: null })).toBeNull();
  });

  it('uses exact backoff sequence from v3', () => {
    expect(backoffSecondsForAttempt(1)).toBe(30);
    expect(backoffSecondsForAttempt(2)).toBe(60);
    expect(backoffSecondsForAttempt(3)).toBe(300);
    expect(backoffSecondsForAttempt(4)).toBe(1800);
    expect(backoffSecondsForAttempt(5)).toBe(3600);
    expect(backoffSecondsForAttempt(9)).toBe(3600);
  });

  it('retries failed delivery independently from successful delivery', () => {
    const nowMs = Date.now();

    const failedPatch = buildDeliveryUpdatePatch(
      {
        attempt_count: 0,
        max_attempts: 5,
      },
      {
        status: 'failed',
        error: 'meta_http_500',
      },
      nowMs,
    );

    const successPatch = buildDeliveryUpdatePatch(
      {
        attempt_count: 0,
        max_attempts: 5,
      },
      {
        status: 'sent',
        response: { ok: true },
      },
      nowMs,
    );

    expect(failedPatch.status).toBe('failed');
    expect(failedPatch.attempt_count).toBe(1);
    expect(failedPatch.next_attempt_at).toBeTruthy();
    expect(successPatch.status).toBe('sent');
    expect(successPatch.attempt_count).toBeUndefined();
  });

  it('requeues stale processing rows after 3 minutes', () => {
    const nowMs = Date.now();
    const staleIso = new Date(nowMs - 181_000).toISOString();
    const freshIso = new Date(nowMs - 60_000).toISOString();

    expect(shouldRequeueStaleDelivery(staleIso, nowMs)).toBe(true);
    expect(shouldRequeueStaleDelivery(freshIso, nowMs)).toBe(false);
  });

  it('simulates two concurrent workers without duplicate claims', async () => {
    const nowIso = new Date().toISOString();
    const deliveries: DeliveryLike[] = [
      {
        id: 'd1',
        platform: 'meta',
        status: 'pending',
        attempt_count: 0,
        max_attempts: 5,
        next_attempt_at: nowIso,
      },
      {
        id: 'd2',
        platform: 'google_ads',
        status: 'pending',
        attempt_count: 0,
        max_attempts: 5,
        next_attempt_at: nowIso,
      },
    ];

    const claim = createInMemoryDeliveryClaimer(deliveries);
    const [workerA, workerB] = await Promise.all([claim(1), claim(1)]);

    const claimedIds = [...workerA, ...workerB].map((row) => row.id).sort();
    expect(claimedIds).toEqual(['d1', 'd2']);
    expect(workerA[0].id).not.toBe(workerB[0].id);
  });
});

