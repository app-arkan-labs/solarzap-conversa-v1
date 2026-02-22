import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface SellerPermissions {
  org_id: string;
  tab_ia_agentes: boolean;
  tab_automacoes: boolean;
  tab_integracoes: boolean;
  tab_banco_ia: boolean;
  tab_minha_conta: boolean;
  can_delete_leads: boolean;
  can_delete_proposals: boolean;
  can_toggle_ai: boolean;
}

const DEFAULTS: Omit<SellerPermissions, 'org_id'> = {
  tab_ia_agentes: true,
  tab_automacoes: true,
  tab_integracoes: true,
  tab_banco_ia: true,
  tab_minha_conta: true,
  can_delete_leads: true,
  can_delete_proposals: true,
  can_toggle_ai: true,
};

/**
 * Hook to manage seller permissions for the current org.
 *
 * - For owner/admin: returns full permissions always (they are unrestricted).
 * - For user/consultant: returns the org-level seller restrictions.
 *
 * The `permissions` object tells you what the CURRENT user can do.
 * The `sellerPermissions` object tells you what SELLERS are allowed to do (for the admin UI).
 */
export function useSellerPermissions() {
  const { orgId, role } = useAuth();
  const [sellerPermissions, setSellerPermissions] = useState<SellerPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isAdmin = role === 'owner' || role === 'admin';
  const isSeller = role === 'user' || role === 'consultant';

  const fetchPermissions = useCallback(async () => {
    if (!orgId) {
      setSellerPermissions(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('org_seller_permissions')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching seller permissions:', error);
        setSellerPermissions(null);
      } else if (data) {
        setSellerPermissions(data as SellerPermissions);
      } else {
        // No row yet — use defaults
        setSellerPermissions({ org_id: orgId, ...DEFAULTS });
      }
    } catch (err) {
      console.error('Unexpected error in useSellerPermissions:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchPermissions();
  }, [fetchPermissions]);

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`org_seller_permissions_${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'org_seller_permissions',
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          void fetchPermissions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchPermissions]);

  const updateSellerPermissions = useCallback(
    async (patch: Partial<Omit<SellerPermissions, 'org_id'>>) => {
      if (!orgId) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from('org_seller_permissions')
          .upsert(
            { org_id: orgId, ...DEFAULTS, ...sellerPermissions, ...patch },
            { onConflict: 'org_id' },
          );

        if (error) throw error;

        setSellerPermissions((prev) =>
          prev ? { ...prev, ...patch } : { org_id: orgId, ...DEFAULTS, ...patch },
        );
      } finally {
        setSaving(false);
      }
    },
    [orgId, sellerPermissions],
  );

  // Effective permissions for the CURRENT user
  // Owner/Admin always have full access
  const permissions = {
    tab_ia_agentes: isAdmin || (sellerPermissions?.tab_ia_agentes ?? true),
    tab_automacoes: isAdmin || (sellerPermissions?.tab_automacoes ?? true),
    tab_integracoes: isAdmin || (sellerPermissions?.tab_integracoes ?? true),
    tab_banco_ia: isAdmin || (sellerPermissions?.tab_banco_ia ?? true),
    tab_minha_conta: isAdmin || (sellerPermissions?.tab_minha_conta ?? true),
    can_delete_leads: isAdmin || (sellerPermissions?.can_delete_leads ?? true),
    can_delete_proposals: isAdmin || (sellerPermissions?.can_delete_proposals ?? true),
    can_toggle_ai: isAdmin || (sellerPermissions?.can_toggle_ai ?? true),
  };

  return {
    /** What the current user can do (resolved based on role) */
    permissions,
    /** Raw seller permission config for the org (for admin UI) */
    sellerPermissions,
    /** Whether the hook is still loading */
    loading,
    /** Whether a save is in progress */
    saving,
    /** Update seller permissions (admin only) */
    updateSellerPermissions,
    /** Whether the current user is admin-level */
    isAdmin,
    /** Whether the current user is a seller */
    isSeller,
  };
}
