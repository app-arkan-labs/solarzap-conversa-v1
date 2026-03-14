import { Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ActiveTab } from '@/types/solarzap';

import { mobilePrimaryNavItems } from './mobileNavConfig';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onMorePress: () => void;
  unreadCount?: number;
  isMoreActive: boolean;
}

export function MobileBottomNav({
  activeTab,
  onTabChange,
  onMorePress,
  unreadCount = 0,
  isMoreActive,
}: MobileBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/95 backdrop-blur-xl supports-[padding:max(0px)]:pb-[env(safe-area-inset-bottom)]">
      <div className="grid h-16 grid-cols-4 px-2">
        {mobilePrimaryNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isConversationsTab = item.id === 'conversas';

          return (
            <button
              key={item.id}
              type="button"
              data-testid={`mobile-nav-tab-${item.id}`}
              aria-label={item.label}
              onClick={() => onTabChange(item.id)}
              className="relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition-colors"
            >
              <span
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200',
                  isActive
                    ? 'brand-gradient-bg text-primary-foreground shadow-[0_14px_30px_-16px_hsl(var(--primary)/0.56)]'
                    : 'text-muted-foreground/70',
                )}
              >
                <Icon className={cn('h-5 w-5 transition-transform duration-200', isActive ? 'scale-110' : '')} />
                {isConversationsTab && unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </span>
              <span className={cn(isActive ? 'text-foreground' : 'text-muted-foreground')}>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          data-testid="mobile-nav-tab-more"
          aria-label="Mais"
          onClick={onMorePress}
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition-colors"
        >
          <span
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200',
              isMoreActive
                ? 'brand-gradient-bg border-transparent text-primary-foreground shadow-[0_14px_30px_-16px_hsl(var(--primary)/0.56)]'
                : 'border-border/60 bg-muted/50 text-muted-foreground',
            )}
          >
            <Plus className="h-5 w-5" />
          </span>
          <span className={cn(isMoreActive ? 'text-foreground' : 'text-muted-foreground')}>Mais</span>
        </button>
      </div>
    </nav>
  );
}