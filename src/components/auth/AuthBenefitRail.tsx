import { ArrowRight, BadgeCheck, CreditCard, MessagesSquare, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

type AuthBenefitRailProps = {
  planLabel?: string | null;
  planDescription?: string | null;
  className?: string;
};

const benefits = [
  {
    icon: MessagesSquare,
    title: 'Acesso ao CRM',
    description: 'Entre para acompanhar conversas, propostas e funil em um so lugar.',
  },
  {
    icon: Sparkles,
    title: 'Primeiro acesso simples',
    description: 'Se for sua primeira conta, o sistema pede confirmacao de email antes de liberar o acesso.',
  },
  {
    icon: CreditCard,
    title: 'Plano preservado',
    description: 'Se voce veio da tela de planos, a selecao continua salva depois do cadastro.',
  },
];

export default function AuthBenefitRail({ planLabel, planDescription, className }: AuthBenefitRailProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="space-y-4">
        <div className="brand-logo-disc h-14 w-14">
          <img src="/logo.png" alt="SolarZap" className="brand-logo-image" />
        </div>
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/90">SolarZap</p>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Acesse sua conta ou crie um novo acesso.
          </h1>
          <p className="max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
            Use seu email e senha para entrar no SolarZap. Se ainda nao tiver conta, crie o acesso nesta mesma tela.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {benefits.map(({ icon: Icon, title, description }) => (
          <div key={title} className="auth-portal-info-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,hsl(var(--primary)/0.18),hsl(var(--secondary)/0.16))] text-primary shadow-[0_18px_36px_-24px_hsl(var(--primary)/0.4)]">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="auth-portal-highlight-card">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">Ajuda rapida</p>
            <h2 className="text-xl font-semibold text-foreground">Se for primeiro acesso, confirme seu email.</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Depois do cadastro, o sistema envia um link de confirmacao. Sem essa etapa, o login nao sera liberado.
            </p>
          </div>
          <BadgeCheck className="mt-1 h-5 w-5 flex-shrink-0 text-primary" />
        </div>

        {planLabel && (
          <div className="rounded-2xl border border-border/70 bg-background/72 px-4 py-3 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.42)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Plano selecionado</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{planLabel}</p>
                <p className="text-sm text-muted-foreground">{planDescription || 'A selecao continua disponivel quando voce seguir para a contratacao.'}</p>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-primary" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}