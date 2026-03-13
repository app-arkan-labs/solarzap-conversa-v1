import { AlertTriangle, CreditCard, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BillingBlockerPayload } from '@/lib/billingBlocker';

interface BillingBlockerDialogProps {
  open: boolean;
  blocker: BillingBlockerPayload | null;
  primaryBusy?: boolean;
  onClose: () => void;
  onPrimaryAction: () => void;
}

const PLAN_LABEL: Record<string, string> = {
  start: 'Start',
  pro: 'Pro',
  scale: 'Scale',
};

const getBlockerIcon = (kind: BillingBlockerPayload['kind']) => {
  if (kind === 'subscription_blocked' || kind === 'read_only') return CreditCard;
  if (kind === 'pack_required') return Sparkles;
  if (kind === 'feature_locked') return Lock;
  return AlertTriangle;
};

export function BillingBlockerDialog({
  open,
  blocker,
  primaryBusy = false,
  onClose,
  onPrimaryAction,
}: BillingBlockerDialogProps) {
  if (!blocker) return null;

  const Icon = getBlockerIcon(blocker.kind);
  const targetPlanLabel =
    blocker.targetPlan && PLAN_LABEL[blocker.targetPlan] ? PLAN_LABEL[blocker.targetPlan] : null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        data-testid="billing-blocker-dialog"
        className="sm:max-w-lg"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{blocker.title}</DialogTitle>
                {targetPlanLabel ? <Badge variant="secondary">Plano {targetPlanLabel}</Badge> : null}
              </div>
              <DialogDescription>{blocker.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            data-testid="billing-blocker-close-secondary"
            onClick={onClose}
          >
            Agora nao
          </Button>
          <Button
            type="button"
            data-testid="billing-blocker-primary"
            onClick={onPrimaryAction}
            disabled={primaryBusy}
          >
            {primaryBusy ? 'Abrindo...' : blocker.primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BillingBlockerDialog;
