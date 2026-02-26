import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Contact, PipelineStage } from '@/types/solarzap';

type StageBadgeItem = {
  key: string;
  label: string;
  className?: string;
};

const FINANCING_STATUS_LABELS: Record<string, string> = {
  collecting_docs: 'Coletando docs',
  submitted: 'Enviado',
  in_review: 'Em analise',
  pending: 'Pendente',
  approved: 'Aprovado',
  denied: 'Negado',
};

const NEGOTIATION_STATUS_LABELS: Record<string, string> = {
  open: 'Aberta',
  follow_up: 'Follow-up',
  approved: 'Aprovada',
  stalled: 'Travada',
};

const NO_SHOW_REASON_LABELS: Record<string, string> = {
  tempo: 'Sem tempo',
  tecnico: 'Motivo tecnico',
  duvida: 'Com duvidas',
  desinteresse: 'Desinteresse',
  sem_resposta: 'Sem resposta',
};

const BADGE_PRIORITY_BY_STAGE: Record<PipelineStage, string[]> = {
  novo_lead: ['bant_complete', 'negotiation_status', 'financing_status', 'no_show_reason'],
  respondeu: ['bant_complete', 'no_show_reason', 'negotiation_status', 'financing_status'],
  chamada_agendada: ['bant_complete', 'no_show_reason', 'negotiation_status', 'financing_status'],
  chamada_realizada: ['bant_complete', 'negotiation_status', 'financing_status', 'no_show_reason'],
  nao_compareceu: ['no_show_reason', 'bant_complete', 'negotiation_status', 'financing_status'],
  aguardando_proposta: ['bant_complete', 'negotiation_status', 'financing_status', 'no_show_reason'],
  proposta_pronta: ['negotiation_status', 'bant_complete', 'financing_status', 'no_show_reason'],
  visita_agendada: ['bant_complete', 'no_show_reason', 'negotiation_status', 'financing_status'],
  visita_realizada: ['negotiation_status', 'bant_complete', 'financing_status', 'no_show_reason'],
  proposta_negociacao: ['negotiation_status', 'financing_status', 'bant_complete', 'no_show_reason'],
  financiamento: ['financing_status', 'negotiation_status', 'bant_complete', 'no_show_reason'],
  aprovou_projeto: ['financing_status', 'negotiation_status', 'bant_complete', 'no_show_reason'],
  contrato_assinado: ['financing_status', 'negotiation_status', 'bant_complete', 'no_show_reason'],
  projeto_pago: ['financing_status', 'negotiation_status', 'bant_complete', 'no_show_reason'],
  aguardando_instalacao: ['financing_status', 'negotiation_status', 'bant_complete', 'no_show_reason'],
  projeto_instalado: ['financing_status', 'negotiation_status', 'bant_complete', 'no_show_reason'],
  coletar_avaliacao: ['financing_status', 'negotiation_status', 'bant_complete', 'no_show_reason'],
  contato_futuro: ['financing_status', 'negotiation_status', 'bant_complete', 'no_show_reason'],
  perdido: ['no_show_reason', 'negotiation_status', 'financing_status', 'bant_complete'],
};

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function buildBadgeMap(contact: Contact): Record<string, StageBadgeItem | null> {
  const stageData = contact.stageData;
  const respondeu = stageData?.respondeu;
  const naoCompareceu = stageData?.nao_compareceu;
  const negociacao = stageData?.negociacao ?? stageData?.proposta_negociacao;
  const financiamento = stageData?.financiamento;

  const financingStatus = normalizeToken(financiamento?.financing_status);
  const negotiationStatus = normalizeToken(negociacao?.negotiation_status);
  const noShowReason = normalizeToken(naoCompareceu?.no_show_reason);
  const bantComplete = respondeu?.bant_complete === true;

  return {
    financing_status: financingStatus
      ? {
          key: 'financing_status',
          label: `Financ: ${FINANCING_STATUS_LABELS[financingStatus] || financiamento?.financing_status}`,
          className: 'border-blue-200 bg-blue-50 text-blue-700',
        }
      : null,
    negotiation_status: negotiationStatus
      ? {
          key: 'negotiation_status',
          label: `Negoc: ${NEGOTIATION_STATUS_LABELS[negotiationStatus] || negociacao?.negotiation_status}`,
          className: 'border-amber-200 bg-amber-50 text-amber-700',
        }
      : null,
    no_show_reason: noShowReason
      ? {
          key: 'no_show_reason',
          label: `No-show: ${NO_SHOW_REASON_LABELS[noShowReason] || naoCompareceu?.no_show_reason}`,
          className: 'border-rose-200 bg-rose-50 text-rose-700',
        }
      : null,
    bant_complete: bantComplete
      ? {
          key: 'bant_complete',
          label: 'BANT: completo',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        }
      : null,
  };
}

export function StageBadges({
  contact,
  maxBadges = 2,
  className,
}: {
  contact: Contact;
  maxBadges?: number;
  className?: string;
}) {
  const badgeMap = buildBadgeMap(contact);
  const priority = BADGE_PRIORITY_BY_STAGE[contact.pipelineStage] || BADGE_PRIORITY_BY_STAGE.novo_lead;

  const items = priority
    .map((key) => badgeMap[key])
    .filter((item): item is StageBadgeItem => !!item)
    .slice(0, Math.max(0, maxBadges));

  if (items.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} data-testid={`stage-badges-${contact.id}`}>
      {items.map((item) => (
        <Badge key={item.key} variant="outline" className={cn('px-2 py-0.5 text-[10px]', item.className)}>
          {item.label}
        </Badge>
      ))}
    </div>
  );
}
