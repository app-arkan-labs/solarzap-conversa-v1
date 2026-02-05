import { cn } from '@/lib/utils';
import { ActiveTab } from '@/types/solarzap';
import { MessageCircle, Kanban, Calendar, Users, BarChart3, Sun, Bell, Settings, Plug, Zap, Brain, BrainCircuit } from 'lucide-react';
import { GoogleAccountButton } from './GoogleAccountButton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface SolarZapNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  unreadNotifications?: number;
  onNotificationsClick?: () => void;
}

const navItems: { id: ActiveTab; icon: typeof MessageCircle; label: string }[] = [
  { id: 'conversas', icon: MessageCircle, label: 'Conversas' },
  { id: 'pipelines', icon: Kanban, label: 'Pipelines' },
  { id: 'calendario', icon: Calendar, label: 'Calendário' },
  { id: 'contatos', icon: Users, label: 'Contatos' },
  { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
  { id: 'ia_agentes', icon: BrainCircuit, label: 'Inteligência Artificial' },
];

export function SolarZapNav({
  activeTab,
  onTabChange,
  unreadNotifications = 0,
  onNotificationsClick
}: SolarZapNavProps) {
  return (
    <nav className="w-[60px] h-full bg-secondary flex flex-col items-center py-4">
      {/* Logo */}
      <div className="mb-8 p-2">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
          <Sun className="w-6 h-6 text-primary-foreground" />
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200',
                'hover:bg-sidebar-accent',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-whatsapp-gray hover:text-sidebar-foreground'
              )}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>

      {/* Notifications Button */}
      <div className="mt-auto mb-2">
        <button
          onClick={onNotificationsClick}
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 relative',
            'hover:bg-sidebar-accent text-whatsapp-gray hover:text-sidebar-foreground'
          )}
          title="Notificações"
        >
          <Bell className="w-5 h-5" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full">
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          )}
        </button>
      </div>

      {/* Settings with clean integration menu */}
      <div className="mb-4">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200',
                'hover:bg-sidebar-accent text-whatsapp-gray hover:text-sidebar-foreground'
              )}
              title="Configurações"
            >
              <Settings className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-64 p-3">
            <div className="space-y-2">
              <button
                onClick={() => onTabChange('automacoes')}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                Automações
              </button>

              <button
                onClick={() => onTabChange('integracoes')}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Plug className="w-4 h-4 text-primary" />
                </div>
                Central de Integrações
              </button>

              <button
                onClick={() => onTabChange('banco_ia')}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-primary" />
                </div>
                Banco de Dados
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* User avatar */}
      <div className="pb-4">
        <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
          <span className="text-xs font-medium text-sidebar-foreground">RM</span>
        </div>
      </div>
    </nav>
  );
}
