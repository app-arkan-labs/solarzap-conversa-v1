import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText, Loader2, PenSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContractPreview } from './ContractPreview';
import { ContractStatusBadge } from './ContractStatusBadge';
import { ContractWizardDialog } from './ContractWizardDialog';
import { useContractEmbedSession } from '../hooks/useContractEmbedSession';
import { renderContractDocument } from '../lib/templateEngine';
import { formatCurrencyPtBr, formatDatePtBr } from '../lib/formatters';
import type { ContractRenderResult } from '../lib/domain';
import type { ContractFormalizationFormValues } from '../lib/schema';

interface ContractsEmbedSurfaceProps {
  token: string;
}

export function ContractsEmbedSurface({ token }: ContractsEmbedSurfaceProps) {
  const contractEmbed = useContractEmbedSession(token);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeValues, setActiveValues] = useState<ContractFormalizationFormValues | null>(
    null,
  );
  const [activeRenderResult, setActiveRenderResult] = useState<ContractRenderResult | null>(
    null,
  );

  useEffect(() => {
    if (!contractEmbed.resolvedValues) return;
    setActiveValues(contractEmbed.resolvedValues);
    setActiveRenderResult(renderContractDocument(contractEmbed.resolvedValues));
    setWizardOpen(true);
  }, [contractEmbed.resolvedValues]);

  const derivedRender = useMemo(
    () => (activeValues ? renderContractDocument(activeValues) : null),
    [activeValues],
  );

  const syncResult = (result: { values: ContractFormalizationFormValues; renderResult: ContractRenderResult }) => {
    setActiveValues(result.values);
    setActiveRenderResult(result.renderResult);
  };

  if (!token.trim()) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-6 py-10">
        <div className="max-w-lg rounded-[28px] border border-rose-200 bg-white px-6 py-8 text-center shadow-[0_24px_60px_-42px_rgba(15,23,42,0.28)]">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Token do embed ausente
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Esta rota publica precisa receber `?token=` para carregar a sessao contratual.
          </p>
        </div>
      </div>
    );
  }

  if (contractEmbed.resolveQuery.isError && !activeValues) {
    const message =
      contractEmbed.resolveQuery.error instanceof Error
        ? contractEmbed.resolveQuery.error.message
        : 'Nao foi possivel resolver a sessao de embed.';

    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-6 py-10">
        <div className="max-w-xl rounded-[28px] border border-rose-200 bg-white px-6 py-8 text-center shadow-[0_24px_60px_-42px_rgba(15,23,42,0.28)]">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Sessao de embed indisponivel
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">{message}</p>
        </div>
      </div>
    );
  }

  if (contractEmbed.resolveQuery.isLoading || !activeValues) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[linear-gradient(180deg,#f8fafc,#ffffff)] px-6 py-10">
        <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.28)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando sessao contratual...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,#e0f2fe,transparent_32%),linear-gradient(180deg,#f8fafc,#ffffff_18%,#f8fafc)] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
        <div className="rounded-[32px] border border-slate-200 bg-white/90 px-5 py-5 shadow-[0_28px_70px_-46px_rgba(15,23,42,0.32)] backdrop-blur-sm sm:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {activeValues.internalMetadata.contractNumber}
                </span>
                <ContractStatusBadge status={activeValues.internalMetadata.contractStatus} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Formalizacao contratual
              </h1>
              <p className="text-sm leading-7 text-slate-600">
                {activeValues.legalData.contratante.razaoSocial || 'Empresa nao preenchida'} •{' '}
                {activeValues.legalData.plano.nome}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setWizardOpen(true)}>
                <PenSquare className="mr-2 h-4 w-4" />
                Editar dados
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void contractEmbed.generatePreview(activeValues).then(syncResult)}
                disabled={contractEmbed.isGeneratingPreview}
              >
                {contractEmbed.isGeneratingPreview ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Preview
              </Button>
              <Button
                type="button"
                onClick={() => void contractEmbed.generatePdf(activeValues).then(syncResult)}
                disabled={contractEmbed.isGeneratingPdf}
              >
                {contractEmbed.isGeneratingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                PDF
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Implantacao', formatCurrencyPtBr(activeValues.legalData.pagamento.valorImplantacao)],
              ['Recorrencia', formatCurrencyPtBr(activeValues.legalData.pagamento.valorRecorrente)],
              ['Inicio', formatDatePtBr(activeValues.legalData.pagamento.dataInicio)],
              ['Primeiro vencimento', formatDatePtBr(activeValues.legalData.pagamento.dataPrimeiroVencimento)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <ContractPreview renderResult={activeRenderResult || derivedRender} />
      </div>

      <ContractWizardDialog
        open={wizardOpen}
        initialValues={activeValues}
        initialRenderResult={activeRenderResult}
        onOpenChange={setWizardOpen}
        onSaveDraft={async (values) => {
          const result = await contractEmbed.saveDraft(values);
          syncResult(result);
          return result;
        }}
        onMarkReviewReady={async (values) => {
          const result = await contractEmbed.markReviewReady(values);
          syncResult(result);
          return result;
        }}
        onGeneratePreview={async (values) => {
          const result = await contractEmbed.generatePreview(values);
          syncResult(result);
          return result;
        }}
        onGeneratePdf={async (values) => {
          const result = await contractEmbed.generatePdf(values);
          syncResult(result);
          return result;
        }}
        isSavingDraft={contractEmbed.isSavingDraft}
        isMarkingReviewReady={contractEmbed.isMarkingReviewReady}
        isGeneratingPreview={contractEmbed.isGeneratingPreview}
        isGeneratingPdf={contractEmbed.isGeneratingPdf}
        title="Formalizacao comercial"
        subtitle="Sessao publica de formalizacao preparada para embed controlado na apresentacao comercial."
        showMockSeedButton={false}
        lockedFieldKeys={contractEmbed.lockedFieldKeys}
      />
    </div>
  );
}
