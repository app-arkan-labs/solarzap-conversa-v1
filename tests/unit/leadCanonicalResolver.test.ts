import { describe, expect, it, vi } from 'vitest';
import { resolveLeadCanonicalId } from '../../supabase/functions/_shared/leadCanonical.ts';

type MockResponse = {
  data: any;
  error: any;
};

type MockScript = {
  rpcSingle: MockResponse[];
  selectMaybeSingle?: MockResponse[];
  insertSingle?: MockResponse[];
  updateResult?: MockResponse[];
};

type FilterOp = {
  op: 'eq' | 'is' | 'order' | 'limit';
  column: string;
  value: unknown;
};

function createSupabaseMock(script: MockScript) {
  let rpcIndex = 0;
  let selectMaybeSingleIndex = 0;
  let insertSingleIndex = 0;
  let updateIndex = 0;

  const calls = {
    rpc: [] as Array<{ fn: string; payload: Record<string, unknown> }>,
    selectMaybeSingle: [] as Array<{ table: string; columns: string; filters: FilterOp[] }>,
    insertSingle: [] as Array<{ table: string; columns: string; payload: Record<string, unknown> }>,
    update: [] as Array<{ table: string; payload: Record<string, unknown>; filters: FilterOp[] }>,
  };

  const popOrDefault = (list: MockResponse[] | undefined, index: number): MockResponse =>
    list && index < list.length
      ? list[index]
      : { data: null, error: null };

  const buildFilterChain = (context: { table: string; columns?: string; payload?: Record<string, unknown>; filters: FilterOp[] }) => {
    const chain: any = {
      eq(column, value) {
        context.filters.push({ op: 'eq', column, value });
        return chain;
      },
      is(column, value) {
        context.filters.push({ op: 'is', column, value });
        return chain;
      },
      order(column, value) {
        context.filters.push({ op: 'order', column, value });
        return chain;
      },
      limit(value) {
        context.filters.push({ op: 'limit', column: 'limit', value });
        return chain;
      },
      async maybeSingle() {
        calls.selectMaybeSingle.push({
          table: context.table,
          columns: String(context.columns || ''),
          filters: [...context.filters],
        });
        const response = popOrDefault(script.selectMaybeSingle, selectMaybeSingleIndex);
        selectMaybeSingleIndex += 1;
        return response;
      },
      async single() {
        if (context.payload) {
          calls.insertSingle.push({
            table: context.table,
            columns: String(context.columns || ''),
            payload: context.payload,
          });
          const response = popOrDefault(script.insertSingle, insertSingleIndex);
          insertSingleIndex += 1;
          return response;
        }

        calls.selectMaybeSingle.push({
          table: context.table,
          columns: String(context.columns || ''),
          filters: [...context.filters],
        });
        const response = popOrDefault(script.selectMaybeSingle, selectMaybeSingleIndex);
        selectMaybeSingleIndex += 1;
        return response;
      },
      then(onfulfilled, onrejected) {
        const payload = context.payload || {};
        calls.update.push({
          table: context.table,
          payload,
          filters: [...context.filters],
        });
        const response = popOrDefault(script.updateResult, updateIndex);
        updateIndex += 1;
        return Promise.resolve(response).then(onfulfilled, onrejected);
      },
    };

    return chain;
  };

  const supabase = {
    rpc: vi.fn((fn: string, payload: Record<string, unknown>) => ({
      single: vi.fn(async () => {
        calls.rpc.push({ fn, payload });
        const response = popOrDefault(script.rpcSingle, rpcIndex);
        rpcIndex += 1;
        return response;
      }),
    })),
    from: vi.fn((table: string) => ({
      select: (columns: string) => buildFilterChain({ table, columns, filters: [] }),
      insert: (payload: Record<string, unknown>) => ({
        select: (columns: string) => ({
          single: async () => {
            calls.insertSingle.push({ table, columns, payload });
            const response = popOrDefault(script.insertSingle, insertSingleIndex);
            insertSingleIndex += 1;
            return response;
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => buildFilterChain({ table, payload, filters: [] }),
    })),
  };

  return { supabase, calls };
}

describe('resolveLeadCanonicalId', () => {
  it('returns rpc_org when org-scoped RPC succeeds', async () => {
    const { supabase, calls } = createSupabaseMock({
      rpcSingle: [{ data: { id: 101 }, error: null }],
      selectMaybeSingle: [{ data: { id: 101, org_id: 'org-1' }, error: null }],
    });

    const result = await resolveLeadCanonicalId({
      supabase,
      userId: 'user-1',
      orgId: 'org-1',
      instanceName: 'instance-a',
      phoneE164: '5511999999999',
      telefone: '5511999999999',
      name: 'Lead A',
      pushName: 'Lead A',
      source: 'whatsapp',
      channel: 'whatsapp',
    });

    expect(result).toEqual({ leadId: 101, method: 'rpc_org', error: null });
    expect(calls.rpc).toHaveLength(1);
    expect(calls.rpc[0].payload).toMatchObject({
      p_user_id: 'user-1',
      p_org_id: 'org-1',
      p_phone_e164: '5511999999999',
    });
    expect(calls.insertSingle).toHaveLength(0);
  });

  it('falls back to rpc_legacy when org RPC hits schema drift', async () => {
    const { supabase, calls } = createSupabaseMock({
      rpcSingle: [
        { data: null, error: { code: 'PGRST202', message: 'Schema cache miss' } },
        { data: { id: 202 }, error: null },
      ],
      selectMaybeSingle: [{ data: { id: 202, org_id: 'org-1' }, error: null }],
    });

    const result = await resolveLeadCanonicalId({
      supabase,
      userId: 'user-1',
      orgId: 'org-1',
      instanceName: 'instance-a',
      phoneE164: '5511888888888',
      telefone: '5511888888888',
      name: 'Lead B',
      pushName: 'Lead B',
      source: 'whatsapp',
      channel: 'whatsapp',
    });

    expect(result).toEqual({ leadId: 202, method: 'rpc_legacy', error: null });
    expect(calls.rpc).toHaveLength(2);
    expect(calls.rpc[0].payload).toMatchObject({ p_org_id: 'org-1' });
    expect(Object.prototype.hasOwnProperty.call(calls.rpc[1].payload, 'p_org_id')).toBe(false);
    expect(calls.insertSingle).toHaveLength(0);
  });

  it('falls back to lookup_existing when RPC fails without schema drift', async () => {
    const { supabase, calls } = createSupabaseMock({
      rpcSingle: [{ data: null, error: { code: 'XX000', message: 'generic rpc failure' } }],
      selectMaybeSingle: [{ data: { id: 303 }, error: null }],
    });

    const result = await resolveLeadCanonicalId({
      supabase,
      userId: 'user-1',
      orgId: 'org-1',
      instanceName: 'instance-a',
      phoneE164: '5511777777777',
      telefone: '5511777777777',
      name: 'Lead C',
      pushName: 'Lead C',
      source: 'whatsapp',
      channel: 'whatsapp',
    });

    expect(result).toEqual({ leadId: 303, method: 'lookup_existing', error: null });
    expect(calls.rpc).toHaveLength(1);
    expect(calls.selectMaybeSingle).toHaveLength(1);
    expect(calls.insertSingle).toHaveLength(0);
  });

  it('falls back to direct_insert when RPC and lookup fail', async () => {
    const { supabase, calls } = createSupabaseMock({
      rpcSingle: [{ data: null, error: { code: 'XX000', message: 'rpc failed' } }],
      selectMaybeSingle: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      insertSingle: [{ data: { id: 404 }, error: null }],
    });

    const result = await resolveLeadCanonicalId({
      supabase,
      userId: 'user-2',
      orgId: 'org-2',
      instanceName: 'attribution-webhook',
      phoneE164: '5511666666666',
      telefone: '5511666666666',
      name: 'Lead D',
      pushName: 'Lead D',
      source: 'webhook',
      channel: 'other',
    });

    expect(result).toEqual({ leadId: 404, method: 'direct_insert', error: null });
    expect(calls.rpc).toHaveLength(1);
    expect(calls.selectMaybeSingle).toHaveLength(2);
    expect(calls.insertSingle).toHaveLength(1);
    expect(calls.insertSingle[0].payload).toMatchObject({
      org_id: 'org-2',
      user_id: 'user-2',
      phone_e164: '5511666666666',
      telefone: '5511666666666',
      canal: 'other',
      source: 'webhook',
      instance_name: 'attribution-webhook',
    });
  });
});
