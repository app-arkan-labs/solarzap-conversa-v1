import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useMobileViewport } from '@/hooks/useMobileViewport';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actionContent?: ReactNode;
  /** Compact toolbar shown below the header on mobile (replaces actionContent) */
  mobileToolbar?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, icon: Icon, actionContent, mobileToolbar, className }: PageHeaderProps) {
  const isMobile = useMobileViewport();
  const location = useLocation();
  const isInternalCrmRoute = location.pathname.startsWith('/admin/crm');
  const compactToolbarContent = isMobile ? (mobileToolbar ?? actionContent) : (actionContent ?? mobileToolbar);

  if (isInternalCrmRoute) {
    if (!compactToolbarContent) return null;

    return (
      <div className={cn('flex-shrink-0', className)}>
        <div className="rounded-[22px] border border-border/60 bg-card/82 px-4 py-3 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.22)] backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {compactToolbarContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn("brand-gradient-soft border-b border-border/70 flex-shrink-0 z-10 backdrop-blur-sm", className)}>
        <div className={cn("w-full", isMobile ? "px-4 py-2.5" : "px-6 py-5")}>
          <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-3">
              {!isMobile && (
                <div className="brand-gradient-bg w-12 h-12 rounded-2xl flex items-center justify-center shadow-[0_18px_42px_-20px_hsl(var(--primary)/0.45)] flex-shrink-0 animate-scale-in">
                  <Icon className="w-6 h-6 text-white" />
                </div>
              )}
              <div className={isMobile ? undefined : "animate-fade-up"}>
                <h1 className={cn("font-bold text-foreground tracking-tight", isMobile ? "text-lg" : "text-2xl")}>{title}</h1>
                {subtitle && !isMobile && <p className="text-sm text-muted-foreground">{subtitle}</p>}
              </div>
            </div>
            {isMobile ? (
              mobileToolbar ?? null
            ) : (
              actionContent && (
                <div className="flex items-center gap-3 animate-fade-up animate-stagger-1 w-full sm:w-auto mt-4 sm:mt-0">
                  {actionContent}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
