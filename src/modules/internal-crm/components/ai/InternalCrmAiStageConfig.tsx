import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { TokenBadge } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmAiSettings, InternalCrmStage } from '@/modules/internal-crm/types';

type StageConfig = InternalCrmAiSettings['stage_configs'][number];

type InternalCrmAiStageConfigProps = {
  stageConfigs: StageConfig[];
  stages: InternalCrmStage[];
  onChange: (configs: StageConfig[]) => void;
};

function normalizeStageLabel(stageCode: string): string {
  return stageCode
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function InternalCrmAiStageConfig(props: InternalCrmAiStageConfigProps) {
  const stageRows = useMemo(() => {
    if (props.stages.length > 0) {
      return props.stages.map((stage) => ({ stage_code: stage.stage_code, name: stage.name }));
    }

    return props.stageConfigs.map((config) => ({
      stage_code: config.stage_code,
      name: normalizeStageLabel(config.stage_code),
    }));
  }, [props.stageConfigs, props.stages]);

  function upsertConfig(stageCode: string, patch: Partial<StageConfig>) {
    const existingIndex = props.stageConfigs.findIndex((config) => config.stage_code === stageCode);

    if (existingIndex === -1) {
      props.onChange([
        ...props.stageConfigs,
        {
          id: `new-${stageCode}`,
          stage_code: stageCode,
          is_enabled: true,
          system_prompt: '',
          prompt_version: 1,
          ...patch,
        },
      ]);
      return;
    }

    const nextConfigs = [...props.stageConfigs];
    nextConfigs[existingIndex] = {
      ...nextConfigs[existingIndex],
      ...patch,
      prompt_version: Math.max(1, Number(nextConfigs[existingIndex].prompt_version || 1)),
    };
    props.onChange(nextConfigs);
  }

  return (
    <div className="space-y-4">
      {stageRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          Nenhuma etapa de pipeline encontrada para configurar prompts.
        </p>
      ) : (
        stageRows.map((stage) => {
          const config =
            props.stageConfigs.find((row) => row.stage_code === stage.stage_code) ||
            ({
              id: `new-${stage.stage_code}`,
              stage_code: stage.stage_code,
              is_enabled: true,
              system_prompt: '',
              prompt_version: 1,
            } as StageConfig);

          return (
            <div key={stage.stage_code} className="space-y-3 rounded-2xl border border-border/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{stage.name}</p>
                  <p className="text-xs text-muted-foreground">Prompt para automacoes nesta etapa do funil.</p>
                </div>
                <div className="flex items-center gap-2">
                  <TokenBadge
                    token={config.is_enabled ? 'active' : 'inactive'}
                    label={config.is_enabled ? 'Ativo' : 'Inativo'}
                  />
                  <Switch
                    checked={config.is_enabled}
                    onCheckedChange={(checked) => upsertConfig(stage.stage_code, { is_enabled: checked })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Prompt da etapa</Label>
                <Textarea
                  rows={4}
                  value={config.system_prompt || ''}
                  onChange={(event) => upsertConfig(stage.stage_code, { system_prompt: event.target.value })}
                  placeholder="Instrucao para o agente operar nesta etapa..."
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
