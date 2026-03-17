export const normalizeAssigneeIds = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const candidate = String(value || '').trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }

  return normalized;
};

export const getRoundRobinAssigneeForIndex = (
  assigneeIds: string[],
  index: number,
): string | null => {
  if (!assigneeIds.length) return null;
  const normalizedIndex = Math.max(0, index);
  return assigneeIds[normalizedIndex % assigneeIds.length] || null;
};

export const getRoundRobinAssigneeForSeed = (
  assigneeIds: string[],
  seed: string,
): string | null => {
  if (!assigneeIds.length) return null;
  const source = String(seed || '');
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }

  return assigneeIds[hash % assigneeIds.length] || null;
};

export const getDistributionPercentages = (count: number): number[] => {
  if (count < 1) return [];

  const base = Math.floor((1000 / count));
  const percentages = new Array<number>(count).fill(base);
  let remainder = 1000 - base * count;

  for (let i = 0; i < percentages.length && remainder > 0; i += 1, remainder -= 1) {
    percentages[i] += 1;
  }

  return percentages;
};
