import React from 'react';
import { useGoogleIntegration } from '@/hooks/useGoogleIntegration';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Calendar, Mail, Loader2, Video, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface GoogleConnectButtonProps {
    connected?: boolean;
    onDisconnect?: () => void;
}

export const GoogleConnectButton: React.FC<GoogleConnectButtonProps> = ({
    connected = false,
    onDisconnect
}) => {
    const { connectGoogle, isConnecting } = useGoogleIntegration();

    const handleConnect = async () => {
        await connectGoogle();
    };

    const handleDisconnect = async () => {
        // Optional: Implement disconnect logic by calling an Edge Function or deleting row
        if (onDisconnect) onDisconnect();
        toast.info('Desconexão ainda não implementada neste botão.');
    };

    if (connected) {
        return (
            <div className="flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-full border border-border/70 bg-card p-2 shadow-sm">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-medium text-foreground">Google Conectado</h3>
                        <p className="text-sm text-foreground/70">Calendar, Gmail e Meet sincronizados</p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
                    onClick={handleDisconnect}
                >
                    Desconectar
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/94 p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.28)] backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                    <div className="z-10 rounded-full border border-border bg-card p-2 shadow-sm">
                        <Calendar className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="z-20 rounded-full border border-border bg-card p-2 shadow-sm">
                        <Mail className="w-4 h-4 text-red-600" />
                    </div>
                    <div className="z-30 rounded-full border border-border bg-card p-2 shadow-sm">
                        <Video className="w-4 h-4 text-primary" />
                    </div>
                </div>
                <div>
                    <h3 className="font-medium text-foreground">Integração Google Workspace</h3>
                    <p className="text-sm text-muted-foreground">Sincronize reuniões e e-mails</p>
                </div>
            </div>

            <Button
                onClick={handleConnect}
                disabled={isConnecting}
                className="gap-2"
                variant="outline"
            >
                {isConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <img src="https://www.google.com/favicon.ico" alt="G" className="w-4 h-4" />
                )}
                Conectar Google
            </Button>
        </div>
    );
};
