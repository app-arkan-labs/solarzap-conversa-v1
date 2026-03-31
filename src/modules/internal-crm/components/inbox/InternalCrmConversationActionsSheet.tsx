import { Archive, Calendar, CheckCheck, Kanban, MessageSquare, Phone, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type {
  InternalCrmClientDetail,
  InternalCrmConversationSummary,
} from '@/modules/internal-crm/types';

type InternalCrmConversationActionsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: InternalCrmConversationSummary | null;
  detail: InternalCrmClientDetail | null;
  onUpdateStatus: (status: 'open' | 'resolved' | 'archived') => void;
  onScheduleMeeting: () => void;
  onOpenComments: () => void;
  onNavigatePipeline: () => void;
  isUpdatingStatus?: boolean;
};

export function InternalCrmConversationActionsSheet(props: InternalCrmConversationActionsSheetProps) {
  const client = props.detail?.client;
  const isResolved = props.conversation?.status === 'resolved';
  const isArchived = props.conversation?.status === 'archived';

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
      label: 'Vídeo',
      icon: Video,
      className: 'bg-cyan-500 hover:bg-cyan-600 text-white',
      onClick: () => {},
    },
    {
      id: 'schedule',
      label: 'Reunião',
      icon: Calendar,
      className: 'bg-purple-500 hover:bg-purple-600 text-white',
      onClick: () => { props.onScheduleMeeting(); props.onOpenChange(false); },
    },
    {
      id: 'comments',
      label: 'Notas',
      icon: MessageSquare,
      className: 'bg-secondary hover:bg-secondary/80 text-secondary-foreground',
      onClick: () => { props.onOpenComments(); props.onOpenChange(false); },
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: Kanban,
      className: 'bg-indigo-500 hover:bg-indigo-600 text-white',
      onClick: () => { props.onNavigatePipeline(); props.onOpenChange(false); },
    },
    {
      id: 'resolve',
      label: isResolved || isArchived ? 'Reabrir' : 'Resolver',
      icon: isResolved || isArchived ? CheckCheck : CheckCheck,
      className: isResolved || isArchived ? 'bg-sky-500 hover:bg-sky-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white',
      onClick: () => { props.onUpdateStatus(isResolved || isArchived ? 'open' : 'resolved'); props.onOpenChange(false); },
    },
  ];

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ações</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Client summary */}
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold">{client?.company_name || props.conversation?.client_company_name || 'Cliente'}</p>
            <p className="text-muted-foreground">{client?.primary_phone || props.conversation?.primary_phone || '-'}</p>
          </div>

          {/* Quick actions grid */}
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
                  disabled={action.id === 'resolve' && props.isUpdatingStatus}
                >
                  <Icon className="h-4 w-4" />
                  {action.label}
                </Button>
              );
            })}
          </div>

          {/* Archive button */}
          {props.conversation?.status !== 'archived' ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { props.onUpdateStatus('archived'); props.onOpenChange(false); }}
              disabled={props.isUpdatingStatus}
            >
              <Archive className="mr-2 h-4 w-4" />
              Arquivar conversa
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
