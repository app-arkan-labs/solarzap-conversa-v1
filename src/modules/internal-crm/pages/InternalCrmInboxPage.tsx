import { useMemo, useState } from 'react';
import { MessageSquare, PlugZap, QrCode, Save, SendHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  internalCrmQueryKeys,
  useInternalCrmConversationDetail,
  useInternalCrmConversations,
  useInternalCrmInstances,
  useInternalCrmMutation,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import { TokenBadge, formatDateTime } from '@/modules/internal-crm/components/InternalCrmUi';

export default function InternalCrmInboxPage() {
  const { toast } = useToast();
  const conversationsQuery = useInternalCrmConversations();
  const instancesQuery = useInternalCrmInstances();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const conversationDetailQuery = useInternalCrmConversationDetail(selectedConversationId);
  const [messageBody, setMessageBody] = useState('');
  const [instanceDialogOpen, setInstanceDialogOpen] = useState(false);
  const [instanceDraft, setInstanceDraft] = useState({
    instance_name: '',
    display_name: '',
    ai_enabled: false,
  });

  const upsertInstanceMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
    onSuccess: async () => {
      toast({ title: 'Instancia salva', description: 'A instancia interna foi registrada no CRM.' });
      setInstanceDialogOpen(false);
    },
  });

  const connectInstanceMutation = useInternalCrmMutation({
    invalidate: [internalCrmQueryKeys.instances()],
    onSuccess: async (data) => {
      const qr = typeof (data as Record<string, unknown>).qr_code_base64 === 'string'
        ? String((data as Record<string, unknown>).qr_code_base64)
        : null;
      toast({
        title: 'Instancia conectada',
        description: qr ? 'QR code atualizado. Use o modal abaixo para conectar no WhatsApp.' : 'Estado da instancia atualizado.',
      });
    },
  });

  const appendMessageMutation = useInternalCrmMutation({
    invalidate: selectedConversationId
      ? [internalCrmQueryKeys.conversations({}), internalCrmQueryKeys.conversationDetail(selectedConversationId)]
      : [internalCrmQueryKeys.conversations({})],
    onSuccess: async () => {
      setMessageBody('');
      toast({ title: 'Mensagem enviada', description: 'O CRM registrou o envio na conversa selecionada.' });
    },
  });

  const selectedConversation = useMemo(() => {
    return conversationsQuery.data?.conversations.find((conversation) => conversation.id === selectedConversationId) || null;
  }, [conversationsQuery.data?.conversations, selectedConversationId]);

  const selectedInstance = useMemo(() => {
    return instancesQuery.data?.instances.find((instance) => instance.id === conversationDetailQuery.data?.whatsapp_instance?.id) || null;
  }, [conversationDetailQuery.data?.whatsapp_instance?.id, instancesQuery.data?.instances]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        subtitle="Atendimento interno via WhatsApp proprio do CRM."
        icon={MessageSquare}
        actionContent={
          <Button onClick={() => setInstanceDialogOpen(true)}>
            <PlugZap className="mr-2 h-4 w-4" />
            Nova instancia interna
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversas abertas</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ultima mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(conversationsQuery.data?.conversations || []).map((conversation) => (
                  <TableRow key={conversation.id} className="cursor-pointer" onClick={() => setSelectedConversationId(conversation.id)}>
                    <TableCell>
                      <div className="font-medium">{conversation.client_company_name || 'Cliente'}</div>
                      <div className="text-xs text-muted-foreground">{conversation.primary_phone || '-'}</div>
                    </TableCell>
                    <TableCell><TokenBadge token={conversation.status} /></TableCell>
                    <TableCell className="max-w-[260px] truncate">{conversation.last_message_preview || '-'}</TableCell>
                  </TableRow>
                ))}
                {(conversationsQuery.data?.conversations || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Nenhuma conversa interna registrada ainda.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="min-h-[640px]">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
              <span>{selectedConversation?.client_company_name || 'Selecione uma conversa'}</span>
              <div className="flex flex-wrap items-center gap-2">
                {selectedConversation ? <TokenBadge token={selectedConversation.status} /> : null}
                {selectedInstance ? <TokenBadge token={selectedInstance.status} label={selectedInstance.display_name} /> : null}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex h-full flex-col gap-4 pt-4">
            {selectedConversationId ? (
              <>
                <ScrollArea className="h-[420px] rounded-2xl border border-border/70 p-4">
                  <div className="space-y-3">
                    {(conversationDetailQuery.data?.messages || []).map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                          message.direction === 'outbound'
                            ? 'ml-auto bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <p>{message.body || '-'}</p>
                        <p className="mt-2 text-[11px] opacity-80">{formatDateTime(message.created_at)}</p>
                      </div>
                    ))}
                    {(conversationDetailQuery.data?.messages || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Ainda nao ha mensagens nesta conversa.</p>
                    ) : null}
                  </div>
                </ScrollArea>

                <div className="rounded-2xl border border-border/70 p-4">
                  <Label>Nova mensagem</Label>
                  <Textarea
                    rows={4}
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                    placeholder="Digite a mensagem que sera enviada pela instancia interna."
                    className="mt-2"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Canal: {selectedConversation?.channel || '-'} · Instancia: {selectedInstance?.display_name || 'nao vinculada'}
                    </p>
                    <Button
                      onClick={() =>
                        appendMessageMutation.mutate({
                          action: 'append_message',
                          conversation_id: selectedConversationId,
                          body: messageBody,
                          message_type: selectedConversation?.channel === 'manual_note' ? 'note' : 'text',
                        })
                      }
                      disabled={!messageBody.trim() || appendMessageMutation.isPending}
                    >
                      <SendHorizontal className="mr-2 h-4 w-4" />
                      Enviar
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 text-sm text-muted-foreground">
                Selecione uma conversa na lista ao lado para ver o historico.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instancias internas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(instancesQuery.data?.instances || []).map((instance) => (
            <div key={instance.id} className="rounded-2xl border border-border/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{instance.display_name}</p>
                  <p className="text-xs text-muted-foreground">{instance.instance_name}</p>
                </div>
                <TokenBadge token={instance.status} />
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => connectInstanceMutation.mutate({ action: 'connect_instance', instance_id: instance.id })}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Conectar / QR
                </Button>
              </div>
              {instance.qr_code_base64 ? (
                <div className="mt-3 rounded-xl border border-border/70 bg-white p-3">
                  <img src={instance.qr_code_base64} alt={`QR ${instance.display_name}`} className="mx-auto h-40 w-40 object-contain" />
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={instanceDialogOpen} onOpenChange={setInstanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova instancia interna</DialogTitle>
            <DialogDescription>Cadastre uma instancia dedicada ao CRM interno com prefixo `sz_internal_`.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome tecnico</Label>
              <Input value={instanceDraft.instance_name} onChange={(event) => setInstanceDraft((current) => ({ ...current, instance_name: event.target.value }))} placeholder="ex: vendas_norte" />
            </div>
            <div className="space-y-2">
              <Label>Nome de exibicao</Label>
              <Input value={instanceDraft.display_name} onChange={(event) => setInstanceDraft((current) => ({ ...current, display_name: event.target.value }))} placeholder="WhatsApp Comercial SolarZap" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstanceDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => upsertInstanceMutation.mutate({ action: 'upsert_instance', ...instanceDraft })} disabled={upsertInstanceMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Salvar instancia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
