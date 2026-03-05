import { describe, expect, it } from 'vitest';
import { buildUpsertLeadCanonicalPayload as buildEdgePayload } from '../../supabase/functions/_shared/leadCanonical.ts';
import {
  buildUpsertLeadCanonicalPayload as buildFrontendPayload,
  doesLeadBelongToOrg,
  scopeLeadProposalLookupQuery,
  scopeProposalByIdsQuery,
  scopeProposalVersionByIdQuery,
  scopeProposalVersionByIdsQuery,
  scopeWhatsappInstanceQuery,
} from '../../src/lib/multiOrgLeadScoping';

class QueryRecorder {
  operations: Array<{ method: 'eq' | 'in'; column: string; value: unknown }> = [];

  eq(column: string, value: unknown) {
    this.operations.push({ method: 'eq', column, value });
    return this;
  }

  in(column: string, value: unknown) {
    this.operations.push({ method: 'in', column, value });
    return this;
  }
}

describe('multi-org lead scoping helpers', () => {
  it('builds the frontend RPC payload with p_org_id for broadcasts', () => {
    expect(
      buildFrontendPayload({
        userId: 'user-1',
        orgId: 'org-1',
        instanceName: 'instance-a',
        phoneE164: '5511999999999',
        telefone: '5511999999999',
        name: 'Lead Teste',
        pushName: 'Lead Teste',
        source: 'cold_list',
      }),
    ).toEqual({
      p_user_id: 'user-1',
      p_org_id: 'org-1',
      p_instance_name: 'instance-a',
      p_phone_e164: '5511999999999',
      p_telefone: '5511999999999',
      p_name: 'Lead Teste',
      p_push_name: 'Lead Teste',
      p_source: 'cold_list',
    });
  });

  it('builds the edge RPC payload with p_org_id for webhooks', () => {
    expect(
      buildEdgePayload({
        userId: 'user-2',
        orgId: 'org-2',
        instanceName: 'attribution-webhook',
        phoneE164: '5511888888888',
        telefone: '5511888888888',
        name: 'Lead Attribution',
        pushName: 'Lead Attribution',
        source: 'webhook',
      }),
    ).toMatchObject({
      p_user_id: 'user-2',
      p_org_id: 'org-2',
      p_instance_name: 'attribution-webhook',
      p_phone_e164: '5511888888888',
      p_telefone: '5511888888888',
      p_source: 'webhook',
    });
  });

  it('rejects RPC leads that do not belong to the active org', () => {
    expect(doesLeadBelongToOrg({ id: 10, org_id: 'org-a' }, 'org-a')).toBe(true);
    expect(doesLeadBelongToOrg({ id: 10, org_id: 'org-b' }, 'org-a')).toBe(false);
    expect(doesLeadBelongToOrg({ id: 10, org_id: null }, 'org-a')).toBe(false);
    expect(doesLeadBelongToOrg(null, 'org-a')).toBe(false);
  });

  it('scopes whatsapp instance lookups by user, org, status and optional flags', () => {
    const query = new QueryRecorder();

    scopeWhatsappInstanceQuery(query, {
      userId: 'user-1',
      orgId: 'org-1',
      instanceName: 'instance-z',
      requireActive: true,
    });

    expect(query.operations).toEqual([
      { method: 'eq', column: 'user_id', value: 'user-1' },
      { method: 'eq', column: 'org_id', value: 'org-1' },
      { method: 'eq', column: 'status', value: 'connected' },
      { method: 'eq', column: 'instance_name', value: 'instance-z' },
      { method: 'eq', column: 'is_active', value: true },
    ]);
  });

  it('scopes proposal reuse lookup by lead_id + org_id', () => {
    const query = new QueryRecorder();

    scopeLeadProposalLookupQuery(query, { leadId: 321, orgId: 'org-9' });

    expect(query.operations).toEqual([
      { method: 'eq', column: 'lead_id', value: 321 },
      { method: 'eq', column: 'org_id', value: 'org-9' },
    ]);
  });

  it('scopes direct proposta and proposal_version reads by org_id', () => {
    const proposalQuery = new QueryRecorder();
    const versionByIdQuery = new QueryRecorder();
    const versionByIdsQuery = new QueryRecorder();

    scopeProposalByIdsQuery(proposalQuery, { proposalIds: [11, 12], orgId: 'org-3' });
    scopeProposalVersionByIdQuery(versionByIdQuery, { proposalVersionId: 'ver-1', orgId: 'org-3' });
    scopeProposalVersionByIdsQuery(versionByIdsQuery, { proposalVersionIds: ['ver-1', 'ver-2'], orgId: 'org-3' });

    expect(proposalQuery.operations).toEqual([
      { method: 'eq', column: 'org_id', value: 'org-3' },
      { method: 'in', column: 'id', value: [11, 12] },
    ]);
    expect(versionByIdQuery.operations).toEqual([
      { method: 'eq', column: 'id', value: 'ver-1' },
      { method: 'eq', column: 'org_id', value: 'org-3' },
    ]);
    expect(versionByIdsQuery.operations).toEqual([
      { method: 'eq', column: 'org_id', value: 'org-3' },
      { method: 'in', column: 'id', value: ['ver-1', 'ver-2'] },
    ]);
  });
});
