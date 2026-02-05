import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface Integration {
  id: string;
  user_id: string;
  provider: 'google' | 'meta_messenger' | 'meta_instagram';
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string;
  account_email?: string;
  account_name?: string;
  account_picture?: string;
  page_id?: string;
  page_name?: string;
  services: Record<string, boolean>;
  connected_at: string;
  updated_at: string;
}

export interface WhatsAppInstance {
  id: string;
  user_id: string;
  instance_name: string;
  instance_token?: string;
  status: 'disconnected' | 'connecting' | 'connected';
  phone_number?: string;
  qr_code?: string;
  connected_at?: string;
  created_at: string;
  updated_at: string;
}

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [whatsappInstance, setWhatsappInstance] = useState<WhatsAppInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Get auth headers - always require real auth
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}` };
  };

  // Fetch all integrations
  const fetchIntegrations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIntegrations([]);
        setWhatsappInstance(null);
        setLoading(false);
        return;
      }

      const [integrationsResult, whatsappResult] = await Promise.all([
        supabase
          .from('user_integrations')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('whatsapp_instances')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (integrationsResult.error) {
        console.error('Error fetching integrations:', integrationsResult.error);
      } else {
        setIntegrations(integrationsResult.data || []);
      }

      if (whatsappResult.error) {
        console.error('Error fetching WhatsApp instance:', whatsappResult.error);
      } else {
        setWhatsappInstance(whatsappResult.data);
      }
    } catch (error) {
      console.error('Error in fetchIntegrations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Subscribe to realtime changes for WhatsApp instances
  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-instances-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances'
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setWhatsappInstance(payload.new as WhatsAppInstance);
          } else if (payload.eventType === 'DELETE') {
            setWhatsappInstance(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Check for OAuth callback params in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const integrationStatus = urlParams.get('integration_status');
    const provider = urlParams.get('provider');
    const message = urlParams.get('message');

    if (integrationStatus) {
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

      if (integrationStatus === 'success') {
        toast.success(`${getProviderName(provider || '')} conectado com sucesso!`);
        fetchIntegrations();
      } else {
        toast.error(`Erro ao conectar: ${message}`);
      }
    }
  }, [fetchIntegrations]);

  const getProviderName = (provider: string): string => {
    switch (provider) {
      case 'google': return 'Google';
      case 'meta_messenger': return 'Messenger';
      case 'meta_instagram': return 'Instagram';
      default: return provider;
    }
  };

  // Connect to Google
  const connectGoogle = useCallback(async () => {
    try {
      setConnecting('google');
      const headers = await getAuthHeaders();
      if (!headers) {
        toast.error('Você precisa estar logado para conectar integrações');
        return;
      }

      const { data, error } = await supabase.functions.invoke('google-oauth', {
        headers
      });

      if (error) throw error;
      if (data?.authUrl) {
        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        window.open(
          data.authUrl,
          'google-oauth',
          `width=${width},height=${height},left=${left},top=${top},popup=yes`
        );
      }
    } catch (error) {
      console.error('Error connecting Google:', error);
      toast.error('Erro ao iniciar conexão com Google');
    } finally {
      setConnecting(null);
    }
  }, []);

  // Connect to Meta (Messenger or Instagram)
  const connectMeta = useCallback(async (platform: 'messenger' | 'instagram') => {
    try {
      setConnecting(platform === 'messenger' ? 'meta_messenger' : 'meta_instagram');
      const headers = await getAuthHeaders();
      if (!headers) {
        toast.error('Você precisa estar logado para conectar integrações');
        return;
      }

      const { data, error } = await supabase.functions.invoke('meta-oauth', {
        body: { platform },
        headers
      });

      if (error) throw error;
      if (data?.authUrl) {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        window.open(
          data.authUrl,
          'meta-oauth',
          `width=${width},height=${height},left=${left},top=${top},popup=yes`
        );
      }
    } catch (error) {
      console.error('Error connecting Meta:', error);
      toast.error(`Erro ao iniciar conexão com ${platform === 'messenger' ? 'Messenger' : 'Instagram'}`);
    } finally {
      setConnecting(null);
    }
  }, []);

  // Connect WhatsApp
  const connectWhatsApp = useCallback(async () => {
    try {
      setConnecting('whatsapp');
      const headers = await getAuthHeaders();
      if (!headers) {
        toast.error('Você precisa estar logado para conectar integrações');
        return;
      }

      const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'create' },
        headers
      });

      if (error) throw error;
      
      if (!data.configured) {
        toast.info('WhatsApp ainda não configurado. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY.');
        return { configured: false };
      }

      if (data.qrCode) {
        return { configured: true, qrCode: data.qrCode, instanceName: data.instanceName };
      }
    } catch (error) {
      console.error('Error connecting WhatsApp:', error);
      toast.error('Erro ao iniciar conexão com WhatsApp');
    } finally {
      setConnecting(null);
    }
    return null;
  }, []);

  // Get WhatsApp status
  const getWhatsAppStatus = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      if (!headers) return null;

      const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'status' },
        headers
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting WhatsApp status:', error);
      return null;
    }
  }, []);

  // Disconnect an integration
  const disconnect = useCallback(async (provider: string) => {
    try {
      setConnecting(provider);
      const headers = await getAuthHeaders();
      if (!headers) {
        toast.error('Você precisa estar logado');
        return;
      }

      if (provider === 'whatsapp') {
        const { error } = await supabase.functions.invoke('whatsapp-connect', {
          body: { action: 'disconnect' },
          headers
        });
        if (error) throw error;
        setWhatsappInstance(null);
      } else {
        const { error } = await supabase.functions.invoke('integration-disconnect', {
          body: { provider },
          headers
        });
        if (error) throw error;
        setIntegrations(prev => prev.filter(i => i.provider !== provider));
      }

      toast.success('Integração desconectada com sucesso');
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Erro ao desconectar integração');
    } finally {
      setConnecting(null);
    }
  }, []);

  // Helper to check if a provider is connected
  const isConnected = useCallback((provider: string): boolean => {
    if (provider === 'whatsapp') {
      return whatsappInstance?.status === 'connected';
    }
    return integrations.some(i => i.provider === provider);
  }, [integrations, whatsappInstance]);

  // Get integration by provider
  const getIntegration = useCallback((provider: string): Integration | undefined => {
    return integrations.find(i => i.provider === provider);
  }, [integrations]);

  return {
    integrations,
    whatsappInstance,
    loading,
    connecting,
    fetchIntegrations,
    connectGoogle,
    connectMeta,
    connectWhatsApp,
    getWhatsAppStatus,
    disconnect,
    isConnected,
    getIntegration,
  };
}
