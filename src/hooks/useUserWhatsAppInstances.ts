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
}

export function useUserWhatsAppInstances() {
  const { user } = useAuth();
  const [instances, setInstances] = useState<UserWhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch instances from Supabase filtered by user_id
  const fetchInstances = useCallback(async () => {
    if (!user) {
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

      // Sync status with Evolution API for each instance
      const updatedInstances = await Promise.all(
        (data || []).map(async (instance) => {
          try {
            const response = await evolutionApi.getInstanceStatus(instance.instance_name);

            if (!response.success || !response.data) {
              return instance;
            }

            const state = response.data.instance.state;
            const newStatus = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';

            if (newStatus === 'connected') {
              // ADDING TOKEN for security (matches WEBHOOK_SECRET in Supabase)
              const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect?token=arkan_secure_2026`;

              // Always ensure webhook is set on load, even if status didn't change (Self-healing)
              await evolutionApi.setWebhook(instance.instance_name, webhookUrl, [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'CONNECTION_UPDATE',
                'QRCODE_UPDATED'
              ]);
            }

            if (newStatus !== instance.status) {
              // Update in database if status changed
              await supabase
                .from('whatsapp_instances')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', instance.id);

              return { ...instance, status: newStatus };
            }
            return instance;
          } catch {
            // If can't reach Evolution API, keep current status
            return instance;
          }
        })
      );

      setInstances(updatedInstances as UserWhatsAppInstance[]);
    } catch (error) {
      console.error('Error fetching instances:', error);
      toast.error('Erro ao carregar instâncias');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial fetch
  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`whatsapp-instances-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `user_id=eq.${user.id}`
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
  }, [user]);

  // Create new instance
  const createInstance = useCallback(async (displayName: string): Promise<{ qrCode?: string; instance?: UserWhatsAppInstance } | null> => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return null;
    }

    if (!displayName.trim()) {
      toast.error('Digite um nome para a instância');
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
        throw new Error(response.error || 'Falha ao criar instância na API');
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
      toast.success('Instância criada! Escaneie o QR Code.');
      return { qrCode, instance: newInstance };
    } catch (error) {
      console.error('Error creating instance:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar instância');
      return null;
    } finally {
      setCreating(false);
    }
  }, [user]);

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
        throw new Error('Dados inválidos recebidos da API');
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

      // toast.success(`Status da instância: ${newStatus === 'connected' ? 'Conectado' : 'Desconectado'}`);
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
          toast.error('Falha ao deletar na API. Tente novamente ou use "Forçar Exclusão" se disponível.');
          throw e; // Stop execution to prevent desync
        }
        toast.warning('Erro na API ignorado (Forçar Exclusão).');
      }

      // 2. Soft delete from Supabase (set is_active = false)
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', instance.id);

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
      toast.success('Instância renomeada');
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
    }
  };
}
