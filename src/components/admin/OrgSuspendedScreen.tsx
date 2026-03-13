import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type OrgSuspendedScreenProps = {
  reason: string | null;
};

export default function OrgSuspendedScreen({ reason }: OrgSuspendedScreenProps) {
  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-xl border border-amber-300 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-slate-900">Sua organizacao foi suspensa</h1>
            <p className="text-sm text-slate-700">
              O acesso ao CRM esta bloqueado ate a reativacao pela equipe de operacoes.
            </p>
            {reason ? (
              <p className="text-sm text-slate-800">
                <span className="font-medium">Motivo:</span> {reason}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              Suporte: suporte@solarzap.com.br
            </p>
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
        </div>
      </div>
    </div>
  );
}
