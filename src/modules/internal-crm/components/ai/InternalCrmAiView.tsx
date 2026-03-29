import { useEffect, useState } from 'react';
import { Bot, Save } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { InternalCrmAiJobsList } from '@/modules/internal-crm/components/ai/InternalCrmAiJobsList';
import { InternalCrmAiStageConfig } from '@/modules/internal-crm/components/ai/InternalCrmAiStageConfig';
import { useInternalCrmAiModule } from '@/modules/internal-crm/hooks/useInternalCrmAi';
import type { InternalCrmAiSettings } from '@/modules/internal-crm/types';

type StageConfig = InternalCrmAiSettings['stage_configs'][number];

export function InternalCrmAiView() {
  const { toast } = useToast();
  const aiModule = useInternalCrmAiModule();

  const settings = aiModule.aiQuery.data?.settings;
  const stages = aiModule.stagesQuery.data?.stages || [];
  const clients = aiModule.clientsQuery.data?.clients || [];

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
  const [stageConfigs, setStageConfigs] = useState<StageConfig[]>([]);

  useEffect(() => {
    if (!settings) return;

    setDraft({
      is_enabled: settings.is_enabled,
      qualification_enabled: settings.qualification_enabled,
      follow_up_enabled: settings.follow_up_enabled,
      broadcast_assistant_enabled: settings.broadcast_assistant_enabled,
      onboarding_assistant_enabled: settings.onboarding_assistant_enabled,
      model: settings.model || '',
      timezone: settings.timezone || 'America/Sao_Paulo',
      default_prompt: settings.default_prompt || '',
    });
    setStageConfigs(settings.stage_configs || []);
  }, [settings]);

  async function handleSaveSettings() {
    try {
      await aiModule.upsertAiSettingsMutation.mutateAsync({
        action: 'upsert_ai_settings',
        ...draft,
        stage_configs: stageConfigs.map((config) => ({
          stage_code: config.stage_code,
          is_enabled: config.is_enabled,
          system_prompt: config.system_prompt,
          prompt_version: config.prompt_version,
        })),
      });

      toast({ title: 'Configuracao salva', description: 'As regras de IA foram atualizadas.' });
    } catch {
      toast({
        title: 'Falha ao salvar IA',
        description: 'Nao foi possivel persistir as configuracoes.',
        variant: 'destructive',
      });
    }
  }

  async function handleEnqueueJob(payload: {
    job_type: string;
    client_id: string | null;
    scheduled_at: string;
    payload: Record<string, unknown>;
  }) {
    try {
      await aiModule.enqueueAgentJobMutation.mutateAsync({
        action: 'enqueue_agent_job',
        ...payload,
      });

      toast({ title: 'Job enfileirado', description: 'O job foi enviado para processamento interno.' });
    } catch {
      toast({
        title: 'Falha ao enfileirar job',
        description: 'Nao foi possivel criar o job no momento.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="IA"
        subtitle="Automacoes internas para qualificacao, follow-up, disparo e onboarding."
        icon={Bot}
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
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
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">Habilita automacao para este fluxo comercial.</p>
                </div>
                <Switch
                  checked={Boolean(draft[key as keyof typeof draft])}
                  onCheckedChange={(checked) => setDraft((current) => ({ ...current, [key]: checked }))}
                />
              </div>
            ))}

            <div className="space-y-2">
              <Label>Modelo</Label>
              <Input
                value={draft.model}
                onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                placeholder="gpt-5-mini"
              />
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                value={draft.timezone}
                onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Prompt padrao</Label>
              <Textarea
                rows={6}
                value={draft.default_prompt}
                onChange={(event) => setDraft((current) => ({ ...current, default_prompt: event.target.value }))}
                placeholder="Comporte-se como SDR interno..."
              />
            </div>

            <Button onClick={() => void handleSaveSettings()} disabled={aiModule.upsertAiSettingsMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Salvar configuracao
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prompts por etapa</CardTitle>
            </CardHeader>
            <CardContent>
              <InternalCrmAiStageConfig
                stageConfigs={stageConfigs}
                stages={stages}
                onChange={setStageConfigs}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fila de jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <InternalCrmAiJobsList
                pendingJobs={settings?.pending_jobs || []}
                clients={clients}
                isPending={aiModule.enqueueAgentJobMutation.isPending}
                onEnqueue={handleEnqueueJob}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
