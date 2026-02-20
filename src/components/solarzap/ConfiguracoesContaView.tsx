import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Loader2, User, Mail, Lock, ShieldCheck, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAuthUserDisplayName } from '@/lib/memberDisplayName';

export function ConfiguracoesContaView() {
    const { user, role, signOut } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        if (user) {
            setEmail(user.email || '');
            setProfileName(getAuthUserDisplayName(user));
        }
    }, [user]);

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
        if (newPassword !== confirmPassword) {
            toast({ title: 'Senhas incompatíveis', description: 'A nova senha e a confirmação devem ser iguais.', variant: 'destructive' });
            return;
        }
        if (newPassword.length < 6) {
            toast({ title: 'Senha fraca', description: 'A senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;
            toast({ title: 'Senha atualizada', description: 'A sua senha foi alterada com sucesso.' });
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

    return (
        <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-4xl max-h-full mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Minha Conta</h1>
                    <p className="text-muted-foreground mt-2">
                        Gerencie suas informações de perfil e segurança.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-primary" /> Informações do Perfil</CardTitle>
                            <CardDescription>Atualize os seus dados básicos.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form id="profile-form" onSubmit={handleUpdateProfile} className="space-y-4">
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
                            <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5 text-primary" /> Segurança</CardTitle>
                            <CardDescription>Altere a sua senha de acesso.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form id="password-form" onSubmit={handleUpdatePassword} className="space-y-4">
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
                            <Button type="submit" form="password-form" disabled={isLoading || !newPassword || !confirmPassword} className="w-full sm:w-auto" variant="outline">
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
