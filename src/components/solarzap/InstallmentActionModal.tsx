import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarClock, CheckCircle2, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface InstallmentActionItem {
  installmentId: string;
  leadId?: string | number | null;
  leadName: string;
  installmentNo: number;
  dueOn: string;
  amount: number;
  status?: "scheduled" | "awaiting_confirmation";
  source?: "dashboard" | "auto";
  sessionKey?: string;
}

interface InstallmentActionModalProps {
  open: boolean;
  installment: InstallmentActionItem | null;
  onClose: () => void;
  onConfirmPaid: (installmentId: string) => Promise<void>;
  onReschedule: (installmentId: string, newDueOn: string) => Promise<void>;
}

type InstallmentActionStep = "decision" | "reschedule";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (days: number) => {
  const nextDate = new Date();
  nextDate.setHours(12, 0, 0, 0);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

export function InstallmentActionModal({
  open,
  installment,
  onClose,
  onConfirmPaid,
  onReschedule,
}: InstallmentActionModalProps) {
  const [step, setStep] = useState<InstallmentActionStep>("decision");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [loadingAction, setLoadingAction] = useState<"paid" | "reschedule" | null>(null);

  useEffect(() => {
    if (!open || !installment) {
      setStep("decision");
      setRescheduleDate("");
      setLoadingAction(null);
      return;
    }

    setStep("decision");
    setRescheduleDate(toInputDate(addDays(1)));
    setLoadingAction(null);
  }, [installment, open]);

  const dueContext = useMemo(() => {
    if (!installment?.dueOn) {
      return {
        label: "Sem vencimento informado",
        helper: "Confirme o pagamento ou reagende a cobranca.",
        tone: "bg-muted text-muted-foreground",
      };
    }

    const dueDate = new Date(`${installment.dueOn}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return {
        label: diffDays === 0 ? "Vence hoje" : "A vencer",
        helper: diffDays === 0 ? "Parcela no dia de vencimento." : "Parcela ainda dentro do prazo.",
        tone: "bg-sky-500/10 text-sky-700",
      };
    }

    if (diffDays === 1) {
      return {
        label: "1 dia de atraso",
        helper: "Vale confirmar agora se o pagamento ja entrou.",
        tone: "bg-amber-500/10 text-amber-700",
      };
    }

    return {
      label: `${diffDays} dias de atraso`,
      helper: "Parcela atrasada que precisa de definicao.",
      tone: "bg-rose-500/10 text-rose-700",
    };
  }, [installment?.dueOn]);

  const handleConfirmPaid = async () => {
    if (!installment) return;

    setLoadingAction("paid");
    try {
      await onConfirmPaid(installment.installmentId);
      onClose();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!installment || !rescheduleDate) return;

    setLoadingAction("reschedule");
    try {
      await onReschedule(installment.installmentId, rescheduleDate);
      onClose();
    } finally {
      setLoadingAction(null);
    }
  };

  const installmentLabel =
    installment?.dueOn && !Number.isNaN(new Date(`${installment.dueOn}T00:00:00`).getTime())
      ? format(new Date(`${installment.dueOn}T00:00:00`), "dd 'de' MMMM", { locale: ptBR })
      : "data nao informada";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Wallet className="h-4 w-4 text-emerald-600" />
            Parcela #{installment?.installmentNo ?? "-"}
          </div>
          <DialogTitle>Confirmar parcela</DialogTitle>
          <DialogDescription>
            {step === "decision"
              ? "Essa parcela foi paga ou ainda precisa de nova cobranca?"
              : "Se ela nao foi paga, escolha a proxima data de cobranca."}
          </DialogDescription>
        </DialogHeader>

        {installment ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">{installment.leadName}</p>
                  <p className="text-sm text-muted-foreground">
                    Parcela #{installment.installmentNo} | vence em {installmentLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="text-lg font-semibold text-foreground">{formatCurrency(installment.amount)}</span>
                  <Badge variant="secondary" className={dueContext.tone}>
                    {dueContext.label}
                  </Badge>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{dueContext.helper}</p>
            </div>

            {step === "decision" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  className="h-auto min-h-12 flex-col items-start gap-1 rounded-2xl px-4 py-3 text-left"
                  disabled={loadingAction !== null}
                  onClick={() => void handleConfirmPaid()}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    Foi paga
                  </span>
                  <span className="text-xs font-normal text-primary-foreground/80">
                    Confirma o recebimento e tira a parcela da fila.
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-12 flex-col items-start gap-1 rounded-2xl px-4 py-3 text-left"
                  disabled={loadingAction !== null}
                  onClick={() => setStep("reschedule")}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Nao foi paga
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Escolha a nova data para continuar cobrando.
                  </span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRescheduleDate(toInputDate(addDays(1)))}>
                    Amanha
                  </Button>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRescheduleDate(toInputDate(addDays(3)))}>
                    Em 3 dias
                  </Button>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRescheduleDate(toInputDate(addDays(7)))}>
                    Em 7 dias
                  </Button>
                </div>

                <div className="space-y-2">
                  <label htmlFor="installment-reschedule-date" className="text-sm font-medium text-foreground">
                    Nova data de cobranca
                  </label>
                  <div className="relative">
                    <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="installment-reschedule-date"
                      type="date"
                      className="pl-9"
                      value={rescheduleDate}
                      onChange={(event) => setRescheduleDate(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          {step === "reschedule" ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setStep("decision")} disabled={loadingAction !== null}>
                Voltar
              </Button>
              <Button type="button" onClick={() => void handleConfirmReschedule()} disabled={!rescheduleDate || loadingAction !== null}>
                Confirmar nova data
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" onClick={onClose} disabled={loadingAction !== null}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
