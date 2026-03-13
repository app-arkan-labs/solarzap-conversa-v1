import { cn } from '@/lib/utils';
import { ActiveTab } from '@/types/solarzap';
import { MessageCircle, Kanban, Calendar, Users, Send, FileText, BarChart3, Bell, Settings, Plug, Zap, Brain, Bot, UserCog, User, Building2, Activity, CreditCard, HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const PLAN_BADGE: Record<string, { label: string; color: string }> = {
  start: { label: 'Start', color: 'bg-slate-600/80 text-slate-100' },
  pro:   { label: 'Pro',   color: 'bg-emerald-600/80 text-emerald-100' },
  scale: { label: 'Scale', color: 'bg-violet-600/80 text-violet-100' },
};

interface SolarZapNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  unreadNotifications?: number;
  onNotificationsClick?: () => void;
  isAdminUser?: boolean;
  onAdminMembersClick?: () => void;
  hasMultipleOrganizations?: boolean;
  onSwitchOrganization?: () => void;
  activeOrganizationName?: string;
  userAvatarUrl?: string | null;
  userDisplayName?: string;
  currentPlanKey?: string | null;
  tabPermissions?: {
    ia_agentes: boolean;
    automacoes: boolean;
    integracoes: boolean;
    tracking: boolean;
    banco_ia: boolean;
    minha_conta: boolean;
    meu_plano: boolean;
  };
  onHelpClick?: () => void;
}

const navItems: { id: ActiveTab; icon: typeof MessageCircle; label: string }[] = [
  { id: 'conversas', icon: MessageCircle, label: 'Conversas' },
  { id: 'pipelines', icon: Kanban, label: 'Pipelines' },
  { id: 'calendario', icon: Calendar, label: 'Calendário' },
  { id: 'contatos', icon: Users, label: 'Contatos' },
  { id: 'disparos', icon: Send, label: 'Disparos' },
  { id: 'propostas', icon: FileText, label: 'Propostas' },
  { id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
];

export function SolarZapNav({
  activeTab,
  onTabChange,
  unreadNotifications = 0,
  onNotificationsClick,
  isAdminUser = false,
  onAdminMembersClick,
  hasMultipleOrganizations = false,
  onSwitchOrganization,
  activeOrganizationName,
  userAvatarUrl,
  userDisplayName,
  tabPermissions,
  currentPlanKey,
  onHelpClick,
}: SolarZapNavProps) {
  const tp = tabPermissions ?? { ia_agentes: true, automacoes: true, integracoes: true, tracking: true, banco_ia: true, minha_conta: true, meu_plano: true };
  const planBadge = currentPlanKey ? PLAN_BADGE[currentPlanKey] : null;
  const normalizedAvatarUrl = typeof userAvatarUrl === 'string' && userAvatarUrl.trim().length > 0
    ? userAvatarUrl.trim()
    : null;
  const userInitial = userDisplayName?.trim().charAt(0).toUpperCase() || '';
  const getMenuItemClass = () => cn(
    'w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-sm font-medium',
    'hover:bg-muted text-foreground',
  );
  return (
    <nav className="w-[60px] h-full bg-secondary flex flex-col items-center py-4">
      {/* Logo + Plan badge */}
      <div className="mb-8 flex flex-col items-center gap-1.5 p-2">
        <button
          type="button"
          data-testid="nav-help-tour"
          onClick={onHelpClick}
          className="rounded-full overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all relative group"
          title="Iniciar Tour Guiado"
          aria-label="Iniciar Tour Guiado"
        >
          <img src="/logo.png" alt="SolarZap" className="w-10 h-10 rounded-full object-cover" />
          <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/20">
            <HelpCircle className="w-4 h-4 text-white" />
          </span>
        </button>
        {planBadge ? (
          <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', planBadge.color)}>
            {planBadge.label}
          </span>
        ) : null}
      </div>

      {/* Navigation Items */}
      <div className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              data-testid={`nav-tab-${item.id}`}
              aria-label={item.label}
              onClick={() => onTabChange(item.id)}
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative group',
                'hover:bg-primary/10',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105'
                  : 'text-whatsapp-gray hover:text-primary'
              )}
              title={item.label}
            >
              <Icon className={cn(
                "w-5 h-5 transition-transform duration-300",
                isActive ? "scale-110" : "group-hover:scale-110"
              )} />
            </button>
          );
        })}
      </div>

      {/* Notifications Button */}
      <div className="mt-auto mb-2">
        <button
          onClick={onNotificationsClick}
          data-testid="nav-notifications-trigger"
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative group',
            'hover:bg-primary/10 text-whatsapp-gray hover:text-primary'
          )}
          title="Notificações"
        >
          <Bell className="w-5 h-5 transition-transform duration-300 group-hover:scale-110" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full animate-bounce shadow-sm">
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
              data-testid="nav-settings-trigger"
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group',
                'hover:bg-primary/10 text-whatsapp-gray hover:text-primary'
              )}
              title="Configurações"
            >
              <Settings className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-64 p-3">
            <div className="space-y-2">
              {activeOrganizationName ? (
                <div
                  data-testid="active-org-name"
                  className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 text-xs text-green-800"
                >
                  Empresa ativa: <span className="font-semibold">{activeOrganizationName}</span>
                </div>
              ) : null}

              {isAdminUser && (
                <button
                  data-testid="nav-admin-members"
                  onClick={onAdminMembersClick}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <UserCog className="w-4 h-4 text-primary" />
                  </div>
                  Gestão de Equipe
                </button>
              )}

              {tp.ia_agentes ? (
                <button
                  data-testid="nav-ia-agentes"
                  onClick={() => onTabChange('ia_agentes')}
                  className={getMenuItemClass()}
                  title="Inteligencia Artificial"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  Inteligência Artificial
                </button>
              ) : null}

              {tp.automacoes ? (
                <button
                  data-testid="nav-automacoes"
                  onClick={() => onTabChange('automacoes')}
                  className={getMenuItemClass()}
                  title="Automacoes"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  Automações
                </button>
              ) : null}

              {tp.tracking ? (
                <button
                  data-testid="nav-tracking"
                  onClick={() => onTabChange('tracking')}
                  className={getMenuItemClass()}
                  title="Tracking e Conversoes"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-primary" />
                  </div>
                  Tracking e Conversões
                </button>
              ) : null}

              {tp.integracoes ? (
                <button
                  data-testid="nav-integracoes"
                  onClick={() => onTabChange('integracoes')}
                  className={getMenuItemClass()}
                  title="Central de Integracoes"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Plug className="w-4 h-4 text-primary" />
                  </div>
                  Central de Integrações
                </button>
              ) : null}

              {tp.banco_ia ? (
                <button
                  onClick={() => onTabChange('banco_ia')}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Brain className="w-4 h-4 text-primary" />
                  </div>
                  Minha Empresa
                </button>
              ) : null}

              <div className="border-t my-1" />

              {tp.meu_plano ? (
                <button
                  data-testid="nav-menu-meu-plano"
                  onClick={() => onTabChange('meu_plano')}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-primary" />
                  </div>
                  Meu Plano
                </button>
              ) : null}

              {tp.minha_conta ? (
                <button
                  data-testid="nav-menu-minha-conta"
                  onClick={() => onTabChange('minha_conta')}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  Minha Conta
                </button>
              ) : null}

              {hasMultipleOrganizations ? (
                <button
                  data-testid="nav-switch-org"
                  onClick={onSwitchOrganization}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-foreground"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  Trocar Empresa
                </button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* User avatar */}
      {tp.minha_conta && (
        <div className="pb-4">
          <button
            data-testid="nav-account-trigger"
            onClick={() => onTabChange('minha_conta')}
            className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
            title="Minha Conta"
          >
            {normalizedAvatarUrl ? (
              <img
                src={normalizedAvatarUrl}
                alt="Avatar do usuario"
                data-testid="nav-account-avatar-image"
                className="h-full w-full object-cover"
              />
            ) : userInitial ? (
              <span className="text-xs font-semibold text-sidebar-foreground">{userInitial}</span>
            ) : (
              <User className="w-4 h-4 text-sidebar-foreground" />
            )}
          </button>
        </div>
      )}
    </nav>
  );
}
