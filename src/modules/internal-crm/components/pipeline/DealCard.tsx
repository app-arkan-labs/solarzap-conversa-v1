import {
  MoreVertical,
  GripVertical,
  Calendar,
  MessageSquareText,
  ArrowRightLeft,
  CheckCircle2,
  CircleX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrencyBr } from '@/modules/internal-crm/components/InternalCrmUi';
import type { InternalCrmDealSummary, InternalCrmStage } from '@/modules/internal-crm/types';
import { cn } from '@/lib/utils';

const STAGE_LABELS: Record<string, string> = {
  novo_lead: 'Novo Lead',
  respondeu: 'Respondeu',
  agendou_reuniao: 'Agendou Reunião',
  chamada_agendada: 'Reunião Agendada',
  chamada_realizada: 'Reunião Realizada',
  nao_compareceu: 'Não Compareceu',
  negociacao: 'Negociação',
  fechou: 'Fechou Contrato',
  nao_fechou: 'Não Fechou',
};

type DealCardProps = {
  deal: InternalCrmDealSummary;
  isDragging?: boolean;
  onCardClick: () => void;
  onScheduleMeeting: () => void;
  onOpenComments: () => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onMoveToStage: (stageCode: string) => void;
  stages: InternalCrmStage[];
};

export function DealCard(props: DealCardProps) {
  const { deal } = props;
  const totalCents = deal.one_time_total_cents + deal.mrr_cents;
  const daysInStage = Math.max(1, Math.ceil((Date.now() - new Date(deal.updated_at).getTime()) / 86400000));

  return (
    <div
      onClick={props.onCardClick}
      className={cn(
        'rounded-lg border border-border/80 bg-card/96 p-3 text-foreground shadow-sm cursor-pointer',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing',
        props.isDragging && 'opacity-50 scale-95',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{deal.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {deal.client_company_name || 'Sem empresa'}
          </p>
        </div>
        <div className="flex items-center gap-0 flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); props.onScheduleMeeting(); }}
                className="gap-2"
              >
                <Calendar className="w-4 h-4 text-purple-500" /> Agendar Reunião
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); props.onOpenComments(); }}
                className="gap-2"
              >
                <MessageSquareText className="w-4 h-4 text-amber-500" /> Notas
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <ArrowRightLeft className="w-4 h-4" /> Mover para
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {props.stages.map((stage) => (
                    <DropdownMenuItem
                      key={stage.stage_code}
                      disabled={stage.stage_code === deal.stage_code}
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onMoveToStage(stage.stage_code);
                      }}
                    >
                      {STAGE_LABELS[stage.stage_code] || stage.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <div className="h-px bg-muted my-1" />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); props.onMarkWon(); }}
                className="gap-2 text-emerald-600"
              >
                <CheckCircle2 className="w-4 h-4" /> Fechou Contrato
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); props.onMarkLost(); }}
                className="gap-2 text-rose-600"
              >
                <CircleX className="w-4 h-4" /> Não Fechou
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <GripVertical className="w-4 h-4 text-muted-foreground/30 cursor-grab active:cursor-grabbing" />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {formatCurrencyBr(totalCents)}
        </span>
        <span>
          {daysInStage === 1 ? '1 dia' : `${daysInStage} dias`} nesta etapa
        </span>
      </div>

      {deal.notes && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2 italic">
          {deal.notes}
        </p>
      )}
    </div>
  );
}
