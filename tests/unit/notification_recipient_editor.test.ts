import { describe, expect, it } from 'vitest';

import {
  mergeRecipientInput,
  normalizeEmailRecipient,
  normalizeWhatsappRecipient,
  removeRecipient,
} from '@/lib/notificationRecipientEditor';

describe('notification recipient editor', () => {
  it('adiciona e deduplica multiplos numeros de whatsapp', () => {
    const result = mergeRecipientInput(
      ['5511999990000'],
      '+55 (11) 99999-0000, 5511888887777; 11 9999',
      'whatsapp',
    );

    expect(result.next).toEqual(['5511999990000', '5511888887777']);
    expect(result.added).toEqual(['5511888887777']);
    expect(result.invalid).toEqual(['11 9999']);
    expect(result.parsedCount).toBe(3);
  });

  it('adiciona emails validos e separa invalidos', () => {
    const result = mergeRecipientInput(
      ['ops@cliente.com'],
      'OPS@cliente.com\ncomercial@cliente.com;invalido@',
      'email',
    );

    expect(result.next).toEqual(['ops@cliente.com', 'comercial@cliente.com']);
    expect(result.added).toEqual(['comercial@cliente.com']);
    expect(result.invalid).toEqual(['invalido@']);
  });

  it('remove destinatario com normalizacao por canal', () => {
    const wa = removeRecipient(
      ['5511999990000', '5511888887777'],
      '+55 (11) 88888-7777',
      'whatsapp',
    );
    const email = removeRecipient(
      ['ops@cliente.com', 'financeiro@cliente.com'],
      'Financeiro@Cliente.com',
      'email',
    );

    expect(wa).toEqual(['5511999990000']);
    expect(email).toEqual(['ops@cliente.com']);
  });

  it('normaliza entradas unitarias', () => {
    expect(normalizeWhatsappRecipient('+55 (11) 99999-0000')).toBe('5511999990000');
    expect(normalizeWhatsappRecipient('123')).toBeNull();
    expect(normalizeEmailRecipient(' Ops@Cliente.com ')).toBe('ops@cliente.com');
    expect(normalizeEmailRecipient('invalido@')).toBeNull();
  });
});
