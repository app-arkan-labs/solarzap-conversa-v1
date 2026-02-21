import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sun, Lock, Loader2, ArrowLeft, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const UpdatePassword = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSessionReady, setIsSessionReady] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

    useEffect(() => {
        // Check if we have a hash token, which happens on password reset redirect
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setIsSessionReady(true);
            } else {
                // Wait a bit for the session to be established by the URL hash interceptor
                setTimeout(async () => {
                    const { data } = await supabase.auth.getSession();
                    if (data.session) {
                        setIsSessionReady(true);
                    } else {
                        toast({
                            title: 'Erro de Sessão',
                            description: 'O link de recuperação parece ser inválido ou expirou.',
                            variant: 'destructive',
                        });
                        navigate('/login');
                    }
                }, 1500);
            }
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setIsSessionReady(true);
            } else if (session) {
                setIsSessionReady(true);
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, [navigate, toast]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast({
                title: 'As senhas não coincidem',
                description: 'Por favor, certifique-se de que ambas as senhas são iguais.',
                variant: 'destructive',
            });
            return;
        }

        if (password.length < 6) {
            toast({
                title: 'Senha muito curta',
                description: 'A senha deve ter pelo menos 6 caracteres.',
                variant: 'destructive',
            });
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            toast({
                title: 'Senha atualizada!',
                description: 'Sua senha foi redefinida com sucesso. Faça login.',
            });

            // Sign out to force the user to login with the new credentials
            await supabase.auth.signOut();
            navigate('/login');
        } catch (err: any) {
            toast({
                title: 'Erro',
                description: err.message || 'Ocorreu um erro ao atualizar a senha.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!isSessionReady) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
                <Loader2 className="h-8 w-8 text-green-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex bg-gradient-to-br from-green-50 to-emerald-100 relative overflow-hidden font-sans">
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
                                Redefinir Senha
                            </CardTitle>
                            <CardDescription className="text-slate-500 text-base font-medium">
                                Por favor, crie uma nova senha para sua conta
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="relative z-10 pb-10 px-6 sm:px-8">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <Label htmlFor="password" className="text-slate-700 font-medium ml-1">Nova Senha</Label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-green-600 transition-colors" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:ring-green-500/30 h-12 rounded-xl transition-all shadow-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-3 duration-500 delay-75">
                                <Label htmlFor="confirm-password" className="text-slate-700 font-medium ml-1">Confirmar Nova Senha</Label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-green-600 transition-colors" />
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="pl-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-green-500 focus:ring-green-500/30 h-12 rounded-xl transition-all shadow-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-12 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-semibold text-lg shadow-lg shadow-green-500/25 transition-all ease-in-out duration-300 mt-6 animate-in fade-in slide-in-from-bottom-4 delay-150"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Salvando...
                                    </span>
                                ) : (
                                    'Salvar Nova Senha'
                                )}
                            </Button>
                        </form>

                        <div className="mt-8 text-center animate-in fade-in slide-in-from-bottom-5 duration-500 delay-200">
                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="inline-flex items-center justify-center text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors group focus:outline-none"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                                Voltar para o login
                            </button>
                        </div>

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

export default UpdatePassword;
