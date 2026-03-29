import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function MfaChallenge() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const canVerify = useMemo(() => !!factorId && code.trim().length >= 6, [factorId, code]);

  useEffect(() => {
    let mounted = true;

    const loadFactors = async () => {
      try {
        setLoadingFactors(true);
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) {
          throw error;
        }

        const payload = data as Record<string, unknown> | null;
        const totpFactors = Array.isArray(payload?.totp) ? payload.totp : [];
        const allFactors = Array.isArray(payload?.all) ? payload.all : [];
        const candidate = (totpFactors[0] || allFactors[0]) as Record<string, unknown> | undefined;
        const nextFactorId = typeof candidate?.id === 'string' ? candidate.id : null;

        if (mounted) {
          setFactorId(nextFactorId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao carregar fatores MFA';
        toast({
          title: 'Erro ao validar MFA',
          description: message,
          variant: 'destructive',
        });
      } finally {
        if (mounted) {
          setLoadingFactors(false);
        }
      }
    };

    void loadFactors();

    return () => {
      mounted = false;
    };
  }, [toast]);

  useEffect(() => {
    let mounted = true;

    const redirectIfElevated = async () => {
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;

        if (mounted && data?.currentLevel === 'aal2') {
          setRedirecting(true);
          window.location.replace('/admin');
        }
      } catch {
        // noop
      }
    };

    void redirectIfElevated();

    return () => {
      mounted = false;
    };
  }, []);

  const handleVerify = async () => {
    if (!factorId) return;

    try {
      setLoadingVerify(true);
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError || !challengeData?.id) {
        throw challengeError || new Error('Falha ao iniciar challenge');
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: code.trim(),
      });
      if (verifyError) {
        throw verifyError;
      }

      toast({
        title: 'MFA validado',
        description: 'Sessão elevada para AAL2.',
      });
      setRedirecting(true);
      window.location.replace('/admin');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Código MFA inválido';
      toast({
        title: 'Falha na verificação',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoadingVerify(false);
    }
  };

  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <CardTitle>Confirmar MFA para /admin</CardTitle>
          <CardDescription>
            Sua sessão atual está em AAL1. Informe o código TOTP para continuar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {redirecting ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecionando para o painel admin...
            </div>
          ) : null}
          {loadingFactors ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando fatores MFA...
            </div>
          ) : !factorId ? (
            <>
              <p className="text-sm text-muted-foreground">
                Nenhum fator MFA encontrado para seu usuário.
              </p>
              <Button className="w-full" onClick={() => navigate('/admin/mfa-setup', { replace: true })}>
                Configurar MFA
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="totp-challenge-code">Codigo de 6 digitos</Label>
                <Input
                  id="totp-challenge-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/')}
                >
                  Cancelar
                </Button>
                <Button className="w-full" onClick={handleVerify} disabled={!canVerify || loadingVerify}>
                  {loadingVerify ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validar'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
