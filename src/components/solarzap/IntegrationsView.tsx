import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  MessageCircle,
  X,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Smartphone,
  QrCode,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  LogOut,
  Plug
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationsContext } from '@/contexts/IntegrationsContext';
import { useUserWhatsAppInstances, UserWhatsAppInstance } from '@/hooks/useUserWhatsAppInstances';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { WHATSAPP_COLORS } from '@/constants';

import { useAISettings } from '@/hooks/useAISettings'; // New Import
import { PageHeader } from './PageHeader';

export function IntegrationsView() {
  const { settings: aiSettings } = useAISettings(); // Get Global Settings
  const { role } = useAuth();
  const isOrgManager = role === 'owner' || role === 'admin';
  const [newInstanceName, setNewInstanceName] = useState('');
  const [currentQR, setCurrentQR] = useState<{ instanceName: string; qrCode: string } | null>(null);
  const [updatingColor, setUpdatingColor] = useState<string | null>(null);

  const {
    loading: integrationsLoading,
  } = useIntegrationsContext();

  const {
    instances: whatsappInstances,
    loading: instancesLoading,
    creating: creatingInstance,
    actionLoading,
    fetchInstances,
    createInstance,
    refreshQrCode,
    checkStatus,
    deleteInstance,
    disconnectInstance,
    connectedCount: whatsappConnectedCount,
    setInstanceAiEnabled,
    updateColor,
  } = useUserWhatsAppInstances();

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) return;

    const result = await createInstance(newInstanceName);
    if (result?.blocked) {
      return;
    }
    if (result?.qrCode) {
      setCurrentQR({ instanceName: result.instance?.instance_name || '', qrCode: result.qrCode });
      setNewInstanceName('');
      return;
    }

    toast.error('Instância criada, mas nenhum QR Code foi retornado. Tente atualizar o QR.');
  };

  const handleRefreshQR = async (instanceName: string) => {
    const qrCode = await refreshQrCode(instanceName);
    if (qrCode) {
      setCurrentQR({ instanceName, qrCode });
      return;
    }

    toast.error('Não foi possível obter o QR Code desta instância.');
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<UserWhatsAppInstance | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, instance: UserWhatsAppInstance) => {
    e.stopPropagation();
    e.preventDefault();
    setInstanceToDelete(instance);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!instanceToDelete) return;

    await deleteInstance(instanceToDelete);
    if (currentQR?.instanceName === instanceToDelete.instance_name) {
      setCurrentQR(null);
    }
    setDeleteDialogOpen(false);
    setInstanceToDelete(null);
  };

  const handleUpdateColor = async (instance: UserWhatsAppInstance, color: string) => {
    try {
      setUpdatingColor(instance.instance_name);
      const ok = await updateColor(instance.id, color);
      if (!ok) return;

      toast.success(`Cor da instância atualizada!`);
      fetchInstances();
    } catch (error) {
      console.error('Error updating color:', error);
      toast.error('Erro ao atualizar cor');
    } finally {
      setUpdatingColor(null);
    }
  };

  if (integrationsLoading) {
    return (
      <div className="flex-1 bg-background p-6 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Carregando integrações...</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="bg-muted/30 min-h-full">
        <PageHeader
          title="Central de Integrações"
          subtitle="Conecte canais e serviços usados pela operação comercial"
          icon={Plug}
          actionContent={
            <div className="flex w-full flex-wrap items-center gap-4 rounded-xl border border-border/50 bg-background/50 px-4 py-2 glass sm:w-auto sm:justify-end">
              <div className="text-right">
                <div className="text-xl font-bold text-foreground leading-none">{whatsappConnectedCount}/{whatsappInstances.length}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 font-semibold">{whatsappConnectedCount === 1 ? 'Instância ativa' : 'Instâncias ativas'}</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-[#25D366]" />
              </div>
            </div>
          }
        />

        <div className="w-full space-y-6 px-4 py-4 sm:px-6 sm:py-6">
          {/* WhatsApp Section */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-[#25D366]/10 to-[#128C7E]/5">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg shadow-[#25D366]/20">
                      <MessageCircle className="w-6 h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-xl">Conexões WhatsApp</CardTitle>
                      <CardDescription className="mt-1">
                        Conecte múltiplos números para sua equipe
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchInstances}
                    disabled={instancesLoading}
                    className="gap-2"
                  >
                    <RefreshCw className={cn("w-4 h-4", instancesLoading && "animate-spin")} />
                    Atualizar
                  </Button>
                </div>
              </CardHeader>
            </div>

            <CardContent className="p-6 space-y-6">
              {/* Create New Instance */}
              <div className="p-5 rounded-2xl bg-muted/50 border border-border/50">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">Nova Instância</h3>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                    placeholder="Nome da instância (ex: Vendas, Suporte...)"
                    className="flex-1 h-11 bg-background border-border/50"
                    disabled={creatingInstance}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateInstance()}
                  />
                  <Button
                    onClick={handleCreateInstance}
                    disabled={!newInstanceName.trim() || creatingInstance}
                    className="h-11 w-full gap-2 bg-primary px-6 hover:bg-primary/90 sm:w-auto"
                  >
                    {creatingInstance ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Criar
                  </Button>
                </div>
              </div>

              {/* QR Code Modal */}
              {currentQR && (
                <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-4 sm:p-6">
                  <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-white p-4 shadow-lg md:mx-0 md:w-auto">
                      <img
                        src={currentQR.qrCode.startsWith('data:') ? currentQR.qrCode : `data:image/png;base64,${currentQR.qrCode}`}
                        alt="QR Code WhatsApp"
                        className="h-auto w-full object-contain md:h-48 md:w-48"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <QrCode className="w-5 h-5 text-primary" />
                        <h4 className="font-semibold text-foreground">Escaneie o QR Code</h4>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Abra o WhatsApp no seu celular e escaneie este código para conectar.
                      </p>
                      <ol className="text-sm text-muted-foreground space-y-2 mb-4">
                        <li className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">1</span>
                          Abra o WhatsApp
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">2</span>
                          Vá em Configurações → Aparelhos conectados
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">3</span>
                          Toque em "Conectar aparelho"
                        </li>
                      </ol>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRefreshQR(currentQR.instanceName)}
                          disabled={actionLoading === currentQR.instanceName}
                        >
                          {actionLoading === currentQR.instanceName ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="w-4 h-4 mr-2" />
                          )}
                          Atualizar QR
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCurrentQR(null)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Fechar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Instances List */}
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    {isOrgManager ? 'Instâncias da Empresa' : 'Minhas Instâncias'} ({whatsappInstances.length})
                  </h3>
                </div>

                {instancesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : whatsappInstances.length === 0 ? (
                  <div className="text-center py-12 px-6 rounded-2xl border-2 border-dashed border-border/50">
                    <div className="w-16 h-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
                      <Smartphone className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h4 className="font-medium text-foreground mb-1">Nenhuma instância</h4>
                    <p className="text-sm text-muted-foreground">
                      {isOrgManager
                        ? 'Crie a primeira instância da empresa para começar a receber mensagens'
                        : 'Crie sua primeira instância para começar a receber mensagens'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {whatsappInstances.map((instance) => {
                      const instanceColor = (instance as any).color || '#25D366'; // Fallback
                      return (
                        <div
                          key={instance.id}
                          className={cn(
                            "group flex flex-col gap-4 rounded-xl border p-4 transition-all duration-200 md:flex-row md:items-center md:justify-between",
                            instance.status === 'connected'
                              ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                              : "bg-muted/30 border-border/50 hover:bg-muted/50"
                          )}
                          style={{ borderLeftColor: instanceColor, borderLeftWidth: '4px' }}
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                              instance.status === 'connected'
                                ? "bg-primary/10"
                                : "bg-muted"
                            )}>
                              {instance.status === 'connected' ? (
                                <Wifi className="w-5 h-5 text-primary" />
                              ) : instance.status === 'connecting' ? (
                                <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                              ) : (
                                <WifiOff className="w-5 h-5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                                {instance.display_name}
                                {instance.status === 'connected' && (
                                  <Badge className="bg-primary/10 text-primary border-0 text-xs">
                                    Online
                                  </Badge>
                                )}
                                {instance.status === 'connecting' && (
                                  <Badge className="bg-amber-500/10 text-amber-600 border-0 text-xs">
                                    Aguardando conexão
                                  </Badge>
                                )}
                              </h4>
                              <p className="mt-0.5 break-all text-xs text-muted-foreground">
                                {instance.phone_number ? `📱 ${instance.phone_number}` : `ID: ${instance.instance_name}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            {/* AI Toggle */}
                            <div className="flex items-center gap-2 px-2 py-1"
                              title="Ativar/Desativar IA para esta instância"
                            >
                              <span className="font-medium text-muted-foreground">IA</span>
                              <Switch
                                checked={!!instance.ai_enabled}
                                onCheckedChange={(checked) => setInstanceAiEnabled(instance.instance_name, checked)}
                                disabled={actionLoading === instance.id}
                                className="scale-75 origin-right data-[state=checked]:bg-primary"
                              />
                            </div>

                            {/* Color Picker */}
                            <div className="flex flex-wrap items-center gap-1 transition-opacity">
                              {WHATSAPP_COLORS.map(color => (
                                <button
                                  key={color}
                                  className={cn(
                                    "w-4 h-4 rounded-full border border-gray-200 hover:scale-125 transition-transform",
                                    updatingColor === instance.instance_name && "opacity-50 cursor-wait"
                                  )}
                                  style={{ backgroundColor: color }}
                                  onClick={() => handleUpdateColor(instance, color)}
                                  disabled={!!updatingColor}
                                  title={color}
                                />
                              ))}
                            </div>

                            <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3 opacity-100 transition-opacity md:ml-4 md:w-auto md:border-l md:border-t-0 md:pl-4 md:pt-0 md:opacity-0 md:group-hover:opacity-100">
                              {instance.status !== 'connected' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRefreshQR(instance.instance_name)}
                                  disabled={actionLoading === instance.instance_name}
                                  className="h-8 text-xs"
                                >
                                  {actionLoading === instance.instance_name ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <QrCode className="w-3 h-3" />
                                  )}
                                  <span className="ml-1.5">QR Code</span>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => checkStatus(instance.instance_name)}
                                disabled={actionLoading === instance.instance_name}
                                className="h-8 text-xs"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span className="ml-1.5">Status</span>
                              </Button>
                              {instance.status === 'connected' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => disconnectInstance(instance.instance_name)}
                                  disabled={actionLoading === instance.instance_name}
                                  className="h-8 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                >
                                  <LogOut className="w-3 h-3" />
                                  <span className="ml-1.5">Desconectar</span>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                onClick={(e) => handleDeleteClick(e, instance)}
                                disabled={actionLoading === instance.id}
                                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                {actionLoading === instance.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>


        </div>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir instância</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a instância "{instanceToDelete?.display_name}"?
                Esta ação irá desconectar o WhatsApp e remover a instância permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {actionLoading === instanceToDelete?.id ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ScrollArea>
  );
}
