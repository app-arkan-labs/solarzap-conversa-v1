import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import solarzapLogo from '@/assets/solarzap-logo.png';

const BUCKET = 'proposal-assets';
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const LOGO_SYNC_EVENT = 'proposal-logo-sync';

type LogoSyncDetail = {
  orgId: string;
  logoUrl: string | null;
};

// ── Module-level cache for default SolarZap logo data URL ──
let _defaultLogoDataUrl: string | null = null;
function loadDefaultLogoDataUrl(): void {
  if (_defaultLogoDataUrl) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      _defaultLogoDataUrl = c.toDataURL('image/png');
    } catch { /* keep null */ }
  };
  img.src = solarzapLogo;
}
// Start loading immediately at module init
loadDefaultLogoDataUrl();

function dispatchLogoSync(detail: LogoSyncDetail) {
  try {
    window.dispatchEvent(new CustomEvent<LogoSyncDetail>(LOGO_SYNC_EVENT, { detail }));
  } catch {
    // non-blocking
  }
}

/**
 * Manages the per-org logo used in generated proposal PDFs.
 *
 * - Persists the logo URL in `company_profile.proposal_logo_url`
 * - Uploads the file to Supabase Storage (`proposal-assets` bucket)
 * - Converts the remote URL into a base-64 data-URL so jsPDF can embed it.
 * - Pre-loads the default SolarZap logo as data URL (jsPDF needs data URLs, not regular URLs)
 */
export function useProposalLogo() {
  const { orgId, user } = useAuth();
  const { toast } = useToast();

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Avoid stale closures on orgId
  const orgIdRef = useRef(orgId);
  orgIdRef.current = orgId;

  // ── Convert a remote URL to a data-URL for jsPDF ──
  // Uses Image+Canvas (works for same-origin assets AND CORS-enabled storage)
  // Falls back to fetch+FileReader if Image approach fails
  const toDataUrl = useCallback(async (url: string): Promise<string | null> => {
    if (!url) return null;
    if (url.startsWith('data:')) return url; // Already a data URL

    // Approach 1: Image + Canvas (handles CORS via crossOrigin attribute)
    try {
      const dataUrl = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            c.getContext('2d')!.drawImage(img, 0, 0);
            resolve(c.toDataURL('image/png'));
          } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        // Timeout after 8s
        setTimeout(() => resolve(null), 8000);
        img.src = url;
      });
      if (dataUrl) return dataUrl;
    } catch { /* fall through */ }

    // Approach 2: fetch + FileReader (backup)
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
    if (!orgId) {
      setLogoUrl(null);
      setLogoDataUrl(null);
      setInitialized(true);
      return;
    }
    let cancelled = false;
    setInitialized(false);
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
        } else {
          setLogoDataUrl(null);
        }
      } catch { /* keep null */ }
      finally {
        if (!cancelled) setInitialized(true);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, toDataUrl]);

  useEffect(() => {
    if (!orgId) return;

    const onLogoSync = (event: Event) => {
      const custom = event as CustomEvent<LogoSyncDetail>;
      const detail = custom.detail;
      if (!detail || detail.orgId !== orgId) return;

      const nextLogo = detail.logoUrl || null;
      setLogoUrl(nextLogo);
      setInitialized(true);

      if (!nextLogo) {
        setLogoDataUrl(null);
        return;
      }

      toDataUrl(nextLogo).then((dataUrl) => {
        setLogoDataUrl(dataUrl);
      }).catch(() => {
        // non-blocking
      });
    };

    window.addEventListener(LOGO_SYNC_EVENT, onLogoSync as EventListener);
    return () => {
      window.removeEventListener(LOGO_SYNC_EVENT, onLogoSync as EventListener);
    };
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
      dispatchLogoSync({ orgId: orgIdRef.current, logoUrl: publicUrl });

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
      dispatchLogoSync({ orgId: orgIdRef.current, logoUrl: null });
      toast({ title: 'Logo removida', description: 'As próximas propostas usarão a logo padrão SolarZap.' });
    } catch (err) {
      console.error('Failed to remove proposal logo:', err);
      toast({ title: 'Erro ao remover logo', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Always return a valid data-URL: custom org logo → default SolarZap logo
  const effectiveLogoDataUrl = logoDataUrl || _defaultLogoDataUrl;

  return { logoUrl, logoDataUrl: effectiveLogoDataUrl, uploadLogo, removeLogo, loading, initialized };
}
