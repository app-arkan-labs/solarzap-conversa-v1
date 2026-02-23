import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const BUCKET = 'proposal-assets';
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Manages the per-org logo used in generated proposal PDFs.
 *
 * - Persists the logo URL in `company_profile.proposal_logo_url`
 * - Uploads the file to Supabase Storage (`proposal-assets` bucket)
 * - Converts the remote URL into a base-64 data-URL so jsPDF can embed it.
 */
export function useProposalLogo() {
  const { orgId, user } = useAuth();
  const { toast } = useToast();

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Avoid stale closures on orgId
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;

  // ── Convert a remote URL to a data-URL for jsPDF ──
  const toDataUrl = useCallback(async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }, []);

  // ── Fetch saved logo from company_profile ──
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('company_profile')
          .select('proposal_logo_url')
          .eq('org_id', orgId)
          .maybeSingle();
        if (cancelled || error) return;
        const url = data?.proposal_logo_url || null;
        setLogoUrl(url);
        if (url) {
          const dataUrl = await toDataUrl(url);
          if (!cancelled) setLogoDataUrl(dataUrl);
        }
      } catch { /* keep null */ }
    })();
    return () => { cancelled = true; };
  }, [orgId, toDataUrl]);

  // ── Upload logo file ──
  const uploadLogo = useCallback(async (file: File) => {
    if (!orgIdRef.current || !user) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: 'Formato inválido', description: 'Use PNG, JPG, WebP ou SVG.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast({ title: 'Arquivo muito grande', description: 'A logo deve ter no máximo 2 MB.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${orgIdRef.current}/logo.${ext}`;

      // Upload (upsert = overwrite)
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      // Public URL
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      // Bust cache by appending timestamp
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Persist in company_profile
      const { error: dbErr } = await supabase
        .from('company_profile')
        .upsert(
          { org_id: orgIdRef.current, proposal_logo_url: publicUrl, updated_at: new Date().toISOString() },
          { onConflict: 'org_id' },
        );
      if (dbErr) throw dbErr;

      setLogoUrl(publicUrl);

      // Convert to data-URL
      const dataUrl = await toDataUrl(publicUrl);
      setLogoDataUrl(dataUrl);

      toast({ title: 'Logo salva', description: 'A logo será usada nas próximas propostas.' });
    } catch (err) {
      console.error('Failed to upload proposal logo:', err);
      toast({ title: 'Erro ao enviar logo', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast, toDataUrl]);

  // ── Remove logo ──
  const removeLogo = useCallback(async () => {
    if (!orgIdRef.current) return;
    setLoading(true);
    try {
      // Remove all logo files for this org
      const { data: files } = await supabase.storage
        .from(BUCKET)
        .list(orgIdRef.current, { limit: 10 });
      if (files && files.length > 0) {
        const paths = files
          .filter((f) => f.name.startsWith('logo'))
          .map((f) => `${orgIdRef.current}/${f.name}`);
        if (paths.length > 0) {
          await supabase.storage.from(BUCKET).remove(paths);
        }
      }

      // Clear DB
      await supabase
        .from('company_profile')
        .upsert(
          { org_id: orgIdRef.current, proposal_logo_url: null, updated_at: new Date().toISOString() },
          { onConflict: 'org_id' },
        );

      setLogoUrl(null);
      setLogoDataUrl(null);
      toast({ title: 'Logo removida', description: 'As próximas propostas usarão a logo padrão SolarZap.' });
    } catch (err) {
      console.error('Failed to remove proposal logo:', err);
      toast({ title: 'Erro ao remover logo', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return { logoUrl, logoDataUrl, uploadLogo, removeLogo, loading };
}
