import { describe, expect, it } from 'vitest';

import { parseMessageContent } from '@/components/solarzap/MessageContent';

describe('parseMessageContent legacy sticker fallback', () => {
  it('renders legacy "Sticker recebido + URL" as image', () => {
    const parsed = parseMessageContent(
      'Sticker recebido\nhttps://cdn.example.com/sticker_123.webp',
    );

    expect(parsed.type).toBe('image');
    expect(parsed.url).toBe('https://cdn.example.com/sticker_123.webp');
    expect(parsed.fileName).toBe('Sticker recebido');
  });

  it('keeps generic text with URL as text', () => {
    const parsed = parseMessageContent(
      'Veja isto\nhttps://cdn.example.com/page',
    );

    expect(parsed.type).toBe('text');
    expect(parsed.text).toContain('Veja isto');
  });

  it('prioritizes attachment columns when attachment_type=image', () => {
    const parsed = parseMessageContent(
      'qualquer conteudo',
      'https://cdn.example.com/image.png',
      'image',
      true,
      'imagem.png',
    );

    expect(parsed.type).toBe('image');
    expect(parsed.url).toBe('https://cdn.example.com/image.png');
    expect(parsed.fileName).toBe('imagem.png');
  });
});
