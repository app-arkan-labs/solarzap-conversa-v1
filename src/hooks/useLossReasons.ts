import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface LossReasonRecord {
  id: string;
  key: string;
  label: string;
  isDefault: boolean;
  position: number;
  createdAt?: string;
}

const LOSS_REASON_QUERY_KEY = 'loss-reasons';

export const DEFAULT_LOSS_REASON_PRESETS: Array<Pick<LossReasonRecord, 'key' | 'label' | 'isDefault' | 'position'>> = [
  { key: 'sem_resposta', label: 'Não respondeu', isDefault: true, position: 1 },
  { key: 'sem_interesse', label: 'Sem interesse', isDefault: true, position: 2 },
  { key: 'concorrente', label: 'Fechou com concorrente', isDefault: true, position: 3 },
  { key: 'timing', label: 'Não é o momento', isDefault: true, position: 4 },
  { key: 'financeiro', label: 'Sem condição financeira', isDefault: true, position: 5 },
  { key: 'preco_alto', label: 'Preço acima do esperado', isDefault: true, position: 6 },
  { key: 'retorno_investimento', label: 'Retorno do investimento não convenceu', isDefault: true, position: 7 },
  { key: 'mudou_plano', label: 'Projeto adiado ou mudou de prioridade', isDefault: true, position: 8 },
  { key: 'outro', label: 'Outro', isDefault: true, position: 9 },
];

const normalizeLossReasonRow = (row: any): LossReasonRecord => ({
  id: String(row.id),
  key: String(row.key || '').trim(),
  label: String(row.label || '').trim(),
  isDefault: row.is_default === true,
  position: Number(row.position || 0),
  createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
});

export const normalizeLossReasonKey = (value: string): string => {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  return normalized || 'motivo_perda';
};

export const buildLossReasonSummary = (label: string, detail?: string | null): string => {
  const normalizedLabel = String(label || '').trim();
  const normalizedDetail = String(detail || '').trim();
  if (!normalizedDetail) return normalizedLabel;
  return `${normalizedLabel}: ${normalizedDetail}`;
};

export async function ensureLossReasonCatalog(orgId: string): Promise<LossReasonRecord[]> {
  const loadReasons = async () => {
    const { data, error } = await supabase
      .from('motivos_perda')
      .select('id, key, label, is_default, position, created_at')
      .eq('org_id', orgId)
      .order('position', { ascending: true })
      .order('label', { ascending: true });

    if (error) throw error;
    return (data || []).map(normalizeLossReasonRow);
  };

  const existingReasons = await loadReasons();
  const existingKeys = new Set(existingReasons.map((reason) => reason.key));
  const missingDefaults = DEFAULT_LOSS_REASON_PRESETS.filter((preset) => !existingKeys.has(preset.key));

  if (missingDefaults.length > 0) {
    const { error } = await supabase
      .from('motivos_perda')
      .upsert(
        missingDefaults.map((preset) => ({
          org_id: orgId,
          key: preset.key,
          label: preset.label,
          is_default: true,
          position: preset.position,
        })),
        { onConflict: 'org_id,key' },
      );

    if (error) throw error;
    return loadReasons();
  }

  return existingReasons;
}

export async function findLossReasonByKey(orgId: string, key: string): Promise<LossReasonRecord | null> {
  const reasons = await ensureLossReasonCatalog(orgId);
  return reasons.find((reason) => reason.key === key) ?? null;
}

export async function createLossReason(orgId: string, label: string, existingReasons: LossReasonRecord[] = []): Promise<LossReasonRecord> {
  const trimmedLabel = String(label || '').trim();
  if (!trimmedLabel) {
    throw new Error('Informe um motivo valido.');
  }

  const lowerLabel = trimmedLabel.toLowerCase();
  const duplicatedLabel = existingReasons.find((reason) => reason.label.toLowerCase() === lowerLabel);
  if (duplicatedLabel) {
    return duplicatedLabel;
  }

  const existingKeys = new Set(existingReasons.map((reason) => reason.key));
  const baseKey = normalizeLossReasonKey(trimmedLabel);
  let uniqueKey = baseKey;
  let suffix = 2;

  while (existingKeys.has(uniqueKey)) {
    uniqueKey = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  const position = existingReasons.reduce((maxPosition, reason) => Math.max(maxPosition, reason.position), 0) + 1;

  const { data, error } = await supabase
    .from('motivos_perda')
    .insert({
      org_id: orgId,
      key: uniqueKey,
      label: trimmedLabel,
      is_default: false,
      position,
    })
    .select('id, key, label, is_default, position, created_at')
    .single();

  if (error) throw error;
  return normalizeLossReasonRow(data);
}

export function useLossReasons() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = [LOSS_REASON_QUERY_KEY, orgId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(orgId),
    queryFn: async () => ensureLossReasonCatalog(orgId as string),
    staleTime: 5 * 60 * 1000,
  });

  const addReasonMutation = useMutation({
    mutationFn: async (label: string) => createLossReason(orgId as string, label, query.data || []),
    onSuccess: (createdReason) => {
      queryClient.setQueryData<LossReasonRecord[]>(queryKey, (current) => {
        const items = [...(current || []), createdReason];
        return items.sort((left, right) => left.position - right.position || left.label.localeCompare(right.label));
      });
    },
  });

  return {
    reasons: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    addReason: addReasonMutation.mutateAsync,
    isAddingReason: addReasonMutation.isPending,
  };
}


