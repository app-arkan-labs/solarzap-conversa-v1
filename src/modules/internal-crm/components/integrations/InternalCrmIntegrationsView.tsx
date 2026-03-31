import { useState, type MouseEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  MessageCircle,
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useInternalCrmGuardContext } from '@/components/admin/InternalCrmGuard';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { WHATSAPP_COLORS } from '@/constants';
import {
  type InternalCrmManagedWhatsappInstance,
  useInternalCrmWhatsappInstances,
} from '@/modules/internal-crm/hooks/useInternalCrmWhatsappInstances';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export function InternalCrmIntegrationsView() {
  const { identity } = useInternalCrmGuardContext();
  const canManageInstances = identity?.crm_role === 'owner' || identity?.crm_role === 'ops';
  const [newInstanceName, setNewInstanceName] = useState('');
  const [currentQR, setCurrentQR] = useState<{ instanceId: string; instanceName: string; qrCode: string } | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<InternalCrmManagedWhatsappInstance | null>(null);

  const {
    instances: whatsappInstances,
    loading: instancesLoading,
    refreshing: instancesRefreshing,
    creating: creatingInstance,
    actionLoading,
    fetchInstances,
    createInstance,
    refreshQrCode,
    checkStatus,
    deleteInstance,
    disconnectInstance,
    connectedCount,
    setInstanceAiEnabled,
    updateColor,
  } = useInternalCrmWhatsappInstances();

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) return;

    const result = await createInstance(newInstanceName);
    if (!result) return;

    if (result.qrCode && result.instance?.id) {
      setCurrentQR({
        instanceId: result.instance.id,
        instanceName: result.instance.instance_name,
        qrCode: result.qrCode,
      });
      setNewInstanceName('');
      return;
    }

    toast.error('Instancia criada, mas nenhum QR Code foi retornado.');
  };

  const handleRefreshQR = async (instance: InternalCrmManagedWhatsappInstance) => {
    const qrCode = await refreshQrCode(instance.id);
    if (!qrCode) {
      toast.error('Nao foi possivel obter o QR Code desta instancia.');
      return;
    }

    setCurrentQR({
      instanceId: instance.id,
      instanceName: instance.instance_name,
      qrCode,
    });
  };

  const handleDeleteClick = (event: MouseEvent, instance: InternalCrmManagedWhatsappInstance) => {
    event.preventDefault();
    event.stopPropagation();
    setInstanceToDelete(instance);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!instanceToDelete) return;

    const deleted = await deleteInstance(instanceToDelete);
    if (!deleted) return;

    if (currentQR?.instanceId === instanceToDelete.id) {
      setCurrentQR(null);
    }

    setDeleteDialogOpen(false);
    setInstanceToDelete(null);
  };

  const handleUpdateColor = async (instance: InternalCrmManagedWhatsappInstance, color: string) => {
    const ok = await updateColor(instance.id, color);
    if (ok) {
      toast.success('Cor da instancia atualizada.');
    }
  };

  const showInitialLoading = instancesLoading && whatsappInstances.length === 0;

  if (showInitialLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-[30px] border border-border/70 bg-card/95 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando integracoes internas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Integracoes"
        subtitle="Conecte canais usados pela operacao comercial interna sem tocar o runtime do CRM principal."
        icon={Plug}
        actionContent={
          <div className="flex w-full flex-wrap items-center gap-4 rounded-xl border border-border/50 bg-background/50 px-4 py-2 glass sm:w-auto sm:justify-end">
            <div className="text-right">
              <div className="text-xl font-bold leading-none text-foreground">{connectedCount}/{whatsappInstances.length}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {connectedCount === 1 ? 'Instancia ativa' : 'Instancias ativas'}
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/10">
              <CheckCircle2 className="h-5 w-5 text-[#25D366]" />
            </div>
          </div>
        }
        mobileToolbar={
          <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[10px]">
            <CheckCircle2 className="h-3 w-3 text-[#25D366]" />
            {connectedCount}/{whatsappInstances.length}
          </Badge>
        }
      />

      <Card className="overflow-hidden border-0 shadow-sm">
        <div className="bg-gradient-to-r from-[#25D366]/10 to-[#128C7E]/5">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25D366] to-[#128C7E] shadow-lg shadow-[#25D366]/20">
                  <MessageCircle className="h-6 w-6 text-white" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-xl">Conexoes WhatsApp</CardTitle>
                  <CardDescription className="mt-1">
                    Instancias dedicadas ao CRM interno, sem compartilhar nada com o CRM principal.
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchInstances()}
                disabled={instancesRefreshing}
                className="gap-2"
              >
                <RefreshCw className={cn('h-4 w-4', instancesRefreshing && 'animate-spin')} />
                Atualizar
              </Button>
            </div>
          </CardHeader>
        </div>

        <CardContent className="space-y-6 p-6">
          {canManageInstances ? (
            <div className="rounded-2xl border border-border/50 bg-muted/50 p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Plus className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">Nova Instancia</h3>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  value={newInstanceName}
                  onChange={(event) => setNewInstanceName(event.target.value)}
                  placeholder="Nome da instancia (ex: SDR, Closer, Onboarding...)"
                  className="h-11 flex-1 border-border/50 bg-background"
                  disabled={creatingInstance}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleCreateInstance();
                    }
                  }}
                />
                <Button
                  onClick={() => void handleCreateInstance()}
                  disabled={!newInstanceName.trim() || creatingInstance}
                  className="h-11 w-full gap-2 bg-primary px-6 hover:bg-primary/90 sm:w-auto"
                >
                  {creatingInstance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Criar
                </Button>
              </div>
            </div>
          ) : null}

          {currentQR ? (
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4 sm:p-6">
              <div className="flex flex-col items-start gap-6 md:flex-row">
                <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-white p-4 shadow-lg md:mx-0 md:w-auto">
                  <img
                    src={currentQR.qrCode.startsWith('data:') ? currentQR.qrCode : `data:image/png;base64,${currentQR.qrCode}`}
                    alt="QR Code WhatsApp"
                    className="h-auto w-full object-contain md:h-48 md:w-48"
                  />
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-primary" />
                    <h4 className="font-semibold text-foreground">Escaneie o QR Code</h4>
                  </div>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Abra o WhatsApp no celular e escaneie este codigo para conectar a instancia interna.
                  </p>
                  <ol className="mb-4 space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">1</span>
                      Abra o WhatsApp
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">2</span>
                      Va em Configuracoes, depois em Aparelhos conectados
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">3</span>
                      Toque em Conectar aparelho
                    </li>
                  </ol>
                  <div className="flex flex-wrap gap-2">
                    {canManageInstances ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const instance = whatsappInstances.find((item) => item.id === currentQR.instanceId);
                          if (instance) {
                            void handleRefreshQR(instance);
                          }
                        }}
                        disabled={actionLoading === currentQR.instanceId}
                      >
                        {actionLoading === currentQR.instanceId ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Atualizar QR
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => setCurrentQR(null)}>
                      <X className="mr-2 h-4 w-4" />
                      Fechar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold text-foreground">
                <Smartphone className="h-4 w-4" />
                Instancias do CRM Interno ({whatsappInstances.length})
              </h3>
            </div>

            {whatsappInstances.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-border/50 px-6 py-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <Smartphone className="h-8 w-8 text-muted-foreground" />
                </div>
                <h4 className="mb-1 font-medium text-foreground">Nenhuma instancia interna</h4>
                <p className="text-sm text-muted-foreground">
                  {canManageInstances
                    ? 'Crie a primeira instancia para alimentar inbox, campanhas e operacoes do CRM interno.'
                    : 'Ainda nao ha instancias internas cadastradas para este CRM.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {whatsappInstances.map((instance) => (
                  <div
                    key={instance.id}
                    className={cn(
                      'group flex flex-col gap-4 rounded-xl border p-4 transition-all duration-200 md:flex-row md:items-center md:justify-between',
                      instance.status === 'connected'
                        ? 'border-primary/20 bg-primary/5 hover:bg-primary/10'
                        : 'border-border/50 bg-muted/30 hover:bg-muted/50',
                    )}
                    style={{ borderLeftColor: instance.color, borderLeftWidth: '4px' }}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
                          instance.status === 'connected' ? 'bg-primary/10' : 'bg-muted',
                        )}
                      >
                        {instance.status === 'connected' ? (
                          <Wifi className="h-5 w-5 text-primary" />
                        ) : instance.status === 'connecting' ? (
                          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                        ) : instance.status === 'error' ? (
                          <AlertCircle className="h-5 w-5 text-destructive" />
                        ) : (
                          <WifiOff className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                          {instance.display_name}
                          {instance.status === 'connected' ? (
                            <Badge className="border-0 bg-primary/10 text-xs text-primary">Online</Badge>
                          ) : null}
                          {instance.status === 'connecting' ? (
                            <Badge className="border-0 bg-amber-500/10 text-xs text-amber-600">Aguardando conexao</Badge>
                          ) : null}
                          {instance.status === 'error' ? (
                            <Badge className="border-0 bg-destructive/10 text-xs text-destructive">Erro</Badge>
                          ) : null}
                        </h4>
                        <p className="mt-0.5 break-all text-xs text-muted-foreground">
                          {instance.phone_number ? `Telefone: ${instance.phone_number}` : `ID: ${instance.instance_name}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <div className="flex items-center gap-2 px-2 py-1" title="Ativar ou desativar IA para esta instancia interna">
                        <span className="font-medium text-muted-foreground">IA</span>
                        <Switch
                          checked={Boolean(instance.ai_enabled)}
                          onCheckedChange={(checked) => {
                            if (canManageInstances) {
                              void setInstanceAiEnabled(instance.id, checked);
                            }
                          }}
                          disabled={!canManageInstances || actionLoading === instance.id}
                          className="origin-right scale-75 data-[state=checked]:bg-primary"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-1 transition-opacity">
                        {WHATSAPP_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={cn(
                              'h-4 w-4 rounded-full border border-gray-200 transition-transform hover:scale-125',
                              (!canManageInstances || actionLoading === instance.id) && 'cursor-not-allowed opacity-50',
                            )}
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              if (canManageInstances) {
                                void handleUpdateColor(instance, color);
                              }
                            }}
                            disabled={!canManageInstances || actionLoading === instance.id}
                            title={color}
                          />
                        ))}
                      </div>

                      <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3 transition-opacity md:ml-4 md:w-auto md:border-l md:border-t-0 md:pl-4 md:pt-0 md:opacity-0 md:group-hover:opacity-100">
                        {canManageInstances && instance.status !== 'connected' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleRefreshQR(instance)}
                            disabled={actionLoading === instance.id}
                            className="h-8 text-xs"
                          >
                            {actionLoading === instance.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <QrCode className="h-3 w-3" />}
                            <span className="ml-1.5">QR Code</span>
                          </Button>
                        ) : null}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void checkStatus(instance.id)}
                          disabled={actionLoading === instance.id}
                          className="h-8 text-xs"
                        >
                          {actionLoading === instance.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          <span className="ml-1.5">Status</span>
                        </Button>

                        {canManageInstances && instance.status === 'connected' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void disconnectInstance(instance.id)}
                            disabled={actionLoading === instance.id}
                            className="h-8 text-xs text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                          >
                            <LogOut className="h-3 w-3" />
                            <span className="ml-1.5">Desconectar</span>
                          </Button>
                        ) : null}

                        {canManageInstances ? (
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={(event) => handleDeleteClick(event, instance)}
                            disabled={actionLoading === instance.id}
                            className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            {actionLoading === instance.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir instancia</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a instancia &quot;{instanceToDelete?.display_name}&quot;?
              Esta acao desconecta o WhatsApp interno e remove a configuracao permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading === instanceToDelete?.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}