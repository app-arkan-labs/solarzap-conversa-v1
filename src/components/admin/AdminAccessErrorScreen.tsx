import { AlertTriangle, RefreshCcw, ShieldX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type AdminAccessErrorScreenProps = {
  mode: 'session_error' | 'origin_error' | 'admin_api_error';
  code: string;
  status?: number;
  requestId?: string | null;
  message: string;
  onRetry: () => void | Promise<void>;
};

const COPY_BY_MODE = {
  session_error: {
    title: 'Sessão admin inconsistente',
    description:
      'O acesso ao admin falhou por autenticação ou renovação de sessão. O fluxo não será redirecionado silenciosamente.',
  },
  origin_error: {
    title: 'Origem não autorizada',
    description:
      'A origem atual não está autorizada a chamar o admin-api. Corrija a allowlist da Edge Function.',
  },
  admin_api_error: {
    title: 'Falha ao validar acesso admin',
    description:
      'O gate do painel respondeu com erro operacional. O acesso foi interrompido de forma diagnostica.',
  },
} as const;

export default function AdminAccessErrorScreen({
  mode,
  code,
  status,
  requestId,
  message,
  onRetry,
}: AdminAccessErrorScreenProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const copy = COPY_BY_MODE[mode];
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  return (
    <div className="app-shell-bg min-h-screen px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl items-center justify-center">
        <Card className="w-full border-amber-200 shadow-sm">
          <CardHeader className="space-y-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              {mode === 'origin_error' ? (
                <ShieldX className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <div className="space-y-2">
              <CardTitle>{copy.title}</CardTitle>
              <CardDescription>{copy.description}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">code: {code}</Badge>
              <Badge variant="outline">status: {status ?? 'n/a'}</Badge>
              <Badge variant="outline">origin: {origin}</Badge>
            </div>

            <div className="rounded-xl border border-border bg-card/94 p-4 text-sm">
              <p className="font-medium text-foreground">Mensagem</p>
              <p className="mt-1 text-muted-foreground">{message}</p>
              <p className="mt-3 font-medium text-foreground">request_id</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{requestId || 'indisponivel'}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="sm:flex-1"
                onClick={() => {
                  void onRetry();
                }}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Tentar novamente
              </Button>
              <Button
                type="button"
                variant="outline"
                className="sm:flex-1"
                onClick={() => {
                  void (async () => {
                    await signOut();
                    navigate('/login', { replace: true });
                  })();
                }}
              >
                Refazer login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
