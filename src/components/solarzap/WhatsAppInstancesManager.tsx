import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Plus,
  Smartphone,
  Loader2,
  QrCode,
  CheckCircle2,
  RefreshCw,
  Bug,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserWhatsAppInstances as useWhatsAppInstances, UserWhatsAppInstance as WhatsAppInstance } from '@/hooks/useUserWhatsAppInstances';
import { WhatsAppInstanceCard } from './WhatsAppInstanceCard';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
// WhatsApp Logo SVG component
const WhatsAppLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface QRModalState {
  isOpen: boolean;
  qrCode: string | null;
  instance: WhatsAppInstance | null;
  countdown: number;
}

export function WhatsAppInstancesManager() {
  const {
    instances,
    loading,
    creating,
    actionLoading,
    createInstance,
    refreshQrCode,
    simulateConnection,
    disconnectInstance,
    deleteInstance,
    renameInstance,
    checkStatus,
    connectedCount,
    isDevMode,
    isFallbackMode,
    setInstanceAiEnabled,
  } = useWhatsAppInstances();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [qrModal, setQrModal] = useState<QRModalState>({
    isOpen: false,
    qrCode: null,
    instance: null,
    countdown: 60,
  });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Função de teste da Edge Function com diagnóstico detalhado
  // Função de teste da Evolution API com diagnóstico detalhado
  const testEdgeFunction = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Test directly using whatsappService instead of Edge Function
      const { whatsappService } = await import('@/services/whatsappService');
      const result = await whatsappService.testConnection();

      if (result.success) {
        const successMsg = `✅ CONEXÃO COM EVOLUTION API OK!\n\n${result.message}\n\nDados:\n${JSON.stringify(result.data, null, 2)}`;
        setTestResult(successMsg);
        toast.success('Evolution API conectada!');
      } else {
        const errorMsg = `❌ ERRO AO CONECTAR NA EVOLUTION API\n\n${result.message}`;
        setTestResult(errorMsg);
        toast.error('Erro na conexão');
      }
    } catch (err) {
      const errorMsg = `❌ FALHA INESPERADA:\n${err instanceof Error ? err.message : String(err)}`;
      setTestResult(errorMsg);
      toast.error('Falha no teste');
    } finally {
      setTesting(false);
    }
  };

  // Handle creating new instance
  const handleCreate = async () => {
    const result = await createInstance(newInstanceName || undefined);
    if (result?.qrCode && result?.instance) {
      setCreateModalOpen(false);
      setNewInstanceName('');
      setQrModal({
        isOpen: true,
        qrCode: result.qrCode,
        instance: result.instance,
        countdown: 60,
      });
      return;
    }

    if (result?.instance && !result.qrCode) {
      toast.error('InstÃ¢ncia criada, mas QR Code nÃ£o foi retornado. Tente reconectar para gerar um novo QR.');
    }
  };

  // Handle simulating connection (DEV_MODE only)
  const handleSimulateConnection = async () => {
    if (!qrModal.instance) return;
    const success = await simulateConnection(qrModal.instance.id);
    if (success) {
      // Update local modal state
      setQrModal(prev => ({
        ...prev,
        instance: prev.instance ? { ...prev.instance, status: 'connected' } : null,
      }));
    }
  };

  // Handle reconnect (show QR modal)
  const handleReconnect = async (instanceId: string) => {
    const instance = instances.find(i => i.id === instanceId);
    if (!instance) return;

    // If instance already has a QR code (connecting status), show it
    if (instance.qr_code) {
      setQrModal({
        isOpen: true,
        qrCode: instance.qr_code,
        instance,
        countdown: 60,
      });
    } else {
      // Refresh QR code — must pass instance_name, not UUID
      const qrCode = await refreshQrCode(instance.instance_name);
      if (qrCode) {
        setQrModal({
          isOpen: true,
          qrCode,
          instance,
          countdown: 60,
        });
      }
    }
  };

  // Handle QR refresh
  const handleRefreshQr = async () => {
    if (!qrModal.instance) return;
    const qrCode = await refreshQrCode(qrModal.instance.instance_name);
    if (qrCode) {
      setQrModal(prev => ({ ...prev, qrCode, countdown: 60 }));
    }
  };

  // Close QR modal
  const closeQrModal = () => {
    setQrModal({ isOpen: false, qrCode: null, instance: null, countdown: 60 });
  };

  // Handle delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<WhatsAppInstance | null>(null);

  const handleRequestDelete = (instance: WhatsAppInstance) => {
    import.meta.env.DEV && console.log('Manager received delete request for:', instance.instance_name);
    setInstanceToDelete(instance);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!instanceToDelete) return;

    await deleteInstance(instanceToDelete);
    setDeleteDialogOpen(false);
    setInstanceToDelete(null);
  };

  // Check if instance got connected (via polling or realtime)
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (qrModal.isOpen && qrModal.instance && qrModal.instance.status !== 'connected') {
      // Poll status every 3 seconds while modal is open
      interval = setInterval(() => {
        if (qrModal.instance?.instance_name) {
          checkStatus(qrModal.instance.instance_name);
        }
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [qrModal.isOpen, qrModal.instance, checkStatus]);

  const currentInstance = qrModal.instance
    ? instances.find(i => i.id === qrModal.instance?.id)
    : null;

  if (currentInstance?.status === 'connected' && qrModal.isOpen) {
    // Auto close after showing success
    toast.success('WhatsApp Conectado com sucesso!');
    setTimeout(closeQrModal, 2000);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-green-500/10">
                <WhatsAppLogo className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-lg">WhatsApp</CardTitle>
                  {connectedCount > 0 && (
                    <Badge className="bg-green-500 hover:bg-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {connectedCount} {connectedCount === 1 ? 'conectado' : 'conectados'}
                    </Badge>
                  )}
                  {isFallbackMode && (
                    <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50">
                      Modo Demonstração
                    </Badge>
                  )}
                </div>
                <CardDescription className="mt-1">
                  {isFallbackMode ? (
                    <span className="text-amber-600">
                      Edge Function indisponível. Usando modo local para demonstração.
                    </span>
                  ) : (
                    'Conecte múltiplas instâncias do WhatsApp para diferentes equipes ou números.'
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={testEdgeFunction}
                disabled={testing}
                className="border-amber-500 text-amber-600 hover:bg-amber-50"
              >
                {testing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Bug className="w-4 h-4 mr-2" />
                )}
                Testar API
              </Button>
              <Button onClick={() => setCreateModalOpen(true)} disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Nova Instância
              </Button>
            </div>
          </div>

          {/* Resultado do teste */}
          {testResult && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <pre className="text-xs whitespace-pre-wrap font-mono">{testResult}</pre>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setTestResult(null)}
              >
                Fechar
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="border-t bg-muted/30 pt-4">
          {instances.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">Nenhuma instância configurada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crie uma nova instância para conectar seu WhatsApp
              </p>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Instância
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {instances.map((instance) => (
                <WhatsAppInstanceCard
                  key={instance.id}
                  instance={instance}
                  isLoading={actionLoading === instance.id}
                  onReconnect={handleReconnect}
                  onDisconnect={disconnectInstance}
                  onRequestDelete={handleRequestDelete}
                  onRename={renameInstance}
                  onToggleAiEnabled={async (instanceName, enabled) => {
                    await setInstanceAiEnabled(instanceName, enabled);
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Instance Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppLogo className="w-6 h-6" />
              Nova Instância WhatsApp
            </DialogTitle>
            <DialogDescription>
              Crie uma nova instância para conectar um número de WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="instance-name">Nome da Instância</Label>
              <Input
                id="instance-name"
                placeholder="Ex: Vendas, Suporte, Atendimento..."
                value={newInstanceName}
                onChange={(e) => setNewInstanceName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Um nome para identificar esta instância (opcional)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4 mr-2" />
              )}
              Criar e Conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      <Dialog open={qrModal.isOpen} onOpenChange={closeQrModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppLogo className="w-6 h-6" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>
              {qrModal.instance?.display_name && (
                <span className="font-medium text-foreground">{qrModal.instance.display_name}</span>
              )}
              {' - '}Escaneie o QR Code com seu WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-6 space-y-4">
            {/* QR Code Area */}
            <div className={cn(
              "w-52 h-52 rounded-xl border-2 flex items-center justify-center transition-all",
              currentInstance?.status === 'connected'
                ? "border-green-500 bg-green-50"
                : "border-border bg-muted/30"
            )}>
              {currentInstance?.status === 'connected' ? (
                <div className="flex flex-col items-center gap-3 text-green-600">
                  <CheckCircle2 className="w-16 h-16" />
                  <span className="font-medium">Conectado!</span>
                </div>
              ) : qrModal.qrCode ? (
                <img
                  src={qrModal.qrCode.startsWith('data:')
                    ? qrModal.qrCode
                    : `data:image/png;base64,${qrModal.qrCode}`
                  }
                  alt="WhatsApp QR Code"
                  className="w-full h-full rounded-lg p-2"
                />
              ) : (
                <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Instructions */}
            {currentInstance?.status !== 'connected' && (
              <>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshQr}
                    disabled={actionLoading === qrModal.instance?.id}
                  >
                    {actionLoading === qrModal.instance?.id ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Atualizar QR Code
                  </Button>

                  {/* DEV_MODE: Simulate Connection Button */}
                  {isDevMode && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={handleSimulateConnection}
                      disabled={actionLoading === qrModal.instance?.id}
                    >
                      {actionLoading === qrModal.instance?.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Simular Conexão
                    </Button>
                  )}
                </div>

                {isDevMode && (
                  <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
                    🧪 Modo de teste ativo. Use "Simular Conexão" para testar.
                  </p>
                )}

                <div className="bg-muted/50 rounded-lg p-4 space-y-3 w-full">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Como conectar:
                  </h4>
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Abra o WhatsApp no seu celular</li>
                    <li>Toque em <strong>Mais opções</strong> ou <strong>Configurações</strong></li>
                    <li>Selecione <strong>Dispositivos conectados</strong></li>
                    <li>Toque em <strong>Conectar dispositivo</strong></li>
                    <li>Aponte a câmera para este QR Code</li>
                  </ol>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir instância</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a instância "{instanceToDelete?.display_name}"?
              Esta ação irá desconectar o WhatsApp e remover a instância.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading === instanceToDelete?.id}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault(); // Prevent auto-close to handle async
                handleConfirmDelete();
              }}
              disabled={actionLoading === instanceToDelete?.id}
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
    </>
  );
}
