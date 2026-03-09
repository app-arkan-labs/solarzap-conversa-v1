import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SubscriptionRequiredScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Assinatura necessária</CardTitle>
            <CardDescription>
              Seu acesso está bloqueado no momento. Ative ou regularize seu plano para continuar usando recursos de escrita.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => navigate('/pricing')}>Ver planos</Button>
            <Button variant="outline" onClick={() => navigate('/')}>Tentar novamente</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
