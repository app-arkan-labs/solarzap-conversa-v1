export const INTERNAL_NOTIFICATION_EMAIL_SENDER_NAME = 'ARKAN SOLAR'
export const INTERNAL_NOTIFICATION_EMAIL_REPLY_TO = 'contato@arkanlabs.com.br'

const INTERNAL_CRM_AUTOMATION_SCOPE_KEY = 'default'

export type InternalNotificationWhatsappErrorCode =
  | 'admin_notification_instance_missing'
  | 'admin_notification_instance_disconnected'
  | 'admin_notification_transport_unavailable'

export type InternalNotificationTransport = {
  emailSenderName: string
  emailReplyTo: string
  whatsappInstanceId: string | null
  whatsappInstanceName: string | null
  whatsappDisplayName: string | null
  whatsappStatus: string | null
  whatsappReady: boolean
  whatsappErrorCode: InternalNotificationWhatsappErrorCode | null
  whatsappErrorMessage: string | null
}

type InternalNotificationTransportSettingsRow = {
  default_whatsapp_instance_id?: unknown
}

type InternalNotificationTransportInstanceRow = {
  id?: unknown
  instance_name?: unknown
  display_name?: unknown
  status?: unknown
}

type SupabaseSchemaLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>
        }
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>
      }
      maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>
    }
  }
}

type SupabaseLike = {
  schema: (schema: string) => SupabaseSchemaLike
}

function asString(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

export function buildInternalNotificationTransport(params: {
  settings?: InternalNotificationTransportSettingsRow | null
  instance?: InternalNotificationTransportInstanceRow | null
  transportQueryErrorMessage?: string | null
}): InternalNotificationTransport {
  const settings = params.settings || null
  const instance = params.instance || null
  const transportQueryErrorMessage = asString(params.transportQueryErrorMessage)
  const desiredInstanceId = asString(settings?.default_whatsapp_instance_id)
  const resolvedInstanceId = asString(instance?.id)
  const resolvedInstanceName = asString(instance?.instance_name)
  const resolvedDisplayName = asString(instance?.display_name)
  const resolvedStatus = asString(instance?.status)

  if (transportQueryErrorMessage) {
    return {
      emailSenderName: INTERNAL_NOTIFICATION_EMAIL_SENDER_NAME,
      emailReplyTo: INTERNAL_NOTIFICATION_EMAIL_REPLY_TO,
      whatsappInstanceId: resolvedInstanceId,
      whatsappInstanceName: resolvedInstanceName,
      whatsappDisplayName: resolvedDisplayName,
      whatsappStatus: resolvedStatus,
      whatsappReady: false,
      whatsappErrorCode: 'admin_notification_transport_unavailable',
      whatsappErrorMessage: transportQueryErrorMessage,
    }
  }

  if (!desiredInstanceId) {
    return {
      emailSenderName: INTERNAL_NOTIFICATION_EMAIL_SENDER_NAME,
      emailReplyTo: INTERNAL_NOTIFICATION_EMAIL_REPLY_TO,
      whatsappInstanceId: null,
      whatsappInstanceName: null,
      whatsappDisplayName: null,
      whatsappStatus: null,
      whatsappReady: false,
      whatsappErrorCode: 'admin_notification_instance_missing',
      whatsappErrorMessage: 'default_whatsapp_instance_id_not_configured',
    }
  }

  if (!resolvedInstanceId || !resolvedInstanceName) {
    return {
      emailSenderName: INTERNAL_NOTIFICATION_EMAIL_SENDER_NAME,
      emailReplyTo: INTERNAL_NOTIFICATION_EMAIL_REPLY_TO,
      whatsappInstanceId: null,
      whatsappInstanceName: null,
      whatsappDisplayName: null,
      whatsappStatus: resolvedStatus,
      whatsappReady: false,
      whatsappErrorCode: 'admin_notification_instance_missing',
      whatsappErrorMessage: 'default_whatsapp_instance_not_found',
    }
  }

  if (resolvedStatus !== 'connected') {
    return {
      emailSenderName: INTERNAL_NOTIFICATION_EMAIL_SENDER_NAME,
      emailReplyTo: INTERNAL_NOTIFICATION_EMAIL_REPLY_TO,
      whatsappInstanceId: resolvedInstanceId,
      whatsappInstanceName: resolvedInstanceName,
      whatsappDisplayName: resolvedDisplayName,
      whatsappStatus: resolvedStatus,
      whatsappReady: false,
      whatsappErrorCode: 'admin_notification_instance_disconnected',
      whatsappErrorMessage: `default_whatsapp_instance_status:${resolvedStatus || 'unknown'}`,
    }
  }

  return {
    emailSenderName: INTERNAL_NOTIFICATION_EMAIL_SENDER_NAME,
    emailReplyTo: INTERNAL_NOTIFICATION_EMAIL_REPLY_TO,
    whatsappInstanceId: resolvedInstanceId,
    whatsappInstanceName: resolvedInstanceName,
    whatsappDisplayName: resolvedDisplayName,
    whatsappStatus: resolvedStatus,
    whatsappReady: true,
    whatsappErrorCode: null,
    whatsappErrorMessage: null,
  }
}

export async function resolveInternalNotificationTransport(
  supabase: SupabaseLike,
): Promise<InternalNotificationTransport> {
  const crm = supabase.schema('internal_crm')

  const settingsResult = await crm
    .from('automation_settings')
    .select('default_whatsapp_instance_id')
    .eq('scope_key', INTERNAL_CRM_AUTOMATION_SCOPE_KEY)
    .maybeSingle()

  if (settingsResult.error) {
    return buildInternalNotificationTransport({
      transportQueryErrorMessage: `automation_settings_query_failed:${settingsResult.error.message || 'unknown_error'}`,
    })
  }

  const desiredInstanceId = asString(settingsResult.data?.default_whatsapp_instance_id)
  if (!desiredInstanceId) {
    return buildInternalNotificationTransport({
      settings: settingsResult.data,
    })
  }

  const instanceResult = await crm
    .from('whatsapp_instances')
    .select('id, instance_name, display_name, status')
    .eq('id', desiredInstanceId)
    .maybeSingle()

  if (instanceResult.error) {
    return buildInternalNotificationTransport({
      settings: settingsResult.data,
      transportQueryErrorMessage: `whatsapp_instance_query_failed:${instanceResult.error.message || 'unknown_error'}`,
    })
  }

  return buildInternalNotificationTransport({
    settings: settingsResult.data,
    instance: instanceResult.data,
  })
}
