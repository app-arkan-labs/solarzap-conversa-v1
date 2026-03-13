export type MessageReaction = {
  emoji?: string;
  fromMe?: boolean;
  reactorId?: string;
  timestamp?: string;
};

export const upsertOwnReaction = (
  existing: unknown,
  emoji: string,
  nowIso: string = new Date().toISOString(),
): MessageReaction[] => {
  const current = Array.isArray(existing) ? (existing as MessageReaction[]) : [];

  const filtered = current.filter((reaction) => {
    if (!reaction || typeof reaction !== 'object') return false;
    return reaction.fromMe !== true && reaction.reactorId !== 'ME';
  });

  const normalizedEmoji = String(emoji || '').trim();
  if (normalizedEmoji) {
    filtered.push({
      emoji: normalizedEmoji,
      fromMe: true,
      reactorId: 'ME',
      timestamp: nowIso,
    });
  }

  return filtered;
};
