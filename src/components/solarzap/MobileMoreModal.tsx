import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, GripHorizontal } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ActiveTab } from '@/types/solarzap';

import {
  getVisibleNavItems,
  mobileMoreMainItems,
  mobileSettingsItems,
  type SolarZapNavActionId,
  type SolarZapTabPermissions,
} from './mobileNavConfig';

interface MobileMoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onNotificationsClick: () => void;
  unreadNotifications: number;
  tabPermissions: SolarZapTabPermissions;
  isAdminUser: boolean;
  onAdminMembersClick: () => void;
  hasMultipleOrganizations: boolean;
  onSwitchOrganization: () => void;
  activeOrganizationName?: string;
}

function MoreItemButton({
  label,
  Icon,
  badge,
  active,
  testId,
  onClick,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  active?: boolean;
  testId?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'relative flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background/65 px-3 py-4 text-center transition-colors',
        active ? 'border-primary/30 bg-primary/10' : 'hover:bg-muted/70',
      )}
    >
      <span className={cn('relative flex h-12 w-12 items-center justify-center rounded-2xl', active ? 'brand-gradient-bg text-primary-foreground' : 'bg-primary/10 text-primary')}>
        <Icon className="h-5 w-5" />
        {badge && badge > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground shadow-sm">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span className="text-xs font-medium leading-tight text-foreground">{label}</span>
    </button>
  );
}

export function MobileMoreModal({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  onNotificationsClick,
  unreadNotifications,
  tabPermissions,
  isAdminUser,
  onAdminMembersClick,
  hasMultipleOrganizations,
  onSwitchOrganization,
  activeOrganizationName,
}: MobileMoreModalProps) {
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShowSettings(false);
    }
  }, [isOpen]);

  const navContext = useMemo(
    () => ({
      tabPermissions,
      isAdminUser,
      hasMultipleOrganizations,
    }),
    [hasMultipleOrganizations, isAdminUser, tabPermissions],
  );

  const mainItems = useMemo(() => getVisibleNavItems(mobileMoreMainItems, navContext), [navContext]);
  const settingsItems = useMemo(() => getVisibleNavItems(mobileSettingsItems, navContext), [navContext]);

  const handleAction = (actionId: SolarZapNavActionId) => {
    switch (actionId) {
      case 'notifications':
        onNotificationsClick();
        onClose();
        return;
      case 'settings':
        setShowSettings(true);
        return;
      case 'admin_members':
        onAdminMembersClick();
        onClose();
        return;
      case 'switch_organization':
        onSwitchOrganization();
        onClose();
        return;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        data-testid="mobile-more-modal"
        className="left-0 top-auto z-50 w-full max-w-none translate-x-0 translate-y-0 gap-0 rounded-t-[28px] rounded-b-none border-x-0 border-b-0 p-0 sm:left-0 sm:top-auto sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-t-[28px] sm:rounded-b-none [&>button]:hidden"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))', maxHeight: 'min(70vh, calc(100dvh - 4rem - env(safe-area-inset-bottom)))' }}
      >
        <div className="rounded-t-[28px] bg-card/97 backdrop-blur-xl">
          <div className="flex justify-center pt-3">
            <span className="flex h-5 items-center justify-center text-muted-foreground/70">
              <GripHorizontal className="h-5 w-5" />
            </span>
          </div>

          <DialogHeader className="px-5 pb-2 pt-1 text-left">
            {showSettings ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-foreground transition-colors hover:bg-muted"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <DialogTitle>Configuracoes</DialogTitle>
                  <DialogDescription>Gerencie atalhos, conta e acessos administrativos.</DialogDescription>
                </div>
              </div>
            ) : (
              <>
                <DialogTitle>Mais</DialogTitle>
                <DialogDescription>Acesse as abas secundarias e acoes do workspace.</DialogDescription>
              </>
            )}
          </DialogHeader>

          {activeOrganizationName ? (
            <div className="px-5 pb-3">
              <div className="rounded-2xl border border-border/60 bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
                Empresa ativa: <span className="font-semibold text-foreground">{activeOrganizationName}</span>
              </div>
            </div>
          ) : null}

          <div className="max-h-[calc(70vh-5rem)] overflow-y-auto px-5 pb-5">
            {!showSettings ? (
              <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <div className="grid grid-cols-2 gap-3">
                  {mainItems.map((item) => {
                    const Icon = item.icon;
                    const isTabActive = item.type === 'tab' ? activeTab === item.id : false;
                    const badge = item.type === 'action' && item.id === 'notifications' ? unreadNotifications : undefined;

                    return (
                      <MoreItemButton
                        key={item.id}
                        label={item.label}
                        Icon={Icon}
                        badge={badge}
                        active={isTabActive}
                        testId={`mobile-more-item-${item.id}`}
                        onClick={() => {
                          if (item.type === 'tab') {
                            onTabChange(item.id);
                            onClose();
                            return;
                          }

                          handleAction(item.id);
                        }}
                      />
                    );
                  })}
                </div>

                {settingsItems.length > 0 ? (
                  <div className="mt-4 border-t border-border/60 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowSettings(true)}
                      className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-background/65 px-4 py-3 text-left transition-colors hover:bg-muted/70"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">Configuracoes</p>
                        <p className="text-xs text-muted-foreground">Conta, IA, integracoes e equipe</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <div className="grid grid-cols-2 gap-3">
                  {settingsItems.map((item) => {
                    const Icon = item.icon;
                    const isTabActive = item.type === 'tab' ? activeTab === item.id : false;

                    return (
                      <MoreItemButton
                        key={item.id}
                        label={item.label}
                        Icon={Icon}
                        active={isTabActive}
                        testId={`mobile-more-item-${item.id}`}
                        onClick={() => {
                          if (item.type === 'tab') {
                            onTabChange(item.id);
                            onClose();
                            return;
                          }

                          handleAction(item.id);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}