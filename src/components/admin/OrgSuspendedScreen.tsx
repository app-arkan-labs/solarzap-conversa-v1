import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

type OrgSuspendedScreenProps = {
  reason: string | null;
};

export default function OrgSuspendedScreen({ reason }: OrgSuspendedScreenProps) {
  const navigate = useNavigate();

  return (
    <div className="app-shell-bg min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border border-amber-300/60 bg-card/94 p-6 shadow-[0_24px_56px_-32px_rgba(15,23,42,0.32)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-3">
            <h1 className="text-xl font-semibold text-foreground">Sua organizacao foi suspensa</h1>
            <p className="text-sm text-foreground/80">
              O acesso ao CRM esta temporariamente bloqueado. Seus dados estao preservados e a conta pode ser reativada a qualquer momento.
            </p>
            {reason ? (
              <p className="text-sm text-foreground/84">
                <span className="font-medium">Motivo:</span> {reason}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="default"
                onClick={() => navigate('/billing')}
              >
                Regularizar pagamento
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  window.location.href = 'mailto:suporte@solarzap.com.br';
                }}
              >
                Contatar suporte
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Suporte: suporte@solarzap.com.br
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
