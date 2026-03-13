import { describe, expect, it } from 'vitest';

import { upsertOwnReaction } from '@/lib/reactions';

describe('upsertOwnReaction', () => {
  it('replaces previous own reaction and keeps external reactions', () => {
    const result = upsertOwnReaction(
      [
        { emoji: '😀', fromMe: true, reactorId: 'ME', timestamp: '2026-03-13T10:00:00.000Z' },
        { emoji: '🔥', fromMe: false, reactorId: 'client-1' },
      ],
      '👍',
      '2026-03-13T10:05:00.000Z',
    );

    expect(result).toEqual([
      { emoji: '🔥', fromMe: false, reactorId: 'client-1' },
      { emoji: '👍', fromMe: true, reactorId: 'ME', timestamp: '2026-03-13T10:05:00.000Z' },
    ]);
  });

  it('removes own reaction when emoji is empty', () => {
    const result = upsertOwnReaction(
      [
        { emoji: '👍', fromMe: true, reactorId: 'ME' },
        { emoji: '❤️', fromMe: false, reactorId: 'client-2' },
      ],
      '',
    );

    expect(result).toEqual([{ emoji: '❤️', fromMe: false, reactorId: 'client-2' }]);
  });

  it('returns empty array when existing payload is not an array', () => {
    expect(upsertOwnReaction(null, '')).toEqual([]);
    expect(upsertOwnReaction({ invalid: true }, '😀')).toEqual([
      {
        emoji: '😀',
        fromMe: true,
        reactorId: 'ME',
        timestamp: expect.any(String),
      },
    ]);
  });
});
