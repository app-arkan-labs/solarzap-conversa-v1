import { describe, expect, it } from 'vitest';
import {
  signContractEmbedToken,
  verifyContractEmbedToken,
} from '@/modules/contracts/lib/embedToken';

describe('contract embed token', () => {
  it('signs and verifies a valid embed token payload', async () => {
    const token = await signContractEmbedToken(
      {
        session_id: 'session-123',
        draft_id: 'draft-456',
        org_id: 'org-789',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      'secret-test-key',
    );

    const verified = await verifyContractEmbedToken(token, 'secret-test-key');
    expect(verified).toEqual({
      session_id: 'session-123',
      draft_id: 'draft-456',
      org_id: 'org-789',
      exp: expect.any(Number),
    });
  });

  it('rejects an expired token', async () => {
    const token = await signContractEmbedToken(
      {
        session_id: 'session-expired',
        draft_id: 'draft-expired',
        org_id: 'org-expired',
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      'secret-test-key',
    );

    const verified = await verifyContractEmbedToken(token, 'secret-test-key');
    expect(verified).toBeNull();
  });
});
