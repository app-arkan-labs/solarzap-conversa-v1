export interface ProposalLinkResolutionInput {
  premiumPayload?: Record<string, unknown> | null;
  pdfUrl?: string | null;
  shareUrl?: string | null;
  supabaseUrl?: string | null;
}

export interface ResolvedProposalLinks {
  pdfUrl: string | null;
  shareUrl: string | null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    const normalized = asNonEmptyString(value);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeBaseUrl(url: string | null | undefined): string | null {
  const value = asNonEmptyString(url);
  if (!value) return null;
  return value.replace(/\/+$/, '');
}

function buildPublicStorageUrl(
  supabaseUrl: string | null | undefined,
  payload: Record<string, unknown> | null | undefined,
): string | null {
  const base = normalizeBaseUrl(supabaseUrl);
  const storage = asRecord(payload?.storage);
  const bucket = asNonEmptyString(storage?.bucket);
  const path = asNonEmptyString(storage?.path);
  if (!base || !bucket || !path) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

function resolvePdfFromPayload(
  payload: Record<string, unknown> | null | undefined,
  supabaseUrl: string | null | undefined,
): string | null {
  const directPdf = firstString([
    payload?.public_pdf_url,
    payload?.client_pdf_url,
    payload?.pdf_url,
    payload?.publicPdfUrl,
    payload?.clientPdfUrl,
    payload?.pdfUrl,
  ]);
  if (directPdf) return directPdf;
  return buildPublicStorageUrl(supabaseUrl, payload);
}

function resolveShareFromPayload(payload: Record<string, unknown> | null | undefined): string | null {
  const shareObj = asRecord(payload?.share);
  return firstString([
    payload?.share_url,
    payload?.shareUrl,
    shareObj?.url,
  ]);
}

export function resolveProposalLinks(input: ProposalLinkResolutionInput): ResolvedProposalLinks {
  const payload = input.premiumPayload || null;
  const directPdf = asNonEmptyString(input.pdfUrl);
  const directShare = asNonEmptyString(input.shareUrl);

  return {
    pdfUrl: directPdf || resolvePdfFromPayload(payload, input.supabaseUrl || null),
    shareUrl: directShare || resolveShareFromPayload(payload),
  };
}

