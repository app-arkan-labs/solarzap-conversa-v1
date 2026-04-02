import { describe, expect, it } from 'vitest';

import {
  resolveInternalCrmAttachmentKind,
  resolveInternalCrmMediaVariant,
  shouldSendInternalCrmAsSticker,
} from '@/modules/internal-crm/lib/chatMedia';

describe('internal CRM chat media helpers', () => {
  it('classifies audio uploads as audio', () => {
    expect(resolveInternalCrmAttachmentKind({ name: 'gravacao.ogg', type: 'audio/ogg' })).toBe('audio');
  });

  it('classifies gif uploads as image with gif media variant', () => {
    expect(resolveInternalCrmAttachmentKind({ name: 'animacao.gif', type: 'image/gif' })).toBe('image');
    expect(resolveInternalCrmMediaVariant({ name: 'animacao.gif', type: 'image/gif' })).toBe('gif');
    expect(shouldSendInternalCrmAsSticker({ name: 'animacao.gif', type: 'image/gif' })).toBe(true);
  });

  it('classifies webp uploads as sticker by default', () => {
    expect(resolveInternalCrmAttachmentKind({ name: 'figurinha.webp', type: 'image/webp' })).toBe('image');
    expect(resolveInternalCrmMediaVariant({ name: 'figurinha.webp', type: 'image/webp' })).toBe('sticker');
    expect(shouldSendInternalCrmAsSticker({ name: 'figurinha.webp', type: 'image/webp' })).toBe(true);
  });

  it('keeps regular images as standard media', () => {
    expect(resolveInternalCrmAttachmentKind({ name: 'foto.png', type: 'image/png' })).toBe('image');
    expect(resolveInternalCrmMediaVariant({ name: 'foto.png', type: 'image/png' })).toBe('standard');
    expect(shouldSendInternalCrmAsSticker({ name: 'foto.png', type: 'image/png' })).toBe(false);
  });
});
