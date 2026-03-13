export const partitionDayEvents = <T>(
  events: T[],
  maxVisible = 4,
): { visible: T[]; hiddenCount: number } => {
  const safeEvents = Array.isArray(events) ? events : [];
  const normalizedMaxVisible = Number.isFinite(maxVisible)
    ? Math.max(0, Math.floor(maxVisible))
    : 4;

  const visible = safeEvents.slice(0, normalizedMaxVisible);
  const hiddenCount = Math.max(0, safeEvents.length - visible.length);

  return { visible, hiddenCount };
};
