import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { evolutionApi } from '@/lib/evolutionApi';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface UserWhatsAppInstance {
  org_id?: string | null;
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

type InstanceConnectionStatus = UserWhatsAppInstance['status'];

function extractQrCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;

  if (typeof source.base64 === 'string' && source.base64.trim().length > 0) {
    return source.base64;
  }

  if (typeof source.code === 'string' && source.code.trim().length > 0) {
    return source.code;
  }

  const qrcode = source.qrcode;
  if (qrcode && typeof qrcode === 'object') {
    const nested = qrcode as Record<string, unknown>;
    if (typeof nested.base64 === 'string' && nested.base64.trim().length > 0) {
      return nested.base64;
    }
    if (typeof nested.code === 'string' && nested.code.trim().length > 0) {
      return nested.code;
    }
  }

  return null;
}

function extractConnectionState(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;

  if (typeof source.state === 'string' && source.state.trim().length > 0) {
    return source.state;
  }

  const instance = source.instance;
  if (instance && typeof instance === 'object') {
    const state = (instance as Record<string, unknown>).state;
    if (typeof state === 'string' && state.trim().length > 0) {
      return state;
    }
  }

  return null;
}

function toInstanceStatus(state: string | null | undefined): InstanceConnectionStatus {
  const normalized = String(state || '').trim().toLowerCase();
  if (normalized === 'open' || normalized === 'connected') return 'connected';
  if (normalized === 'connecting') return 'connecting';
  return 'disconnected';
}

export function useUserWhatsAppInstances() {
  const { user, orgId, role } = useAuth();
  const [instances, setInstances] = useState<UserWhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const isOrgManager = role === 'owner' || role === 'admin';

  // Fetch instances from Supabase in active organization scope.
  const fetchInstances = useCallback(async () => {
    if (!user || !orgId) {
      setInstances([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      let query = supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!isOrgManager) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

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

              const newStatus = toInstanceStatus(extractConnectionState(response.data));

              // Only update if changed
              if (newStatus !== instance.status) {

                if (newStatus === 'connected') {
                  // ADDING TOKEN for security
                  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect`;

                  // Fire and forget webhook update
                  evolutionApi.setWebhook(instance.instance_name, webhookUrl, [
                    'MESSAGES_UPSERT',
                    'MESSAGES_UPDATE',
                    'CONNECTION_UPDATE',
                    'QRCODE_UPDATED'
                  ], {
                    'X-Arkan-Webhook-Token': 'server-managed'
                  }).catch(e => console.error("Webhook update failed in bg", e));
                }

                // Update in database if status changed (background)
                let statusQuery = supabase
                  .from('whatsapp_instances')
                  .update({ status: newStatus, updated_at: new Date().toISOString() })
                  .eq('id', instance.id)
                  .eq('org_id', orgId);

                if (!isOrgManager) {
                  statusQuery = statusQuery.eq('user_id', user.id);
                }

                await statusQuery;

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
      toast.error('Erro ao carregar instâncias');
      setLoading(false);
    }
  }, [isOrgManager, orgId, user]);

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
            if (!isOrgManager && newInstance.user_id !== user.id) return;
            if (newInstance.is_active) {
              setInstances(prev => [newInstance, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as UserWhatsAppInstance;
            if (!isOrgManager && updated.user_id !== user.id) return;
            if (updated.is_active) {
              setInstances(prev => prev.map(inst =>
                inst.id === updated.id ? updated : inst
              ));
            } else {
              setInstances(prev => prev.filter(inst => inst.id !== updated.id));
            }
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: string; user_id?: string };
            if (!isOrgManager && deleted.user_id && deleted.user_id !== user.id) return;
            const deletedId = deleted.id;
            setInstances(prev => prev.filter(inst => inst.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOrgManager, orgId, user]);

  // Create new instance
  const createInstance = useCallback(async (displayName?: string): Promise<{ qrCode?: string; instance?: UserWhatsAppInstance } | null> => {
    if (!user) {
      toast.error('Voce precisa estar logado');
      return null;
    }
    if (!orgId) {
      toast.error('Organizacao nao vinculada ao usuario');
      return null;
    }

    try {
      setCreating(true);
      const normalizedDisplayName = displayName?.trim() || 'WhatsApp';
      const sanitizedName = normalizedDisplayName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const timestamp = Date.now().toString().slice(-6); // last 6 digits for brevity but uniqueness
      const instanceName = `solarzap-${sanitizedName}-${timestamp}`;

      // Use evolutionApi
      // Note: evolutionApi.createInstance returns EvolutionApiResponse<CreateInstanceResponse>
      const response = await evolutionApi.createInstance(instanceName);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Falha ao criar instância na API');
      }

      // Configure Webhook Immediately
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect`;
      await evolutionApi.setWebhook(instanceName, webhookUrl, [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED'
      ], {
        'X-Arkan-Webhook-Token': 'server-managed'
      });


      let qrCode = extractQrCode(response.data);
      if (!qrCode) {
        const connectResponse = await evolutionApi.connectInstance(instanceName);
        if (connectResponse.success && connectResponse.data) {
          qrCode = extractQrCode(connectResponse.data);
        }
      }

      // 4. Save to Supabase with user_id
      const { data: newInstance, error } = await supabase
        .from('whatsapp_instances')
        .insert({
          org_id: orgId,
          user_id: user.id,
          instance_name: instanceName,
          display_name: normalizedDisplayName,
          status: 'connecting',
          qr_code: qrCode,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setInstances(prev => [newInstance, ...prev]);
      toast.success('Instância criada! Escaneie o QR Code.');
      return { qrCode: qrCode || undefined, instance: newInstance };
    } catch (error) {
      console.error('Error creating instance:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar instância');
      return null;
    } finally {
      setCreating(false);
    }
  }, [user, orgId]);

  // Refresh QR Code
  const refreshQrCode = useCallback(async (instanceName: string): Promise<string | null> => {
    try {
      if (!orgId) {
        toast.error('Organizacao nao vinculada ao usuario');
        return null;
      }
      if (!isOrgManager && !user?.id) {
        toast.error('Voce precisa estar logado');
        return null;
      }

      setActionLoading(instanceName);
      // evolutionApi.connectInstance gets the QR code
      const response = await evolutionApi.connectInstance(instanceName);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Falha ao obter QR Code');
      }

      const qrCode = extractQrCode(response.data);

      if (qrCode) {
        // Update in database
        let refreshQuery = supabase
          .from('whatsapp_instances')
          .update({ qr_code: qrCode, status: 'connecting', updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName)
          .eq('org_id', orgId);

        if (!isOrgManager) {
          refreshQuery = refreshQuery.eq('user_id', user?.id);
        }

        await refreshQuery;
      }

      return qrCode;
    } catch (error) {
      console.error('Error refreshing QR:', error);
      toast.error('Erro ao atualizar QR Code');
      return null;
    } finally {
      setActionLoading(null);
    }
  }, [isOrgManager, orgId, user]);

  // Check instance status
  const checkStatus = useCallback(async (instanceName: string): Promise<void> => {
    try {
      if (!orgId) return;
      if (!isOrgManager && !user?.id) return;

      setActionLoading(instanceName);
      const response = await evolutionApi.getInstanceStatus(instanceName);

      // Handle explicitly if instance doesn't exist (404 logic might be inside success:false)
      if (!response.success) {
        // If error suggests instance not found, mark as disconnected
        if (response.error?.includes('404') || response.error?.includes('not found') || response.error?.includes('instance does not exist')) {
          import.meta.env.DEV && console.log(`Instance ${instanceName} not found on server. Marking as disconnected.`);
          let notFoundQuery = supabase
            .from('whatsapp_instances')
            .update({ status: 'disconnected', updated_at: new Date().toISOString() })
            .eq('instance_name', instanceName)
            .eq('org_id', orgId);

          if (!isOrgManager) {
            notFoundQuery = notFoundQuery.eq('user_id', user?.id);
          }

          await notFoundQuery;

          setInstances(prev => prev.map(inst =>
            inst.instance_name === instanceName ? { ...inst, status: 'disconnected' } : inst
          ));
          return;
        }
        throw new Error(response.error || 'Falha ao verificar status');
      }

      if (!response.data) {
        throw new Error('Dados inválidos recebidos da API');
      }

      const newStatus = toInstanceStatus(extractConnectionState(response.data));

      // Update in database
      let statusUpdateQuery = supabase
        .from('whatsapp_instances')
        .update({
          status: newStatus,
          qr_code: newStatus === 'connected' ? null : undefined,
          connected_at: newStatus === 'connected' ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('instance_name', instanceName)
        .eq('org_id', orgId);

      if (!isOrgManager) {
        statusUpdateQuery = statusUpdateQuery.eq('user_id', user?.id);
      }

      await statusUpdateQuery;

      // Force Webhook Registration if Connected
      if (newStatus === 'connected') {
        const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect`;
        import.meta.env.DEV && console.log(`Ensuring Webhook is set for ${instanceName}: ${webhookUrl}`);

        await evolutionApi.setWebhook(instanceName, webhookUrl, [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED'
        ], {
          'X-Arkan-Webhook-Token': 'server-managed'
        });
      }

      setInstances(prev => prev.map(inst =>
        inst.instance_name === instanceName ? { ...inst, status: newStatus } : inst
      ));

      // toast.success(`Status da instância: ${newStatus === 'connected' ? 'Conectado' : 'Desconectado'}`);
    } catch (error) {
      console.error('Error checking status:', error);
      // If network error, we don't change status to avoid flapping
      // But if it's a 404 from the request method itself (if library throws)
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
        let disconnectQuery = supabase
          .from('whatsapp_instances')
          .update({ status: 'disconnected', updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName)
          .eq('org_id', orgId);

        if (!isOrgManager) {
          disconnectQuery = disconnectQuery.eq('user_id', user?.id);
        }

        await disconnectQuery;

        setInstances(prev => prev.map(inst =>
          inst.instance_name === instanceName ? { ...inst, status: 'disconnected' } : inst
        ));
      }
    } finally {
      setActionLoading(null);
    }
  }, [isOrgManager, orgId, user]);

  // Delete instance
  const deleteInstance = useCallback(async (instance: UserWhatsAppInstance, force: boolean = false): Promise<boolean> => {
    try {
      if (!orgId) {
        toast.error('Organizacao nao vinculada ao usuario');
        return false;
      }
      if (!isOrgManager && !user?.id) {
        toast.error('Voce precisa estar logado');
        return false;
      }
      setActionLoading(instance.id);

      // 1. Logout and Delete from Evolution API
      try {
        await evolutionApi.logoutInstance(instance.instance_name);
        await evolutionApi.deleteInstance(instance.instance_name);
      } catch (e) {
        console.error('Error deleting from API', e);
        if (!force) {
          toast.error('Falha ao deletar na API. Tente novamente ou use "Forçar Exclusão" se disponível.');
          throw e; // Stop execution to prevent desync
        }
        toast.warning('Erro na API ignorado (Forçar Exclusão).');
      }

      // 2. Soft delete from Supabase (set is_active = false)
      let deleteQuery = supabase
        .from('whatsapp_instances')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', instance.id)
        .eq('org_id', orgId);

      if (!isOrgManager) {
        deleteQuery = deleteQuery.eq('user_id', user?.id);
      }

      const { error } = await deleteQuery;

      if (error) throw error;

      setInstances(prev => prev.filter(i => i.id !== instance.id));
      toast.success('Instância removida com sucesso');
      return true;
    } catch (error) {
      console.error('Error deleting instance:', error);
      // toast already handled for specific cases
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [isOrgManager, orgId, user]);

  // Disconnect instance (logout but keep)
  const disconnectInstance = useCallback(async (instanceName: string): Promise<boolean> => {
    try {
      if (!orgId) {
        toast.error('Organizacao nao vinculada ao usuario');
        return false;
      }
      if (!isOrgManager && !user?.id) {
        toast.error('Voce precisa estar logado');
        return false;
      }

      setActionLoading(instanceName);

      await evolutionApi.logoutInstance(instanceName);

      let disconnectQuery = supabase
        .from('whatsapp_instances')
        .update({
          status: 'disconnected',
          phone_number: null,
          connected_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('instance_name', instanceName)
        .eq('org_id', orgId);

      if (!isOrgManager) {
        disconnectQuery = disconnectQuery.eq('user_id', user?.id);
      }

      await disconnectQuery;

      toast.success('Instância desconectada');

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
  }, [isOrgManager, orgId, user]);

  // Rename instance
  const renameInstance = useCallback(async (instanceId: string, newName: string): Promise<boolean> => {
    try {
      if (!orgId) {
        toast.error('Organizacao nao vinculada ao usuario');
        return false;
      }
      if (!isOrgManager && !user?.id) {
        toast.error('Voce precisa estar logado');
        return false;
      }
      setActionLoading(instanceId);
      let renameQuery = supabase
        .from('whatsapp_instances')
        .update({ display_name: newName, updated_at: new Date().toISOString() })
        .eq('id', instanceId)
        .eq('org_id', orgId);

      if (!isOrgManager) {
        renameQuery = renameQuery.eq('user_id', user?.id);
      }

      const { error } = await renameQuery;

      if (error) throw error;

      setInstances(prev => prev.map(inst =>
        inst.id === instanceId ? { ...inst, display_name: newName } : inst
      ));
      toast.success('Instância renomeada');
      return true;
    } catch (error) {
      console.error('Error renaming:', error);
      toast.error('Erro ao renomear');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [isOrgManager, orgId, user]);

  // Simulate connection (for dev/demo)
  const simulateConnection = useCallback(async (instanceId: string): Promise<boolean> => {
    // Mock implementation for dev mode
    try {
      if (!orgId) return false;
      if (!isOrgManager && !user?.id) return false;
      setActionLoading(instanceId);
      await new Promise(resolve => setTimeout(resolve, 2000));

      let simulateQuery = supabase
        .from('whatsapp_instances')
        .update({ status: 'connected', connected_at: new Date().toISOString() })
        .eq('id', instanceId)
        .eq('org_id', orgId);

      if (!isOrgManager) {
        simulateQuery = simulateQuery.eq('user_id', user?.id);
      }

      const { error } = await simulateQuery;

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
  }, [isOrgManager, orgId, user]);

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
        if (!orgId) {
          toast.error('Organizacao nao vinculada ao usuario');
          return false;
        }
        if (!isOrgManager && !user?.id) {
          toast.error('Voce precisa estar logado');
          return false;
        }

        let updateColorQuery = supabase
          .from('whatsapp_instances')
          .update({ color, updated_at: new Date().toISOString() })
          .eq('id', instanceId)
          .eq('org_id', orgId);

        if (!isOrgManager) {
          updateColorQuery = updateColorQuery.eq('user_id', user?.id);
        }

        const { error } = await updateColorQuery;

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
        if (!orgId) {
          toast.error('Organizacao nao vinculada ao usuario');
          return false;
        }

        // Find ID for local update (optimistic)
        const targetInstance = instances.find(i => i.instance_name === instanceName);
        const targetId = targetInstance?.id;

        if (targetId) setActionLoading(targetId);

        let setAiQuery = supabase
          .from('whatsapp_instances')
          .update({ ai_enabled: enabled, updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName)
          .eq('org_id', orgId)
          .select();

        if (!isOrgManager) {
          setAiQuery = setAiQuery.eq('user_id', user?.id);
        }

        const { data, error } = await setAiQuery;

        if (error) throw error;
        if (!data || data.length === 0) {
          console.error('Update returned 0 rows. RLS mismatch?');
          throw new Error('Falha ao atualizar: Permissão negada ou instância não encontrada.');
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
        toast.error('Erro ao atualizar IA da instância');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    toggleAllInstances: async (enabled: boolean): Promise<boolean> => {
      try {
        if (!orgId) {
          toast.error('Organizacao nao vinculada ao usuario');
          return false;
        }

        setLoading(true);
        let toggleAllQuery = supabase
          .from('whatsapp_instances')
          .update({ ai_enabled: enabled, updated_at: new Date().toISOString() })
          .eq('org_id', orgId)
          .neq('status', 'disconnected');

        if (!isOrgManager) {
          toggleAllQuery = toggleAllQuery.eq('user_id', user?.id);
        }

        const { error } = await toggleAllQuery;

        if (error) throw error;

        // Optimistic update all
        setInstances(prev => prev.map(inst => ({ ...inst, ai_enabled: enabled })));

        await fetchInstances();
        toast.success(enabled ? 'Todas as instâncias ativadas' : 'Todas as instâncias desativadas');
        return true;
      } catch (error) {
        console.error('Error toggling all instances:', error);
        toast.error('Erro ao atualizar instâncias');
        return false;
      } finally {
        setLoading(false);
      }
    },
    activateAiForAllLeads: async (instanceName: string): Promise<number | null> => {
      try {
        if (!orgId) {
          toast.error('Organizacao nao vinculada ao usuario');
          return null;
        }

        setActionLoading(instanceName);

        // 1. Ensure instance itself is enabled
        let enableInstanceAiQuery = supabase
          .from('whatsapp_instances')
          .update({ ai_enabled: true, updated_at: new Date().toISOString() })
          .eq('instance_name', instanceName)
          .eq('org_id', orgId);

        if (!isOrgManager) {
          enableInstanceAiQuery = enableInstanceAiQuery.eq('user_id', user?.id);
        }

        await enableInstanceAiQuery;

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
          .eq('org_id', orgId)
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



