import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import OnboardingChecklist from '@/components/billing/OnboardingChecklist';

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="app-shell-bg min-h-screen p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-primary/20 bg-card/94 p-4 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.22)] backdrop-blur-xl">
          <h1 className="text-xl font-semibold text-foreground">Assinatura ativada</h1>
          <p className="text-sm text-muted-foreground">Seu trial foi iniciado. Complete o onboarding para acelerar os primeiros resultados.</p>
        </div>
        <OnboardingChecklist />
        <div className="flex justify-end">
          <Button onClick={() => navigate('/')}>Ir para o app</Button>
        </div>
      </div>
    </div>
  );
}
