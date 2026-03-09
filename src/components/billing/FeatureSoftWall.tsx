import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function FeatureSoftWall({
  featureName,
  requiredPlan,
  description,
  onUpgrade,
}: {
  featureName: string;
  requiredPlan: string;
  description?: string;
  onUpgrade?: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Recurso bloqueado no plano atual</p>
            <h2 className="text-xl font-semibold">{featureName}</h2>
          </div>
        </div>

        <div className="mb-5 flex items-center gap-2">
          <Badge variant="secondary">Plano necessário: {requiredPlan}</Badge>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          {description || 'Faça upgrade do plano para desbloquear este recurso e continuar.'}
        </p>

        <div className="flex justify-end">
          <Button onClick={onUpgrade}>Fazer upgrade</Button>
        </div>
      </div>
    </div>
  );
}
