import { useState } from 'react';
import { Building2, Plus, Save } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { InternalCrmClientDetail } from '@/modules/internal-crm/components/clients/InternalCrmClientDetail';
import { InternalCrmClientsView } from '@/modules/internal-crm/components/clients/InternalCrmClientsView';
import { useInternalCrmClientsModule } from '@/modules/internal-crm/hooks/useInternalCrmClients';
import { useInternalCrmPipelineStages } from '@/modules/internal-crm/hooks/useInternalCrmApi';

export default function InternalCrmClientsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageCode, setStageCode] = useState('all');
  const [lifecycle, setLifecycle] = useState('all');
  const [draft, setDraft] = useState({
    company_name: '',
    primary_contact_name: '',
    primary_phone: '',
    primary_email: '',
    source_channel: 'whatsapp',
    lifecycle_status: 'lead',
    notes: '',
  });

  const stagesQuery = useInternalCrmPipelineStages();
  const clients = useInternalCrmClientsModule(selectedClientId, {
    search,
    stage_code: stageCode,
    lifecycle_status: lifecycle,
  });

  const handleSaveClient = async () => {
    await clients.upsertClientMutation.mutateAsync({
      action: 'upsert_client',
      ...draft,
    });

    toast({ title: 'Cliente salvo', description: 'Cadastro interno atualizado com sucesso.' });
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
  };

  const handleGenerateCheckout = async (dealId: string) => {
    const data = await clients.checkoutMutation.mutateAsync({
      action: 'create_deal_checkout_link',
      deal_id: dealId,
      client_id: selectedClientId,
    });

    const checkoutUrl = String((data as { checkout_url?: string })?.checkout_url || '');
    if (checkoutUrl) {
      window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
    }

    toast({ title: 'Checkout gerado', description: 'Link de pagamento aberto em nova aba.' });
  };

  const handleCreateNextAction = async (dealId: string) => {
    if (!selectedClientId) return;

    await clients.upsertTaskMutation.mutateAsync({
      action: 'upsert_task',
      client_id: selectedClientId,
      deal_id: dealId,
      title: 'Próxima ação comercial',
      task_kind: 'next_action',
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    toast({ title: 'Próxima ação criada', description: 'A tarefa entrou na fila operacional.' });
  };

  const handleProvision = async (dealId?: string) => {
    if (!selectedClientId) return;

    await clients.provisionMutation.mutateAsync({
      action: 'provision_customer',
      client_id: selectedClientId,
      deal_id: dealId,
    });

    toast({ title: 'Provisionamento concluído', description: 'Conta do cliente criada e vinculada ao CRM interno.' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        subtitle="Base comercial interna com detalhe operacional e ponte de provisionamento."
        icon={Building2}
        actionContent={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo cliente
          </Button>
        }
      />

      <InternalCrmClientsView
        clients={clients.clientsQuery.data?.clients || []}
        selectedClientId={selectedClientId}
        onSelectClient={setSelectedClientId}
        search={search}
        onSearchChange={setSearch}
        stageCode={stageCode}
        onStageCodeChange={setStageCode}
        lifecycle={lifecycle}
        onLifecycleChange={setLifecycle}
        stages={stagesQuery.data?.stages || []}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo cliente interno</DialogTitle>
            <DialogDescription>
              Crie a ficha comercial antes de pipeline, inbox e provisionamento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input
                value={draft.company_name}
                onChange={(event) => setDraft((current) => ({ ...current, company_name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Contato principal</Label>
              <Input
                value={draft.primary_contact_name}
                onChange={(event) => setDraft((current) => ({ ...current, primary_contact_name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={draft.primary_phone}
                onChange={(event) => setDraft((current) => ({ ...current, primary_phone: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={draft.primary_email}
                onChange={(event) => setDraft((current) => ({ ...current, primary_email: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Origem</Label>
              <Select
                value={draft.source_channel}
                onValueChange={(value) => setDraft((current) => ({ ...current, source_channel: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="google_ads">Google Ads</SelectItem>
                  <SelectItem value="indicacao">Indicação</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Lifecycle</Label>
              <Select
                value={draft.lifecycle_status}
                onValueChange={(value) => setDraft((current) => ({ ...current, lifecycle_status: value }))}
              >
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
            <Textarea
              rows={4}
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSaveClient()} disabled={clients.upsertClientMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Salvar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={Boolean(selectedClientId)} onOpenChange={(open) => !open && setSelectedClientId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{clients.clientDetailQuery.data?.client.company_name || 'Cliente interno'}</SheetTitle>
            <SheetDescription>
              Visão completa para fechamento, follow-up e provisionamento.
            </SheetDescription>
          </SheetHeader>

          {clients.clientDetailQuery.data ? (
            <div className="mt-6">
              <InternalCrmClientDetail
                detail={clients.clientDetailQuery.data}
                onGenerateCheckout={(dealId) => void handleGenerateCheckout(dealId)}
                onCreateNextAction={(dealId) => void handleCreateNextAction(dealId)}
                onProvision={(dealId) => void handleProvision(dealId)}
              />
            </div>
          ) : (
            <div className="mt-6 text-sm text-muted-foreground">Carregando detalhe do cliente...</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
