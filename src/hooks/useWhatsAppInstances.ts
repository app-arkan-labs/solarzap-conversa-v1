import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { USE_MOCK_DATA, EDGE_FUNCTION_FALLBACK } from '@/config/devMode';

export interface WhatsAppInstance {
  id: string;
  user_id: string;
  instance_name: string;
  display_name: string;
  instance_token?: string;
  status: 'disconnected' | 'connecting' | 'connected';
  phone_number?: string;
  qr_code?: string;
  is_active: boolean;
  connected_at?: string;
  created_at: string;
  updated_at: string;
}

// Mock data for USE_MOCK_DATA testing
// Generate a simple SVG QR code as base64 for testing (no external dependencies)
const createMockQrCode = () => {
  const size = 200;
  const cellSize = 8;
  const cells = 21;
  
  const seed = Date.now();
  const pattern: boolean[][] = [];
  for (let i = 0; i < cells; i++) {
    pattern[i] = [];
    for (let j = 0; j < cells; j++) {
      const isFinderPattern = 
        (i < 7 && j < 7) || 
        (i < 7 && j >= cells - 7) || 
        (i >= cells - 7 && j < 7);
      
      if (isFinderPattern) {
        const inOuter = i === 0 || i === 6 || j === 0 || j === 6 ||
                       (i < 7 && (j === cells - 7 || j === cells - 1)) ||
                       (i < 7 && j >= cells - 7 && (i === 0 || i === 6)) ||
                       (i >= cells - 7 && j < 7 && (j === 0 || j === 6)) ||
                       (i >= cells - 7 && j < 7 && (i === cells - 7 || i === cells - 1));
        const inCenter = (i >= 2 && i <= 4 && j >= 2 && j <= 4) ||
                        (i >= 2 && i <= 4 && j >= cells - 5 && j <= cells - 3) ||
                        (i >= cells - 5 && i <= cells - 3 && j >= 2 && j <= 4);
        pattern[i][j] = inOuter || inCenter;
      } else {
        pattern[i][j] = ((seed * (i + 1) * (j + 1)) % 7) < 3;
      }
    }
  }
  
  let rects = '';
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      if (pattern[i][j]) {
        const x = j * cellSize + 10;
        const y = i * cellSize + 10;
        rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#000"/>`;
      }
    }
  }
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#fff"/>
    ${rects}
  </svg>`;
  
  const base64 = btoa(svg);
  return `data:image/svg+xml;base64,${base64}`;
};

const generateMockId = () => `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export function useWhatsAppInstances() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const fallbackAttempted = useRef(false);

  // Load instances from localStorage in mock mode
  const loadMockInstances = useCallback(() => {
    const saved = localStorage.getItem('mock_whatsapp_instances');
    if (saved) {
      try {
        return JSON.parse(saved) as WhatsAppInstance[];
      } catch {
        return [];
      }
    }
    return [];
  }, []);

  // Save instances to localStorage in mock mode
  const saveMockInstances = useCallback((newInstances: WhatsAppInstance[]) => {
    localStorage.setItem('mock_whatsapp_instances', JSON.stringify(newInstances));
    setInstances(newInstances);
  }, []);

  // Get auth headers - always require real auth
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Você precisa estar logado');
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}` };
  };

  // Fetch all WhatsApp instances
  const fetchInstances = useCallback(async () => {
    try {
      // Use mock data if USE_MOCK_DATA is true OR if fallback is active
      if (USE_MOCK_DATA || useFallback) {
        const mockInstances = loadMockInstances();
        setInstances(mockInstances);
        setLoading(false);
        return;
      }

      // Always require real auth
      const headers = await getAuthHeaders();
      if (headers === null) {
        setInstances([]);
        setLoading(false);
        return;
      }

      console.log('[useWhatsAppInstances] Fetching instances...');
      
      const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'list' },
        headers
      });

      console.log('[useWhatsAppInstances] Response:', { data, error });

      if (error) {
        // Check if it's a connection/deployment error
        const isConnectionError = error.message?.includes('Failed to send') || 
                                   error.message?.includes('FetchError') ||
                                   error.message?.includes('NetworkError');
        
        if (isConnectionError) {
          console.warn('[useWhatsAppInstances] Edge Function not deployed or unreachable.');
          
          // Enable fallback mode if configured
          if (EDGE_FUNCTION_FALLBACK && !fallbackAttempted.current) {
            fallbackAttempted.current = true;
            setUseFallback(true);
            toast.info(
              'Edge Function indisponível. Usando modo demonstração local.', 
              { duration: 5000 }
            );
            const mockInstances = loadMockInstances();
            setInstances(mockInstances);
            setLoading(false);
            return;
          } else {
            toast.error(
              'Edge Function não está ativa. Verifique o deploy no Supabase Dashboard > Edge Functions.',
              { duration: 8000 }
            );
          }
        }
        throw error;
      }
      
      if (!data?.configured) {
        console.log('[useWhatsAppInstances] Evolution API not configured');
        setInstances([]);
      } else {
        setInstances(data.instances || []);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp instances:', error);
      // If API fails, don't crash - just show empty
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, [loadMockInstances, useFallback]);

  // Initial fetch
  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (USE_MOCK_DATA) return;

    const channel = supabase
      .channel('whatsapp-instances-multi')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newInstance = payload.new as WhatsAppInstance;
            if (newInstance.is_active) {
              setInstances(prev => [newInstance, ...prev]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedInstance = payload.new as WhatsAppInstance;
            if (updatedInstance.is_active) {
              setInstances(prev => prev.map(inst => 
                inst.id === updatedInstance.id ? updatedInstance : inst
              ));
            } else {
              setInstances(prev => prev.filter(inst => inst.id !== updatedInstance.id));
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
  }, []);

  // Create new instance
  const createInstance = useCallback(async (displayName?: string): Promise<{ qrCode?: string; instance?: WhatsAppInstance } | null> => {
    try {
      setCreating(true);

      // Use mock data if USE_MOCK_DATA is true OR if fallback is active
      if (USE_MOCK_DATA || useFallback) {
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const newInstance: WhatsAppInstance = {
          id: generateMockId(),
          user_id: 'mock-user',
          instance_name: `instance-${Date.now()}`,
          display_name: displayName || `WhatsApp ${instances.length + 1}`,
          status: 'connecting',
          is_active: true,
          qr_code: createMockQrCode(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const updatedInstances = [newInstance, ...instances];
        saveMockInstances(updatedInstances);
        
        toast.success(useFallback 
          ? 'Instância criada em modo demonstração! (Edge Function indisponível)' 
          : 'Instância criada! Escaneie o QR Code. (Modo de teste)'
        );
        return { qrCode: newInstance.qr_code, instance: newInstance };
      }

      // Always require real auth
      const headers = await getAuthHeaders();
      if (headers === null) return null;

      console.log('[useWhatsAppInstances] Creating instance with name:', displayName);

      const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'create', displayName },
        headers
      });

      console.log('[useWhatsAppInstances] Create response:', { data, error });

      if (error) {
        console.error('Function invoke error:', error);
        
        // Provide more helpful error message
        if (error.message?.includes('Failed to send') || error.message?.includes('FetchError')) {
          toast.error(
            'A Edge Function não está respondendo. Possíveis causas: ' +
            '1) Função não deployada, 2) Erro no código da função, 3) Secrets não configurados. ' +
            'Verifique no Dashboard do Supabase > Edge Functions > whatsapp-connect.',
            { duration: 10000 }
          );
          return null;
        }
        
        throw new Error(error.message || 'Erro na chamada da função');
      }

      if (data?.error) {
        console.error('API returned error:', data.error);
        throw new Error(data.error);
      }
      
      if (!data?.configured) {
        toast.info('WhatsApp ainda não configurado. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY nos Secrets do Supabase.');
        return null;
      }

      toast.success('Instância criada! Escaneie o QR Code.');
      return { qrCode: data.qrCode, instance: data.instance };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Error creating WhatsApp instance:', error);
      toast.error(`Erro ao criar instância: ${errorMessage}`);
      return null;
    } finally {
      setCreating(false);
    }
  }, [instances, saveMockInstances]);

  // Refresh QR Code for an instance
  const refreshQrCode = useCallback(async (instanceId: string): Promise<string | null> => {
    try {
      setActionLoading(instanceId);

      // Use mock if USE_MOCK_DATA is true
      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const newQr = createMockQrCode();
        const updatedInstances = instances.map(inst => 
          inst.id === instanceId ? { ...inst, qr_code: newQr, updated_at: new Date().toISOString() } : inst
        );
        saveMockInstances(updatedInstances);
        return newQr;
      }

      const headers = await getAuthHeaders();
      if (headers === null) return null;

      const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'refresh_qr', instanceId },
        headers
      });

      if (error) throw error;
      return data.qrCode || null;
    } catch (error) {
      console.error('Error refreshing QR code:', error);
      toast.error('Erro ao atualizar QR Code');
      return null;
    } finally {
      setActionLoading(null);
    }
  }, [instances, saveMockInstances]);

  // Simulate connection (only works with USE_MOCK_DATA)
  const simulateConnection = useCallback(async (instanceId: string, phoneNumber?: string): Promise<boolean> => {
    if (!USE_MOCK_DATA) return false;
    
    try {
      setActionLoading(instanceId);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const updatedInstances = instances.map(inst => 
        inst.id === instanceId 
          ? { 
              ...inst, 
              status: 'connected' as const, 
              phone_number: phoneNumber || '+55 11 99999-' + Math.floor(1000 + Math.random() * 9000),
              qr_code: undefined,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } 
          : inst
      );
      saveMockInstances(updatedInstances);
      toast.success('Instância conectada! (Simulação)');
      return true;
    } catch (error) {
      console.error('Error simulating connection:', error);
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [instances, saveMockInstances]);

  // Disconnect instance (logout but keep)
  const disconnectInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    try {
      setActionLoading(instanceId);

      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const updatedInstances = instances.map(inst => 
          inst.id === instanceId 
            ? { 
                ...inst, 
                status: 'disconnected' as const, 
                phone_number: undefined,
                connected_at: undefined,
                updated_at: new Date().toISOString(),
              } 
            : inst
        );
        saveMockInstances(updatedInstances);
        toast.success('Instância desconectada');
        return true;
      }

      const headers = await getAuthHeaders();
      if (headers === null) return false;

      const { error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'disconnect', instanceId },
        headers
      });

      if (error) throw error;
      toast.success('Instância desconectada');
      return true;
    } catch (error) {
      console.error('Error disconnecting instance:', error);
      toast.error('Erro ao desconectar instância');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [instances, saveMockInstances]);

  // Delete instance (soft delete)
  const deleteInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    try {
      setActionLoading(instanceId);

      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const updatedInstances = instances.filter(inst => inst.id !== instanceId);
        saveMockInstances(updatedInstances);
        toast.success('Instância removida');
        return true;
      }

      const headers = await getAuthHeaders();
      if (headers === null) return false;

      const { error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'delete', instanceId },
        headers
      });

      if (error) throw error;
      toast.success('Instância removida');
      return true;
    } catch (error) {
      console.error('Error deleting instance:', error);
      toast.error('Erro ao remover instância');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [instances, saveMockInstances]);

  // Rename instance
  const renameInstance = useCallback(async (instanceId: string, newName: string): Promise<boolean> => {
    try {
      setActionLoading(instanceId);

      if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const updatedInstances = instances.map(inst => 
          inst.id === instanceId 
            ? { ...inst, display_name: newName, updated_at: new Date().toISOString() } 
            : inst
        );
        saveMockInstances(updatedInstances);
        toast.success('Nome atualizado');
        return true;
      }

      const headers = await getAuthHeaders();
      if (headers === null) return false;

      const { error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'rename', instanceId, newName },
        headers
      });

      if (error) throw error;
      toast.success('Nome atualizado');
      return true;
    } catch (error) {
      console.error('Error renaming instance:', error);
      toast.error('Erro ao renomear instância');
      return false;
    } finally {
      setActionLoading(null);
    }
  }, [instances, saveMockInstances]);

  // Get connected instances count
  const connectedCount = instances.filter(i => i.status === 'connected').length;
  const hasConnectedInstance = connectedCount > 0;

  return {
    instances,
    loading,
    creating,
    actionLoading,
    fetchInstances,
    createInstance,
    refreshQrCode,
    simulateConnection,
    disconnectInstance,
    deleteInstance,
    renameInstance,
    connectedCount,
    hasConnectedInstance,
    isDevMode: USE_MOCK_DATA || useFallback, // Show dev UI when using mock data OR fallback mode
    isFallbackMode: useFallback,
  };
}
