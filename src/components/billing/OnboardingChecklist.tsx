import { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

const DEFAULT_ITEMS = [
  'Conectar WhatsApp',
  'Cadastrar primeiro lead',
  'Criar primeira campanha',
  'Gerar primeira proposta',
];

export default function OnboardingChecklist() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Checklist inicial</h3>
      <ul className="space-y-2">
        {DEFAULT_ITEMS.map((item) => (
          <li key={item}>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm"
              onClick={() => setDone((prev) => ({ ...prev, [item]: !prev[item] }))}
            >
              {done[item] ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-400" />}
              {item}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
