import { describe, expect, it } from 'vitest';

import { tokenizeLinkifiedText } from '@/lib/linkifyText';

describe('tokenizeLinkifiedText', () => {
  it('detects plain https links', () => {
    const tokens = tokenizeLinkifiedText('Acesse https://example.com agora');
    expect(tokens).toEqual([
      { type: 'text', value: 'Acesse ' },
      { type: 'link', value: 'https://example.com', href: 'https://example.com' },
      { type: 'text', value: ' agora' },
    ]);
  });

  it('removes trailing punctuation from links', () => {
    const tokens = tokenizeLinkifiedText('Link: https://example.com/teste.');
    expect(tokens).toEqual([
      { type: 'text', value: 'Link: ' },
      { type: 'link', value: 'https://example.com/teste', href: 'https://example.com/teste' },
      { type: 'text', value: '.' },
    ]);
  });

  it('keeps unmatched closing parenthesis outside the link', () => {
    const tokens = tokenizeLinkifiedText('(https://example.com/teste)');
    expect(tokens).toEqual([
      { type: 'text', value: '(' },
      { type: 'link', value: 'https://example.com/teste', href: 'https://example.com/teste' },
      { type: 'text', value: ')' },
    ]);
  });
});
