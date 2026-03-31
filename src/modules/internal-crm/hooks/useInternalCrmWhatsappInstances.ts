import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';
import {
  internalCrmQueryKeys,
  useInternalCrmInstances,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmWhatsappInstance } from '@/modules/internal-crm/types';

const DEFAULT_INSTANCE_COLOR = '#25D366';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function buildInstanceSlug(displayName: string): string {
  const normalized = displayName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `${normalized || 'instancia'}_${Date.now().toString().slice(-6)}`;
}

export type InternalCrmManagedWhatsappInstance = InternalCrmWhatsappInstance & {
  color: string;
  metadata: Record<string, unknown>;
};

function normalizeInstance(instance: InternalCrmWhatsappInstance): InternalCrmManagedWhatsappInstance {
  const metadata = asRecord(instance.metadata);
  const metadataColor = typeof metadata.color === 'string' ? metadata.color.trim() : '';
  const explicitColor = typeof instance.color === 'string' ? instance.color.trim() : '';

  return {
    ...instance,
    metadata,
    color: explicitColor || metadataColor || DEFAULT_INSTANCE_COLOR,
  };
}

export function useInternalCrmWhatsappInstances() {
  const queryClient = useQueryClient();
  const instancesQuery = useInternalCrmInstances();
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const upsertMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });
  const connectMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });
  const statusMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });
  const disconnectMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });
  const deleteMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
  });

  const instances = useMemo(
    () => (instancesQuery.data?.instances || []).map(normalizeInstance),
    [instancesQuery.data?.instances],
  );

  useEffect(() => {
    const channel = supabase
      .channel('internal_crm_whatsapp_instances')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'internal_crm',
          table: 'whatsapp_instances',
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: internalCrmQueryKeys.instances() });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const fetchInstances = useCallback(async () => {
    await instancesQuery.refetch();
  }, [instancesQuery]);

  const createInstance = useCallback(
    async (displayName: string): Promise<{ qrCode?: string; instance?: InternalCrmManagedWhatsappInstance } | null> => {
      const normalizedDisplayName = displayName.trim();
      if (!normalizedDisplayName) return null;

      try {
        setCreating(true);

        const createResponse = (await upsertMutation.mutateAsync({
          action: 'upsert_instance',
          instance_name: buildInstanceSlug(normalizedDisplayName),
          display_name: normalizedDisplayName,
          ai_enabled: false,
          color: DEFAULT_INSTANCE_COLOR,
        })) as { instance?: InternalCrmWhatsappInstance };

        const createdInstanceId = String(createResponse.instance?.id || '');
        if (!createdInstanceId) {
          throw new Error('instance_missing_after_create');
        }

        const connectResponse = (await connectMutation.mutateAsync({
          action: 'connect_instance',
          instance_id: createdInstanceId,
        })) as {
          instance?: InternalCrmWhatsappInstance;
          qr_code_base64?: string;
        };

        const instance = normalizeInstance(connectResponse.instance || createResponse.instance || ({
          id: createdInstanceId,
          instance_name: '',
          display_name: normalizedDisplayName,
          status: 'connecting',
          ai_enabled: false,
          assistant_identity_name: null,
          assistant_prompt_override: null,
          phone_number: null,
          webhook_url: null,
          qr_code_base64: null,
          metadata: { color: DEFAULT_INSTANCE_COLOR },
        } as InternalCrmWhatsappInstance));

        return {
          instance,
          qrCode: String(connectResponse.qr_code_base64 || instance.qr_code_base64 || '').trim() || undefined,
        };
      } catch (error) {
        console.error('Failed to create internal CRM instance', error);
        toast.error('Erro ao criar a instancia interna.');
        return null;
      } finally {
        setCreating(false);
      }
    },
    [connectMutation, upsertMutation],
  );

  const refreshQrCode = useCallback(
    async (instanceId: string): Promise<string | null> => {
      try {
        setActionLoading(instanceId);
        const response = (await connectMutation.mutateAsync({
          action: 'connect_instance',
          instance_id: instanceId,
        })) as { qr_code_base64?: string };

        const qrCode = String(response.qr_code_base64 || '').trim();
        return qrCode || null;
      } catch (error) {
        console.error('Failed to refresh internal CRM QR code', error);
        toast.error('Erro ao atualizar o QR Code.');
        return null;
      } finally {
        setActionLoading(null);
      }
    },
    [connectMutation],
  );

  const checkStatus = useCallback(
    async (instanceId: string): Promise<InternalCrmWhatsappInstance['status'] | null> => {
      try {
        setActionLoading(instanceId);
        const response = (await statusMutation.mutateAsync({
          action: 'get_instance_status',
          instance_id: instanceId,
        })) as { status?: InternalCrmWhatsappInstance['status'] };

        return response.status || null;
      } catch (error) {
        console.error('Failed to check internal CRM instance status', error);
        toast.error('Erro ao consultar o status da instancia.');
        return null;
      } finally {
        setActionLoading(null);
      }
    },
    [statusMutation],
  );

  const disconnectInstance = useCallback(
    async (instanceId: string): Promise<boolean> => {
      try {
        setActionLoading(instanceId);
        await disconnectMutation.mutateAsync({
          action: 'disconnect_instance',
          instance_id: instanceId,
        });
        toast.success('Instancia desconectada.');
        return true;
      } catch (error) {
        console.error('Failed to disconnect internal CRM instance', error);
        toast.error('Erro ao desconectar a instancia.');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [disconnectMutation],
  );

  const deleteInstance = useCallback(
    async (instance: InternalCrmManagedWhatsappInstance): Promise<boolean> => {
      try {
        setActionLoading(instance.id);
        await deleteMutation.mutateAsync({
          action: 'delete_instance',
          instance_id: instance.id,
        });
        toast.success('Instancia excluida.');
        return true;
      } catch (error) {
        console.error('Failed to delete internal CRM instance', error);
        toast.error('Erro ao excluir a instancia.');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [deleteMutation],
  );

  const setInstanceAiEnabled = useCallback(
    async (instanceId: string, enabled: boolean): Promise<boolean> => {
      const instance = instances.find((item) => item.id === instanceId);
      if (!instance) return false;

      try {
        setActionLoading(instanceId);
        await upsertMutation.mutateAsync({
          action: 'upsert_instance',
          instance_id: instance.id,
          ai_enabled: enabled,
        });
        toast.success(`IA ${enabled ? 'ativada' : 'desativada'} para a instancia.`);
        return true;
      } catch (error) {
        console.error('Failed to update internal CRM AI toggle', error);
        toast.error('Erro ao atualizar a IA da instancia.');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [instances, upsertMutation],
  );

  const updateColor = useCallback(
    async (instanceId: string, color: string): Promise<boolean> => {
      const instance = instances.find((item) => item.id === instanceId);
      if (!instance) return false;

      try {
        setActionLoading(instanceId);
        await upsertMutation.mutateAsync({
          action: 'upsert_instance',
          instance_id: instance.id,
          color,
        });
        return true;
      } catch (error) {
        console.error('Failed to update internal CRM instance color', error);
        toast.error('Erro ao atualizar a cor da instancia.');
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [instances, upsertMutation],
  );

  return {
    instances,
    loading: instancesQuery.isLoading,
    refreshing: instancesQuery.isFetching,
    creating,
    actionLoading,
    fetchInstances,
    createInstance,
    refreshQrCode,
    checkStatus,
    deleteInstance,
    disconnectInstance,
    connectedCount: instances.filter((instance) => instance.status === 'connected').length,
    setInstanceAiEnabled,
    updateColor,
  };
}