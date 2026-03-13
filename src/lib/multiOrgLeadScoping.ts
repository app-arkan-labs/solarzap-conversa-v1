type EqChainable = {
  eq(column: string, value: unknown): any;
};

type InChainable = {
  in(column: string, values: readonly unknown[]): any;
};

export type UpsertLeadCanonicalPayloadInput = {
  userId: string;
  orgId?: string | null;
  instanceName: string;
  phoneE164: string;
  telefone: string;
  name?: string | null;
  pushName?: string | null;
  source?: string | null;
};

export function buildUpsertLeadCanonicalPayload(input: UpsertLeadCanonicalPayloadInput) {
  return {
    p_user_id: input.userId,
    p_org_id: input.orgId ?? null,
    p_instance_name: input.instanceName,
    p_phone_e164: input.phoneE164,
    p_telefone: input.telefone,
    p_name: input.name ?? null,
    p_push_name: input.pushName ?? null,
    p_source: input.source ?? 'whatsapp',
  };
}

export function doesLeadBelongToOrg(
  lead: { id?: unknown; org_id?: unknown } | null | undefined,
  orgId: string,
): boolean {
  return Number(lead?.id || 0) > 0 && String(lead?.org_id || '') === orgId;
}

export function scopeUserOrgQuery(
  query: EqChainable,
  params: { userId: string; orgId: string },
): any {
  return query.eq('user_id', params.userId).eq('org_id', params.orgId);
}

export function scopeWhatsappInstanceQuery(
  query: EqChainable,
  params: {
    userId: string;
    orgId: string;
    instanceName?: string;
    requireActive?: boolean;
  },
): any {
  let scoped = scopeUserOrgQuery(query, params).eq('status', 'connected');
  if (params.instanceName) {
    scoped = scoped.eq('instance_name', params.instanceName);
  }
  if (params.requireActive) {
    scoped = scoped.eq('is_active', true);
  }
  return scoped;
}

export function scopeLeadProposalLookupQuery(
  query: EqChainable,
  params: { leadId: number; orgId: string },
): any {
  return query.eq('lead_id', params.leadId).eq('org_id', params.orgId);
}

export function scopeProposalByIdQuery(
  query: EqChainable,
  params: { proposalId: number | string; orgId: string },
): any {
  return query.eq('id', params.proposalId).eq('org_id', params.orgId);
}

export function scopeProposalByIdsQuery(
  query: EqChainable & InChainable,
  params: { proposalIds: readonly (number | string)[]; orgId: string },
): any {
  return query.eq('org_id', params.orgId).in('id', params.proposalIds);
}

export function scopeProposalVersionByIdQuery(
  query: EqChainable,
  params: { proposalVersionId: string; orgId: string },
): any {
  return query.eq('id', params.proposalVersionId).eq('org_id', params.orgId);
}

export function scopeProposalVersionByIdsQuery(
  query: EqChainable & InChainable,
  params: { proposalVersionIds: readonly string[]; orgId: string },
): any {
  return query.eq('org_id', params.orgId).in('id', params.proposalVersionIds);
}

export function scopeProposalVersionByProposalIdQuery(
  query: EqChainable,
  params: { proposalId: number | string; orgId: string },
): any {
  return query.eq('proposta_id', params.proposalId).eq('org_id', params.orgId);
}
