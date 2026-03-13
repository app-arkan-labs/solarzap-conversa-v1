import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, Loader2, ArrowLeft, Zap, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ViewMode = 'login' | 'signup' | 'forgot';
const SIGNUP_AUTO_RESEND_DEFAULT_DELAY_MS = 65_000;
const MICROSOFT_EMAIL_DOMAINS = new Set(['hotmail.com', 'outlook.com', 'live.com', 'msn.com']);
const PLAN_STORAGE_KEY = 'checkout_plan_hint';
const VALID_PLAN_HINTS = new Set(['start', 'pro', 'scale']);

const normalizePlanHint = (value: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_PLAN_HINTS.has(normalized) ? normalized : null;
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('login');
  const { signIn, signUp, resendSignUpConfirmation } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const autoResendTimerRef = useRef<number | null>(null);

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
        const queryPlanHint = normalizePlanHint(searchParams.get('plan'));
        const storedPlanHint = normalizePlanHint(window.sessionStorage.getItem(PLAN_STORAGE_KEY));
        const planHint = queryPlanHint || storedPlanHint;
        navigate(planHint ? `/?plan=${encodeURIComponent(planHint)}` : '/');
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
    if (password.length < 8) {
      toast({ title: 'Senha muito curta', description: 'A senha deve ter pelo menos 8 caracteres.', variant: 'destructive' });
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    setIsLoading(true);
    try {
      const error = await signUp(normalizedEmail, password);
      if (!error) {
        const planHint = normalizePlanHint(searchParams.get('plan'));
        if (planHint) {
          window.sessionStorage.setItem(PLAN_STORAGE_KEY, planHint);
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
            title: 'Conta ainda nao confirmada',
            description: `Reenviamos o email de confirmacao para ${normalizedEmail}. Depois de confirmar, use o fluxo de esqueci a senha novamente.`,
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

  const title = view === 'login' ? 'Bem-vindo de volta' : view === 'signup' ? 'Criar sua conta' : 'Esqueceu sua senha?';
  const subtitle = view === 'login'
    ? 'Acesse sua conta SolarZap'
    : view === 'signup'
      ? 'Preencha os dados para começar'
      : 'Enviaremos um link para redefinir sua senha';

  return (
    <div className="min-h-screen w-full flex bg-gradient-to-br from-green-50 to-emerald-100 relative overflow-hidden font-sans">
      {/* Background blurred circles */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-green-200/50 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[50%] h-[50%] rounded-full bg-emerald-200/60 blur-[120px]" />
      </div>

      <div className="w-full h-full min-h-screen flex items-center justify-center p-4 sm:p-8 relative z-10">
        <Card className="w-full max-w-md bg-white/90 backdrop-blur-xl border-white shadow-2xl overflow-hidden relative">
          <CardHeader className="text-center space-y-6 pt-10 pb-4 relative z-10">
            <div className="mx-auto flex items-center justify-center transform hover:scale-105 transition-all duration-300">
              <img src="/logo.png" alt="SolarZap Logo" className="h-20 w-auto object-contain drop-shadow-md" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold tracking-tight text-slate-800 drop-shadow-sm">
                {title}
              </CardTitle>
              <CardDescription className="text-slate-500 text-base font-medium">
                {subtitle}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="relative z-10 pb-10 px-6 sm:px-8">
            {/* ── LOGIN FORM ── */}
            {view === 'login' && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <Label htmlFor="email" className="text-slate-700 font-medium ml-1">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-green-600 transition-colors" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:ring-green-500/30 h-12 rounded-xl transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-3 duration-500 delay-75">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-slate-700 font-medium ml-1">Senha</Label>
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-xs font-medium text-green-600 hover:text-green-700 transition-colors"
                    >
                      Esqueceu sua senha?
                    </button>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-green-600 transition-colors" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-12 pr-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:ring-green-500/30 h-12 rounded-xl transition-all shadow-sm"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-semibold text-lg shadow-lg shadow-green-500/25 transition-all ease-in-out duration-300 mt-2 animate-in fade-in slide-in-from-bottom-4 delay-150"
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
                    className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    Não tem conta? <span className="text-green-600 font-semibold hover:underline">Criar conta</span>
                  </button>
                </div>
              </form>
            )}

            {/* ── SIGN UP FORM ── */}
            {view === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <Label htmlFor="signup-email" className="text-slate-700 font-medium ml-1">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-green-600 transition-colors" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:ring-green-500/30 h-12 rounded-xl transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-3 duration-500 delay-75">
                  <Label htmlFor="signup-password" className="text-slate-700 font-medium ml-1">Senha</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-green-600 transition-colors" />
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimo 8 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-12 pr-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:ring-green-500/30 h-12 rounded-xl transition-all shadow-sm"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-semibold text-lg shadow-lg shadow-green-500/25 transition-all ease-in-out duration-300 mt-2 animate-in fade-in slide-in-from-bottom-4 delay-150"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Criando conta...
                    </span>
                  ) : (
                    'Criar Conta'
                  )}
                </Button>

                <div className="text-center pt-2 animate-in fade-in slide-in-from-bottom-5 duration-500 delay-200">
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className="inline-flex items-center justify-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors group"
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
                  <Label htmlFor="forgot-email" className="text-slate-700 font-medium ml-1">Email da conta</Label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-green-600 transition-colors" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:ring-green-500/30 h-12 rounded-xl transition-all shadow-sm"
                      required
                    />
                  </div>
                  <p className="text-xs text-slate-400 ml-1 mt-1">
                    Você receberá um link no email para criar uma nova senha.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-semibold text-lg shadow-lg shadow-green-500/25 transition-all ease-in-out duration-300 mt-2 animate-in fade-in slide-in-from-bottom-4 delay-150"
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
                    className="inline-flex items-center justify-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors group"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                    Voltar para o login
                  </button>
                </div>
              </form>
            )}

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-center items-center text-slate-400 text-xs gap-1.5">
              <Zap className="w-3 h-3 text-green-500" />
              <span>SolarZap CRM &copy; {new Date().getFullYear()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
