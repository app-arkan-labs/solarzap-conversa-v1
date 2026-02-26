import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import type { LeadStageData } from '@/types/ai';
import type { Contact } from '@/types/solarzap';

type StageField = { key: string; label: string };
type StageSectionConfig = {
  key: 'respondeu' | 'nao_compareceu' | 'negociacao' | 'financiamento';
  title: string;
  subtitle: string;
  fields: StageField[];
};

const SECTION_CONFIGS: StageSectionConfig[] = [
  {
    key: 'respondeu',
    title: 'Qualificacao (Respondeu)',
    subtitle: 'BANT e contexto inicial',
    fields: [
      { key: 'segment', label: 'Segmento' },
      { key: 'timing', label: 'Timing' },
      { key: 'budget_fit', label: 'Fit de Orcamento' },
      { key: 'need_reason', label: 'Motivo da Necessidade' },
      { key: 'decision_makers', label: 'Tomadores de Decisao' },
      { key: 'decision_makers_present', label: 'Tomadores Presentes' },
      { key: 'visit_datetime', label: 'Data/Hora da Visita' },
      { key: 'address', label: 'Endereco' },
      { key: 'reference_point', label: 'Ponto de Referencia' },
      { key: 'bant_complete', label: 'BANT Completo' },
    ],
  },
  {
    key: 'nao_compareceu',
    title: 'Nao Compareceu',
    subtitle: 'Motivo e recuperacao',
    fields: [
      { key: 'no_show_reason', label: 'Motivo do No-show' },
      { key: 'recovery_path', label: 'Caminho de Recuperacao' },
      { key: 'next_step_choice', label: 'Proximo Passo (Escolha)' },
      { key: 'next_step', label: 'Proximo Passo' },
      { key: 'attempt_count', label: 'Tentativas' },
      { key: 'call_datetime', label: 'Data/Hora da Ligacao' },
      { key: 'visit_datetime', label: 'Data/Hora da Visita' },
      { key: 'address', label: 'Endereco' },
      { key: 'reference_point', label: 'Ponto de Referencia' },
    ],
  },
  {
    key: 'negociacao',
    title: 'Negociacao',
    subtitle: 'Condicao, objecao e status',
    fields: [
      { key: 'payment_track', label: 'Trilho de Pagamento' },
      { key: 'payment_method', label: 'Metodo de Pagamento' },
      { key: 'main_objection', label: 'Objecao Principal' },
      { key: 'chosen_condition', label: 'Condicao Escolhida' },
      { key: 'explicit_approval', label: 'Aprovacao Explicita' },
      { key: 'negotiation_status', label: 'Status da Negociacao' },
    ],
  },
  {
    key: 'financiamento',
    title: 'Financiamento',
    subtitle: 'Status, documentos e follow-up',
    fields: [
      { key: 'financing_status', label: 'Status do Financiamento' },
      { key: 'missing_docs', label: 'Documentos Faltantes' },
      { key: 'last_update_at', label: 'Ultima Atualizacao' },
      { key: 'next_followup_at', label: 'Proximo Follow-up' },
      { key: 'fear_reason', label: 'Medo / Travamento' },
      { key: 'profile_type', label: 'Perfil' },
      { key: 'approved_at', label: 'Aprovado Em' },
      { key: 'bank_notes', label: 'Notas do Banco' },
    ],
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(isMeaningfulValue);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(isMeaningfulValue);
  return true;
}

function formatStageValue(fieldKey: string, value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Nao';
  }

  if (typeof value === 'number') return String(value);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    if (fieldKey.endsWith('_at') || fieldKey.endsWith('_datetime')) {
      const date = new Date(trimmed);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString('pt-BR');
      }
    }

    return trimmed;
  }

  if (isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}

function getStageObject(stageData: LeadStageData | undefined, key: StageSectionConfig['key']): Record<string, unknown> | null {
  if (!stageData) return null;
  if (key === 'negociacao') {
    const candidate = stageData.negociacao ?? stageData.proposta_negociacao;
    return isPlainObject(candidate) ? candidate : null;
  }
  const candidate = stageData[key];
  return isPlainObject(candidate) ? candidate : null;
}

function hasRenderableStageFields(stageObj: Record<string, unknown> | null): boolean {
  if (!stageObj) return false;
  return Object.entries(stageObj).some(([key, value]) => key !== 'updated_at' && isMeaningfulValue(value));
}

export function LeadStageDataSection({ contact }: { contact: Contact }) {
  const stageData = contact.stageData;
  const sections = SECTION_CONFIGS
    .map((config) => ({ config, data: getStageObject(stageData, config.key) }))
    .filter(({ data }) => hasRenderableStageFields(data));

  if (!stageData || sections.length === 0) return null;

  return (
    <div className="space-y-3" data-testid={`lead-stage-data-section-${contact.id}`}>
      <Accordion type="single" collapsible defaultValue="agent-stage-data" className="rounded-lg border border-border bg-muted/20 px-4">
        <AccordionItem value="agent-stage-data" className="border-b-0">
          <AccordionTrigger className="py-3 hover:no-underline">
            <div className="flex items-center gap-2 text-left">
              <span className="text-sm font-semibold text-foreground">Dados do Agente</span>
              <Badge variant="outline" className="text-[10px]">
                {sections.length} etapa{sections.length > 1 ? 's' : ''}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-3">
              {sections.map(({ config, data }) => {
                const rows = config.fields
                  .map((field) => ({ field, value: data?.[field.key] }))
                  .filter((row) => isMeaningfulValue(row.value));

                const updatedAt = typeof data?.updated_at === 'string' ? data.updated_at : null;

                return (
                  <div key={config.key} className="rounded-md border border-border bg-background p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-foreground">{config.title}</div>
                        <div className="text-xs text-muted-foreground">{config.subtitle}</div>
                      </div>
                      {updatedAt && (
                        <Badge variant="outline" className="text-[10px]">
                          Atualizado: {formatStageValue('updated_at', updatedAt)}
                        </Badge>
                      )}
                    </div>

                    {rows.length === 0 ? (
                      <div className="text-xs text-muted-foreground">Sem dados estruturados desta etapa.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {rows.map(({ field, value }) => (
                          <div key={`${config.key}-${field.key}`} className="rounded-sm border border-border/60 bg-muted/20 p-2">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {field.label}
                            </div>
                            <div className="mt-0.5 break-words text-sm text-foreground">
                              {formatStageValue(field.key, value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
