export const TRACKING_PLATFORMS = ['meta', 'google_ads', 'ga4'] as const
export type TrackingPlatform = (typeof TRACKING_PLATFORMS)[number]

export const CONVERSION_DELIVERY_STATUSES = [
  'pending',
  'processing',
  'sent',
  'failed',
  'skipped',
  'disabled',
] as const
export type ConversionDeliveryStatus = (typeof CONVERSION_DELIVERY_STATUSES)[number]

export const TRACKING_MAX_ATTEMPTS = 5
export const TRACKING_BACKOFF_SECONDS = [30, 60, 300, 1800, 3600] as const

export type StageEventMapEntry = {
  event_key: string
  meta: string | null
  google_ads: string | null
  ga4: string | null
}

export type StageEventMap = Record<string, StageEventMapEntry>

export function normalizeCrmStageSlug(value: string | null | undefined): string {
  if (!value) return 'unknown'
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_') || 'unknown'
}

export function getDefaultStageEventMap(): StageEventMap {
  return {
    novo_lead: {
      event_key: 'novo_lead',
      meta: 'Lead',
      google_ads: null,
      ga4: 'generate_lead',
    },
    agendou_reuniao: {
      event_key: 'agendou_reuniao',
      meta: 'Schedule',
      google_ads: 'schedule',
      ga4: 'schedule_appointment',
    },
    chamada_realizada: {
      event_key: 'chamada_realizada',
      meta: null,
      google_ads: null,
      ga4: null,
    },
    visita_realizada: {
      event_key: 'visita_realizada',
      meta: 'SubmitApplication',
      google_ads: 'proposal_sent',
      ga4: 'proposal_ready',
    },
    chamada_agendada: {
      event_key: 'chamada_agendada',
      meta: null,
      google_ads: null,
      ga4: null,
    },
    proposta_pronta: {
      event_key: 'proposta_pronta',
      meta: null,
      google_ads: null,
      ga4: null,
    },
    financiamento: {
      event_key: 'financiamento',
      meta: 'InitiateCheckout',
      google_ads: 'financing',
      ga4: 'begin_checkout',
    },
    aprovou_projeto: {
      event_key: 'aprovou_projeto',
      meta: 'CompleteRegistration',
      google_ads: 'qualified_lead',
      ga4: 'project_approved',
    },
    contrato_assinado: {
      event_key: 'contrato_assinado',
      meta: null,
      google_ads: null,
      ga4: null,
    },
    fechou: {
      event_key: 'fechou',
      meta: 'Purchase',
      google_ads: 'purchase',
      ga4: 'purchase',
    },
    projeto_pago: {
      event_key: 'projeto_pago',
      meta: null,
      google_ads: null,
      ga4: null,
    },
  }
}

export function isTrackingEnabled(settings: { tracking_enabled?: boolean | null } | null | undefined): boolean {
  return settings?.tracking_enabled === true
}

export function shouldCreateDeliveries(settings: { tracking_enabled?: boolean | null } | null | undefined): boolean {
  return isTrackingEnabled(settings)
}

export function disabledDeliveryStatus(): ConversionDeliveryStatus {
  return 'disabled'
}

