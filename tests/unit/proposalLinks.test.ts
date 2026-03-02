import { describe, expect, it } from 'vitest';
import { resolveProposalLinks } from '@/utils/proposalLinks';

describe('resolveProposalLinks', () => {
  it('prefers explicit pdf/share links when provided', () => {
    const links = resolveProposalLinks({
      pdfUrl: 'https://cdn.example.com/a.pdf',
      shareUrl: 'https://app.example.com/share/abc',
      premiumPayload: {
        pdf_url: 'https://cdn.example.com/fallback.pdf',
        share_url: 'https://app.example.com/share/fallback',
      },
      supabaseUrl: 'https://project.supabase.co',
    });

    expect(links.pdfUrl).toBe('https://cdn.example.com/a.pdf');
    expect(links.shareUrl).toBe('https://app.example.com/share/abc');
  });

  it('resolves links from legacy premium payload fields', () => {
    const links = resolveProposalLinks({
      premiumPayload: {
        public_pdf_url: 'https://cdn.example.com/public.pdf',
        share_url: 'https://app.example.com/share/legacy',
      },
      supabaseUrl: 'https://project.supabase.co',
    });

    expect(links.pdfUrl).toBe('https://cdn.example.com/public.pdf');
    expect(links.shareUrl).toBe('https://app.example.com/share/legacy');
  });

  it('resolves share link from nested share.url payload', () => {
    const links = resolveProposalLinks({
      premiumPayload: {
        share: {
          url: 'https://project.supabase.co/functions/v1/proposal-share?token=abc',
        },
      },
      supabaseUrl: 'https://project.supabase.co',
    });

    expect(links.shareUrl).toBe('https://project.supabase.co/functions/v1/proposal-share?token=abc');
  });

  it('builds public storage PDF link when only storage metadata exists', () => {
    const links = resolveProposalLinks({
      premiumPayload: {
        storage: {
          bucket: 'proposal-assets',
          path: 'org/file.pdf',
        },
      },
      supabaseUrl: 'https://project.supabase.co/',
    });

    expect(links.pdfUrl).toBe('https://project.supabase.co/storage/v1/object/public/proposal-assets/org/file.pdf');
    expect(links.shareUrl).toBeNull();
  });
});

