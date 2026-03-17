import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type AuthContextBadgeProps = {
  icon: LucideIcon;
  label: string;
  className?: string;
};

export default function AuthContextBadge({ icon: Icon, label, className }: AuthContextBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-primary/18 bg-primary/10 px-3 py-1.5 text-xs font-semibold tracking-[0.14em] text-primary uppercase',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}