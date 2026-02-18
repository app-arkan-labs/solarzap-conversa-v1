import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { evolutionApi } from '@/lib/evolutionApi';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface UserWhatsAppInstance {
  id: string;
  user_id: string;
  instance_name: string;
  display_name: string;
  status: 'disconnected' | 'connecting' | 'connected';
  phone_number?: string | null;
  qr_code?: string | null;
  is_active: boolean;
  connected_at?: string | null;
  created_at: string;
  updated_at: string;
  color?: string; // Added for instance differentiation
  ai_enabled?: boolean | null;
}

export function useUserWhatsAppInstances() {
  const { user, orgId } = useAuth();
  const [instances, setInstances] = useState<UserWhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch instances from Supabase filtered by user_id
  const fetchInstances = useCallback(async () => {
    if (!user || !orgId) {
      setInstances([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // IMMEDIATE RENDER: Show what we have in DB
      const dbInstances = data as UserWhatsAppInstance[];
      setInstances(dbInstances);
      setLoading(false); // Stop spinner immediately

      // BACKGROUND SYNC: Check status with Evolution API
      // We don't await this for the UI to unblock
      (async () => {
        if (!dbInstances.length) return;

        const updatedInstances = await Promise.all(
          dbInstances.map(async (instance) => {
            try {
              // If already disconnected in DB, maybe we don't need to check? 
              // keeping it simple for now, check everyone
              const response = await evolutionApi.getInstanceStatus(instance.instance_name);

              if (!response.success || !response.data) {
                return instance;
              }

              const state = response.data.instance.state;
              const newStatus: 'disconnected' | 'connecting' | 'connected' = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';

              // Only update if changed
              if (newStatus !== instance.status) {

                if (newStatus === 'connected') {
                  // ADDING TOKEN for security
                  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect?token=arkan_secure_2026`;

                  // Fire and forget webhook update
                  evolutionApi.setWebhook(instance.instance_name, webhookUrl, [
                    'MESSAGES_UPSERT',
                    'MESSAGES_UPDATE',
                    'CONNECTION_UPDATE',
                    'QRCODE_UPDATED'
                  ]).catch(e => console.error("Webhook update failed in bg", e));
                }

                // Update in database if status changed (background)
                await supabase
                  .from('whatsapp_instances')
                  .update({ status: newStatus, updated_at: new Date().toISOString() })
                  .eq('id', instance.id);

                return { ...instance, status: newStatus };
              }
              return instance;
            } catch (e) {
              console.error(`Error syncing status for ${instance.instance_name}`, e);
              return instance;
            }
          })
        ) as unknown as UserWhatsAppInstance[];

        // Update state with fresh statuses if any changed
        setInstances(prev => {
          // Merge logic: keep current instances but update status from background sync
          // This prevents overwriting if user added/removed instances in the meantime
          return prev.map(prevInst => {
            const refreshed = updatedInstances.find(u => u.id === prevInst.id);
            return refreshed ? refreshed : prevInst;
          });
        });

      })(); // Immediate invocation of async IIFE

    } catch (error) {
      console.error('Error fetching instances:', error);
      toast.error('Erro ao carregar instÃ¢ncias');
      setLoading(false);
    }
  }, [user, orgId]);

  // Initial fetch
  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Real-time subscription
  useEffect(() => {
    if (!user || !orgId) return;

    const channel = supabase
      .channel(`whatsapp-instances-${orgId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `org_id=eq.${orgId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newInstance = payload.new as UserWhatsAppInstance;
            if (newInstance.is_active) {
              setInstances(prev => [newInstance, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as UserWhatsAppInstance;
            if (updated.is_active) {
              setInstances(prev => prev.map(inst =>
                inst.id === updated.id ? updated : inst
              ));
            } else {
              setInstances(prev => prev.filter(inst => inst.id !== updated.id));
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setInstances(prev => prev.filter(inst => inst.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, orgId]);

  // Create new instance
  const createInstance = useCallback(async (displayName: string): Promise<{ qrCode?: string; instance?: UserWhatsAppInstance } | null> => {
    if (!user) {
      toast.error('Voce precisa estar logado');
      return null;
    }
    if (!orgId) {
      toast.error('Organizacao nao vinculada ao usuario');
      return null;
    }

    if (!displayName.trim()) {
      toast.error('Digite um nome para a instÃ¢ncia');
      return null;
    }

    try {
      setCreating(true);
      const sanitizedName = displayName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const timestamp = Date.now().toString().slice(-6); // last 6 digits for brevity but uniqueness
      const instanceName = `solarzap-${sanitizedName}-${timestamp}`;

      // Use evolutionApi
      // Note: evolutionApi.createInstance returns EvolutionApiResponse<CreateInstanceResponse>
      const response = await evolutionApi.createInstance(instanceName);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Falha ao criar instÃ¢ncia na API');
      }

      // Configure Webhook Immediately
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect?token=arkan_secure_2026`;
      await evolutionApi.setWebhook(instanceName, webhookUrl, [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED'
      ]);


      const qrCode = response.data.qrcode?.base64 || undefined;

      // 4. Save to Supabase with user_id
      const { data: newInstance, error } = await supabase
        .from('whatsapp_instances')
        .insert({
          org_id: orgId,
          user_id: user.id,
          instance_name: instanceName,
          display_name: displayName.trim(),
          status: 'connecting',
          qr_code: qrCode,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setInstances(prev => [newInstance, ...prev]);
      toast.success('InstÃ¢ncia criada! Escaneie o QR Code.');
      return { qrCode, instance: newInstance };
    } catch (error) {
      console.error('Error creating instance:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar instÃ¢ncia');
      return null;
    } finally {
      setCreating(false);
    }
  }, [user, orgId]);

  // Refresh QR Code
  const refreshQrCode = useCallback(async (instanceName: string): Promise<string | null> => {
    try {
      setActionLoading(instanceName);
      // evolutionApi.connectInstance gets the QR code
      const response = await evolutionApi.connectInstance(instanceName);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Falha ao obter QR Code');
      }

      const qrCode = response.data.base64 || response.data.code;

      if (qrCode) {
        // Update in database
        await supabase
          .from('whatsapp_instances')
          .update({ qr_code: qrCode, status: 'connecting', updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName);
      }

      return qrCode || null;
    } catch (error) {
      console.error('Error refreshing QR:', error);
      toast.error('Erro ao atualizar QR Code');
      return null;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Check instance status
  const checkStatus = useCallback(async (instanceName: string): Promise<void> => {
    try {
      setActionLoading(instanceName);
      const response = await evolutionApi.getInstanceStatus(instanceName);

      // Handle explicitly if instance doesn't exist (404 logic might be inside success:false)
      if (!response.success) {
        // If error suggests instance not found, mark as disconnected
        if (response.error?.includes('404') || response.error?.includes('not found') || response.error?.includes('instance does not exist')) {
          console.log(`Instance ${instanceName} not found on server. Marking as disconnected.`);
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'disconnected', updated_at: new Date().toISOString() })
            .eq('instance_name', instanceName);

          setInstances(prev => prev.map(inst =>
            inst.instance_name === instanceName ? { ...inst, status: 'disconnected' } : inst
          ));
          return;
        }
        throw new Error(response.error || 'Falha ao verificar status');
      }

      if (!response.data) {
        throw new Error('Dados invÃ¡lidos recebidos da API');
      }

      const state = response.data.instance.state;
      const newStatus = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';

      // Update in database
      await supabase
        .from('whatsapp_instances')
        .update({
          status: newStatus,
          qr_code: newStatus === 'connected' ? null : undefined,
          connected_at: newStatus === 'connected' ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('instance_name', instanceName);

      // Force Webhook Registration if Connected
      if (newStatus === 'connected') {
        const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect`;
        console.log(`Ensuring Webhook is set for ${instanceName}: ${webhookUrl}`);

        await evolutionApi.setWebhook(instanceName, webhookUrl, [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED'
        ]);
      }

      setInstances(prev => prev.map(inst =>
        inst.instance_name === instanceName ? { ...inst, status: newStatus } : inst
      ));

      // toast.success(`Status da instÃ¢ncia: ${newStatus === 'connected' ? 'Conectado' : 'Desconectado'}`);
    } catch (error) {
      console.error('Error checking status:', error);
      // If network error, we don't change status to avoid flapping
      // But if it's a 404 from the request method itself (if library throws)
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
        await supabase
          .from('whatsapp_instances')
          .update({ status: 'disconnected', updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName);

        setInstances(prev => prev.map(inst =>
          inst.instance_name === instanceName ? { ...inst, status: 'disconnected' } : inst
        ));
      }
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Delete instance
  const deleteInstance = useCallback(async (instance: UserWhatsAppInstance, force: boolean = false): Promise<boolean> => {
    try {
      setActionLoading(instance.id);

      // 1. Logout and Delete from Evolution API
      try {
        await evolutionApi.logoutInstance(instance.instance_name);
        await evolutionApi.deleteInstance(instance.instance_name);
      } catch (e) {
        console.error('Error deleting from API', e);
        if (!force) {
          toast.error('Falha ao deletar na API. Tente novamente ou use "ForÃ§ar ExclusÃ£o" se disponÃ­vel.');
          throw e; // Stop execution to prevent desync
        }
        toast.warning('Erro na API ignorado (ForÃ§ar ExclusÃ£o).');
      }

      // 2. Soft delete from Supabase (set is_active = false)
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', instance.id);

      if (error) throw error;

      setInstances(prev => prev.filter(i => i.id !== instance.id));
      toast.success('InstÃ¢ncia removida com sucesso');
      return true;
    } catch (error) {
      console.error('Error deleting instance:', error);
      // toast already handled for specific cases
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Disconnect instance (logout but keep)
  const disconnectInstance = useCallback(async (instanceName: string): Promise<boolean> => {
    try {
      setActionLoading(instanceName);

      await evolutionApi.logoutInstance(instanceName);

      await supabase
        .from('whatsapp_instances')
        .update({
          status: 'disconnected',
          phone_number: null,
          connected_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('instance_name', instanceName);

      toast.success('InstÃ¢ncia desconectada');

      setInstances(prev => prev.map(inst =>
        inst.instance_name === instanceName
          ? { ...inst, status: 'disconnected', phone_number: null as any, connected_at: null }
          : inst
      ));

      return true;
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Erro ao desconectar');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Rename instance
  const renameInstance = useCallback(async (instanceId: string, newName: string): Promise<boolean> => {
    try {
      setActionLoading(instanceId);
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ display_name: newName, updated_at: new Date().toISOString() })
        .eq('id', instanceId);

      if (error) throw error;

      setInstances(prev => prev.map(inst =>
        inst.id === instanceId ? { ...inst, display_name: newName } : inst
      ));
      toast.success('InstÃ¢ncia renomeada');
      return true;
    } catch (error) {
      console.error('Error renaming:', error);
      toast.error('Erro ao renomear');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  // Simulate connection (for dev/demo)
  const simulateConnection = useCallback(async (instanceId: string): Promise<boolean> => {
    // Mock implementation for dev mode
    try {
      setActionLoading(instanceId);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ status: 'connected', connected_at: new Date().toISOString() })
        .eq('id', instanceId);

      if (error) throw error;

      setInstances(prev => prev.map(i =>
        i.id === instanceId ? { ...i, status: 'connected' as const } : i
      ));
      return true;
    } catch (e) {
      return false;
    } finally {
      setActionLoading(null);
    }
  }, []);

  const connectedCount = instances.filter(i => i.status === 'connected').length;
  const hasConnectedInstance = connectedCount > 0;
  const isDevMode = false; // Hardcoded for now
  const isFallbackMode = false;

  return {
    instances,
    loading,
    creating,
    actionLoading,
    fetchInstances,
    createInstance,
    refreshQrCode,
    checkStatus,
    deleteInstance,
    disconnectInstance,
    renameInstance,
    simulateConnection,
    connectedCount,
    hasConnectedInstance,
    isDevMode,
    isFallbackMode,
    updateColor: async (instanceId: string, color: string) => {
      try {
        const { error } = await supabase
          .from('whatsapp_instances')
          .update({ color, updated_at: new Date().toISOString() })
          .eq('id', instanceId);

        if (error) throw error;

        setInstances(prev => prev.map(inst =>
          inst.id === instanceId ? { ...inst, color } : inst
        ));
        return true;
      } catch (error) {
        console.error('Error updating color:', error);
        toast.error('Erro ao atualizar cor');
        return false;
      }
    },
    setInstanceAiEnabled: async (instanceName: string, enabled: boolean): Promise<boolean> => {
      try {
        // Find ID for local update (optimistic)
        const targetInstance = instances.find(i => i.instance_name === instanceName);
        const targetId = targetInstance?.id;

        if (targetId) setActionLoading(targetId);

        const { data, error } = await supabase
          .from('whatsapp_instances')
          .update({ ai_enabled: enabled, updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName)
          .select();

        if (error) throw error;
        if (!data || data.length === 0) {
          console.error('Update returned 0 rows. RLS mismatch?');
          throw new Error('Falha ao atualizar: PermissÃ£o negada ou instÃ¢ncia nÃ£o encontrada.');
        }

        // Optimistic update
        setInstances(prev => prev.map(inst =>
          inst.instance_name === instanceName ? { ...inst, ai_enabled: enabled } : inst
        ));

        // Invalidate/Refetch to be 100% sure
        await fetchInstances();

        toast.success(enabled ? 'IA ativada' : 'IA desativada');
        return true;
      } catch (error) {
        console.error('Error updating AI enabled:', error);
        toast.error('Erro ao atualizar IA da instÃ¢ncia');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    toggleAllInstances: async (enabled: boolean): Promise<boolean> => {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('whatsapp_instances')
          .update({ ai_enabled: enabled, updated_at: new Date().toISOString() })
          .eq('user_id', user?.id) // Safe update for all user instances
          .neq('status', 'disconnected'); // Optional: only update active/connected ones? User said "Reset ALL status", usually implies all valid ones.

        if (error) throw error;

        // Optimistic update all
        setInstances(prev => prev.map(inst => ({ ...inst, ai_enabled: enabled })));

        await fetchInstances();
        toast.success(enabled ? 'Todas as instÃ¢ncias ativadas' : 'Todas as instÃ¢ncias desativadas');
        return true;
      } catch (error) {
        console.error('Error toggling all instances:', error);
        toast.error('Erro ao atualizar instÃ¢ncias');
        return false;
      } finally {
        setLoading(false);
      }
    },
    activateAiForAllLeads: async (instanceName: string): Promise<number | null> => {
      try {
        setActionLoading(instanceName);

        // 1. Ensure instance itself is enabled
        await supabase
          .from('whatsapp_instances')
          .update({ ai_enabled: true, updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName);

        // Optimistic update instance
        setInstances(prev => prev.map(inst =>
          inst.instance_name === instanceName ? { ...inst, ai_enabled: true } : inst
        ));

        // 2. Batch update leads
        const { data, error } = await supabase
          .from('leads')
          .update({
            ai_enabled: true,
            ai_paused_reason: null,
            ai_paused_at: null
          })
          .eq('instance_name', instanceName)
          .select('id');

        if (error) throw error;

        return data?.length || 0;
      } catch (error) {
        console.error('Error activating all leads:', error);
        throw error;
      } finally {
        setActionLoading(null);
      }
    }
  };
}


