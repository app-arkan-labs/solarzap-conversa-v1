import { describe, expect, it } from 'vitest';

import {
  buildDispatchSuccessLookup,
  countDeliveredRecipients,
  markRecipientDelivered,
  wasRecipientDelivered,
} from '../../supabase/functions/_shared/notificationDispatchState.ts';

describe('notification dispatch state', () => {
  it('deduplica destinos ja entregues por canal', () => {
    const lookup = buildDispatchSuccessLookup([
      { channel: 'whatsapp', destination: '+55 (11) 99999-0000', status: 'success' },
      { channel: 'whatsapp', destination: '5511999990000', status: 'success' },
      { channel: 'email', destination: 'OPS@cliente.com', status: 'success' },
      { channel: 'email', destination: 'ops@cliente.com', status: 'success' },
      { channel: 'email', destination: 'financeiro@cliente.com', status: 'failed' },
    ]);

    expect(lookup.whatsapp.size).toBe(1);
    expect(lookup.email.size).toBe(1);
    expect(wasRecipientDelivered('whatsapp', '5511999990000', lookup)).toBe(true);
    expect(wasRecipientDelivered('email', 'ops@cliente.com', lookup)).toBe(true);
    expect(wasRecipientDelivered('email', 'financeiro@cliente.com', lookup)).toBe(false);
  });

  it('conta entregas acumuladas para retry parcial', () => {
    const lookup = buildDispatchSuccessLookup([
      { channel: 'email', destination: 'ops@cliente.com', status: 'success' },
    ]);

    markRecipientDelivered('whatsapp', '5511999990000', lookup);

    expect(countDeliveredRecipients('email', ['OPS@cliente.com', 'extra@cliente.com'], lookup)).toBe(1);
    expect(countDeliveredRecipients('whatsapp', ['+55 (11) 99999-0000', '5511888887777'], lookup)).toBe(1);
  });
});
