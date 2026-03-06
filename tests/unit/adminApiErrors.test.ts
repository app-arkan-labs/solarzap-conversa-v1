import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock, refreshSessionMock, fetchMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
    },
  },
}));

vi.stubGlobal('fetch', fetchMock);

import { invokeAdminApi, isAdminApiError } from '@/hooks/useAdminApi';

const sessionWithToken = (token: string) => ({
  data: { session: { access_token: token } },
  error: null,
});

const emptySession = {
  data: { session: null },
  error: null,
};

const responseWithJson = (body: Record<string, unknown>, status: number, requestId?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(requestId ? { 'x-admin-request-id': requestId } : {}),
    },
  });

describe('useAdminApi error normalization', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    refreshSessionMock.mockReset();
    fetchMock.mockReset();
  });

  it('refreshes session before first invoke when no access token exists', async () => {
    getSessionMock.mockResolvedValue(emptySession);
    refreshSessionMock.mockResolvedValue(sessionWithToken('token-refreshed'));
    fetchMock.mockResolvedValue(
      responseWithJson({ ok: true, user_id: 'user-1', system_role: 'super_admin', aal: 'aal2' }, 200),
    );

    const response = await invokeAdminApi<{
      ok: true;
      user_id: string;
      system_role: string;
      aal: string;
    }>({ action: 'whoami' });

    expect(response.user_id).toBe('user-1');
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers?.Authorization).toBeDefined();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))._admin_access_token).toBe('token-refreshed');
  });

  it('retries after gateway 401 and succeeds with refreshed token', async () => {
    getSessionMock.mockResolvedValue(sessionWithToken('token-initial'));
    refreshSessionMock.mockResolvedValue(sessionWithToken('token-retried'));
    fetchMock
      .mockResolvedValueOnce(
        responseWithJson({ code: 401, message: 'Missing authorization header' }, 401, 'req-401'),
      )
      .mockResolvedValueOnce(
        responseWithJson({ ok: true, user_id: 'user-2', system_role: 'super_admin', aal: 'aal2' }, 200),
      );

    const response = await invokeAdminApi<{
      ok: true;
      user_id: string;
      system_role: string;
      aal: string;
    }>({ action: 'whoami' });

    expect(response.user_id).toBe('user-2');
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))._admin_access_token).toBe('token-initial');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))._admin_access_token).toBe('token-retried');
  });

  it('maps context-less invoke failures to network_error', async () => {
    getSessionMock.mockResolvedValue(sessionWithToken('token-network'));
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));

    try {
      await invokeAdminApi({ action: 'whoami' });
      throw new Error('Expected invokeAdminApi to fail');
    } catch (error) {
      expect(isAdminApiError(error)).toBe(true);
      if (!isAdminApiError(error)) {
        return;
      }
      expect(error.code).toBe('network_error');
      expect(error.message).toContain('Failed to fetch');
    }
  });

  it('preserves forbidden_origin with status and request id', async () => {
    getSessionMock.mockResolvedValue(sessionWithToken('token-origin'));
    fetchMock.mockResolvedValue(
      responseWithJson(
        { ok: false, code: 'forbidden_origin', message: 'Origin not allowed' },
        403,
        'req-origin',
      ),
    );

    try {
      await invokeAdminApi({ action: 'whoami' });
      throw new Error('Expected invokeAdminApi to fail');
    } catch (error) {
      expect(isAdminApiError(error)).toBe(true);
      if (!isAdminApiError(error)) {
        return;
      }
      expect(error.code).toBe('forbidden_origin');
      expect(error.status).toBe(403);
      expect(error.requestId).toBe('req-origin');
      expect(error.message).toBe('Origin not allowed');
    }
  });
});
