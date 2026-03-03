import { describe, expect, it } from 'vitest'

import {
  normalizeEmailRecipients,
  normalizeWhatsappRecipients,
  resolveNotificationRouting,
} from '../../supabase/functions/_shared/notificationRecipients.ts'

describe('notificationRecipients routing', () => {
  it('bloqueia canais quando toggle global esta desligado', () => {
    const routing = resolveNotificationRouting({
      enabledNotifications: false,
      enabledWhatsapp: true,
      enabledEmail: true,
      whatsappRecipients: ['5511999990000'],
      emailRecipients: ['ops@cliente.com'],
    })

    expect(routing.notificationsEnabled).toBe(false)
    expect(routing.whatsappEnabled).toBe(false)
    expect(routing.emailEnabled).toBe(false)
    expect(routing.hasEnabledChannel).toBe(false)
    expect(routing.hasAnyRecipient).toBe(false)
  })

  it('normaliza e deduplica destinatarios de whatsapp', () => {
    const recipients = normalizeWhatsappRecipients([
      '+55 (11) 99999-0000',
      '5511999990000',
      '  ',
      '(11) 97777-1111',
    ])

    expect(recipients).toEqual(['5511999990000', '11977771111'])
  })

  it('normaliza e deduplica destinatarios de email', () => {
    const recipients = normalizeEmailRecipients([
      'Ops@Cliente.com ',
      ' ops@cliente.com',
      '',
      'financeiro@cliente.com',
    ])

    expect(recipients).toEqual(['ops@cliente.com', 'financeiro@cliente.com'])
  })

  it('retorna somente destinatarios dos canais habilitados', () => {
    const routing = resolveNotificationRouting({
      enabledNotifications: true,
      enabledWhatsapp: true,
      enabledEmail: false,
      whatsappRecipients: ['5511999990000', '5511888881111'],
      emailRecipients: ['time@cliente.com'],
    })

    expect(routing.whatsappEnabled).toBe(true)
    expect(routing.emailEnabled).toBe(false)
    expect(routing.whatsappRecipients).toEqual(['5511999990000', '5511888881111'])
    expect(routing.emailRecipients).toEqual([])
    expect(routing.hasEnabledChannel).toBe(true)
    expect(routing.hasAnyRecipient).toBe(true)
  })
})
