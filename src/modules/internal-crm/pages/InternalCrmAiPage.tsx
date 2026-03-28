import { useEffect, useState } from 'react';
import { Bot, Save, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  internalCrmQueryKeys,
  useInternalCrmAi,
  useInternalCrmMutation,
  useInternalCrmPipelineStages,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';

export default function InternalCrmAiPage() {
  const { toast } = useToast();
  const aiQuery = useInternalCrmAi();
  const stagesQuery = useInternalCrmPipelineStages();
  const [draft, setDraft] = useState({
    is_enabled: false,
    qualification_enabled: false,
    follow_up_enabled: false,
    broadcast_assistant_enabled: false,
    onboarding_assistant_enabled: false,
    model: '',
    timezone: 'America/Sao_Paulo',
    default_prompt: '',
  });

  useEffect(() => {
    if (!aiQuery.data?.settings) return;
    setDraft({
      is_enabled: aiQuery.data.settings.is_enabled,
      qualification_enabled: aiQuery.data.settings.qualification_enabled,
      follow_up_enabled: aiQuery.data.settings.follow_up_enabled,
      broadcast_assistant_enabled: aiQuery.data.settings.broadcast_assistant_enabled,
      onboarding_assistant_enabled: aiQuery.data.settings.onboarding_assistant_enabled,
      model: aiQuery.data.settings.model || '',
      timezone: aiQuery.data.settings.timezone || 'America/Sao_Paulo',
      default_prompt: aiQuery.data.settings.default_prompt || '',
    });
  }, [aiQuery.data?.settings]);

  const aiMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.ai()],
    onSuccess: async () => {
      toast({ title: 'IA atualizada', description: 'As configuracoes internas foram persistidas.' });
    },
  });

  const stageConfigs = aiQuery.data?.settings.stage_configs || [];
  const pendingJobs = aiQuery.data?.settings.pending_jobs || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="IA"
        subtitle="Assistentes internos para qualificacao, follow-up, disparos e onboarding."
        icon={Bot}
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuracao global</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              ['IA geral', 'is_enabled'],
              ['Qualificacao', 'qualification_enabled'],
              ['Follow-up', 'follow_up_enabled'],
              ['Assistente de disparos', 'broadcast_assistant_enabled'],
              ['Assistente de onboarding', 'onboarding_assistant_enabled'],
            ].map(([label, key]) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 p-4">
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-sm text-muted-foreground">Controla se esta automacao pode operar no CRM interno.</p>
                </div>
                <Switch
                  checked={Boolean(draft[key as keyof typeof draft])}
                  onCheckedChange={(checked) => setDraft((current) => ({ ...current, [key]: checked }))}
                />
              </div>
            ))}

            <div className="space-y-2">
              <Label>Modelo</Label>
              <Input value={draft.model} onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))} placeholder="gpt-5-mini" />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input value={draft.timezone} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Prompt default</Label>
              <Textarea rows={6} value={draft.default_prompt} onChange={(event) => setDraft((current) => ({ ...current, default_prompt: event.target.value }))} />
            </div>
            <Button
              onClick={() =>
                aiMutation.mutate({
                  action: 'upsert_ai_settings',
                  ...draft,
                  stage_configs: stageConfigs,
                })
              }
              disabled={aiMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar configuracao
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Prompts por etapa
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(stagesQuery.data?.stages || []).map((stage) => {
                const config = stageConfigs.find((row) => row.stage_code === stage.stage_code);
                return (
                  <div key={stage.stage_code} className="rounded-2xl border border-border/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{stage.name}</p>
                      <TokenBadge token={config?.is_enabled ? 'active' : 'inactive'} label={config?.is_enabled ? 'Ativo' : 'Inativo'} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {config?.system_prompt || 'Nenhum prompt customizado configurado para esta etapa ainda.'}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fila de jobs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum job pendente no momento.</p>
              ) : (
                pendingJobs.map((job) => (
                  <div key={job.id} className="rounded-2xl border border-border/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{job.job_type}</p>
                      <TokenBadge token={job.status} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Agendado para {formatDateTime(job.scheduled_at)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
