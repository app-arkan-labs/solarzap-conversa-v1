import { describe, expect, it } from 'vitest'

import {
  buildInternalNotificationTransport,
  INTERNAL_NOTIFICATION_EMAIL_REPLY_TO,
  INTERNAL_NOTIFICATION_EMAIL_SENDER_NAME,
  resolveInternalNotificationTransport,
} from '../../supabase/functions/_shared/internalNotificationTransport.ts'

describe('internal notification transport', () => {
  it('returns fixed email identity and connected admin instance when ready', () => {
    const transport = buildInternalNotificationTransport({
      settings: {
        default_whatsapp_instance_id: 'instance-1',
      },
      instance: {
        id: 'instance-1',
        instance_name: 'sz_internal_solarzap_969216',
        display_name: 'SolarZap',
        status: 'connected',
      },
    })

    expect(transport.emailSenderName).toBe(INTERNAL_NOTIFICATION_EMAIL_SENDER_NAME)
    expect(transport.emailReplyTo).toBe(INTERNAL_NOTIFICATION_EMAIL_REPLY_TO)
    expect(transport.whatsappReady).toBe(true)
    expect(transport.whatsappInstanceId).toBe('instance-1')
    expect(transport.whatsappInstanceName).toBe('sz_internal_solarzap_969216')
    expect(transport.whatsappErrorCode).toBeNull()
  })

  it('marks transport as missing when no default admin instance is configured', () => {
    const transport = buildInternalNotificationTransport({
      settings: {
        default_whatsapp_instance_id: null,
      },
    })

    expect(transport.whatsappReady).toBe(false)
    expect(transport.whatsappErrorCode).toBe('admin_notification_instance_missing')
    expect(transport.whatsappErrorMessage).toBe('default_whatsapp_instance_id_not_configured')
  })

  it('marks transport as disconnected when admin instance is not connected', () => {
    const transport = buildInternalNotificationTransport({
      settings: {
        default_whatsapp_instance_id: 'instance-2',
      },
      instance: {
        id: 'instance-2',
        instance_name: 'sz_internal_solarzap_969216',
        display_name: 'SolarZap',
        status: 'disconnected',
      },
    })

    expect(transport.whatsappReady).toBe(false)
    expect(transport.whatsappErrorCode).toBe('admin_notification_instance_disconnected')
    expect(transport.whatsappErrorMessage).toBe('default_whatsapp_instance_status:disconnected')
  })

  it('returns transport unavailable when automation settings query fails', async () => {
    const supabase = {
      schema() {
        return {
          from() {
            return {
              select() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({
                        data: null,
                        error: { message: 'permission denied' },
                      }),
                    }
                  },
                }
              },
            }
          },
        }
      },
    }

    const transport = await resolveInternalNotificationTransport(supabase as never)

    expect(transport.whatsappReady).toBe(false)
    expect(transport.whatsappErrorCode).toBe('admin_notification_transport_unavailable')
    expect(transport.whatsappErrorMessage).toBe('automation_settings_query_failed:permission denied')
  })
})
