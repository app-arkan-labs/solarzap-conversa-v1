import { cn } from "@/lib/utils";
import {
  DASHBOARD_VIEW_OPTIONS,
  type DashboardVisualization,
} from "@/lib/dashboardViews";

interface DashboardNavProps {
  value: DashboardVisualization;
  onChange: (view: DashboardVisualization) => void;
  compact?: boolean;
  className?: string;
}

export function DashboardNav({ value, onChange, compact = false, className }: DashboardNavProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border border-border/60 bg-background/85 p-1 shadow-sm",
        compact ? "rounded-xl" : "",
        className,
      )}
    >
      {DASHBOARD_VIEW_OPTIONS.map((option) => {
        const isActive = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              compact ? "px-2.5 py-1.5 text-xs" : "",
              isActive
                ? "brand-gradient-button text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
