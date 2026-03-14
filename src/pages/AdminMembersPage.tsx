import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Users, UserPlus, Shield, Eye, Trash2, Save, Settings2, Bot, Zap, Plug, Building2, User, Ban, Sparkles, UserCheck, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useSellerPermissions, type SellerPermissions } from '@/hooks/useSellerPermissions';
import {
  inviteMember,
  isOrgAdminInvokeError,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { useMobileViewport } from '@/hooks/useMobileViewport';

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
  owner: 'border-primary/30 bg-primary/14 text-foreground',
  admin: 'border-secondary/24 bg-secondary/14 text-foreground',
  user: 'border-primary/20 bg-primary/10 text-foreground/88',
  consultant: 'border-secondary/18 bg-secondary/10 text-foreground/88',
};

function fallbackMemberLabel(member: MemberDto) {
  if (member.email) {
    return member.email;
  }
  return member.user_id;
}

export default function AdminMembersPage({ embedded = false }: AdminMembersPageProps) {
  const isMobileViewport = useMobileViewport();
  const { loading: authLoading, role, orgId } = useAuth();
  const { toast } = useToast();

  const [loadingMembers, setLoadingMembers] = useState(true);
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [draftByUserId, setDraftByUserId] = useState<DraftByUserId>({});
  const [submittingByUserId, setSubmittingByUserId] = useState<Record<string, boolean>>({});
  const [removingByUserId, setRemovingByUserId] = useState<Record<string, boolean>>({});
  const [memberToRemove, setMemberToRemove] = useState<MemberDto | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('user');
  const [inviteCanViewTeamLeads, setInviteCanViewTeamLeads] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

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

      const response = await listMembers(orgId ?? undefined, { forceRefresh: isRefresh });
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
  }, [authLoading, canAccessAdmin, orgId]);

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
    try {
      const response = await inviteMember({
        org_id: orgId ?? undefined,
        email: inviteEmail.trim(),
        role: inviteRole,
        can_view_team_leads: inviteCanViewTeamLeads,
      });

      const assignedRoleLabel = ROLE_LABELS[response.assigned_role] || ROLE_LABELS[inviteRole];
      let successDescription = 'Convite enviado com link para definir senha.';
      if (response.credential_mode === 'reset_link') {
        successDescription = 'Conta existente vinculada; link de redefinicao enviado por e-mail.';
      } else if (response.credential_mode === 'invite_link') {
        successDescription = 'Convite enviado com link para definir senha.';
      }
      successDescription = `${successDescription} Cargo aplicado: ${assignedRoleLabel}.`;

      toast({
        title: 'Convite registrado',
        description: successDescription,
      });

      setInviteEmail('');
      setInviteRole('user');
      setInviteCanViewTeamLeads(false);
      await loadMembers(true);
    } catch (error) {
      if (isOrgAdminInvokeError(error) && error.code === 'system_email_send_failed') {
        toast({
          title: 'Falha no envio de e-mail',
          description:
            'O membro foi vinculado, mas o e-mail de acesso nao foi entregue. Verifique a configuracao do envio e tente novamente.',
          variant: 'destructive',
        });
        await loadMembers(true);
        return;
      }

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
        org_id: orgId ?? undefined,
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
    setMemberToRemove(member);
  };

  const confirmRemoveMember = async () => {
    const member = memberToRemove;
    if (!member) return;
    setMemberToRemove(null);
    setRemovingByUserId((current) => ({ ...current, [member.user_id]: true }));
    try {
      await removeMember(member.user_id, orgId ?? undefined);
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
      className={`${embedded ? 'h-full flex-1 overflow-y-auto' : 'min-h-screen flex flex-col'} bg-background`}
      data-testid="admin-members-page"
    >
      <PageHeader
        title="Gestão de Equipe"
        subtitle="Gerencie membros, funções e permissões da sua organização."
        icon={UserCog}
        actionContent={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button variant="outline" onClick={() => void loadMembers(true)} disabled={refreshing} className="bg-background/50 glass border-border/50 shadow-sm">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Atualizar
            </Button>
            {!embedded && (
              <Button asChild variant="secondary" className="bg-background/50 glass border-border/50 shadow-sm">
                <Link to="/">Voltar</Link>
              </Button>
            )}
          </div>
        }
      />
      <div className="flex-1 p-4 md:p-8 overflow-y-auto w-full">
        <div className="mx-auto w-full max-w-6xl space-y-6">

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Adicionar Membro
              </CardTitle>
              <CardDescription>
                Envie convite por e-mail com link para definir senha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-12" onSubmit={handleInviteSubmit}>
                <div className="md:col-span-6">
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
                <div className="md:col-span-3 lg:col-span-2">
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
                <div className="md:col-span-3 lg:col-span-2 flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Switch
                      data-testid="invite-can-view-toggle"
                      checked={inviteCanViewTeamLeads}
                      onCheckedChange={setInviteCanViewTeamLeads}
                      className="scale-90"
                    />
                    <span className="text-xs">Ver leads da equipe</span>
                  </label>
                </div>
                <div className="md:col-span-12 lg:col-span-2 flex items-end">
                  <Button data-testid="invite-submit" type="submit" disabled={inviteLoading} className="w-full">
                    {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Convidar'}
                  </Button>
                </div>
              </form>
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
              {isMobileViewport ? (
                <div className="space-y-3" data-testid="members-table">
                  {members.map((member) => {
                    const draft = draftByUserId[member.user_id] || {
                      role: member.role,
                      can_view_team_leads: member.can_view_team_leads,
                    };
                    const dirty =
                      draft.role !== member.role ||
                      draft.can_view_team_leads !== member.can_view_team_leads;

                    return (
                      <div
                        key={member.user_id}
                        data-testid={`member-row-${member.user_id}`}
                        className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)/0.22),hsl(var(--secondary)/0.16))] text-sm font-semibold text-foreground ring-1 ring-border/70">
                                {(fallbackMemberLabel(member)[0] || '?').toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{fallbackMemberLabel(member)}</p>
                                <Badge variant="outline" className={`mt-1 text-[10px] ${ROLE_COLORS[member.role]}`}>
                                  {ROLE_LABELS[member.role]}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground text-right">
                            {new Date(member.joined_at).toLocaleDateString('pt-BR')}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Função</label>
                            <select
                              data-testid={`member-role-${member.user_id}`}
                              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                          </div>

                          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                            <div>
                              <p className="text-sm font-medium">Ver leads da equipe</p>
                              <p className="text-xs text-muted-foreground">Permite visualizar leads de outros vendedores.</p>
                            </div>
                            <Switch
                              data-testid={`member-can-view-${member.user_id}`}
                              checked={draft.can_view_team_leads}
                              onCheckedChange={(checked) =>
                                handleDraftChange(member.user_id, {
                                  can_view_team_leads: checked,
                                })
                              }
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-10 flex-1"
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
                              className="h-10 text-red-600 hover:text-red-700 hover:bg-red-50"
                              data-testid={`member-remove-${member.user_id}`}
                              disabled={removingByUserId[member.user_id] === true}
                              onClick={() => void handleRemoveMember(member)}
                            >
                              {removingByUserId[member.user_id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <><Trash2 className="h-3.5 w-3.5 mr-1" /> Remover</>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
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
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)/0.22),hsl(var(--secondary)/0.16))] text-xs font-semibold text-foreground ring-1 ring-border/70">
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
                              data-testid={`member-can-view-${member.user_id}`}
                              checked={draft.can_view_team_leads}
                              onCheckedChange={(checked) =>
                                handleDraftChange(member.user_id, {
                                  can_view_team_leads: checked,
                                })
                              }
                              className="scale-90"
                            />
                            <Eye className={`h-3.5 w-3.5 ${draft.can_view_team_leads ? 'text-primary' : 'text-muted-foreground'}`} />
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
              )}
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
                        icon={<Building2 className="h-4 w-4" />}
                        label="Minha Empresa"
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
                      <PermissionToggle
                        icon={<UserCheck className="h-4 w-4" />}
                        label="Atribuir Vendedor"
                        description="Atribuir vendedor responsável aos leads"
                        checked={sellerPermissions?.can_assign_leads ?? true}
                        saving={permissionsSaving}
                        onChange={(v) => void updateSellerPermissions({ can_assign_leads: v })}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Remove member confirmation dialog (replaces window.confirm) */}
        <Dialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Remover Membro</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Remover {memberToRemove ? fallbackMemberLabel(memberToRemove) : ''} da organização? Esta ação não remove o usuário do Auth.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMemberToRemove(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmRemoveMember}>Remover</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
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
