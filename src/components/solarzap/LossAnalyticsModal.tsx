import React, { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { TrendingDown } from "lucide-react";

import { LossAnalyticsPanel } from "@/components/dashboard/LossAnalyticsPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLossAnalytics } from "@/hooks/useLossAnalytics";

interface LossAnalyticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerUserId?: string | null;
}

const formatDateInput = (date: Date) => format(date, "yyyy-MM-dd");

export function LossAnalyticsModal({ open, onOpenChange, ownerUserId = null }: LossAnalyticsModalProps) {
  const [from, setFrom] = useState(() => formatDateInput(subDays(new Date(), 30)));
  const [to, setTo] = useState(() => formatDateInput(new Date()));

  const startDate = useMemo(() => new Date(`${from}T00:00:00`), [from]);
  const endDate = useMemo(() => new Date(`${to}T23:59:59`), [to]);

  const { data, isLoading, error } = useLossAnalytics({
    startDate,
    endDate,
    ownerUserId,
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-[1200px] overflow-hidden p-0">
        <div className="border-b border-border/60 p-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <TrendingDown className="h-5 w-5 text-rose-500" />
              Detalhes das perdas
            </DialogTitle>
            <DialogDescription>
              Motivos mais frequentes, historico recente e acoes sugeridas para reduzir perdas comerciais.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="md:w-[180px]" />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="md:w-[180px]" />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFrom(formatDateInput(subDays(new Date(), 30)));
                setTo(formatDateInput(new Date()));
              }}
            >
              Ultimos 30 dias
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(92vh-128px)]">
          <div className="p-6">
            <LossAnalyticsPanel data={data} isLoading={isLoading} error={error} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
