import React from 'react';
import { Phone, Video, Search, CheckSquare, Bot, UserCog } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { InstanceSelector } from './InstanceSelector';
import { Badge } from '@/components/ui/badge';

interface ChatHeaderActionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCall: () => void;
  onVideoCall: () => void;
  onSearch: () => void;
  onSelectMessages: () => void;
  // AI toggle
  aiEnabled: boolean;
  aiGlobalActive: boolean;
  aiInstanceDisabled: boolean;
  onToggleAi: (enabled: boolean) => void;
  // Instance selector
  isOrgManager: boolean;
  instances: any[];
  selectedInstanceId: string | null;
  onSelectInstance: (instance: any) => void;
  onUpdateInstanceColor: (instanceId: string, color: string) => Promise<void>;
}

export function ChatHeaderActionsDrawer({
  open,
  onOpenChange,
  onCall,
  onVideoCall,
  onSearch,
  onSelectMessages,
  aiEnabled,
  aiGlobalActive,
  aiInstanceDisabled,
  onToggleAi,
  isOrgManager,
  instances,
  selectedInstanceId,
  onSelectInstance,
  onUpdateInstanceColor,
}: ChatHeaderActionsDrawerProps) {
  const aiDisabled = !aiGlobalActive || aiInstanceDisabled;

  const actionItem = (icon: React.ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={() => { onClick(); onOpenChange(false); }}
      className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted transition-colors"
    >
      {icon}
      {label}
    </button>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[70vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>Ações</DrawerTitle>
        </DrawerHeader>
        <div className="space-y-1 px-2 pb-6">
          {/* AI Toggle */}
          <div className={cn(
            "flex items-center justify-between rounded-xl px-4 py-3",
            aiDisabled && "opacity-60"
          )}>
            <div className="flex items-center gap-3">
              {aiEnabled && !aiDisabled ? (
                <Bot className="w-5 h-5 text-primary" />
              ) : (
                <UserCog className="w-5 h-5 text-orange-500" />
              )}
              <span className="text-sm font-medium">
                {!aiGlobalActive ? 'IA Global Desativada' : aiInstanceDisabled ? 'IA da Instância Pausada' : aiEnabled ? 'IA Ativa' : 'IA Pausada'}
              </span>
            </div>
            <Switch
              checked={aiEnabled}
              onCheckedChange={onToggleAi}
              disabled={aiDisabled}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          {/* Instance Selector */}
          <div className="px-4 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-2">Instância WhatsApp</p>
            {isOrgManager ? (
              <InstanceSelector
                instances={instances}
                selectedInstanceId={selectedInstanceId}
                onSelect={(inst) => { onSelectInstance(inst); }}
                onUpdateColor={onUpdateInstanceColor}
              />
            ) : (
              <Badge variant="secondary" className="h-8 px-3 text-xs">
                {instances.find(i => i.id === selectedInstanceId)?.display_name ||
                  instances.find(i => i.id === selectedInstanceId)?.instance_name ||
                  'Instância atribuída'}
              </Badge>
            )}
          </div>

          <div className="h-px bg-border mx-4 my-1" />

          {actionItem(<Phone className="w-5 h-5 text-blue-500" />, 'Ligar', onCall)}
          {actionItem(<Video className="w-5 h-5 text-purple-500" />, 'Chamada de vídeo', onVideoCall)}
          {actionItem(<Search className="w-5 h-5 text-muted-foreground" />, 'Pesquisar mensagens', onSearch)}
          {actionItem(<CheckSquare className="w-5 h-5 text-muted-foreground" />, 'Selecionar mensagens', onSelectMessages)}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
