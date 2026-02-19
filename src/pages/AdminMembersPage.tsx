import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
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
              <Users className="h-6 w-6 text-primary" />
              Admin Members
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie convite, roles e permissoes da organizacao.
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
            <CardTitle>Convidar membro</CardTitle>
            <CardDescription>
              Fluxo hibrido: criar com senha temporaria ou enviar invite por email.
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
                <label className="text-sm font-medium">Role</label>
                <select
                  data-testid="invite-role-select"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as OrgRole)}
                >
                  {ROLE_OPTIONS.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {roleOption}
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
                  <option value="create">create</option>
                  <option value="invite">invite</option>
                </select>
              </div>
              <div className="md:col-span-2 flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    data-testid="invite-can-view-toggle"
                    type="checkbox"
                    checked={inviteCanViewTeamLeads}
                    onChange={(event) => setInviteCanViewTeamLeads(event.target.checked)}
                  />
                  can_view_team_leads
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
                className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
              >
                Senha temporaria criada: <code className="font-semibold">{lastTempPassword}</code>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Membros ({members.length})</CardTitle>
            <CardDescription>
              Owners atuais: {ownerCount}. A remocao/democao do ultimo owner e bloqueada no backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="members-table">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Role</th>
                  <th className="pb-3 font-medium">can_view_team_leads</th>
                  <th className="pb-3 font-medium">Joined</th>
                  <th className="pb-3 font-medium text-right">Acoes</th>
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
                      <td className="py-3 pr-3 font-medium">{fallbackMemberLabel(member)}</td>
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
                              {roleOption}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-3">
                        <label className="inline-flex items-center gap-2">
                          <input
                            data-testid={`member-can-view-${member.user_id}`}
                            type="checkbox"
                            checked={draft.can_view_team_leads}
                            onChange={(event) =>
                              handleDraftChange(member.user_id, {
                                can_view_team_leads: event.target.checked,
                              })
                            }
                          />
                          <span>{draft.can_view_team_leads ? 'true' : 'false'}</span>
                        </label>
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
                              'Salvar'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            data-testid={`member-remove-${member.user_id}`}
                            disabled={removingByUserId[member.user_id] === true}
                            onClick={() => void handleRemoveMember(member)}
                          >
                            {removingByUserId[member.user_id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Remover'
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
      </div>
    </div>
  );
}
