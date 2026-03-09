import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, User, Mail, Lock, ShieldCheck, LogOut, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAuthUserDisplayName } from '@/lib/memberDisplayName';
import { PageHeader } from './PageHeader';
import { createBillingPortalSession, createPlanCheckoutSession, useOrgBillingInfo } from '@/hooks/useOrgBilling';
import { runBillingAdminAction } from '@/lib/orgAdminClient';
import PlanBadge from '@/components/billing/PlanBadge';
import UsageBar from '@/components/billing/UsageBar';

export function ConfiguracoesContaView() {
    const { user, role, signOut } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [billingBusy, setBillingBusy] = useState(false);
    const [migratingLegacy, setMigratingLegacy] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const billingQuery = useOrgBillingInfo(Boolean(user));
    const billing = billingQuery.data;

    useEffect(() => {
        if (user) {
            setEmail(user.email || '');
            setProfileName(getAuthUserDisplayName(user));
            setAvatarUrl(user.user_metadata?.avatar_url || null);
        }
    }, [user]);

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            toast({ title: 'Formato inválido', description: 'Use PNG, JPG ou WebP.', variant: 'destructive' });
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast({ title: 'Arquivo muito grande', description: 'A foto deve ter no máximo 2 MB.', variant: 'destructive' });
            return;
        }

        setIsLoading(true);
        try {
            const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
            const path = `${user.id}/avatar.${ext}`;

            const { error: upErr } = await supabase.storage
                .from('avatars')
                .upload(path, file, { contentType: file.type, upsert: true });
            if (upErr) throw upErr;

            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
            const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

            const { error: metaErr } = await supabase.auth.updateUser({
                data: { ...user.user_metadata, avatar_url: publicUrl },
            });
            if (metaErr) throw metaErr;

            setAvatarUrl(publicUrl);
            await supabase.auth.refreshSession();
            toast({ title: 'Foto atualizada', description: 'Sua foto de perfil foi salva.' });
        } catch (err: any) {
            console.error('Avatar upload error:', err);
            toast({ title: 'Erro ao enviar foto', description: err.message || 'Tente novamente.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
            if (avatarInputRef.current) avatarInputRef.current.value = '';
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            toast({ title: 'Erro', description: 'Usuário não autenticado.', variant: 'destructive' });
            return;
        }

        const nextProfileName = profileName.trim();
        if (!nextProfileName) {
            toast({ title: 'Nome inválido', description: 'Por favor, insira o seu nome.', variant: 'destructive' });
            return;
        }

        setIsLoading(true);
        try {
            const currentMetadata =
                user.user_metadata && typeof user.user_metadata === 'object'
                    ? user.user_metadata
                    : {};

            const { data, error } = await supabase.auth.updateUser({
                data: {
                    ...currentMetadata,
                    name: nextProfileName,
                    full_name: nextProfileName,
                    display_name: nextProfileName,
                }
            });
            if (error) throw error;

            setProfileName(getAuthUserDisplayName(data.user ?? user));
            setEmail(data.user?.email || user.email || '');
            await supabase.auth.refreshSession();
            toast({ title: 'Perfil atualizado', description: 'O seu perfil foi atualizado com sucesso.' });
        } catch (err: any) {
            console.error(err);
            toast({ title: 'Erro', description: err.message, variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPassword) {
            toast({ title: 'Senha atual obrigatória', description: 'Informe a senha atual para confirmar a alteração.', variant: 'destructive' });
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ title: 'Senhas incompatíveis', description: 'A nova senha e a confirmação devem ser iguais.', variant: 'destructive' });
            return;
        }
        if (newPassword.length < 8) {
            toast({ title: 'Senha fraca', description: 'A senha deve ter pelo menos 8 caracteres.', variant: 'destructive' });
            return;
        }

        setIsLoading(true);
        try {
            // Sprint 4, Item #17: Verify current password before allowing change
            const { error: signInErr } = await supabase.auth.signInWithPassword({
                email: user?.email || '',
                password: currentPassword,
            });
            if (signInErr) {
                toast({ title: 'Senha atual incorreta', description: 'A senha informada não confere.', variant: 'destructive' });
                return;
            }

            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;
            toast({ title: 'Senha atualizada', description: 'A sua senha foi alterada com sucesso.' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            console.error(err);
            toast({ title: 'Erro', description: err.message, variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const handleUpgradePlan = async () => {
        try {
            setBillingBusy(true);
            const targetPlan = billing?.plan_key === 'free' ? 'start' : 'pro';
            const checkoutUrl = await createPlanCheckoutSession({
                planKey: targetPlan,
                successUrl: `${window.location.origin}/welcome?checkout=success`,
                cancelUrl: `${window.location.origin}/pricing?checkout=cancel`,
            });
            window.location.href = checkoutUrl;
        } catch (err: any) {
            toast({ title: 'Falha ao abrir checkout', description: err?.message || 'Tente novamente.', variant: 'destructive' });
        } finally {
            setBillingBusy(false);
        }
    };

    const handleOpenBillingPortal = async () => {
        try {
            setBillingBusy(true);
            const portalUrl = await createBillingPortalSession();
            window.location.href = portalUrl;
        } catch (err: any) {
            toast({ title: 'Portal indisponível', description: err?.message || 'Tente novamente.', variant: 'destructive' });
        } finally {
            setBillingBusy(false);
        }
    };

    const handleLegacyMigration = async () => {
        try {
            setMigratingLegacy(true);
            await runBillingAdminAction('migrate_legacy_to_trial', { trialDays: 7 });
            await billingQuery.refetch();
            toast({ title: 'Migração aplicada', description: 'Organização migrada para trial de 7 dias.' });
        } catch (err: any) {
            toast({ title: 'Falha na migração', description: err?.message || 'Tente novamente.', variant: 'destructive' });
        } finally {
            setMigratingLegacy(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col items-center h-full bg-slate-50 overflow-hidden">
            <div className="w-full">
                <PageHeader
                    title="Minha Conta"
                    subtitle="Gerencie suas informações de perfil e segurança."
                    icon={User}
                />
            </div>
            <div className="flex-1 p-6 overflow-y-auto w-full">
                <div className="max-w-4xl max-h-full mx-auto space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-primary" /> Perfil</CardTitle>
                            <CardDescription>
                                Atualize suas informações pessoais e foto de perfil.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form id="profile-form" onSubmit={handleUpdateProfile} className="space-y-6">
                                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                        <button
                                            type="button"
                                            data-testid="profile-avatar-trigger"
                                            onClick={() => avatarInputRef.current?.click()}
                                            disabled={isLoading}
                                            className="group relative h-24 w-24 overflow-hidden rounded-full border-2 border-border bg-muted transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                                            aria-label="Alterar foto de perfil"
                                        >
                                            {avatarUrl ? (
                                                <img
                                                    src={avatarUrl}
                                                    alt="Foto de perfil"
                                                    data-testid="profile-avatar-image"
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                                                    {profileName?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                            )}
                                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                                <Camera className="h-5 w-5 text-white" />
                                            </span>
                                        </button>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-foreground">Foto de perfil</p>
                                            <p className="text-xs text-muted-foreground">Clique na foto para alterar.</p>
                                            <p className="text-xs text-muted-foreground">PNG, JPG ou WebP ate 2 MB.</p>
                                        </div>
                                    </div>
                                    <input
                                        ref={avatarInputRef}
                                        data-testid="profile-avatar-input"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="hidden"
                                        onChange={handleAvatarUpload}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">Clique na foto para alterar seu avatar.</p>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nome Completo</Label>
                                    <Input
                                        id="name"
                                        value={profileName}
                                        onChange={e => setProfileName(e.target.value)}
                                        placeholder="João Silva"
                                        disabled={isLoading}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="flex items-center gap-1"><Mail className="w-4 h-4" /> E-mail</Label>
                                    <Input
                                        id="email"
                                        value={email}
                                        disabled
                                        className="bg-muted/50 cursor-not-allowed"
                                        title="O e-mail não pode ser alterado por aqui"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Nível de Acesso</Label>
                                    <div className="px-3 py-2 bg-muted/30 rounded-md border border-border/50 font-medium text-sm text-muted-foreground uppercase capitalize">
                                        {role || 'Membro Padrão'}
                                    </div>
                                </div>
                            </form>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" form="profile-form" disabled={isLoading} className="w-full sm:w-auto">
                                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Salvar Alterações
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Meu Plano</CardTitle>
                            <CardDescription>Resumo do billing da organização ativa.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <PlanBadge billing={billing} />
                            <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-md border border-border bg-muted/20 p-3">
                                    <p className="text-muted-foreground">Plano</p>
                                    <p className="font-semibold uppercase">{billing?.plan_key || 'free'}</p>
                                </div>
                                <div className="rounded-md border border-border bg-muted/20 p-3">
                                    <p className="text-muted-foreground">Status</p>
                                    <p className="font-semibold uppercase">{billing?.subscription_status || 'indefinido'}</p>
                                </div>
                                <div className="rounded-md border border-border bg-muted/20 p-3">
                                    <p className="text-muted-foreground">Acesso</p>
                                    <p className="font-semibold uppercase">{billing?.access_state || 'full'}</p>
                                </div>
                            </div>
                            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                                <UsageBar
                                    label="Propostas no ciclo"
                                    used={Number((billing?.usage?.proposals_generated as number) || 0)}
                                    limit={Number((billing?.effective_limits?.max_proposals_month as number) || (billing?.plan_limits?.max_proposals_month as number) || 0)}
                                />
                                <UsageBar
                                    label="Campanhas no ciclo"
                                    used={Number((billing?.usage?.campaigns_created as number) || 0)}
                                    limit={Number((billing?.effective_limits?.max_campaigns_month as number) || (billing?.plan_limits?.max_campaigns_month as number) || 0)}
                                />
                                <UsageBar
                                    label="Créditos de disparo no ciclo"
                                    used={Number((billing?.usage?.broadcast_credits_used as number) || 0)}
                                    limit={Number((billing?.effective_limits?.monthly_broadcast_credits as number) || (billing?.plan_limits?.monthly_broadcast_credits as number) || 0)}
                                />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" onClick={handleUpgradePlan} disabled={billingBusy}>
                                    Fazer Upgrade
                                </Button>
                                <Button type="button" variant="outline" onClick={handleOpenBillingPortal} disabled={billingBusy}>
                                    Abrir Portal de Cobrança
                                </Button>
                                {(role === 'owner' || role === 'admin') && (
                                    <Button type="button" variant="outline" onClick={handleLegacyMigration} disabled={migratingLegacy}>
                                        {migratingLegacy ? 'Migrando...' : 'Migrar legado para trial'}
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5 text-primary" /> Segurança</CardTitle>
                            <CardDescription>Altere a sua senha de acesso.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form id="password-form" onSubmit={handleUpdatePassword} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="currentPassword">Senha Atual</Label>
                                    <Input
                                        id="currentPassword"
                                        type="password"
                                        value={currentPassword}
                                        onChange={e => setCurrentPassword(e.target.value)}
                                        placeholder="******"
                                        disabled={isLoading}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newPassword">Nova Senha</Label>
                                    <Input
                                        id="newPassword"
                                        type="password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="******"
                                        disabled={isLoading}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="******"
                                        disabled={isLoading}
                                    />
                                </div>
                            </form>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" form="password-form" disabled={isLoading || !currentPassword || !newPassword || !confirmPassword} className="w-full sm:w-auto" variant="outline">
                                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Atualizar Senha
                            </Button>
                        </CardFooter>
                    </Card>

                    <Card className="md:col-span-2 border-destructive/20">
                        <CardHeader>
                            <CardTitle className="text-destructive flex items-center gap-2"><LogOut className="w-5 h-5" /> Sessão</CardTitle>
                            <CardDescription>
                                Encerre sua sessão de acesso na plataforma atual.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="destructive" onClick={handleSignOut} className="w-full sm:w-auto">
                                Sair da Conta
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
