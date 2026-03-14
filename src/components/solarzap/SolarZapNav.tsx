import { cn } from '@/lib/utils';
import { ActiveTab } from '@/types/solarzap';
import { Bell, HelpCircle, Settings } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  desktopPrimaryNavItems,
  desktopSettingsAccountItems,
  desktopSettingsMainItems,
  getVisibleNavItems,
  type SolarZapNavActionId,
  type SolarZapTabPermissions,
} from './mobileNavConfig';

const PLAN_BADGE: Record<string, { label: string; color: string }> = {
  start: { label: 'Start', color: 'bg-sidebar-accent text-sidebar-foreground' },
  pro:   { label: 'Pro',   color: 'bg-primary/14 text-primary border border-primary/20' },
  scale: { label: 'Scale', color: 'bg-secondary/14 text-foreground border border-secondary/18' },
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
  tabPermissions?: SolarZapTabPermissions;
  onHelpClick?: () => void;
}

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
  const sidebarHoverClass = 'hover:bg-secondary/14 hover:text-secondary dark:hover:bg-primary/14 dark:hover:text-primary';
  const navContext = {
    tabPermissions: tp,
    isAdminUser,
    hasMultipleOrganizations,
  };
  const visiblePrimaryNavItems = getVisibleNavItems(desktopPrimaryNavItems, navContext);
  const visibleSettingsMainItems = getVisibleNavItems(desktopSettingsMainItems, navContext);
  const visibleSettingsAccountItems = getVisibleNavItems(desktopSettingsAccountItems, navContext);

  const handleActionItemClick = (actionId: SolarZapNavActionId) => {
    switch (actionId) {
      case 'admin_members':
        onAdminMembersClick?.();
        return;
      case 'switch_organization':
        onSwitchOrganization?.();
        return;
      case 'notifications':
        onNotificationsClick?.();
        return;
      case 'settings':
        return;
    }
  };

  return (
    <nav className="w-[60px] h-full border-r border-sidebar-border/70 bg-[linear-gradient(180deg,hsl(var(--sidebar-background)),hsl(var(--sidebar-accent))_135%)] flex flex-col items-center py-4 shadow-[18px_0_40px_-34px_rgba(15,23,42,0.16)] dark:shadow-[18px_0_40px_-34px_rgba(2,6,23,0.78)]">
      {/* Logo + Plan badge */}
      <div className="mb-8 flex flex-col items-center gap-1.5 p-2">
        <button
          type="button"
          data-testid="nav-help-tour"
          onClick={onHelpClick}
          className="brand-logo-disc relative group h-10 w-10 overflow-hidden hover:ring-2 hover:ring-primary/45 transition-all dark:shadow-[0_14px_26px_-18px_rgba(2,6,23,0.86)]"
          title="Iniciar Tour Guiado"
          aria-label="Iniciar Tour Guiado"
        >
          <img src="/logo.png" alt="SolarZap" className="brand-logo-image" />
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
        {visiblePrimaryNavItems.map((item) => {
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
                isActive
                    ? 'brand-gradient-bg text-primary-foreground shadow-[0_16px_34px_-16px_hsl(var(--primary)/0.52)] scale-105'
                    : cn('text-sidebar-foreground/58', sidebarHoverClass)
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
            'text-sidebar-foreground/58',
            sidebarHoverClass,
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
                'text-sidebar-foreground/58',
                sidebarHoverClass,
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
                  className="rounded-xl border border-sidebar-border bg-sidebar-accent px-2.5 py-2 text-xs text-sidebar-foreground"
                >
                  Empresa ativa: <span className="font-semibold">{activeOrganizationName}</span>
                </div>
              ) : null}

              {visibleSettingsMainItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    data-testid={item.testId}
                    onClick={() => {
                      if (item.type === 'tab') {
                        onTabChange(item.id);
                        return;
                      }

                      handleActionItemClick(item.id);
                    }}
                    className={getMenuItemClass()}
                    title={item.title ?? item.label}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    {item.label}
                  </button>
                );
              })}

              <div className="border-t my-1" />

              {visibleSettingsAccountItems.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    data-testid={item.testId}
                    onClick={() => {
                      if (item.type === 'tab') {
                        onTabChange(item.id);
                        return;
                      }

                      handleActionItemClick(item.id);
                    }}
                    className={getMenuItemClass()}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    {item.label}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}
