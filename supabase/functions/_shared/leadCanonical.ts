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
