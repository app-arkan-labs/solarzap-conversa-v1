export type NotificationRoutingInput = {
  enabledNotifications: boolean
  enabledWhatsapp: boolean
  enabledEmail: boolean
  whatsappRecipients: unknown
  emailRecipients: unknown
}

export type NotificationRoutingResult = {
  notificationsEnabled: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
  whatsappRecipients: string[]
  emailRecipients: string[]
  hasEnabledChannel: boolean
  hasAnyRecipient: boolean
}

function toUnique(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function toDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '')
}

export function normalizeWhatsappRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return toUnique(
    value
      .map((item) => toDigits(item))
      .filter(Boolean),
  )
}

export function normalizeEmailRecipients(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return toUnique(
    value
      .map((item) => String(item ?? '').trim().toLowerCase())
      .filter(Boolean),
  )
}

export function resolveNotificationRouting(input: NotificationRoutingInput): NotificationRoutingResult {
  const notificationsEnabled = input.enabledNotifications === true
  const whatsappEnabled = notificationsEnabled && input.enabledWhatsapp === true
  const emailEnabled = notificationsEnabled && input.enabledEmail === true

  const whatsappRecipients = whatsappEnabled
    ? normalizeWhatsappRecipients(input.whatsappRecipients)
    : []
  const emailRecipients = emailEnabled
    ? normalizeEmailRecipients(input.emailRecipients)
    : []

  return {
    notificationsEnabled,
    whatsappEnabled,
    emailEnabled,
    whatsappRecipients,
    emailRecipients,
    hasEnabledChannel: whatsappEnabled || emailEnabled,
    hasAnyRecipient: whatsappRecipients.length > 0 || emailRecipients.length > 0,
  }
}
