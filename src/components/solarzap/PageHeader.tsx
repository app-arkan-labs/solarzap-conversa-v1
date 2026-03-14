import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actionContent?: ReactNode;
  className?: string; // for custom overriding if needed
}

export function PageHeader({ title, subtitle, icon: Icon, actionContent, className }: PageHeaderProps) {
  return (
    <div className={cn("brand-gradient-soft border-b border-border/70 flex-shrink-0 z-10 backdrop-blur-sm", className)}>
      <div className="w-full px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-4">
            <div className="brand-gradient-bg w-12 h-12 rounded-2xl flex items-center justify-center shadow-[0_18px_42px_-20px_hsl(var(--primary)/0.45)] flex-shrink-0 animate-scale-in">
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div className="animate-fade-up">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actionContent && (
            <div className="flex items-center gap-3 animate-fade-up animate-stagger-1 w-full sm:w-auto mt-4 sm:mt-0">
              {actionContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
