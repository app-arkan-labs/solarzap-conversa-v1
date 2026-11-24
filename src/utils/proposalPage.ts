import { supabase } from '@/lib/supabase';
import { scopeProposalVersionByIdQuery } from '@/lib/multiOrgLeadScoping';

export const PROPOSAL_PAGE_PATH = '/proposta/abrir';

export function isProposalPageUrl(url: string | null) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) && parsed.pathname === PROPOSAL_PAGE_PATH;
  } catch {
    return false;
  }
}

export function downloadProposalHTML(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function publishProposalPage(versionId: string, orgId: string) {
  const { data, error } = await supabase.functions.invoke('proposal-share-link', {
    body: { proposalVersionId: versionId },
  });
  if (error || !data?.token) throw new Error('Não foi possível emitir o link da proposta.');
  const url = new URL(PROPOSAL_PAGE_PATH, window.location.origin);
  url.hash = new URLSearchParams({ token: data.token }).toString();
  const scope = { proposalVersionId: versionId, orgId };
  const { data: version, error: readError } = await scopeProposalVersionByIdQuery(
    supabase.from('proposal_versions').select('premium_payload') as any, scope,
  ).single();
  if (readError || !version) throw new Error('Não foi possível localizar a versão da proposta.');
  const { error: updateError } = await scopeProposalVersionByIdQuery(
    supabase.from('proposal_versions').update({
      premium_payload: { ...version.premium_payload, share: { url: url.href, exp: data.exp } },
    }) as any, scope,
  ).select('id').single();
  if (updateError) throw new Error('Não foi possível salvar o link da proposta.');
  return url.href;
}
