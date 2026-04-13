import { describe, expect, it } from 'vitest';
import {
  BROADCAST_MIN_INTERVAL_SECONDS,
  clampBroadcastIntervalSeconds,
  computeBroadcastJitteredDelaySeconds,
  selectRotatingBroadcastMessage,
} from '../../supabase/functions/_shared/broadcastDispatch';

describe('broadcastDispatch', () => {
  it('clamps campaign intervals to the operational minimum of 60 seconds', () => {
    expect(clampBroadcastIntervalSeconds(undefined)).toBe(BROADCAST_MIN_INTERVAL_SECONDS);
    expect(clampBroadcastIntervalSeconds(10)).toBe(BROADCAST_MIN_INTERVAL_SECONDS);
    expect(clampBroadcastIntervalSeconds(60)).toBe(60);
    expect(clampBroadcastIntervalSeconds(86_500)).toBe(86_400);
  });

  it('applies jitter without going below the operational floor', () => {
    expect(computeBroadcastJitteredDelaySeconds(60, 0)).toBe(60);
    expect(computeBroadcastJitteredDelaySeconds(300, 0)).toBe(210);
    expect(computeBroadcastJitteredDelaySeconds(300, 1)).toBe(390);
  });

  it('rotates messages deterministically by dispatch order', () => {
    const messages = ['Mensagem A', 'Mensagem B', 'Mensagem C'];

    expect(selectRotatingBroadcastMessage(messages, 0)).toBe('Mensagem A');
    expect(selectRotatingBroadcastMessage(messages, 1)).toBe('Mensagem B');
    expect(selectRotatingBroadcastMessage(messages, 2)).toBe('Mensagem C');
    expect(selectRotatingBroadcastMessage(messages, 3)).toBe('Mensagem A');
    expect(selectRotatingBroadcastMessage(messages, 4)).toBe('Mensagem B');
  });
});
