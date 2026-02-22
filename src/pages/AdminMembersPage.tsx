import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Users, UserPlus, Shield, Eye, Trash2, Save, Settings2, Bot, Zap, Plug, Brain, User, Ban, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useSellerPermissions, type SellerPermissions } from '@/hooks/useSellerPermissions';
import {
  inviteMember,
  listMembers,
  removeMember,
  updateMember,
  type MemberDto,
  type OrgRole,
} from '@/lib/orgAdminClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

type InviteMode = 'create' | 'invite';
type AdminMembersPageProps = {
  embedded?: boolean;
};

type DraftByUserId = Record<
  string,
  {
    role: OrgRole;
    can_view_team_leads: boolean;
  }
>;

const ROLE_OPTIONS: OrgRole[] = ['owner', 'admin', 'user', 'consultant'];

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  user: 'Vendedor',
  consultant: 'Consultor',
};

const ROLE_COLORS: Record<OrgRole, string> = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  user: 'bg-green-100 text-green-700 border-green-200',
  consultant: 'bg-amber-100 text-amber-700 border-amber-200',
};

function fallbackMemberLabel(member: MemberDto) {
  if (member.email) {
    return member.email;
  }
  return member.user_id;
}

export default function AdminMembersPage({ embedded = false }: AdminMembersPageProps) {
  const { loading: authLoading, role } = useAuth();
  const { toast } = useToast();

  const [loadingMembers, setLoadingMembers] = useState(true);
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [draftByUserId, setDraftByUserId] = useState<DraftByUserId>({});
  const [submittingByUserId, setSubmittingByUserId] = useState<Record<string, boolean>>({});
  const [removingByUserId, setRemovingByUserId] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('user');
  const [inviteCanViewTeamLeads, setInviteCanViewTeamLeads] = useState(false);
  const [inviteMode, setInviteMode] = useState<InviteMode>('create');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);

  const canAccessAdmin = role === 'owner' || role === 'admin';

  const {
    sellerPermissions,
    loading: permissionsLoading,
    saving: permissionsSaving,
    updateSellerPermissions,
  } = useSellerPermissions();

  const ownerCount = useMemo(
    () => members.filter((member) => member.role === 'owner').length,
    [members],
  );

  const syncDrafts = (nextMembers: MemberDto[]) => {
    const nextDrafts: DraftByUserId = {};
    for (const member of nextMembers) {
      nextDrafts[member.user_id] = {
        role: member.role,
        can_view_team_leads: member.can_view_team_leads,
      };
    }
    setDraftByUserId(nextDrafts);
  };

  const loadMembers = async (isRefresh = false) => {
    if (!canAccessAdmin) {
      setLoadingMembers(false);
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoadingMembers(true);
      }

      const response = await listMembers();
      const orderedMembers = [...response.members].sort((a, b) => {
        const joinedA = new Date(a.joined_at).getTime();
        const joinedB = new Date(b.joined_at).getTime();
        if (joinedA !== joinedB) {
          return joinedA - joinedB;
        }
        return fallbackMemberLabel(a).localeCompare(fallbackMemberLabel(b));
      });

      setMembers(orderedMembers);
      syncDrafts(orderedMembers);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar membros.';
      toast({
        title: 'Falha ao carregar equipe',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoadingMembers(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (authLoading) {
      return;
    }
    void loadMembers();
  }, [authLoading, canAccessAdmin]);

  const handleInviteSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim()) {
      toast({
        title: 'Email obrigatorio',
        description: 'Informe um email valido para convidar membro.',
        variant: 'destructive',
      });
      return;
    }

    setInviteLoading(true);
    setLastTempPassword(null);
    try {
      const response = await inviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
        can_view_team_leads: inviteCanViewTeamLeads,
        mode: inviteMode,
      });

      toast({
        title: 'Convite registrado',
        description:
          response.mode === 'create'
            ? 'Usuario criado e vinculado a organizacao.'
            : 'Convite enviado e membership atualizado.',
      });

      setInviteEmail('');
      setInviteRole('user');
      setInviteCanViewTeamLeads(false);
      setInviteMode('create');
      setLastTempPassword(response.temp_password ?? null);
      await loadMembers(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao convidar membro.';
      toast({
        title: 'Erro no convite',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleDraftChange = (userId: string, partial: Partial<DraftByUserId[string]>) => {
    setDraftByUserId((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...partial,
      },
    }));
  };

  const handleSaveMember = async (member: MemberDto) => {
    const draft = draftByUserId[member.user_id];
    if (!draft) {
      return;
    }

    const noChanges =
      draft.role === member.role && draft.can_view_team_leads === member.can_view_team_leads;
    if (noChanges) {
      return;
    }

    setSubmittingByUserId((current) => ({ ...current, [member.user_id]: true }));
    try {
      await updateMember({
        user_id: member.user_id,
        role: draft.role,
        can_view_team_leads: draft.can_view_team_leads,
      });

      toast({
        title: 'Membro atualizado',
        description: `${fallbackMemberLabel(member)} atualizado com sucesso.`,
      });
      await loadMembers(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao atualizar membro.';
      toast({
        title: 'Erro ao atualizar membro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmittingByUserId((current) => ({ ...current, [member.user_id]: false }));
    }
  };

  const handleRemoveMember = async (member: MemberDto) => {
    const confirmed = window.confirm(
      `Remover ${fallbackMemberLabel(member)} da organizacao? Esta acao nao remove o usuario do Auth.`,
    );
    if (!confirmed) {
      return;
    }

    setRemovingByUserId((current) => ({ ...current, [member.user_id]: true }));
    try {
      await removeMember(member.user_id);
      toast({
        title: 'Membro removido',
        description: `${fallbackMemberLabel(member)} removido da organizacao.`,
      });
      await loadMembers(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao remover membro.';
      toast({
        title: 'Erro ao remover membro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setRemovingByUserId((current) => ({ ...current, [member.user_id]: false }));
    }
  };

  if (authLoading || loadingMembers) {
    return (
      <div className={`${embedded ? 'h-full' : 'min-h-screen'} bg-background flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando painel de membros...</p>
        </div>
      </div>
    );
  }

  if (!canAccessAdmin) {
    return (
      <div className={`${embedded ? 'h-full' : 'min-h-screen'} bg-background flex items-center justify-center p-6`}>
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>
              Apenas usuarios owner/admin podem acessar o painel de membros.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/">Voltar para o dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={`${embedded ? 'h-full flex-1 overflow-y-auto' : 'min-h-screen'} bg-background p-6 md:p-8`}
      data-testid="admin-members-page"
    >
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              Gestão de Equipe
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie membros, funções e permissões da sua organização.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void loadMembers(true)} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Atualizar
            </Button>
            {!embedded && (
              <Button asChild variant="secondary">
                <Link to="/">Voltar</Link>
              </Button>
            )}
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Adicionar Membro
            </CardTitle>
            <CardDescription>
              Crie com senha temporária ou envie um convite por e-mail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-12" onSubmit={handleInviteSubmit}>
              <div className="md:col-span-5">
                <label className="text-sm font-medium">Email</label>
                <Input
                  data-testid="invite-email-input"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="membro@empresa.com"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Função</label>
                <select
                  data-testid="invite-role-select"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as OrgRole)}
                >
                  {ROLE_OPTIONS.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {ROLE_LABELS[roleOption]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Modo</label>
                <select
                  data-testid="invite-mode-select"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={inviteMode}
                  onChange={(event) => setInviteMode(event.target.value as InviteMode)}
                >
                  <option value="create">Criar com senha</option>
                  <option value="invite">Enviar convite</option>
                </select>
              </div>
              <div className="md:col-span-2 flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <Switch
                    checked={inviteCanViewTeamLeads}
                    onCheckedChange={setInviteCanViewTeamLeads}
                    className="scale-90"
                  />
                  <span className="text-xs">Ver leads da equipe</span>
                </label>
              </div>
              <div className="md:col-span-1 flex items-end">
                <Button data-testid="invite-submit" type="submit" disabled={inviteLoading} className="w-full">
                  {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Convidar'}
                </Button>
              </div>
            </form>

            {lastTempPassword && (
              <div
                data-testid="invite-temp-password"
                className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm"
              >
                <span className="font-medium text-amber-800">Senha temporária:</span>{' '}
                <code className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">{lastTempPassword}</code>
                <p className="text-xs text-amber-600 mt-1">Compartilhe essa senha com o novo membro. Ele poderá alterá-la depois.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Membros da Equipe
              <Badge variant="secondary" className="ml-1">{members.length}</Badge>
            </CardTitle>
            <CardDescription>
              {ownerCount} proprietário(s) ativo(s). O último proprietário não pode ser removido.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="members-table">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium">Membro</th>
                  <th className="pb-3 font-medium">Função</th>
                  <th className="pb-3 font-medium">Ver equipe</th>
                  <th className="pb-3 font-medium">Entrada</th>
                  <th className="pb-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const draft = draftByUserId[member.user_id] || {
                    role: member.role,
                    can_view_team_leads: member.can_view_team_leads,
                  };
                  const dirty =
                    draft.role !== member.role ||
                    draft.can_view_team_leads !== member.can_view_team_leads;

                  return (
                    <tr
                      key={member.user_id}
                      data-testid={`member-row-${member.user_id}`}
                      className="border-b align-middle"
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                            {(fallbackMemberLabel(member)[0] || '?').toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium">{fallbackMemberLabel(member)}</span>
                            <Badge variant="outline" className={`ml-2 text-[10px] ${ROLE_COLORS[member.role]}`}>
                              {ROLE_LABELS[member.role]}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <select
                          data-testid={`member-role-${member.user_id}`}
                          className="h-9 rounded-md border border-input bg-background px-2"
                          value={draft.role}
                          onChange={(event) =>
                            handleDraftChange(member.user_id, {
                              role: event.target.value as OrgRole,
                            })
                          }
                        >
                          {ROLE_OPTIONS.map((roleOption) => (
                            <option key={roleOption} value={roleOption}>
                              {ROLE_LABELS[roleOption]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={draft.can_view_team_leads}
                            onCheckedChange={(checked) =>
                              handleDraftChange(member.user_id, {
                                can_view_team_leads: checked,
                              })
                            }
                            className="scale-90"
                          />
                          <Eye className={`h-3.5 w-3.5 ${draft.can_view_team_leads ? 'text-green-600' : 'text-slate-300'}`} />
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {new Date(member.joined_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            data-testid={`member-save-${member.user_id}`}
                            disabled={!dirty || submittingByUserId[member.user_id] === true}
                            onClick={() => void handleSaveMember(member)}
                          >
                            {submittingByUserId[member.user_id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <><Save className="h-3.5 w-3.5 mr-1" /> Salvar</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`member-remove-${member.user_id}`}
                            disabled={removingByUserId[member.user_id] === true}
                            onClick={() => void handleRemoveMember(member)}
                          >
                            {removingByUserId[member.user_id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
        {/* Seller Permissions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Permissões de Vendedores
            </CardTitle>
            <CardDescription>
              Defina o que os vendedores e consultores podem acessar e fazer.{' '}
              Proprietários e Administradores sempre têm acesso total.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {permissionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Settings Tabs Access */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Acesso às Abas de Configurações
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Escolha quais abas os vendedores podem ver no menu de configurações.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <PermissionToggle
                      icon={<Bot className="h-4 w-4" />}
                      label="Inteligência Artificial"
                      description="Configurações de agentes IA"
                      checked={sellerPermissions?.tab_ia_agentes ?? true}
                      saving={permissionsSaving}
                      onChange={(v) => void updateSellerPermissions({ tab_ia_agentes: v })}
                    />
                    <PermissionToggle
                      icon={<Zap className="h-4 w-4" />}
                      label="Automações"
                      description="Mensagens automáticas"
                      checked={sellerPermissions?.tab_automacoes ?? true}
                      saving={permissionsSaving}
                      onChange={(v) => void updateSellerPermissions({ tab_automacoes: v })}
                    />
                    <PermissionToggle
                      icon={<Plug className="h-4 w-4" />}
                      label="Central de Integrações"
                      description="WhatsApp, Google, etc."
                      checked={sellerPermissions?.tab_integracoes ?? true}
                      saving={permissionsSaving}
                      onChange={(v) => void updateSellerPermissions({ tab_integracoes: v })}
                    />
                    <PermissionToggle
                      icon={<Brain className="h-4 w-4" />}
                      label="Banco de Dados IA"
                      description="Base de conhecimento"
                      checked={sellerPermissions?.tab_banco_ia ?? true}
                      saving={permissionsSaving}
                      onChange={(v) => void updateSellerPermissions({ tab_banco_ia: v })}
                    />
                    <PermissionToggle
                      icon={<User className="h-4 w-4" />}
                      label="Minha Conta"
                      description="Perfil e senha"
                      checked={sellerPermissions?.tab_minha_conta ?? true}
                      saving={permissionsSaving}
                      onChange={(v) => void updateSellerPermissions({ tab_minha_conta: v })}
                    />
                  </div>
                </div>

                <div className="border-t" />

                {/* Action Permissions */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Permissões de Ações
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Controle quais ações os vendedores podem executar.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <PermissionToggle
                      icon={<Trash2 className="h-4 w-4" />}
                      label="Deletar Leads"
                      description="Excluir leads permanentemente"
                      checked={sellerPermissions?.can_delete_leads ?? true}
                      saving={permissionsSaving}
                      onChange={(v) => void updateSellerPermissions({ can_delete_leads: v })}
                    />
                    <PermissionToggle
                      icon={<Ban className="h-4 w-4" />}
                      label="Deletar Propostas"
                      description="Excluir propostas existentes"
                      checked={sellerPermissions?.can_delete_proposals ?? true}
                      saving={permissionsSaving}
                      onChange={(v) => void updateSellerPermissions({ can_delete_proposals: v })}
                    />
                    <PermissionToggle
                      icon={<Sparkles className="h-4 w-4" />}
                      label="Ligar/Desligar IA"
                      description="Ativar ou pausar IA nos leads"
                      checked={sellerPermissions?.can_toggle_ai ?? true}
                      saving={permissionsSaving}
                      onChange={(v) => void updateSellerPermissions({ can_toggle_ai: v })}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Permission Toggle Card ── */
function PermissionToggle({
  icon,
  label,
  description,
  checked,
  saving,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  saving: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          checked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        }`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={saving}
        className="scale-90"
      />
    </div>
  );
}
