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

if (password.length < 8) {
    toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 8 caracteres.',
                variant: 'destructive',
            });
            return;
        }

        setIsLoading(true);
        try {
            const { data: currentUserData } = await supabase.auth.getUser();
            const recoveryEmail = currentUserData.user?.email?.trim().toLowerCase() || null;

            const { error } = await supabase.auth.updateUser({
                password: password,
            });

            if (error) throw error;

            if (recoveryEmail) {
                const { error: reAuthError } = await supabase.auth.signInWithPassword({
                    email: recoveryEmail,
                    password,
                });

                if (!reAuthError) {
                    toast({
                        title: 'Senha atualizada!',
                        description: 'Senha redefinida com sucesso. Entrando automaticamente...',
                    });
                    navigate('/onboarding');
                    return;
                }

                console.warn('Automatic sign-in after password reset failed', reAuthError);
            }

            toast({
                title: 'Senha atualizada!',
                description: 'Sua senha foi redefinida com sucesso. Faça login.',
            });

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
            <div className="auth-shell min-h-screen w-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="auth-shell min-h-screen w-full flex relative overflow-hidden font-sans">

            <div className="w-full h-full min-h-screen flex items-center justify-center p-4 sm:p-8 relative z-10">
                <Card className="auth-card w-full max-w-md overflow-hidden relative">

                    <CardHeader className="text-center space-y-6 pt-10 pb-4 relative z-10">
                        <div className="brand-logo-disc mx-auto h-24 w-24 transform transition-all duration-300 hover:scale-105">
                            <img src="/logo.png" alt="SolarZap Logo" className="brand-logo-image" />
                        </div>
                        <div className="space-y-2">
                            <CardTitle className="text-3xl font-bold tracking-tight text-foreground drop-shadow-sm">
                                Redefinir Senha
                            </CardTitle>
                            <CardDescription className="text-muted-foreground text-base font-medium">
                                Por favor, crie uma nova senha para sua conta
                            </CardDescription>
                        </div>
                    </CardHeader>

                    <CardContent className="relative z-10 pb-10 px-6 sm:px-8">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <Label htmlFor="password" className="text-foreground font-medium ml-1">Nova Senha</Label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-12 rounded-xl transition-all shadow-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 text-left animate-in fade-in slide-in-from-bottom-3 duration-500 delay-75">
                                <Label htmlFor="confirm-password" className="text-foreground font-medium ml-1">Confirmar Nova Senha</Label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="pl-12 bg-background/85 border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/20 h-12 rounded-xl transition-all shadow-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="brand-gradient-button w-full h-12 rounded-xl text-white font-semibold text-lg shadow-[0_20px_48px_-22px_hsl(var(--primary)/0.6)] transition-all ease-in-out duration-300 mt-6 animate-in fade-in slide-in-from-bottom-4 delay-150"
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
                                className="inline-flex items-center justify-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group focus:outline-none"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                                Voltar para o login
                            </button>
                        </div>

                        <div className="mt-8 pt-6 border-t border-border flex justify-center items-center text-muted-foreground text-xs gap-1.5">
                            <Zap className="w-3 h-3 text-primary" />
                            <span>SolarZap CRM &copy; {new Date().getFullYear()}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default UpdatePassword;

