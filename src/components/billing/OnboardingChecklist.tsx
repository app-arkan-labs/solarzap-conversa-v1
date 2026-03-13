import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ChecklistStatus = {
  whatsappConnected: boolean;
  hasLead: boolean;
  hasProposal: boolean;
  aiAutomationReady: boolean;
};

const INITIAL_STATUS: ChecklistStatus = {
  whatsappConnected: false,
  hasLead: false,
  hasProposal: false,
  aiAutomationReady: false,
};

const isSchemaMismatchError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204' || code === '42P01') return true;
  return /column|table|schema cache/i.test(String(error.message || ''));
};

export default function OnboardingChecklist() {
  const { orgId } = useAuth();
  const [status, setStatus] = useState<ChecklistStatus>(INITIAL_STATUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setStatus(INITIAL_STATUS);
      setError('Organização não encontrada para calcular o checklist.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        whatsappCountResult,
        leadsCountResult,
        proposalsCountResult,
        aiSettingsResult,
        automationSettingsResult,
      ] = await Promise.all([
        supabase
          .from('whatsapp_instances')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('is_active', true)
          .eq('status', 'connected'),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId),
        supabase
          .from('propostas')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId),
        supabase
          .from('ai_settings')
          .select('is_active')
          .eq('org_id', orgId)
          .maybeSingle(),
        supabase
          .from('automation_settings')
          .select('settings')
          .eq('org_id', orgId)
          .maybeSingle(),
      ]);

      if (whatsappCountResult.error) throw whatsappCountResult.error;
      if (leadsCountResult.error) throw leadsCountResult.error;
      if (proposalsCountResult.error) throw proposalsCountResult.error;
      if (aiSettingsResult.error) throw aiSettingsResult.error;
      if (automationSettingsResult.error && !isSchemaMismatchError(automationSettingsResult.error)) {
        throw automationSettingsResult.error;
      }

      const aiIsActive = aiSettingsResult.data?.is_active === true;

      const automationSettings = (
        automationSettingsResult.data?.settings &&
        typeof automationSettingsResult.data.settings === 'object' &&
        !Array.isArray(automationSettingsResult.data.settings)
      )
        ? automationSettingsResult.data.settings as Record<string, unknown>
        : null;

      const automationEnabled = automationSettings
        ? (
          automationSettings.videoCallMessageEnabled === true ||
          automationSettings.proposalReadyMessageEnabled === true ||
          automationSettings.visitScheduledMessageEnabled === true ||
          automationSettings.callScheduledMessageEnabled === true ||
          automationSettings.askForReferralMessageEnabled === true ||
          automationSettings.dragDropChamadaRealizada === true ||
          automationSettings.dragDropAguardandoProposta === true ||
          automationSettings.dragDropPropostaPronta === true
        )
        : true;

      setStatus({
        whatsappConnected: Number(whatsappCountResult.count || 0) > 0,
        hasLead: Number(leadsCountResult.count || 0) > 0,
        hasProposal: Number(proposalsCountResult.count || 0) > 0,
        aiAutomationReady: aiIsActive && automationEnabled,
      });
    } catch (refreshError) {
      const message = refreshError instanceof Error
        ? refreshError.message
        : 'Falha ao calcular checklist inicial.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = useMemo(() => ([
    {
      key: 'whatsapp',
      title: 'Conectar WhatsApp',
      done: status.whatsappConnected,
      description: 'Obrigatório para conversas e automações com leads.',
    },
    {
      key: 'lead',
      title: 'Cadastrar primeiro lead',
      done: status.hasLead,
      description: 'Crie/importe ao menos um lead para iniciar o funil.',
    },
    {
      key: 'proposal',
      title: 'Gerar primeira proposta',
      done: status.hasProposal,
      description: 'Valida o fluxo comercial ponta a ponta.',
    },
    {
      key: 'ai-automation',
      title: 'Ativar IA e automações',
      done: status.aiAutomationReady,
      description: 'Habilite IA da organização e mantenha automações ativas.',
    },
  ]), [status.aiAutomationReady, status.hasLead, status.hasProposal, status.whatsappConnected]);

  const completed = items.filter((item) => item.done).length;
  const progress = Math.round((completed / items.length) * 100);

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Checklist inicial</h3>
          <p className="text-xs text-muted-foreground">
            {completed}/{items.length} concluído{completed === 1 ? '' : 's'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              item.done ? 'border-emerald-200 bg-emerald-50/50' : 'border-border bg-background',
            )}
          >
            <div className="flex items-start gap-2">
              {item.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              )}
              <div className="min-w-0">
                <p className={cn('font-medium', item.done ? 'text-emerald-800' : 'text-foreground')}>{item.title}</p>
                <p className={cn('text-xs', item.done ? 'text-emerald-700/90' : 'text-muted-foreground')}>{item.description}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
