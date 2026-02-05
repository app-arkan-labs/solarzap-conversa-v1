import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGoogleIntegrationContext } from '@/contexts/GoogleIntegrationContext';
import { 
  Loader2, 
  Check, 
  Calendar, 
  Video, 
  Mail, 
  Shield,
  LogOut,
  User,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GoogleConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GoogleConnectModal({ isOpen, onClose }: GoogleConnectModalProps) {
  const { 
    isConnected, 
    isConnecting, 
    account, 
    connectGoogle, 
    disconnectGoogle 
  } = useGoogleIntegrationContext();
  
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleConnect = async () => {
    if (!email.includes('@gmail.com') && !email.includes('@googlemail.com')) {
      setError('Por favor, insira um e-mail do Google (@gmail.com)');
      return;
    }
    
    setError('');
    const success = await connectGoogle(email);
    
    if (success) {
      setEmail('');
    }
  };

  const handleDisconnect = () => {
    disconnectGoogle();
  };

  const services = [
    {
      id: 'calendar',
      name: 'Google Calendar',
      description: 'Sincronize eventos e agendamentos',
      icon: Calendar,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      id: 'meet',
      name: 'Google Meet',
      description: 'Crie links de videochamada automaticamente',
      icon: Video,
      color: 'text-green-500',
      bgColor: 'bg-green-50',
    },
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Envie notificações por e-mail',
      icon: Mail,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">G</span>
            </div>
            Integração Google
          </DialogTitle>
          <DialogDescription>
            {isConnected 
              ? 'Gerencie sua conexão com os serviços do Google'
              : 'Conecte sua conta Google para sincronizar Calendar, Meet e Gmail'
            }
          </DialogDescription>
        </DialogHeader>

        {isConnected && account ? (
          <div className="space-y-4">
            {/* Conta conectada */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <img 
                  src={account.picture} 
                  alt={account.name}
                  className="w-12 h-12 rounded-full"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{account.name}</div>
                  <div className="text-sm text-muted-foreground truncate">{account.email}</div>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                  <Check className="w-3 h-3" />
                  Conectado
                </div>
              </div>
            </div>

            {/* Serviços ativos */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Serviços ativos</Label>
              <div className="space-y-2">
                {services.map((service) => {
                  const isActive = account.services[service.id as keyof typeof account.services];
                  const Icon = service.icon;
                  return (
                    <div 
                      key={service.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                        isActive 
                          ? "border-green-200 bg-green-50/50" 
                          : "border-border bg-muted/50"
                      )}
                    >
                      <div className={cn("p-2 rounded-lg", service.bgColor)}>
                        <Icon className={cn("w-4 h-4", service.color)} />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{service.name}</div>
                        <div className="text-xs text-muted-foreground">{service.description}</div>
                      </div>
                      {isActive && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Fechar
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                className="flex-1 gap-2"
              >
                <LogOut className="w-4 h-4" />
                Desconectar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Serviços disponíveis */}
            <div className="grid grid-cols-3 gap-2">
              {services.map((service) => {
                const Icon = service.icon;
                return (
                  <div 
                    key={service.id}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/50 text-center"
                  >
                    <div className={cn("p-2 rounded-lg", service.bgColor)}>
                      <Icon className={cn("w-5 h-5", service.color)} />
                    </div>
                    <span className="text-xs font-medium">{service.name}</span>
                  </div>
                );
              })}
            </div>

            {/* Form de login */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="google-email">E-mail do Google</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="google-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="seu.email@gmail.com"
                    className="pl-10"
                    disabled={isConnecting}
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                  </div>
                )}
              </div>
              
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Ao conectar, você autoriza o SolarZap a acessar seu Calendar, Meet e Gmail 
                  para criar eventos e enviar notificações.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={isConnecting}>
                Cancelar
              </Button>
              <Button 
                onClick={handleConnect}
                disabled={!email.trim() || isConnecting}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <div className="w-4 h-4 rounded bg-white flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-[10px]">G</span>
                    </div>
                    Conectar com Google
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
