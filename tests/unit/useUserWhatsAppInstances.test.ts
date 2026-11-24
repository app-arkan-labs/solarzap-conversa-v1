import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useUserWhatsAppInstances } from '@/hooks/useUserWhatsAppInstances';

type InstanceRow = Record<string, unknown>;
type InstanceEvent = { eventType: 'INSERT' | 'UPDATE'; new: InstanceRow };

const { from, subscribe, auth, create } = vi.hoisted(() => ({
  from: vi.fn(),
  subscribe: vi.fn(),
  auth: { user: { id: 'test-user' }, orgId: 'test-org', role: 'owner' },
  create: vi.fn(),
}));

vi.mock('@/config/devMode', () => ({ DEV_MODE: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/contexts/BillingBlockerContext', () => ({ useBillingBlocker: () => ({ billing: null }) }));
vi.mock('@/lib/supabase', () => ({
  supabaseUrl: 'https://test.invalid',
  supabase: {
    from,
    channel: () => ({ on: subscribe }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: { allowed: true }, error: null }),
  },
}));
vi.mock('@/lib/evolutionApi', () => ({
  evolutionApi: {
    createInstance: create,
    setWebhook: vi.fn().mockResolvedValue({ success: true }),
  },
}));

it.each(['realtime first', 'request first'])('shows one instance with %s', async (order) => {
  const fetchQuery = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  let publish: (event: InstanceEvent) => void = vi.fn();
  subscribe.mockImplementation((_type, _filter, callback) => {
    publish = callback;
    return { subscribe: vi.fn() };
  });
  create.mockResolvedValue({ success: true, data: { base64: 'fixture-qr' } });

  let row: InstanceRow = {};
  from.mockReturnValue({
    select: () => fetchQuery,
    insert: (data: InstanceRow) => ({
      select: () => ({
        single: async () => {
          row = { ...data, id: 'same-db-id' };
          if (order === 'realtime first') publish({ eventType: 'INSERT', new: row });
          return { data: row, error: null };
        },
      }),
    }),
  });

  const { result } = renderHook(() => useUserWhatsAppInstances());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    const created = await result.current.createInstance('Test instance');
    expect(created).toMatchObject({ qrCode: 'fixture-qr' });
  });
  if (order === 'request first') act(() => publish({ eventType: 'INSERT', new: row }));

  expect(result.current.instances.map(instance => instance.id)).toEqual(['same-db-id']);
  act(() => publish({ eventType: 'UPDATE', new: { ...row, status: 'connected' } }));
  act(() => publish({ eventType: 'INSERT', new: row }));
  expect(result.current.instances).toMatchObject([{ id: 'same-db-id', status: 'connected' }]);
});
