import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Sparkles,
  UserPlus,
} from 'lucide-react';

import AuthContextBadge from '@/components/auth/AuthContextBadge';
import AuthPortalShell from '@/components/auth/AuthPortalShell';
import VerifyEmailState from '@/components/auth/VerifyEmailState';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ViewMode = 'login' | 'signup' | 'forgot' | 'verify';
type PlanHint = 'start' | 'pro' | 'scale';

type VerifyState = {
  title: string;
  description: string;
  hint?: string;
};

const SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS = 65_000;
const MICROSOFT_EMAIL_DOMAINS = new Set(['hotmail.com', 'outlook.com', 'live.com', 'msn.com']);
const PLAN_STORAGE_KEY = 'checkout_plan_hint';
const VALID_PLAN_HINTS = new Set(['start', 'pro', 'scale']);
const FIELD_CLASS_NAME = 'h-12 rounded-2xl border-border bg-background/82 pl-12 pr-12 text-foreground shadow-sm transition-all focus:border-primary focus:ring-primary/15';

const PLAN_META: Record<PlanHint, { label: string; description: string }> = {
  start: {
    label: 'Plano Start',
    description: 'Entrada orientada para operacoes que estao estruturando o processo comercial.',
  },
  pro: {
    label: 'Plano Pro',
    description: 'Contexto preservado para equipes em crescimento que seguem para ativacao guiada.',
  },
  scale: {
    label: 'Plano Scale',
    description: 'Fluxo premium alinhado a operacoes de maior volume e ativacao completa.',
  },
};

const normalizePlanHint = (value: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_PLAN_HINTS.has(normalized) ? (normalized as PlanHint) : null;
};

const loginViewCopy = {
  login: {
    title: 'Entre no seu portal SolarZap',
    description: 'Acesse sua operacao com a mesma linguagem visual que acompanha onboarding e billing.',
    badgeIcon: LogIn,
    badgeLabel: 'Acesso ao app',
  },
  signup: {
    title: 'Crie sua conta e siga para a ativacao',
    description: 'Abra seu acesso no proprio portal e mantenha a continuidade da jornada ate o setup do produto.',
    badgeIcon: UserPlus,
    badgeLabel: 'Criacao de conta',
  },
  forgot: {
    title: 'Recupere o acesso com seguranca',
    description: 'Enviaremos um link de redefinicao sem tirar o usuario do fluxo principal do produto.',
    badgeIcon: KeyRound,
    badgeLabel: 'Recuperacao',
  },
  verify: {
    title: 'Confirme seu email para continuar',
    description: 'A verificacao virou uma etapa explicita do portal para reduzir quebra de contexto.',
    badgeIcon: Sparkles,
    badgeLabel: 'Confirmacao',
  },
} as const;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('login');
  const [verifyState, setVerifyState] = useState<VerifyState>({
    title: 'Confirme seu email',
    description: 'Enviamos um link para validar sua conta antes do proximo passo.',
  });
  const { signIn, signUp, resendSignUpConfirmation } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const autoResendTimerRef = useRef<number | null>(null);

  const queryPlanHint = normalizePlanHint(searchParams.get('plan'));
  const storedPlanHint = typeof window !== 'undefined'
    ? normalizePlanHint(window.sessionStorage.getItem(PLAN_STORAGE_KEY))
    : null;
  const activePlanHint = queryPlanHint || storedPlanHint;
  const activePlanMeta = activePlanHint ? PLAN_META[activePlanHint] : null;
  const viewCopy = loginViewCopy[view];

  useEffect(() => {
    const requestedMode = String(searchParams.get('mode') || '').trim().toLowerCase();
    const planHint = normalizePlanHint(searchParams.get('plan'));

    if (planHint) {
      window.sessionStorage.setItem(PLAN_STORAGE_KEY, planHint);
    }

    if (requestedMode === 'signup') {
      setView('signup');
    }
  }, [searchParams]);

  const getFriendlyAuthMessage = (code: string | undefined, message: string) => {
    const normalizedCode = String(code || '').toLowerCase();
    const normalizedMessage = String(message || '').toLowerCase();

    if (normalizedCode === 'over_email_send_rate_limit' || normalizedMessage.includes('only request this after')) {
      return 'Ja enviamos a confirmacao. O sistema vai tentar novo envio automaticamente em instantes.';
    }

    if (
      normalizedCode === 'user_already_registered' ||
      normalizedMessage.includes('user already registered') ||
      normalizedMessage.includes('ja possui cadastro')
    ) {
      return 'Este email ja possui cadastro confirmado. Faca login ou use recuperacao de senha.';
    }

    return message;
  };

  const isRateLimitError = (code: string | undefined, message: string) => {
    const normalizedCode = String(code || '').toLowerCase();
    const normalizedMessage = String(message || '').toLowerCase();
    return normalizedCode === 'over_email_send_rate_limit' || normalizedMessage.includes('only request this after');
  };

  const isAlreadyRegisteredError = (code: string | undefined, message: string) => {
    const normalizedCode = String(code || '').toLowerCase();
    const normalizedMessage = String(message || '').toLowerCase();
    return (
      normalizedCode === 'user_already_registered' ||
      normalizedMessage.includes('user already registered') ||
      normalizedMessage.includes('ja possui cadastro')
    );
  };

  const isEmailNotConfirmedError = (code: string | undefined, message: string) => {
    const normalizedCode = String(code || '').toLowerCase();
    const normalizedMessage = String(message || '').toLowerCase();
    return (
      normalizedCode === 'email_not_confirmed' ||
      normalizedMessage.includes('email not confirmed') ||
      normalizedMessage.includes('email_not_confirmed') ||
      normalizedMessage.includes('confirme seu email')
    );
  };

  const parseRateLimitDelayMs = (message: string) => {
    const match = message.match(/(\d+)\s*seconds?/i);
    const seconds = Number(match?.[1] || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1000;
  };

  const shouldScheduleDomainResend = (targetEmail: string) => {
    const domain = targetEmail.split('@')[1]?.trim().toLowerCase();
    if (!domain) return false;
    return MICROSOFT_EMAIL_DOMAINS.has(domain);
  };

  const clearAutoResendTimer = () => {
    if (autoResendTimerRef.current !== null) {
      window.clearTimeout(autoResendTimerRef.current);
      autoResendTimerRef.current = null;
    }
  };

  const openVerifyState = (targetEmail: string, nextState?: Partial<VerifyState>) => {
    setEmail(targetEmail);
    setView('verify');
    setVerifyState({
      title: nextState?.title || 'Confirme seu email para continuar',
      description: nextState?.description || `Enviamos a confirmacao para ${targetEmail}. Abra a caixa de entrada, spam e lixeira.`,
      hint: nextState?.hint || (activePlanMeta
        ? `${activePlanMeta.label} segue reservado. Depois da confirmacao, voce continua no fluxo de ativacao sem perder contexto.`
        : 'Depois da confirmacao, voce segue para a proxima etapa do produto sem trocar de linguagem visual.'),
    });
  };

  const scheduleAutomaticResend = (targetEmail: string, delayMs: number, attemptsLeft = 1) => {
    clearAutoResendTimer();
    autoResendTimerRef.current = window.setTimeout(async () => {
      autoResendTimerRef.current = null;
      const error = await resendSignUpConfirmation(targetEmail);
      if (!error) {
        openVerifyState(targetEmail, {
          title: 'Confirmacao reenviada',
          description: `Enviamos novamente para ${targetEmail}. Confira caixa de entrada, spam e lixeira.`,
        });
        toast({
          title: 'Confirmacao reenviada automaticamente',
          description: `Enviamos novamente para ${targetEmail}.`,
        });
        return;
      }

      const code = (error as { code?: string }).code;
      if (attemptsLeft > 0 && isRateLimitError(code, error.message)) {
        const retryDelayMs = parseRateLimitDelayMs(error.message) ?? SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS;
        scheduleAutomaticResend(targetEmail, retryDelayMs + 2000, attemptsLeft - 1);
        return;
      }

      toast({
        title: 'Falha ao confirmar email',
        description: getFriendlyAuthMessage(code, error.message),
        variant: 'destructive',
      });
    }, Math.max(2000, delayMs));
  };

  useEffect(() => () => clearAutoResendTimer(), []);

  const handleManualResend = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setIsLoading(true);
    try {
      const error = await resendSignUpConfirmation(normalizedEmail);
      if (!error) {
        openVerifyState(normalizedEmail, {
          title: 'Email reenviado',
          description: `Reenviamos a confirmacao para ${normalizedEmail}. Confira a caixa de entrada e a pasta de spam.`,
        });
        toast({
          title: 'Confirmacao reenviada',
          description: `Enviamos um novo link para ${normalizedEmail}.`,
        });
        return;
      }

      const code = (error as { code?: string }).code;
      if (isRateLimitError(code, error.message)) {
        const delayMs = parseRateLimitDelayMs(error.message) ?? SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS;
        scheduleAutomaticResend(normalizedEmail, delayMs + 2000, 1);
        openVerifyState(normalizedEmail, {
          title: 'Confirmacao pendente',
          description: `Ja existe um envio recente para ${normalizedEmail}. Vamos tentar um novo reenvio automaticamente em instantes.`,
        });
        return;
      }

      toast({
        title: 'Falha ao reenviar',
        description: getFriendlyAuthMessage(code, error.message),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setIsLoading(true);
    try {
      const error = await signIn(normalizedEmail, password);
      if (!error) {
        const planHint = queryPlanHint || storedPlanHint;
        navigate(planHint ? `/?plan=${encodeURIComponent(planHint)}` : '/');
        return;
      }

      const code = (error as { code?: string }).code;
      if (isEmailNotConfirmedError(code, error.message)) {
        const resendError = await resendSignUpConfirmation(normalizedEmail);
        if (!resendError && shouldScheduleDomainResend(normalizedEmail)) {
          scheduleAutomaticResend(normalizedEmail, SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS, 1);
        }

        if (!resendError) {
          openVerifyState(normalizedEmail, {
            title: 'Confirme seu email para entrar',
            description: `Reenviamos a confirmacao para ${normalizedEmail}. Depois disso, voce volta ao fluxo principal do produto.`,
          });
        } else {
          const resendCode = (resendError as { code?: string }).code;
          toast({
            title: 'Conta sem confirmacao',
            description: getFriendlyAuthMessage(resendCode, resendError.message),
            variant: 'destructive',
          });
        }
        return;
      }

      toast({
        title: 'Erro ao entrar',
        description: error.message === 'Invalid login credentials' ? 'Email ou senha incorretos.' : error.message,
        variant: 'destructive',
      });
    } catch {
      toast({ title: 'Erro', description: 'Ocorreu um erro inesperado.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 8 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setIsLoading(true);
    try {
      const error = await signUp(normalizedEmail, password);
      if (!error) {
        if (queryPlanHint) {
          window.sessionStorage.setItem(PLAN_STORAGE_KEY, queryPlanHint);
        }
        if (shouldScheduleDomainResend(normalizedEmail)) {
          scheduleAutomaticResend(normalizedEmail, SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS, 1);
        }
        setPassword('');
        openVerifyState(normalizedEmail, {
          title: 'Conta criada. Agora confirme seu email',
          description: `Enviamos o link de confirmacao para ${normalizedEmail}. Assim que confirmar, o fluxo continua com a mesma experiencia do portal.`,
        });
        toast({
          title: 'Conta criada',
          description: `Enviamos a confirmacao para ${normalizedEmail}.`,
        });
        return;
      }

      const code = (error as { code?: string }).code;
      if (isRateLimitError(code, error.message)) {
        const delayMs = parseRateLimitDelayMs(error.message) ?? SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS;
        scheduleAutomaticResend(normalizedEmail, delayMs + 2000, 1);
        openVerifyState(normalizedEmail, {
          title: 'Confirmacao pendente',
          description: `Ja existe um envio recente para ${normalizedEmail}. Vamos reenviar automaticamente em instantes.`,
        });
        return;
      }

      if (isAlreadyRegisteredError(code, error.message)) {
        setView('login');
        toast({
          title: 'Email ja cadastrado',
          description: 'Essa conta ja existe. Entre com sua senha ou use recuperacao de senha.',
        });
        return;
      }

      toast({
        title: 'Erro ao criar conta',
        description: getFriendlyAuthMessage(code, error.message),
        variant: 'destructive',
      });
    } catch {
      toast({ title: 'Erro', description: 'Ocorreu um erro inesperado.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      toast({
        title: 'Informe seu email',
        description: 'Digite o email da sua conta para receber o link.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const passwordRecoveryRedirectTo = `${window.location.origin}/update-password?password_recovery=1`;
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: passwordRecoveryRedirectTo,
      });
      if (error) throw error;

      toast({
        title: 'Email enviado',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
      setView('login');
    } catch (err: unknown) {
      const code = String((err as { code?: string })?.code || '').toLowerCase();
      const message = String((err as { message?: string })?.message || '');
      if (isEmailNotConfirmedError(code, message)) {
        const resendError = await resendSignUpConfirmation(normalizedEmail);
        if (!resendError) {
          if (shouldScheduleDomainResend(normalizedEmail)) {
            scheduleAutomaticResend(normalizedEmail, SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS, 1);
          }
          openVerifyState(normalizedEmail, {
            title: 'Conta ainda nao confirmada',
            description: `Reenviamos o email de confirmacao para ${normalizedEmail}. Depois de confirmar, voce pode redefinir sua senha normalmente.`,
          });
          return;
        }
      }
      toast({
        title: 'Erro ao enviar email',
        description: message || 'Nao foi possivel enviar o email de recuperacao.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const footer = useMemo(
    () => (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-2 text-xs">
          <div className="brand-logo-disc h-7 w-7">
            <img src="/logo.png" alt="SolarZap" className="brand-logo-image" />
          </div>
          <span>SolarZap CRM © {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <a href="/privacidade" className="transition-colors hover:text-foreground">Privacidade</a>
          <a href="/termos" className="transition-colors hover:text-foreground">Termos</a>
        </div>
      </div>
    ),
    [],
  );

  const renderModeSwitch = () => {
    if (view === 'verify') return null;

    if (view === 'forgot') {
      return (
        <Button type="button" variant="ghost" className="mb-6 px-0 text-sm text-muted-foreground" onClick={() => setView('login')}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para login
        </Button>
      );
    }

    return (
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-muted/55 p-1">
        <button
          type="button"
          className={`rounded-[1rem] px-4 py-3 text-sm font-semibold transition-all ${view === 'login' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setView('login')}
        >
          Entrar
        </button>
        <button
          type="button"
          className={`rounded-[1rem] px-4 py-3 text-sm font-semibold transition-all ${view === 'signup' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setView('signup')}
        >
          Criar conta
        </button>
      </div>
    );
  };

  const renderEmailField = (id: string, label: string, placeholder = 'seu@email.com') => (
    <div className="space-y-2 text-left">
      <Label htmlFor={id} className="ml-1 text-sm font-medium text-foreground">{label}</Label>
      <div className="group relative">
        <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input
          id={id}
          type="email"
          placeholder={placeholder}
          value={email}
          onChange={(currentEvent) => setEmail(currentEvent.target.value)}
          className={FIELD_CLASS_NAME}
          required
        />
      </div>
    </div>
  );

  const renderPasswordField = (id: string, label: string, placeholder: string) => (
    <div className="space-y-2 text-left">
      <Label htmlFor={id} className="ml-1 text-sm font-medium text-foreground">{label}</Label>
      <div className="group relative">
        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input
          id={id}
          type={showPassword ? 'text' : 'password'}
          placeholder={placeholder}
          value={password}
          onChange={(currentEvent) => setPassword(currentEvent.target.value)}
          className={FIELD_CLASS_NAME}
          required
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword((currentValue) => !currentValue)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );

  const renderForm = () => {
    if (view === 'verify') {
      return (
        <VerifyEmailState
          email={email.trim().toLowerCase()}
          title={verifyState.title}
          description={verifyState.description}
          hint={verifyState.hint}
          isSubmitting={isLoading}
          onResend={handleManualResend}
          onBack={() => setView('login')}
        />
      );
    }

    if (view === 'forgot') {
      return (
        <form onSubmit={handleForgotPassword} className="space-y-5">
          {renderEmailField('forgot-email', 'Email da conta')}
          <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
            Voce recebera um link para criar uma nova senha mantendo o fluxo seguro da sua conta.
          </div>
          <Button type="submit" className="h-12 w-full text-base font-semibold" disabled={isLoading}>
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </span>
            ) : (
              'Enviar link de recuperacao'
            )}
          </Button>
        </form>
      );
    }

    if (view === 'signup') {
      return (
        <form onSubmit={handleSignUp} className="space-y-5">
          {renderEmailField('signup-email', 'Email profissional')}
          {renderPasswordField('signup-password', 'Senha', 'Minimo de 8 caracteres')}
          <div className="grid gap-3 rounded-[1.5rem] border border-border/70 bg-muted/30 p-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Conta criada no portal</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Sem trocar de tela, o usuario segue para a confirmacao e depois para a ativacao.</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Continuacao ate billing</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Se houver plano selecionado, o contexto continua preservado no proximo passo.</p>
            </div>
          </div>
          <Button type="submit" className="h-12 w-full text-base font-semibold" disabled={isLoading}>
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando conta...
              </span>
            ) : (
              'Criar conta'
            )}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Ja tem acesso?{' '}
            <button type="button" className="font-semibold text-primary transition-colors hover:text-primary/80" onClick={() => setView('login')}>
              Fazer login
            </button>
          </p>
        </form>
      );
    }

    return (
      <form onSubmit={handleLogin} className="space-y-5">
        {renderEmailField('email', 'Email')}
        <div className="space-y-2 text-left">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password" className="ml-1 text-sm font-medium text-foreground">Senha</Label>
            <button type="button" className="text-sm font-medium text-primary transition-colors hover:text-primary/80" onClick={() => setView('forgot')}>
              Esqueci minha senha
            </button>
          </div>
          <div className="group relative">
            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(currentEvent) => setPassword(currentEvent.target.value)}
              className={FIELD_CLASS_NAME}
              required
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((currentValue) => !currentValue)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <Button type="submit" className="h-12 w-full text-base font-semibold" disabled={isLoading}>
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Entrando...
            </span>
          ) : (
            'Entrar'
          )}
        </Button>
        <div className="rounded-2xl border border-border/70 bg-background/72 px-4 py-3 text-sm leading-6 text-muted-foreground">
          A autenticacao agora funciona como a entrada oficial do app, com continuidade visual ate onboarding e plano.
        </div>
      </form>
    );
  };

  return (
    <AuthPortalShell
      badge={<AuthContextBadge icon={viewCopy.badgeIcon} label={viewCopy.badgeLabel} />}
      title={viewCopy.title}
      description={viewCopy.description}
      planLabel={activePlanMeta?.label || null}
      planDescription={activePlanMeta?.description || null}
      footer={footer}
    >
      {renderModeSwitch()}
      {renderForm()}
    </AuthPortalShell>
  );
}
