import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  MessageCircle, 
  Instagram, 
  Check, 
  Loader2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface MetaConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: 'messenger' | 'instagram';
  onConnected: () => void;
}

type ConnectionStep = 'auth' | 'permissions' | 'pages' | 'connected';

export function MetaConnectModal({ isOpen, onClose, platform, onConnected }: MetaConnectModalProps) {
  const [step, setStep] = useState<ConnectionStep>('auth');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const { toast } = useToast();

  // Mock pages - in production these would come from Facebook API
  const mockPages = [
    { id: '1', name: 'SolarZap Energia Solar', category: 'Empresa de Energia' },
    { id: '2', name: 'Energia Renovável BR', category: 'Serviços' },
  ];

  const platformConfig = {
    messenger: {
      name: 'Messenger',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <path fill="#0084FF" d="M12 2C6.477 2 2 6.145 2 11.243c0 2.903 1.442 5.49 3.696 7.181V22l3.429-1.879A10.86 10.86 0 0012 20.485c5.523 0 10-4.144 10-9.242C22 6.145 17.523 2 12 2zm1.052 12.45l-2.548-2.72-4.973 2.72 5.47-5.806 2.613 2.72 4.907-2.72-5.47 5.806z"/>
        </svg>
      ),
      color: 'bg-[#0084FF]',
      description: 'Conecte sua página do Facebook para receber mensagens do Messenger.',
      permissions: ['Gerenciar mensagens da página', 'Ler informações da página', 'Responder como página'],
    },
    instagram: {
      name: 'Instagram',
      icon: <Instagram className="w-6 h-6 text-white" />,
      color: 'bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737]',
      description: 'Conecte sua conta profissional do Instagram para gerenciar DMs.',
      permissions: ['Gerenciar mensagens do Instagram', 'Ler informações do perfil', 'Responder como conta'],
    },
  };

  const config = platformConfig[platform];

  const handleFacebookLogin = () => {
    setIsLoading(true);
    // Simulate OAuth flow
    setTimeout(() => {
      setIsLoading(false);
      setStep('permissions');
    }, 1500);
  };

  const handleGrantPermissions = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('pages');
    }, 1000);
  };

  const handleSelectPage = (pageId: string) => {
    setSelectedPage(pageId);
  };

  const handleConnect = () => {
    if (!selectedPage) {
      toast({
        title: "Selecione uma página",
        description: "Você precisa selecionar uma página para continuar.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('connected');
      setTimeout(() => {
        onConnected();
        toast({
          title: `${config.name} conectado!`,
          description: "Você já pode receber e responder mensagens.",
        });
      }, 1500);
    }, 1000);
  };

  const handleClose = () => {
    setStep('auth');
    setSelectedPage(null);
    setIsLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.color)}>
              {platform === 'instagram' ? config.icon : null}
            </div>
            {platform === 'messenger' && config.icon}
            Conectar {config.name}
          </DialogTitle>
          <DialogDescription>
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2">
            {['auth', 'permissions', 'pages', 'connected'].map((s, i) => (
              <div key={s} className="flex items-center">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                  step === s ? (platform === 'messenger' ? "bg-blue-500 text-white" : "bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#F77737] text-white") :
                  ['permissions', 'pages', 'connected'].indexOf(step) > ['auth', 'permissions', 'pages', 'connected'].indexOf(s) 
                    ? "bg-green-500 text-white" 
                    : "bg-muted text-muted-foreground"
                )}>
                  {['permissions', 'pages', 'connected'].indexOf(step) > ['auth', 'permissions', 'pages', 'connected'].indexOf(s) 
                    ? <Check className="w-4 h-4" /> 
                    : i + 1}
                </div>
                {i < 3 && (
                  <div className={cn(
                    "w-8 h-0.5 transition-all",
                    ['permissions', 'pages', 'connected'].indexOf(step) > i 
                      ? "bg-green-500" 
                      : "bg-muted"
                  )} />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          {step === 'auth' && (
            <div className="space-y-4 text-center">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Você será redirecionado para o Facebook para autorizar a conexão.
                </p>
              </div>
              
              <Button 
                onClick={handleFacebookLogin}
                disabled={isLoading}
                className="w-full bg-[#1877F2] hover:bg-[#166FE5]"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                )}
                Continuar com Facebook
              </Button>
            </div>
          )}

          {step === 'permissions' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <span>Permissões necessárias:</span>
              </div>
              
              <div className="space-y-2">
                {config.permissions.map((permission, i) => (
                  <div 
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="text-sm">{permission}</span>
                  </div>
                ))}
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Suas credenciais são armazenadas de forma segura e nunca compartilhadas.
                </p>
              </div>
              
              <Button 
                onClick={handleGrantPermissions}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Conceder Permissões
              </Button>
            </div>
          )}

          {step === 'pages' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione a página que deseja conectar:
              </p>
              
              <div className="space-y-2">
                {mockPages.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => handleSelectPage(page.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left",
                      selectedPage === page.id 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      {platform === 'messenger' ? (
                        <MessageCircle className="w-5 h-5" />
                      ) : (
                        <Instagram className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{page.name}</p>
                      <p className="text-xs text-muted-foreground">{page.category}</p>
                    </div>
                    {selectedPage === page.id && (
                      <Check className="w-5 h-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
              
              <Button 
                onClick={handleConnect}
                disabled={isLoading || !selectedPage}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Conectar Página
              </Button>
            </div>
          )}

          {step === 'connected' && (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Conectado com sucesso!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Você já pode receber e responder mensagens do {config.name}.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
