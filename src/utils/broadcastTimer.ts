export const BROADCAST_MIN_TIMER_SECONDS = 10;
export const BROADCAST_SLIDER_MAX_TIMER_SECONDS = 86_400;

export const clampBroadcastTimerSeconds = (value: number, fallback = 15): number => {
  const candidate = Number(value);
  const safeFallback = Number.isFinite(fallback) ? Math.round(fallback) : 15;

  if (!Number.isFinite(candidate)) {
    return Math.max(BROADCAST_MIN_TIMER_SECONDS, safeFallback);
  }

  return Math.max(BROADCAST_MIN_TIMER_SECONDS, Math.round(candidate));
};

export const formatBroadcastInterval = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const days = Math.floor(safeSeconds / 86_400);
  const hours = Math.floor((safeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  return `${remainingSeconds}s`;
};
