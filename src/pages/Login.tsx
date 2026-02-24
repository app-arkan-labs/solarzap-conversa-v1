import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, Loader2, ArrowLeft, Zap, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ViewMode = 'login' | 'signup' | 'forgot';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('login');
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const error = await signIn(email, password);
      if (!error) {
        navigate('/');
      } else {
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
    setIsLoading(true);
    try {
      const error = await signUp(email, password);
      if (!error) {
        toast({ title: 'Conta criada!', description: 'Verifique seu email para confirmar a conta.' });
        setView('login');
      } else {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro', description: 'Ocorreu um erro inesperado', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Informe seu email', description: 'Digite o email da sua conta para receber o link.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw error;
      toast({
        title: 'Email enviado!',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
      setView('login');
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Não foi possível enviar o email.', variant: 'destructive' });
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
                      placeholder="Mínimo 6 caracteres"
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
