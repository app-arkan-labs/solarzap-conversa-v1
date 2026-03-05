import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type EnrollmentState = {
  factorId: string;
  qrCode: string;
  secret: string | null;
};

export default function MfaSetup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loadingEnroll, setLoadingEnroll] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null);
  const [code, setCode] = useState('');

  const canVerify = useMemo(
    () => !!enrollment?.factorId && code.trim().length >= 6,
    [code, enrollment?.factorId],
  );

  const handleEnroll = async () => {
    try {
      setLoadingEnroll(true);
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'SolarZap Admin',
      });

      if (error || !data?.id) {
        throw error || new Error('Falha ao criar fator TOTP');
      }

      const qrCode = data.totp?.uri || data.totp?.qr_code || '';
      if (!qrCode) {
        throw new Error('QR Code nao retornado pelo Supabase');
      }

      setEnrollment({
        factorId: data.id,
        qrCode,
        secret: data.totp?.secret ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no enrollment MFA';
      toast({
        title: 'Erro ao configurar MFA',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoadingEnroll(false);
    }
  };

  const handleVerify = async () => {
    if (!enrollment?.factorId) return;

    try {
      setLoadingVerify(true);
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollment.factorId,
      });
      if (challengeError || !challengeData?.id) {
        throw challengeError || new Error('Nao foi possivel iniciar challenge MFA');
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challengeData.id,
        code: code.trim(),
      });
      if (verifyError) {
        throw verifyError;
      }

      toast({
        title: 'MFA configurado',
        description: 'Sessao elevada para AAL2. Acesso admin liberado.',
      });
      navigate('/admin', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Codigo MFA invalido';
      toast({
        title: 'Falha na verificacao',
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
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <CardTitle>Configurar MFA para /admin</CardTitle>
          <CardDescription>
            O painel admin exige autenticacao reforcada (AAL2). Escaneie o QR no app autenticador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!enrollment ? (
            <Button className="w-full" onClick={handleEnroll} disabled={loadingEnroll}>
              {loadingEnroll ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gerar QR TOTP'}
            </Button>
          ) : (
            <>
              <div className="rounded-md border bg-white p-4 flex items-center justify-center">
                <QRCode value={enrollment.qrCode} size={180} />
              </div>
              {enrollment.secret ? (
                <p className="text-xs text-muted-foreground break-all">
                  Chave manual: <span className="font-mono">{enrollment.secret}</span>
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="totp-setup-code">Codigo de 6 digitos</Label>
                <Input
                  id="totp-setup-code"
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
                  {loadingVerify ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar e continuar'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
