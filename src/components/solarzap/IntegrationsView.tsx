import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Calendar,
  Mail,
  Video,
  MessageCircle,
  Instagram,
  Check,
  X,
  Settings,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Smartphone,
  QrCode,
  Wifi,
  WifiOff,
  Zap,
  Shield,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  LogOut,
  Palette,
  Plug
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIntegrationsContext } from '@/contexts/IntegrationsContext';
import { useUserWhatsAppInstances, UserWhatsAppInstance } from '@/hooks/useUserWhatsAppInstances';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

import { WHATSAPP_COLORS } from '@/constants';

export function IntegrationsView() {
  const [newInstanceName, setNewInstanceName] = useState('');
  const [currentQR, setCurrentQR] = useState<{ instanceName: string; qrCode: string } | null>(null);
  const [updatingColor, setUpdatingColor] = useState<string | null>(null);

  const {
    isConnected,
    getIntegration,
    loading: integrationsLoading,
    connecting,
    connectGoogle,
    connectMeta,
    disconnect
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
  } = useUserWhatsAppInstances();

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) return;

    const result = await createInstance(newInstanceName);
    if (result?.qrCode) {
      setCurrentQR({ instanceName: result.instance?.instance_name || '', qrCode: result.qrCode });
      setNewInstanceName('');
    }
  };

  const handleRefreshQR = async (instanceName: string) => {
    const qrCode = await refreshQrCode(instanceName);
    if (qrCode) {
      setCurrentQR({ instanceName, qrCode });
    }
  };

  const handleDeleteInstance = async (instance: UserWhatsAppInstance) => {
    if (!confirm(`Tem certeza que deseja excluir "${instance.display_name}"?`)) return;
    await deleteInstance(instance);
    if (currentQR?.instanceName === instance.instance_name) {
      setCurrentQR(null);
    }
  };

  const handleUpdateColor = async (instance: UserWhatsAppInstance, color: string) => {
    try {
      setUpdatingColor(instance.instance_name);
      // Optimistic update locally would depend on state management, but let's refresh
      const { error } = await supabase
        .from('whatsapp_instances')
        .update({ color })
        .eq('id', instance.id);

      if (error) throw error;

      toast.success(`Cor da instância atualizada!`);
      fetchInstances(); // Refresh list to show new color
    } catch (error) {
      console.error('Error updating color:', error);
      toast.error('Erro ao atualizar cor');
    } finally {
      setUpdatingColor(null);
    }
  };

  const connections = {
    google: isConnected('google'),
    whatsapp: whatsappConnectedCount > 0,
    messenger: isConnected('meta_messenger'),
    instagram: isConnected('meta_instagram'),
  };

  const connectedCount = Object.values(connections).filter(Boolean).length;

  const platforms = [
    {
      id: 'google',
      provider: 'google',
      name: 'Google Workspace',
      description: 'Calendar, Gmail e Meet integrados',
      logo: (
        <svg viewBox="0 0 24 24" className="w-7 h-7">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      ),
      connected: connections.google,
      accountInfo: getIntegration('google')?.account_email,
      services: [
        { id: 'calendar', name: 'Calendar', icon: <Calendar className="w-4 h-4" />, connected: connections.google },
        { id: 'gmail', name: 'Gmail', icon: <Mail className="w-4 h-4" />, connected: connections.google },
        { id: 'meet', name: 'Meet', icon: <Video className="w-4 h-4" />, connected: connections.google },
      ],
    },
    {
      id: 'meta-messenger',
      provider: 'meta_messenger',
      name: 'Messenger',
      description: 'Mensagens do Facebook',
      logo: (
        <div className="w-7 h-7 rounded-full bg-gradient-to-b from-[#00B2FF] to-[#006AFF] flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
      ),
      connected: connections.messenger,
      accountInfo: getIntegration('meta_messenger')?.page_name,
      services: [
        { id: 'messenger', name: 'Messenger', icon: <MessageCircle className="w-4 h-4" />, connected: connections.messenger },
      ],
    },
    {
      id: 'meta-instagram',
      provider: 'meta_instagram',
      name: 'Instagram',
      description: 'Direct Messages',
      logo: (
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737] flex items-center justify-center">
          <Instagram className="w-4 h-4 text-white" />
        </div>
      ),
      connected: connections.instagram,
      accountInfo: getIntegration('meta_instagram')?.page_name,
      services: [
        { id: 'instagram-dm', name: 'Instagram DM', icon: <Instagram className="w-4 h-4" />, connected: connections.instagram },
      ],
    },
  ];

  const handleConnect = (platformId: string) => {
    if (platformId === 'google') {
      connectGoogle();
    } else if (platformId === 'meta-messenger') {
      connectMeta('messenger');
    } else if (platformId === 'meta-instagram') {
      connectMeta('instagram');
    }
  };

  const handleDisconnect = (provider: string) => {
    disconnect(provider);
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
        {/* Header Premium */}
        <div className="bg-gradient-to-r from-primary/10 via-background to-secondary/10 border-b">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                  <Plug className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">Central de Integrações</h1>
                  <p className="text-muted-foreground">
                    Conecte suas plataformas e centralize todas as comunicações
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-2xl font-bold text-foreground">{connectedCount}/4</div>
                  <div className="text-sm text-muted-foreground">Plataformas ativas</div>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* Status Cards Premium */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                name: 'Google',
                connected: connections.google,
                icon: (
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                ),
                gradient: 'from-blue-500/10 to-red-500/10'
              },
              {
                name: 'WhatsApp',
                connected: connections.whatsapp,
                count: whatsappConnectedCount,
                total: whatsappInstances.length,
                icon: <MessageCircle className="w-5 h-5 text-[#25D366]" />,
                gradient: 'from-[#25D366]/20 to-[#128C7E]/10'
              },
              {
                name: 'Messenger',
                connected: connections.messenger,
                icon: <MessageCircle className="w-5 h-5 text-[#006AFF]" />,
                gradient: 'from-[#00B2FF]/10 to-[#006AFF]/10'
              },
              {
                name: 'Instagram',
                connected: connections.instagram,
                icon: <Instagram className="w-5 h-5 text-[#E4405F]" />,
                gradient: 'from-[#833AB4]/10 via-[#FD1D1D]/10 to-[#F77737]/10'
              },
            ].map((item) => (
              <Card
                key={item.name}
                className={cn(
                  "relative overflow-hidden border-0 shadow-sm transition-all duration-300 hover:shadow-md",
                  item.connected ? "ring-2 ring-primary/20" : ""
                )}
              >
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-50", item.gradient)} />
                <CardContent className="p-4 relative">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-background/80 backdrop-blur flex items-center justify-center shadow-sm">
                      {item.icon}
                    </div>
                    {item.connected ? (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-muted-foreground/50" />
                    )}
                  </div>
                  <h3 className="font-semibold text-foreground">{item.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {item.connected
                      ? item.count !== undefined
                        ? `${item.count}/${item.total} conectado${item.count !== 1 ? 's' : ''}`
                        : 'Conectado'
                      : 'Desconectado'
                    }
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* WhatsApp Premium Section */}
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-[#25D366]/10 to-[#128C7E]/5">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#25D366] to-[#128C7E] flex items-center justify-center shadow-lg shadow-[#25D366]/20">
                      <MessageCircle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        WhatsApp Business
                        <Badge variant="outline" className="ml-2 bg-background text-xs">
                          Evolution API
                        </Badge>
                      </CardTitle>
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
                <div className="flex gap-3">
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
                    className="h-11 px-6 gap-2 bg-primary hover:bg-primary/90"
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
                <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
                  <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="p-4 bg-white rounded-2xl shadow-lg mx-auto md:mx-0">
                      <img
                        src={currentQR.qrCode.startsWith('data:') ? currentQR.qrCode : `data:image/png;base64,${currentQR.qrCode}`}
                        alt="QR Code WhatsApp"
                        className="w-48 h-48 object-contain"
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
                      <div className="flex gap-2">
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Minhas Instâncias ({whatsappInstances.length})
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
                      Crie sua primeira instância para começar a receber mensagens
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
                            "group flex items-center justify-between p-4 rounded-xl border transition-all duration-200",
                            instance.status === 'connected'
                              ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                              : "bg-muted/30 border-border/50 hover:bg-muted/50"
                          )}
                          style={{ borderLeftColor: instanceColor, borderLeftWidth: '4px' }}
                        >
                          <div className="flex items-center gap-4">
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
                            <div>
                              <h4 className="font-medium text-foreground flex items-center gap-2">
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
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {instance.phone_number ? `📱 ${instance.phone_number}` : `ID: ${instance.instance_name}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Color Picker */}
                            <div className="flex items-center gap-1 transition-opacity">
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

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pl-4 border-l ml-4">
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
                                onClick={() => handleDeleteInstance(instance)}
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

          {/* Other Platforms */}
          <div className="grid lg:grid-cols-3 gap-4">
            {platforms.map((platform) => (
              <Card
                key={platform.id}
                className={cn(
                  "border-0 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md",
                  platform.connected && "ring-2 ring-primary/20"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                        {platform.logo}
                      </div>
                      <div>
                        <CardTitle className="text-base">{platform.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {platform.connected && platform.accountInfo
                            ? platform.accountInfo
                            : platform.description
                          }
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 pb-4">
                  <div className="flex items-center gap-2 mb-4">
                    {platform.services.map((service) => (
                      <div
                        key={service.id}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs",
                          service.connected
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {service.icon}
                        {service.name}
                      </div>
                    ))}
                  </div>

                  {platform.connected ? (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-9">
                        <Settings className="w-3.5 h-3.5 mr-1.5" />
                        Configurar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(platform.provider)}
                        disabled={connecting === platform.provider}
                        className="h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {connecting === platform.provider ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <X className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleConnect(platform.id)}
                      disabled={connecting === platform.provider}
                      className="w-full h-9 gap-2"
                    >
                      {connecting === platform.provider ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                      Conectar
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Help Card */}
          <Card className="border-0 shadow-sm bg-gradient-to-r from-muted/50 to-muted/30">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ExternalLink className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Precisa de ajuda?</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Consulte nossa documentação ou fale com o suporte
                  </p>
                </div>
              </div>
              <Button variant="outline" className="gap-2">
                Ver Documentação
                <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}
