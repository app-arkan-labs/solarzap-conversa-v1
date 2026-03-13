export type DispatchChannel = 'whatsapp' | 'email'

export type DispatchSuccessLookup = {
  whatsapp: Set<string>
  email: Set<string>
}

export type DispatchLogLike = {
  channel: unknown
  destination: unknown
  status: unknown
}

export function normalizeDispatchDestination(
  channel: DispatchChannel,
  destination: unknown,
): string {
  const raw = String(destination ?? '').trim()
  if (!raw) return ''
  if (channel === 'whatsapp') return raw.replace(/\D/g, '')
  return raw.toLowerCase()
}

export function createDispatchSuccessLookup(): DispatchSuccessLookup {
  return {
    whatsapp: new Set<string>(),
    email: new Set<string>(),
  }
}

export function buildDispatchSuccessLookup(rows: DispatchLogLike[]): DispatchSuccessLookup {
  const lookup = createDispatchSuccessLookup()
  for (const row of rows) {
    const status = String(row.status || '').toLowerCase()
    if (status !== 'success') continue
    const channel = String(row.channel || '').toLowerCase()
    if (channel !== 'whatsapp' && channel !== 'email') continue
    const normalized = normalizeDispatchDestination(channel, row.destination)
    if (!normalized) continue
    lookup[channel].add(normalized)
  }
  return lookup
}

export function countDeliveredRecipients(
  channel: DispatchChannel,
  recipients: string[],
  lookup: DispatchSuccessLookup,
): number {
  const targetSet = lookup[channel]
  let delivered = 0
  for (const recipient of recipients) {
    const normalized = normalizeDispatchDestination(channel, recipient)
    if (!normalized) continue
    if (targetSet.has(normalized)) delivered += 1
  }
  return delivered
}

export function markRecipientDelivered(
  channel: DispatchChannel,
  destination: unknown,
  lookup: DispatchSuccessLookup,
): void {
  const normalized = normalizeDispatchDestination(channel, destination)
  if (!normalized) return
  lookup[channel].add(normalized)
}

export function wasRecipientDelivered(
  channel: DispatchChannel,
  destination: unknown,
  lookup: DispatchSuccessLookup,
): boolean {
  const normalized = normalizeDispatchDestination(channel, destination)
  if (!normalized) return false
  return lookup[channel].has(normalized)
}
