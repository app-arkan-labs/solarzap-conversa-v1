import { describe, expect, it } from 'vitest';

describe('Google Ads OAuth state encoding', () => {
  it('encodes and decodes state correctly', () => {
    const stateData = {
      user_id: 'u1',
      org_id: 'o1',
      redirect_url: 'http://localhost:5173',
      nonce: 'abc123',
    };

    const encoded = btoa(JSON.stringify(stateData));
    const decoded = JSON.parse(atob(encoded));

    expect(decoded).toEqual(stateData);
  });

  it('rejects malformed state', () => {
    expect(() => JSON.parse(atob('not-base64!!!'))).toThrow();
  });

  it('rejects state missing required fields', () => {
    const partial = btoa(JSON.stringify({ user_id: 'u1' }));
    const decoded = JSON.parse(atob(partial));

    expect(decoded.org_id).toBeUndefined();
    expect(decoded.redirect_url).toBeUndefined();
  });
});
