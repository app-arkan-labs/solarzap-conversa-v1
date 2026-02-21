import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, MessageCircle, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';

type Method = 'tel' | 'whatsapp';

function normalizeBrazilPhoneDigits(raw: string | undefined | null) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function isMethod(value: string | null): value is Method {
  return value === 'tel' || value === 'whatsapp';
}

export default function CallQrRedirect() {
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const token = params.get('token') || '';
  const methodParam = params.get('method');
  const phoneParam = params.get('phone');

  const method = isMethod(methodParam) ? methodParam : null;
  const phoneDigits = useMemo(() => normalizeBrazilPhoneDigits(phoneParam), [phoneParam]);
  const phoneDisplay = useMemo(() => formatPhoneForDisplay(phoneDigits), [phoneDigits]);

  const targetUrl = useMemo(() => {
    if (!method || !phoneDigits) return '';
    if (method === 'tel') return `tel:+${phoneDigits}`;
    return `https://wa.me/${phoneDigits}`;
  }, [method, phoneDigits]);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!method || !phoneDigits || !targetUrl) {
      setStatus('error');
      setError('Link inválido ou incompleto.');
      return;
    }

    let cancelled = false;

    (async () => {
      // Best-effort: register scan event (does not block the redirect).
      if (token) {
        try {
          await supabase.from('qr_scan_events').insert([{ token, method }]);
        } catch {
          // Ignore: DB/table/policy might not be configured; QR still works.
        }
      }

      if (cancelled) return;
      setStatus('ready');

      // Best-effort: try to open automatically. Some browsers may require a tap.
      try {
        window.location.href = targetUrl;
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [method, phoneDigits, targetUrl, token]);

  const title = method === 'tel' ? 'Abrindo discador' : method === 'whatsapp' ? 'Abrindo WhatsApp' : 'Abrindo...';
  const Icon = method === 'tel' ? Phone : MessageCircle;

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-600" />
            {title}
          </CardTitle>
          <CardDescription>
            {status === 'error'
              ? error
              : `Número: ${phoneDisplay || '-'}${method === 'whatsapp' ? ' (conversa)' : ''}`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {status !== 'error' && (
            <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
              Se nada acontecer automaticamente, toque em <span className="font-medium text-foreground">Abrir agora</span>.
            </div>
          )}

          {status === 'error' && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Verifique se o QR Code foi gerado corretamente e tente novamente.
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            className="flex-1 gap-2"
            disabled={status !== 'ready' || !targetUrl}
            onClick={() => {
              if (!targetUrl) return;
              window.location.href = targetUrl;
            }}
          >
            <ExternalLink className="w-4 h-4" />
            Abrir agora
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

