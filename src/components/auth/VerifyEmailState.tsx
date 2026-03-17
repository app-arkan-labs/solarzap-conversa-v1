import { ArrowLeft, Loader2, MailCheck, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

type VerifyEmailStateProps = {
  email: string;
  title: string;
  description: string;
  isSubmitting: boolean;
  onResend: () => void;
  onBack: () => void;
  hint?: string;
};

export default function VerifyEmailState({
  email,
  title,
  description,
  isSubmitting,
  onResend,
  onBack,
  hint,
}: VerifyEmailStateProps) {
  return (
    <div className="space-y-6">
      <div className="auth-status-card">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,hsl(var(--primary)/0.16),hsl(var(--secondary)/0.14))] text-primary shadow-[0_22px_46px_-28px_hsl(var(--primary)/0.45)]">
          <MailCheck className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/78 p-4 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.35)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Email da conta</p>
        <p className="mt-2 break-all text-base font-semibold text-foreground">{email}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Abra o email de confirmacao, clique no link e depois volte para fazer login.
        </p>
      </div>

      {hint && (
        <div className="rounded-2xl border border-primary/16 bg-primary/8 px-4 py-3 text-sm leading-6 text-muted-foreground">
          {hint}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" className="flex-1" onClick={onResend} disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reenviando...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              Reenviar confirmacao
            </span>
          )}
        </Button>

        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={isSubmitting}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>
    </div>
  );
}