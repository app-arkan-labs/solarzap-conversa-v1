import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import OnboardingChecklist from '@/components/billing/OnboardingChecklist';

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <h1 className="text-xl font-semibold text-emerald-800">Assinatura ativada</h1>
          <p className="text-sm text-emerald-700">Seu trial foi iniciado. Complete o onboarding para acelerar os primeiros resultados.</p>
        </div>
        <OnboardingChecklist />
        <div className="flex justify-end">
          <Button onClick={() => navigate('/')}>Ir para o app</Button>
        </div>
      </div>
    </div>
  );
}
