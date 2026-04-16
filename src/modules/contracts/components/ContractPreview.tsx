import { ScrollArea } from '@/components/ui/scroll-area';
import type { ContractRenderResult } from '../lib/domain';

interface ContractPreviewProps {
  renderResult: ContractRenderResult | null;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}

export function ContractPreview({
  renderResult,
  emptyStateTitle = 'Preview ainda nao gerado',
  emptyStateDescription = 'Confirme a revisao final e gere o preview para visualizar o contrato completo.',
}: ContractPreviewProps) {
  if (!renderResult) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
        <div className="max-w-md space-y-3">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">
            {emptyStateTitle}
          </h3>
          <p className="text-sm leading-6 text-slate-600">
            {emptyStateDescription}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[70dvh] rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#fffdf8,#ffffff_18%,#f8fafc_100%)] p-4 sm:p-6">
      <div
        className="min-h-full"
        dangerouslySetInnerHTML={{ __html: renderResult.html }}
      />
    </ScrollArea>
  );
}
