import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface DashboardMetricItem {
  id: string;
  label: string;
  value: string;
  description: string;
  icon?: LucideIcon;
  tone?: "default" | "sky" | "emerald" | "amber" | "rose" | "cyan";
}

interface DashboardMetricGridProps {
  items: DashboardMetricItem[];
  className?: string;
}

const toneClasses: Record<NonNullable<DashboardMetricItem["tone"]>, { icon: string; bubble: string }> = {
  default: {
    icon: "text-foreground",
    bubble: "bg-muted text-foreground",
  },
  sky: {
    icon: "text-sky-700",
    bubble: "bg-sky-500/10 text-sky-700",
  },
  emerald: {
    icon: "text-emerald-700",
    bubble: "bg-emerald-500/10 text-emerald-700",
  },
  amber: {
    icon: "text-amber-700",
    bubble: "bg-amber-500/10 text-amber-700",
  },
  rose: {
    icon: "text-rose-700",
    bubble: "bg-rose-500/10 text-rose-700",
  },
  cyan: {
    icon: "text-cyan-700",
    bubble: "bg-cyan-500/10 text-cyan-700",
  },
};

export function DashboardMetricGrid({ items, className }: DashboardMetricGridProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((item) => {
        const tone = toneClasses[item.tone || "default"];
        const Icon = item.icon;

        return (
          <Card key={item.id} className="border-border/50 bg-background/50 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{item.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>
                </div>
                {Icon ? (
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", tone.bubble)}>
                    <Icon className={cn("h-4 w-4", tone.icon)} />
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
