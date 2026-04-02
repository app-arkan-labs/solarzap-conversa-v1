import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type InternalCrmPageLayoutProps = {
  children: ReactNode;
  mode?: 'standard' | 'immersive';
  className?: string;
};

export function InternalCrmPageLayout({
  children,
  mode = 'standard',
  className,
}: InternalCrmPageLayoutProps) {
  if (mode === 'immersive') {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className={cn('mx-auto flex h-full min-h-0 w-full flex-1 max-w-[1680px] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5', className)}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn('mx-auto flex min-h-0 h-full w-full flex-1 max-w-[1680px] flex-col gap-6 overflow-auto px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5', className)}>
        {children}
      </div>
    </div>
  );
}

export function InternalCrmFilterBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[26px] border border-border/60 bg-card/84 p-4 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.22)] backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
}

export function InternalCrmPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-border/60 bg-card/88 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.24)] backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
}

export function InternalCrmCompactBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[22px] border border-border/60 bg-card/82 px-4 py-3 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.22)] backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
}
