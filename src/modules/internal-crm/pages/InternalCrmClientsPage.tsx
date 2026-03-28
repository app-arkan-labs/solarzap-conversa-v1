import { useState } from 'react';
import { Building2, CreditCard, ExternalLink, Plus, Rocket, Save, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  internalCrmQueryKeys,
  useInternalCrmClientDetail,
  useInternalCrmClients,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { TokenBadge, formatCurrencyBr, formatDateOnly, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';

export default function InternalCrmClientsPage() {
  const { toast } = useToast();
  const clientsQuery = useInternalCrmClients();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const clientDetailQuery = useInternalCrmClientDetail(selectedClientId);
  const [draft, setDraft] = useState({
    company_name: '',
    primary_contact_name: '',
    primary_phone: '',
    primary_email: '',
    source_channel: 'whatsapp',
    lifecycle_status: 'lead',
    notes: '',
  });

  const clientMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.clients({}), internalCrmQueryKeys.dashboard({})],
    onSuccess: async () => {
      toast({ title: 'Cliente salvo', description: 'O cadastro interno foi atualizado.' });
      setDialogOpen(false);
      setDraft({
        company_name: '',
        primary_contact_name: '',
        primary_phone: '',
        primary_email: '',
        source_channel: 'whatsapp',
        lifecycle_status: 'lead',
        notes: '',
      });
    },
  });

  const taskMutation = useInternalCrmMutation({
    invalidate: selectedClientId ? [internalCrmQueryKeys.clientDetail(selectedClientId), internalCrmQueryKeys.dashboard({})] : [internalCrmQueryKeys.dashboard({})],
    onSuccess: async () => {
      toast({ title: 'Proxima acao criada', description: 'A fila operacional foi atualizada.' });
    },
  });

  const checkoutMutation = useInternalCrmMutation({
    invalidate: selectedClientId ? [internalCrmQueryKeys.clientDetail(selectedClientId), internalCrmQueryKeys.deals({})] : [internalCrmQueryKeys.deals({})],
    onSuccess: async (data) => {
      const checkoutUrl = typeof (data as Record<string, unknown>).checkout_url === 'string' ? String((data as Record<string, unknown>).checkout_url) : null;
      if (checkoutUrl) {
        window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
      }
      toast({ title: 'Checkout gerado', description: 'O link Stripe foi aberto em uma nova aba.' });
    },
  });

  const provisionMutation = useInternalCrmMutation({
    invalidate: selectedClientId ? [internalCrmQueryKeys.clientDetail(selectedClientId), internalCrmQueryKeys.clients({}), internalCrmQueryKeys.dashboard({})] : [internalCrmQueryKeys.clients({}), internalCrmQueryKeys.dashboard({})],
    onSuccess: async () => {
      toast({ title: 'Conta provisionada', description: 'O cliente foi vinculado ao app publico com sucesso.' });
    },
  });

  const detail = clientDetailQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        subtitle="Base interna com detalhe comercial, onboarding e ponte com o app publico."
        icon={Building2}
        actionContent={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo cliente
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Base ativa do CRM interno</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Lifecycle</TableHead>
                <TableHead>MRR</TableHead>
                <TableHead>Proxima acao</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(clientsQuery.data?.clients || []).map((client) => (
                <TableRow key={client.id} className="cursor-pointer" onClick={() => setSelectedClientId(client.id)}>
                  <TableCell className="font-medium">{client.company_name}</TableCell>
                  <TableCell>{client.primary_contact_name || '-'}</TableCell>
                  <TableCell><TokenBadge token={client.current_stage_code} label={client.current_stage_code} /></TableCell>
                  <TableCell><TokenBadge token={client.lifecycle_status} /></TableCell>
                  <TableCell>{formatCurrencyBr(client.total_mrr_cents)}</TableCell>
                  <TableCell>{client.next_action || '-'}</TableCell>
                </TableRow>
              ))}
              {(clientsQuery.data?.clients || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum cliente interno cadastrado ainda.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo cliente interno</DialogTitle>
            <DialogDescription>Crie a ficha do lead/cliente antes de trabalhar pipeline, inbox ou provisionamento.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={draft.company_name} onChange={(event) => setDraft((current) => ({ ...current, company_name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Contato principal</Label>
              <Input value={draft.primary_contact_name} onChange={(event) => setDraft((current) => ({ ...current, primary_contact_name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={draft.primary_phone} onChange={(event) => setDraft((current) => ({ ...current, primary_phone: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={draft.primary_email} onChange={(event) => setDraft((current) => ({ ...current, primary_email: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select value={draft.source_channel} onValueChange={(value) => setDraft((current) => ({ ...current, source_channel: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="google_ads">Google Ads</SelectItem>
                  <SelectItem value="indicacao">Indicacao</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lifecycle</Label>
              <Select value={draft.lifecycle_status} onValueChange={(value) => setDraft((current) => ({ ...current, lifecycle_status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="customer_onboarding">Onboarding</SelectItem>
                  <SelectItem value="active_customer">Ativo</SelectItem>
                  <SelectItem value="churn_risk">Risco de churn</SelectItem>
                  <SelectItem value="churned">Churnado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea rows={4} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() =>
                clientMutation.mutate({
                  action: 'upsert_client',
                  ...draft,
                })
              }
              disabled={clientMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(selectedClientId)} onOpenChange={(open) => !open && setSelectedClientId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{detail?.client.company_name || 'Cliente interno'}</SheetTitle>
            <SheetDescription>
              Ficha completa do cliente, deals associados, tarefas e vinculo com o app publico.
            </SheetDescription>
          </SheetHeader>

          {detail ? (
            <div className="mt-6 space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumo</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Contato</p>
                    <p className="font-medium">{detail.client.primary_contact_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Telefone</p>
                    <p className="font-medium">{detail.client.primary_phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">E-mail</p>
                    <p className="font-medium">{detail.client.primary_email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Origem</p>
                    <p className="font-medium">{detail.client.source_channel || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Etapa</p>
                    <TokenBadge token={detail.client.current_stage_code} label={detail.client.current_stage_code} />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Lifecycle</p>
                    <TokenBadge token={detail.client.lifecycle_status} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Deals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(detail.deals || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum deal associado a este cliente.</p>
                  ) : (
                    detail.deals.map((deal) => (
                      <div key={deal.id} className="rounded-2xl border border-border/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{deal.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrencyBr(deal.one_time_total_cents)} one-time e {formatCurrencyBr(deal.mrr_cents)} de MRR
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <TokenBadge token={deal.status} />
                            <TokenBadge token={deal.payment_status} />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {deal.payment_method === 'stripe' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => checkoutMutation.mutate({ action: 'create_deal_checkout_link', deal_id: deal.id, client_id: detail.client.id })}
                            >
                              <CreditCard className="mr-2 h-4 w-4" />
                              Gerar checkout
                            </Button>
                          ) : null}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              taskMutation.mutate({
                                action: 'upsert_task',
                                client_id: detail.client.id,
                                deal_id: deal.id,
                                title: `Proxima acao para ${deal.title}`,
                                task_kind: 'next_action',
                                due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                              })
                            }
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Registrar proxima acao
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Provisionamento no app publico</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <TokenBadge token={detail.app_link?.provisioning_status || 'pending'} />
                    {detail.app_link?.provisioned_at ? <span className="text-xs text-muted-foreground">Provisionado em {formatDateTime(detail.app_link.provisioned_at)}</span> : null}
                  </div>
                  {detail.linked_public_org_summary?.org ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
                      <div className="flex items-center gap-2 font-medium text-emerald-900">
                        <ShieldCheck className="h-4 w-4" />
                        Org vinculada: {detail.linked_public_org_summary.org.name}
                      </div>
                      <div className="mt-2 space-y-1 text-emerald-900/80">
                        <p>Plano: {detail.linked_public_org_summary.org.plan || '-'}</p>
                        <p>Status: {detail.linked_public_org_summary.org.subscription_status || '-'}</p>
                        <p>Membros: {detail.linked_public_org_summary.stats?.member_count || 0}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Este cliente ainda nao foi provisionado no SolarZap principal.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        provisionMutation.mutate({
                          action: 'provision_customer',
                          client_id: detail.client.id,
                          deal_id: detail.deals[0]?.id,
                        })
                      }
                    >
                      <Rocket className="mr-2 h-4 w-4" />
                      Provisionar conta SolarZap
                    </Button>
                    {detail.app_link?.linked_public_org_id ? (
                      <Button variant="outline" onClick={() => window.open(`/admin/orgs/${detail.app_link?.linked_public_org_id}`, '_blank', 'noopener,noreferrer')}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Abrir org no admin
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Fila de tarefas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(detail.tasks || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma tarefa registrada.</p>
                  ) : (
                    detail.tasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-border/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{task.title}</p>
                          <TokenBadge token={task.status} />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{task.notes || 'Sem notas adicionais.'}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Prazo: {formatDateTime(task.due_at)}</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="mt-6 text-sm text-muted-foreground">Carregando detalhe do cliente...</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
