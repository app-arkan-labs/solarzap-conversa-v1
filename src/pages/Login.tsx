import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, Loader2, ArrowLeft, Zap, Eye, EyeOff, User, Building2, CreditCard } from 'lucide-react';
import { RotatingHeadline } from '@/components/auth/RotatingHeadline';
import { useToast } from '@/hooks/use-toast';
import { isAdminHost } from '@/lib/hostDetection';
import { formatCpf, formatCnpj, cleanCpf, cleanCnpj, isValidCpf, isValidCnpj } from '@/utils/documentValidation';

type ViewMode = 'login' | 'signup' | 'forgot';
const SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS = 65_000;
const MICROSOFT_EMAIL_DOMAINS = new Set(['hotmail.com', 'outlook.com', 'live.com', 'msn.com']);
const PLAN_STORAGE_KEY = 'checkout_plan_hint';
const REDIRECT_STORAGE_KEY = 'post_auth_redirect_hint';
const CHECKOUT_INTENT_KEY = 'checkout_plan_intent';
const VALID_PLAN_HINTS = new Set(['start', 'pro', 'scale']);

const PLAN_LABELS: Record<string, string> = {
  start: 'Start',
  pro: 'Pro',
  scale: 'Scale',
};

const normalizePlanHint = (value: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_PLAN_HINTS.has(normalized) ? normalized : null;
};

const normalizeRedirectHint = (value: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    return null;
  }
  return normalized;
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [cpf, setCpf] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('login');
  const { signIn, signUp, resendSignUpConfirmation } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const autoResendTimerRef = useRef<number | null>(null);
  const adminHost = typeof window !== 'undefined' && isAdminHost(window.location.hostname);

  const planHintFromUrl = normalizePlanHint(searchParams.get('plan'));
  const trialFromUrl = searchParams.get('trial');
  const checkoutFromUrl = searchParams.get('checkout');

  useEffect(() => {
    const requestedMode = String(searchParams.get('mode') || '').trim().toLowerCase();
    const planHint = normalizePlanHint(searchParams.get('plan'));
    const redirectHint = normalizeRedirectHint(searchParams.get('redirect'));

    if (planHint) {
      window.sessionStorage.setItem(PLAN_STORAGE_KEY, planHint);
      // Persist to localStorage so the intent survives cross-tab email confirmation
      window.localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify({
        plan: planHint,
        trial: Number(searchParams.get('trial') || 7) || 7,
        autoCheckout: searchParams.get('checkout') === '1',
        ts: Date.now(),
      }));
    }
    if (redirectHint) {
      window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectHint);
    }

    if (requestedMode === 'signup' && !adminHost) {
      setView('signup');
    }
  }, [adminHost, searchParams]);

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
      return 'Este email ja possui cadastro confirmado. Faça login ou use recuperacao de senha.';
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

  const scheduleAutomaticResend = (targetEmail: string, delayMs: number, attemptsLeft = 1) => {
    clearAutoResendTimer();
    autoResendTimerRef.current = window.setTimeout(async () => {
      autoResendTimerRef.current = null;
      const error = await resendSignUpConfirmation(targetEmail);
      if (!error) {
        toast({
          title: 'Confirmacao reenviada automaticamente',
          description: `Enviamos novamente para ${targetEmail}. Confira a caixa de entrada e spam.`,
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setIsLoading(true);
    try {
      const error = await signIn(normalizedEmail, password);
      if (!error) {
        const redirectHint = normalizeRedirectHint(searchParams.get('redirect'))
          || normalizeRedirectHint(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY));
        const queryPlanHint = normalizePlanHint(searchParams.get('plan'));
        const storedPlanHint = normalizePlanHint(window.sessionStorage.getItem(PLAN_STORAGE_KEY));
        const planHint = queryPlanHint || storedPlanHint;
        window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
        navigate(adminHost ? '/admin' : redirectHint || (planHint ? `/?plan=${encodeURIComponent(planHint)}` : '/'));
      } else {
        const code = (error as { code?: string }).code;

        if (isEmailNotConfirmedError(code, error.message)) {
          const resendError = await resendSignUpConfirmation(normalizedEmail);
          if (!resendError) {
            if (shouldScheduleDomainResend(normalizedEmail)) {
              scheduleAutomaticResend(normalizedEmail, SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS, 1);
            }
            toast({
              title: 'Confirme seu email para entrar',
              description: `Reenviamos a confirmacao para ${normalizedEmail}. Verifique caixa de entrada, spam e lixeira.`,
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
          description: error.message === 'Invalid login credentials'
            ? 'Email ou senha incorretos'
            : error.message,
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Erro', description: 'Ocorreu um erro inesperado', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim();
    const trimmedCompany = companyName.trim();
    if (trimmedName.length < 3) {
      toast({ title: 'Nome muito curto', description: 'Informe seu nome completo (mínimo 3 caracteres).', variant: 'destructive' });
      return;
    }
    if (trimmedCompany.length < 2) {
      toast({ title: 'Nome da empresa obrigatório', description: 'Informe o nome da sua empresa (mínimo 2 caracteres).', variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: 'Senha muito curta', description: 'A senha deve ter pelo menos 8 caracteres.', variant: 'destructive' });
      return;
    }
    const rawCpf = cleanCpf(cpf);
    if (rawCpf && !isValidCpf(rawCpf)) {
      toast({ title: 'CPF inválido', description: 'Verifique o CPF informado.', variant: 'destructive' });
      return;
    }
    const rawCnpj = cleanCnpj(cnpj);
    if (rawCnpj && !isValidCnpj(rawCnpj)) {
      toast({ title: 'CNPJ inválido', description: 'Verifique o CNPJ informado.', variant: 'destructive' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    setIsLoading(true);
    try {
      const error = await signUp(normalizedEmail, password, {
        display_name: trimmedName,
        company_name: trimmedCompany,
        ...(rawCpf ? { cpf: rawCpf } : {}),
        ...(rawCnpj ? { cnpj: rawCnpj } : {}),
      });
      if (!error) {
        const planHint = normalizePlanHint(searchParams.get('plan'));
        const redirectHint = normalizeRedirectHint(searchParams.get('redirect'));
        if (planHint) {
          window.sessionStorage.setItem(PLAN_STORAGE_KEY, planHint);
          window.localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify({
            plan: planHint,
            trial: Number(searchParams.get('trial') || 7) || 7,
            autoCheckout: searchParams.get('checkout') === '1',
            ts: Date.now(),
          }));
        }
        if (redirectHint) {
          window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectHint);
        }
        setPassword('');
        setView('login');
        if (shouldScheduleDomainResend(normalizedEmail)) {
          scheduleAutomaticResend(normalizedEmail, SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS, 1);
        }
        toast({
          title: 'Conta criada!',
          description: `Enviamos o email de confirmacao para ${normalizedEmail}.`,
        });
      } else {
        const code = (error as { code?: string }).code;

        if (isRateLimitError(code, error.message)) {
          const delayMs = parseRateLimitDelayMs(error.message) ?? SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS;
          scheduleAutomaticResend(normalizedEmail, delayMs + 2000, 1);
          toast({
            title: 'Confirmacao pendente',
            description: `Ja enviamos uma solicitacao. Vamos reenviar automaticamente para ${normalizedEmail} em instantes.`,
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
          title: 'Erro',
          description: getFriendlyAuthMessage(code, error.message),
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Erro', description: 'Ocorreu um erro inesperado', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast({ title: 'Informe seu email', description: 'Digite o email da sua conta para receber o link.', variant: 'destructive' });
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
        title: 'Email enviado!',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
      setView('login');
    } catch (err: any) {
      const code = String(err?.code || '').toLowerCase();
      const message = String(err?.message || '');
      if (isEmailNotConfirmedError(code, message)) {
        const resendError = await resendSignUpConfirmation(normalizedEmail);
        if (!resendError) {
          if (shouldScheduleDomainResend(normalizedEmail)) {
            scheduleAutomaticResend(normalizedEmail, SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS, 1);
          }
          toast({
            title: 'Conta ainda não confirmada',
            description: `Reenviamos o email de confirmação para ${normalizedEmail}. Depois de confirmar, use o fluxo de esqueci a senha novamente.`,
          });
          setView('login');
          return;
        }
      }
      toast({ title: 'Erro', description: message || 'Não foi possível enviar o email.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const staticTitle = adminHost
    ? view === 'forgot'
      ? 'Recuperar acesso admin'
      : 'Painel Admin SolarZap'
    : view === 'signup'
      ? 'Criar sua conta'
      : view === 'forgot'
        ? 'Esqueceu sua senha?'
        : null;
  const subtitle = view === 'login'
    ? adminHost
      ? 'Acesse sua conta administrativa'
      : 'Acesse sua conta SolarZap'
    : view === 'signup'
      ? 'Preencha os dados para começar'
      : 'Enviaremos um link para redefinir sua senha';

  return (
    <div className="auth-shell min-h-screen w-full flex relative overflow-hidden font-sans">
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      <div className="w-full h-full min-h-screen flex items-center justify-center p-4 sm:p-8 relative z-10">
        <Card className="auth-card w-full max-w-md overflow-hidden relative">
          <CardHeader className="text-center space-y-5 pt-10 pb-2 relative z-10">
            <div className="brand-logo-disc mx-auto h-20 w-20 transform transition-all duration-300 hover:scale-105 hover:shadow-[0_0_32px_-6px_hsl(var(--primary)/0.45)]">
              <img src="/logo.png" alt="SolarZap Logo" className="brand-logo-image" />
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-2xl font-bold tracking-tight text-foreground drop-shadow-sm min-h-[2rem]">
                {view === 'login' ? <RotatingHeadline /> : staticTitle}
              </CardTitle>
              <CardDescription className="text-muted-foreground/80 text-sm font-medium">
                {subtitle}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="relative z-10 pb-10 px-6 sm:px-8">
            {/* ── LOGIN FORM ── */}
            {view === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <Label htmlFor="email" className="text-foreground font-medium ml-1">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-12 rounded-xl transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-3 duration-500 delay-75">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-foreground font-medium ml-1">Senha</Label>
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Esqueceu sua senha?
                    </button>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-12 pr-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-12 rounded-xl transition-all shadow-sm"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="brand-gradient-button w-full h-12 rounded-xl text-white font-semibold text-lg shadow-[0_20px_48px_-22px_hsl(var(--primary)/0.6)] transition-all ease-in-out duration-300 mt-2 animate-in fade-in slide-in-from-bottom-4 delay-150"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Entrando...
                    </span>
                  ) : (
                    'Entrar'
                  )}
                </Button>

                <div className="text-center pt-2 animate-in fade-in slide-in-from-bottom-5 duration-500 delay-200">
                  <button
                    type="button"
                    onClick={() => setView('signup')}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Não tem conta? <span className="text-primary font-semibold hover:underline">Criar conta</span>
                  </button>
                </div>
              </form>
            )}

            {/* ── SIGN UP FORM ── */}
            {view === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-4">
                {/* Plan badge when coming from landing page */}
                {planHintFromUrl && PLAN_LABELS[planHintFromUrl] && (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm animate-in fade-in slide-in-from-top-2 duration-500">
                    <Zap className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-primary font-medium">
                      Plano {PLAN_LABELS[planHintFromUrl]} selecionado
                      {trialFromUrl && Number(trialFromUrl) > 0 ? ` — ${trialFromUrl} dias grátis` : ''}
                    </span>
                  </div>
                )}

                <div className="space-y-1.5 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <Label htmlFor="signup-fullname" className="text-foreground font-medium ml-1">Nome completo</Label>
                  <div className="relative group">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="signup-fullname"
                      type="text"
                      placeholder="Seu nome completo"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-11 rounded-xl transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <Label htmlFor="signup-email" className="text-foreground font-medium ml-1">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-11 rounded-xl transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-left animate-in fade-in slide-in-from-bottom-3 duration-500 delay-75">
                  <Label htmlFor="signup-password" className="text-foreground font-medium ml-1">Senha</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 8 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-12 pr-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-11 rounded-xl transition-all shadow-sm"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-left animate-in fade-in slide-in-from-bottom-3 duration-500 delay-75">
                  <Label htmlFor="signup-company" className="text-foreground font-medium ml-1">Nome da empresa</Label>
                  <div className="relative group">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="signup-company"
                      type="text"
                      placeholder="Ex: Solar Energy Ltda"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="pl-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-11 rounded-xl transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                  <div className="space-y-1.5 text-left">
                    <Label htmlFor="signup-cpf" className="text-foreground font-medium ml-1 text-xs">CPF <span className="text-muted-foreground">(opcional)</span></Label>
                    <div className="relative group">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="signup-cpf"
                        type="text"
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        value={cpf}
                        onChange={(e) => setCpf(formatCpf(e.target.value))}
                        maxLength={14}
                        className="pl-10 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-11 rounded-xl transition-all shadow-sm text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 text-left">
                    <Label htmlFor="signup-cnpj" className="text-foreground font-medium ml-1 text-xs">CNPJ <span className="text-muted-foreground">(opcional)</span></Label>
                    <div className="relative group">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <Input
                        id="signup-cnpj"
                        type="text"
                        inputMode="numeric"
                        placeholder="00.000.000/0000-00"
                        value={cnpj}
                        onChange={(e) => setCnpj(formatCnpj(e.target.value))}
                        maxLength={18}
                        className="pl-10 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-11 rounded-xl transition-all shadow-sm text-sm"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="brand-gradient-button w-full h-12 rounded-xl text-white font-semibold text-lg shadow-[0_20px_48px_-22px_hsl(var(--primary)/0.6)] transition-all ease-in-out duration-300 mt-2 animate-in fade-in slide-in-from-bottom-4 delay-150"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Criando conta...
                    </span>
                  ) : (
                    planHintFromUrl ? 'Criar conta e continuar' : 'Criar Conta'
                  )}
                </Button>

                <div className="text-center pt-2 animate-in fade-in slide-in-from-bottom-5 duration-500 delay-200">
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className="inline-flex items-center justify-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                    Já tem conta? Fazer login
                  </button>
                </div>
              </form>
            )}

            {/* ── FORGOT PASSWORD FORM ── */}
            {view === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <Label htmlFor="forgot-email" className="text-foreground font-medium ml-1">Email da conta</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-12 rounded-xl transition-all shadow-sm"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground ml-1 mt-1">
                    Você receberá um link no email para criar uma nova senha.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="brand-gradient-button w-full h-12 rounded-xl text-white font-semibold text-lg shadow-[0_20px_48px_-22px_hsl(var(--primary)/0.6)] transition-all ease-in-out duration-300 mt-2 animate-in fade-in slide-in-from-bottom-4 delay-150"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Enviando...
                    </span>
                  ) : (
                    'Enviar Link de Recuperação'
                  )}
                </Button>

                <div className="text-center pt-2 animate-in fade-in slide-in-from-bottom-5 duration-500 delay-200">
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className="inline-flex items-center justify-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                    Voltar para o login
                  </button>
                </div>
              </form>
            )}

            {/* Footer */}
            <div className="mt-8 pt-5 border-t border-border/50 flex justify-center items-center text-muted-foreground/60 text-[11px] gap-1.5 tracking-wide">
              <Zap className="w-3 h-3 text-primary/60" />
              <span>SolarZap CRM &copy; {new Date().getFullYear()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
