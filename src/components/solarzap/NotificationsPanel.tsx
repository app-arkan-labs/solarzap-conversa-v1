import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Notification, NOTIFICATION_CONFIG } from '@/types/notifications';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { X, Check, CheckCheck, Trash2, Bell, BellOff, Settings2, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { NotificationConfigPanel } from './NotificationConfigPanel';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface NotificationsPanelProps {
  notifications: Notification[];
  isOpen: boolean;
  onClose: () => void;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onGoToContact?: (contactId: string) => void;
  onConfirmInstallmentPaid?: (installmentId: string) => Promise<void>;
  onRescheduleInstallment?: (installmentId: string, newDueOn: string) => Promise<void>;
}

export function NotificationsPanel({
  notifications,
  isOpen,
  onClose,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  onGoToContact,
  onConfirmInstallmentPaid,
  onRescheduleInstallment,
}: NotificationsPanelProps) {
  const { toast } = useToast();
  const [showConfig, setShowConfig] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Notification | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const unreadNotifications = notifications.filter(n => !n.isRead);
  const readNotifications = notifications.filter(n => n.isRead);

  const handleConfirmInstallment = async (notification: Notification) => {
    if (!notification.installmentId || !onConfirmInstallmentPaid) return;

    setActionLoadingId(notification.id);
    try {
      await onConfirmInstallmentPaid(notification.installmentId);
      onMarkAsRead(notification.id);
      toast({
        title: 'Parcela confirmada',
        description: 'Recebimento registrado no faturamento e lucro.',
      });
    } catch (error) {
      toast({
        title: 'Falha ao confirmar parcela',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenReschedule = (notification: Notification) => {
    if (!notification.installmentId) return;
    setRescheduleTarget(notification);
    setRescheduleDate(notification.dueOn || '');
  };

  const renderNotification = (notification: Notification) => {
    const config = NOTIFICATION_CONFIG[notification.type];
    const timeAgo = formatDistanceToNow(notification.createdAt, {
      addSuffix: true,
      locale: ptBR
    });
    const isInstallmentAction = notification.type === 'installment_due_check' && notification.requiresAction;
    const isActionLoading = actionLoadingId === notification.id;

    return (
      <div
        key={notification.id}
        className={cn(
          'p-3 border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer',
          !notification.isRead && 'bg-primary/5'
        )}
        onClick={() => {
          onMarkAsRead(notification.id);
          if (notification.contactId && onGoToContact) {
            onGoToContact(notification.contactId);
            onClose();
          }
        }}
      >
        <div className="flex items-start gap-3">
          {/* Priority indicator */}
          <div className={cn(
            'w-2 h-2 rounded-full mt-2 flex-shrink-0',
            notification.priority === 'urgent' && 'bg-red-500 animate-pulse',
            notification.priority === 'high' && 'bg-orange-500',
            notification.priority === 'medium' && 'bg-blue-500',
            notification.priority === 'low' && 'bg-gray-400',
          )} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base">{config.icon}</span>
              <span className={cn(
                'text-sm font-medium',
                !notification.isRead ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {notification.title}
              </span>
              {!notification.isRead && (
                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {notification.message}
            </p>
            <span className="text-xs text-muted-foreground/70 mt-1 block">
              {timeAgo}
            </span>

            {isInstallmentAction && notification.installmentId ? (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isActionLoading || !onConfirmInstallmentPaid}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleConfirmInstallment(notification);
                  }}
                >
                  {isActionLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  Parcela paga
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={isActionLoading || !onRescheduleInstallment}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleOpenReschedule(notification);
                  }}
                >
                  Nao paga
                </Button>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {!notification.isRead && !isInstallmentAction && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkAsRead(notification.id);
                }}
                title="Marcar como lida"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            )}
            {!isInstallmentAction ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(notification.id);
                }}
                title="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const handleClose = () => {
    setShowConfig(false);
    setRescheduleTarget(null);
    setRescheduleDate('');
    onClose();
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleTarget?.installmentId || !onRescheduleInstallment) return;
    if (!rescheduleDate) {
      toast({
        title: 'Nova data obrigatoria',
        description: 'Informe a nova data para reagendar a cobranca.',
        variant: 'destructive',
      });
      return;
    }

    setActionLoadingId(rescheduleTarget.id);
    try {
      await onRescheduleInstallment(rescheduleTarget.installmentId, rescheduleDate);
      onMarkAsRead(rescheduleTarget.id);
      toast({
        title: 'Parcela reagendada',
        description: 'Novo ciclo de cobranca criado com sucesso.',
      });
      setRescheduleTarget(null);
      setRescheduleDate('');
    } catch (error) {
      toast({
        title: 'Falha ao reagendar parcela',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={handleClose}
      />

      {/* Panel container — expands when config is open */}
      <div className="fixed left-[60px] top-0 h-full z-50 flex shadow-xl animate-in slide-in-from-left-2 duration-200">

        {/* ── Notifications list (always visible) ── */}
        <div className="w-80 bg-background border-r border-border flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">Notificações</h2>
              {unreadNotifications.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                  {unreadNotifications.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-8 w-8', showConfig && 'bg-primary/10 text-primary')}
                onClick={() => setShowConfig(!showConfig)}
                data-testid="notifications-open-settings"
                title="Configurações de Notificações"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Actions bar */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-b border-border flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1.5"
                onClick={onMarkAllAsRead}
                disabled={unreadNotifications.length === 0}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como lidas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={onClearAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar
              </Button>
            </div>
          )}

          {/* Notifications list */}
          <ScrollArea className="flex-1">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <BellOff className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground text-center">
                  Nenhuma notificação
                </p>
                <p className="text-xs text-muted-foreground/70 text-center mt-1">
                  Você receberá alertas quando houver ações importantes
                </p>
              </div>
            ) : (
              <div>
                {unreadNotifications.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-muted/30">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Novas ({unreadNotifications.length})
                      </span>
                    </div>
                    {unreadNotifications.map(renderNotification)}
                  </div>
                )}
                {readNotifications.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-muted/30">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Anteriores
                      </span>
                    </div>
                    {readNotifications.slice(0, 20).map(renderNotification)}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ── Config panel (slides in alongside) ── */}
        {showConfig && (
          <div className="w-full max-w-full animate-in slide-in-from-left-4 duration-300 sm:w-[360px]">
            <NotificationConfigPanel onClose={() => setShowConfig(false)} />
          </div>
        )}
      </div>

      <Dialog open={!!rescheduleTarget} onOpenChange={(open) => !open && setRescheduleTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reagendar parcela</DialogTitle>
            <DialogDescription>
              Informe a nova data de cobranca para manter o ciclo de confirmacao ativo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reschedule-date">Nova data (obrigatoria)</Label>
            <Input
              id="reschedule-date"
              type="date"
              value={rescheduleDate}
              onChange={(event) => setRescheduleDate(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRescheduleTarget(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => { void handleRescheduleSubmit(); }}
              disabled={actionLoadingId === rescheduleTarget?.id}
            >
              {actionLoadingId === rescheduleTarget?.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar nova data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
