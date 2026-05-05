import { Calendar, Kanban, MessageSquare, Phone, PhoneCall, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { resolveInternalCrmPipelineStageView } from '@/modules/internal-crm/lib/inboxStage';
import type {
  InternalCrmClientDetail,
  InternalCrmConversationSummary,
} from '@/modules/internal-crm/types';

type InternalCrmConversationActionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: InternalCrmConversationSummary | null;
  detail: InternalCrmClientDetail | null;
  onScheduleMeeting: () => void;
  onScheduleCall: () => void;
  onOpenComments: () => void;
  onNavigatePipeline: () => void;
};

export function InternalCrmConversationActionsSheet(props: InternalCrmConversationActionsSheetProps) {
  const client = props.detail?.client;
  const stageView = resolveInternalCrmPipelineStageView({
    conversation: props.conversation,
    detail: props.detail,
  });

  const quickActions = [
    {
      id: 'call',
      label: 'Ligar',
      icon: Phone,
      className: 'bg-blue-500 hover:bg-blue-600 text-white',
      onClick: () => {
        const phone = client?.primary_phone || props.conversation?.primary_phone;
        if (phone) window.open(`tel:${phone}`);
      },
    },
    {
      id: 'video',
      label: 'Video',
      icon: Video,
      className: 'bg-cyan-500 hover:bg-cyan-600 text-white',
      onClick: () => {
        window.open('https://meet.google.com/new', '_blank');
      },
    },
    {
      id: 'schedule',
      label: 'Reuniao',
      icon: Calendar,
      className: 'bg-purple-500 hover:bg-purple-600 text-white',
      onClick: () => {
        props.onScheduleMeeting();
        props.onOpenChange(false);
      },
    },
    {
      id: 'schedule_call',
      label: 'Chamada',
      icon: PhoneCall,
      className: 'bg-orange-500 hover:bg-orange-600 text-white',
      onClick: () => {
        props.onScheduleCall();
        props.onOpenChange(false);
      },
    },
    {
      id: 'comments',
      label: 'Comentarios',
      icon: MessageSquare,
      className: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground',
      onClick: () => {
        props.onOpenComments();
        props.onOpenChange(false);
      },
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: Kanban,
      className: 'bg-indigo-500 hover:bg-indigo-600 text-white',
      onClick: () => {
        props.onNavigatePipeline();
        props.onOpenChange(false);
      },
    },
  ];

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Acoes do Cliente</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <div className="space-y-2 text-sm">
            <p className="font-semibold">{client?.company_name || props.conversation?.client_company_name || 'Cliente'}</p>
            <p className="text-muted-foreground">{client?.primary_phone || props.conversation?.primary_phone || '-'}</p>
            <span
              className="inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold text-white"
              style={{ backgroundColor: stageView.color }}
            >
              {stageView.label}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  variant="secondary"
                  size="sm"
                  className={`h-auto flex-col gap-1 py-3 text-[11px] font-medium ${action.className}`}
                  onClick={action.onClick}
                >
                  <Icon className="h-4 w-4" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
