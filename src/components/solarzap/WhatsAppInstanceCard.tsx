import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  Smartphone,
  MoreVertical,
  QrCode,
  Power,
  Trash2,
  Edit3,
  Loader2,
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { UserWhatsAppInstance as WhatsAppInstance } from '@/hooks/useUserWhatsAppInstances';
import { useAISettings } from '@/hooks/useAISettings'; // New Import

interface WhatsAppInstanceCardProps {
  instance: WhatsAppInstance;
  isLoading: boolean;
  onReconnect: (instanceId: string) => void;
  onDisconnect: (instanceId: string) => void;
  onRequestDelete: (instance: WhatsAppInstance) => void;
  onRename: (instanceId: string, newName: string) => void;
  onToggleAiEnabled: (instanceName: string, enabled: boolean) => void;
}

export function WhatsAppInstanceCard({
  instance,
  isLoading,
  onReconnect,
  onDisconnect,
  onRequestDelete,
  onRename,
  onToggleAiEnabled,
}: WhatsAppInstanceCardProps) {
  const { settings: aiSettings } = useAISettings(); // Get Global Settings
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState(instance.display_name);

  const statusConfig = {
    connected: {
      label: 'Conectado',
      color: 'bg-green-500',
      badgeClass: 'bg-green-500/10 text-green-600 border-green-500/20',
      icon: CheckCircle2,
    },
    connecting: {
      label: 'Conectando',
      color: 'bg-yellow-500',
      badgeClass: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      icon: Clock,
    },
    disconnected: {
      label: 'Desconectado',
      color: 'bg-muted-foreground/50',
      badgeClass: 'bg-muted text-muted-foreground border-muted',
      icon: XCircle,
    },
  };

  const status = statusConfig[instance.status];
  const StatusIcon = status.icon;

  const handleRename = () => {
    if (newName.trim() && newName !== instance.display_name) {
      onRename(instance.id, newName.trim());
    }
    setRenameDialogOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          "rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md",
          instance.status === 'connected' && "border-green-500/30 bg-green-500/5"
        )}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            {/* Left: Status indicator + Info */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                instance.status === 'connected' ? "bg-green-500/20" : "bg-muted"
              )}>
                <Smartphone className={cn(
                  "w-5 h-5",
                  instance.status === 'connected' ? "text-green-600" : "text-muted-foreground"
                )} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium text-sm truncate">{instance.display_name}</h4>
                  <Badge variant="outline" className={cn("text-xs shrink-0", status.badgeClass)}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {status.label}
                  </Badge>
                </div>

                {instance.phone_number ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" />
                    {instance.phone_number}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    {instance.status === 'connecting' ? 'Aguardando conexão...' : 'Não conectado'}
                  </p>
                )}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* AI Toggle */}
              <div className="flex items-center gap-2 mr-2 px-2 py-1"
                title="Ativar/Desativar IA para esta instância"
              >
                <span className="font-medium text-muted-foreground">IA</span>
                <Switch
                  checked={!!instance.ai_enabled}
                  onCheckedChange={(checked) => onToggleAiEnabled(instance.instance_name, checked)}
                  disabled={isLoading}
                  className="scale-75 origin-right data-[state=checked]:bg-green-500"
                />
              </div>

              {instance.status === 'disconnected' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReconnect(instance.id)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-1" />
                      Reconectar
                    </>
                  )}
                </Button>
              )}

              {instance.status === 'connecting' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onReconnect(instance.id)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-1" />
                      Ver QR
                    </>
                  )}
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={(e) => {
                    e.preventDefault();
                    setNewName(instance.display_name);
                    setRenameDialogOpen(true);
                  }}>
                    <Edit3 className="w-4 h-4 mr-2" />
                    Renomear
                  </DropdownMenuItem>

                  {instance.status === 'connected' && (
                    <DropdownMenuItem
                      onClick={() => onDisconnect(instance.id)}
                      className="text-yellow-600"
                    >
                      <Power className="w-4 h-4 mr-2" />
                      Desconectar
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      import.meta.env.DEV && console.log('Dropdown Delete Clicked:', instance.instance_name);
                      onRequestDelete(instance);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 z-50"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  import.meta.env.DEV && console.log('Delete Clicked:', instance.instance_name);
                  onRequestDelete(instance);
                }}
                disabled={isLoading}
                title="Excluir Instância"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Rename Dialog (kept local as it's less critical, but could be moved too) */}
      <AlertDialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renomear instância</AlertDialogTitle>
            <AlertDialogDescription>
              Digite um novo nome para identificar esta instância.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex: Vendas, Suporte, Atendimento..."
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename}>
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
