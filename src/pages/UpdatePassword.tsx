import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react';

import AuthContextBadge from '@/components/auth/AuthContextBadge';
import AuthPortalShell from '@/components/auth/AuthPortalShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

const FIELD_CLASS_NAME = 'h-12 rounded-2xl border-border bg-background/82 pl-12 pr-12 text-foreground shadow-sm transition-all focus:border-primary focus:ring-primary/15';

export default function UpdatePassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSessionReady, setIsSessionReady] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setIsSessionReady(true);
                return;
            }

            setTimeout(async () => {
                const { data } = await supabase.auth.getSession();
                if (data.session) {
                    setIsSessionReady(true);
                    return;
                }

                toast({
                    title: 'Erro de sessao',
                    description: 'O link de recuperacao parece invalido ou expirado.',
                    variant: 'destructive',
                });
                navigate('/login');
            }, 1500);
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || session) {
                setIsSessionReady(true);
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, [navigate, toast]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (password !== confirmPassword) {
            toast({
                title: 'As senhas nao coincidem',
                description: 'Revise os campos e tente novamente.',
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

            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            if (recoveryEmail) {
                const { error: reAuthError } = await supabase.auth.signInWithPassword({
                    email: recoveryEmail,
                    password,
                });

                if (!reAuthError) {
                    toast({
                        title: 'Senha atualizada',
                        description: 'Senha redefinida com sucesso. Entrando automaticamente...',
                    });
                    navigate('/onboarding');
                    return;
                }
            }

            toast({
                title: 'Senha atualizada',
                description: 'Sua senha foi redefinida com sucesso. Faca login.',
            });
            await supabase.auth.signOut();
            navigate('/login');
        } catch (error: unknown) {
            toast({
                title: 'Erro ao atualizar senha',
                description: (error as { message?: string })?.message || 'Ocorreu um erro inesperado.',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const rail = (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="brand-logo-disc h-14 w-14">
                    <img src="/logo.png" alt="SolarZap" className="brand-logo-image" />
                </div>
                <div className="space-y-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/90">Seguranca do acesso</p>
                    <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                        Redefina a senha da sua conta.
                    </h1>
                    <p className="max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
                        Defina uma nova senha para concluir a recuperacao e voltar ao login.
                    </p>
                </div>
            </div>

            <div className="auth-portal-info-card">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,hsl(var(--primary)/0.18),hsl(var(--secondary)/0.16))] text-primary shadow-[0_18px_36px_-24px_hsl(var(--primary)/0.4)]">
                    <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Link temporario</p>
                    <p className="text-sm leading-6 text-muted-foreground">Se este link expirar, solicite uma nova recuperacao na tela de login.</p>
                </div>
            </div>
        </div>
    );

    if (!isSessionReady) {
        return (
            <div className="auth-portal-shell flex min-h-screen items-center justify-center px-4">
                <div className="auth-portal-form-surface flex w-full max-w-sm items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Validando sessao de recuperacao...
                </div>
            </div>
        );
    }

    return (
        <AuthPortalShell
            badge={<AuthContextBadge icon={KeyRound} label="Redefinicao segura" />}
            title="Crie uma nova senha"
            description="Preencha os dois campos abaixo para atualizar a senha da sua conta."
            rail={rail}
            footer={
                <div className="flex items-center justify-between gap-3 text-xs">
                    <span>SolarZap CRM © {new Date().getFullYear()}</span>
                    <button type="button" className="font-medium transition-colors hover:text-foreground" onClick={() => navigate('/login')}>
                        Voltar ao login
                    </button>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2 text-left">
                    <Label htmlFor="password" className="ml-1 text-sm font-medium text-foreground">Nova senha</Label>
                    <div className="group relative">
                        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Digite sua nova senha"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className={FIELD_CLASS_NAME}
                            required
                        />
                        <button type="button" tabIndex={-1} onClick={() => setShowPassword((currentValue) => !currentValue)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground">
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                    </div>
                </div>

                <div className="space-y-2 text-left">
                    <Label htmlFor="confirm-password" className="ml-1 text-sm font-medium text-foreground">Confirmar nova senha</Label>
                    <div className="group relative">
                        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                        <Input
                            id="confirm-password"
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Repita a senha"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className={FIELD_CLASS_NAME}
                            required
                        />
                        <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword((currentValue) => !currentValue)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground">
                            {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
                    Use uma senha forte com pelo menos 8 caracteres para concluir a recuperacao com seguranca.
                </div>

                <Button type="submit" className="h-12 w-full text-base font-semibold" disabled={isLoading}>
                    {isLoading ? (
                        <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Salvando...
                        </span>
                    ) : (
                        'Salvar nova senha'
                    )}
                </Button>

                <Button type="button" variant="ghost" className="w-full text-sm text-muted-foreground" onClick={() => navigate('/login')}>
                    <ArrowLeft className="h-4 w-4" />
                    Voltar para o login
                </Button>
            </form>
        </AuthPortalShell>
    );
}

