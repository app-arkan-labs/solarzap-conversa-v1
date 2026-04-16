import { useEffect, useState } from 'react';
import {
  Download,
  FilePlus2,
  FileText,
  Layers3,
  Loader2,
  PenSquare,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/solarzap/PageHeader';
import { ContractPreview } from './ContractPreview';
import { ContractStatusBadge } from './ContractStatusBadge';
import { ContractWizardDialog } from './ContractWizardDialog';
import { useContractModule } from '../hooks/useContractModule';
import { contractDraftRecordToFormValues } from '../lib/repository';
import { createSolarPrimeMockContract } from '../lib/mock';
import { renderContractDocument } from '../lib/templateEngine';
import { formatCurrencyPtBr, formatDatePtBr } from '../lib/formatters';
import type { ContractExternalPrefill, ContractInputMode, ContractRenderResult } from '../lib/domain';
import type { ContractFormalizationFormValues } from '../lib/schema';

interface ContractsWorkspaceProps {
  mode?: ContractInputMode;
  externalPrefill?: ContractExternalPrefill | null;
}

export function ContractsWorkspace({
  mode = 'workspace',
  externalPrefill,
}: ContractsWorkspaceProps) {
  const contractModule = useContractModule(externalPrefill);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeValues, setActiveValues] = useState<ContractFormalizationFormValues | null>(
    null,
  );
  const [activeRenderResult, setActiveRenderResult] = useState<ContractRenderResult | null>(
    null,
  );

  useEffect(() => {
    if (!activeDraftId && contractModule.drafts.length > 0) {
      void (async () => {
        const firstDraft = contractModule.drafts[0];
        const draft = await contractModule.getDraft(firstDraft.id);
        const values = contractDraftRecordToFormValues(draft);
        setActiveDraftId(firstDraft.id);
        setActiveValues(values);
        setActiveRenderResult(renderContractDocument(values));
      })();
    }
  }, [activeDraftId, contractModule]);

  const syncResult = (result: { values: ContractFormalizationFormValues; renderResult: ContractRenderResult }) => {
    setActiveDraftId(result.values.internalMetadata.contractDraftId);
    setActiveValues(result.values);
    setActiveRenderResult(result.renderResult);
  };

  const handleCreateDraft = async () => {
    const result = await contractModule.createDraft();
    syncResult(result);
    setWizardOpen(true);
  };

  const handleSelectDraft = async (draftId: string) => {
    const draft = await contractModule.getDraft(draftId);
    const values = contractDraftRecordToFormValues(draft);
    setActiveDraftId(draftId);
    setActiveValues(values);
    setActiveRenderResult(renderContractDocument(values));
  };

  const handleLoadMock = async () => {
    const result = await contractModule.createDraft();
    const mock = createSolarPrimeMockContract({
      internalMetadata: {
        ...result.values.internalMetadata,
        organizationId: result.values.internalMetadata.organizationId,
        createdByUserId: result.values.internalMetadata.createdByUserId,
        lastUpdatedByUserId: result.values.internalMetadata.lastUpdatedByUserId,
        sellerUserId: result.values.internalMetadata.sellerUserId,
      },
    });
    const persisted = await contractModule.saveDraft(mock);
    syncResult(persisted);
    setWizardOpen(true);
  };

  const headerActionContent = (
    <>
      <Button type="button" variant="outline" onClick={handleLoadMock}>
        <Sparkles className="mr-2 h-4 w-4" />
        Mock Solar Prime
      </Button>
      <Button type="button" onClick={handleCreateDraft}>
        <FilePlus2 className="mr-2 h-4 w-4" />
        Novo contrato
      </Button>
    </>
  );

  const headerCopy =
    mode === 'crm_admin'
      ? {
          title: 'Contratos',
          subtitle:
            'Modulo contratual central no CRM admin, com drafts, preview, PDF e preparacao para embed.',
        }
      : {
          title: 'Modulo contratual',
          subtitle:
            'Draft, wizard, preview, PDF e persistencia centralizados no SolarZap.',
        };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#f8fafc,#ffffff_18%,#f8fafc_100%)]">
      {mode !== 'embedded' ? (
        <PageHeader
          title={headerCopy.title}
          subtitle={headerCopy.subtitle}
          icon={FileText}
          actionContent={headerActionContent}
        />
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 p-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-6">
        <Card className="min-h-0 overflow-hidden border-slate-200 shadow-[0_22px_40px_-34px_rgba(15,23,42,0.35)]">
          <CardContent className="flex h-full min-h-0 flex-col p-0">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Drafts
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
                    Contratos do modulo central
                  </h2>
                </div>
                {contractModule.isLoadingDrafts ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              </div>
            </div>

            <ScrollArea className="h-full">
              <div className="space-y-3 p-4">
                {contractModule.drafts.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                    <p className="text-sm text-slate-600">
                      Nenhum contrato criado ainda. Abra um draft para iniciar o fluxo.
                    </p>
                  </div>
                ) : (
                  contractModule.drafts.map((draft) => {
                    const active = draft.id === activeDraftId;
                    return (
                      <button
                        key={draft.id}
                        type="button"
                        onClick={() => void handleSelectDraft(draft.id)}
                        className={`w-full rounded-[24px] border px-4 py-4 text-left transition-all ${
                          active
                            ? 'border-slate-950 bg-slate-950 text-white shadow-[0_22px_40px_-34px_rgba(15,23,42,0.82)]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                                {draft.contractNumber}
                              </p>
                              <p className="mt-1 text-sm font-semibold tracking-tight">
                                {draft.companyName}
                              </p>
                            </div>
                            {!active ? <ContractStatusBadge status={draft.status} /> : null}
                          </div>
                          <div className={`space-y-1 text-sm ${active ? 'text-slate-200' : 'text-slate-600'}`}>
                            <p>{draft.planName}</p>
                            <p>{draft.responsibleName}</p>
                            <p>Atualizado em {formatDatePtBr(draft.updatedAt.slice(0, 10))}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden border-slate-200 shadow-[0_26px_50px_-40px_rgba(15,23,42,0.38)]">
          <CardContent className="flex h-full min-h-0 flex-col gap-5 p-5 sm:p-6">
            {activeValues ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                        {activeValues.internalMetadata.contractNumber}
                      </span>
                      <ContractStatusBadge status={activeValues.internalMetadata.contractStatus} />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                      {activeValues.legalData.contratante.razaoSocial || 'Contrato em andamento'}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {activeValues.legalData.plano.nome} • Responsavel {activeValues.legalData.responsavel.nome || 'nao preenchido'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setWizardOpen(true)}>
                      <PenSquare className="mr-2 h-4 w-4" />
                      Abrir wizard
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void contractModule
                          .generatePreview(activeValues)
                          .then(syncResult)
                      }
                      disabled={contractModule.isGeneratingPreview}
                    >
                      {contractModule.isGeneratingPreview ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Layers3 className="mr-2 h-4 w-4" />
                      )}
                      Preview
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        void contractModule
                          .generatePdf(activeValues)
                          .then((result) => syncResult(result))
                      }
                      disabled={contractModule.isGeneratingPdf}
                    >
                      {contractModule.isGeneratingPdf ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      PDF
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Implantacao', formatCurrencyPtBr(activeValues.legalData.pagamento.valorImplantacao)],
                    ['Recorrencia', formatCurrencyPtBr(activeValues.legalData.pagamento.valorRecorrente)],
                    ['Inicio', formatDatePtBr(activeValues.legalData.pagamento.dataInicio)],
                    ['Vencimento', `Todo dia ${activeValues.legalData.pagamento.diaVencimentoMensal}`],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {label}
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>

                <ContractPreview
                  renderResult={
                    activeValues.internalMetadata.contractStatus === 'preview_generated' ||
                    activeValues.internalMetadata.contractStatus === 'pdf_generated' ||
                    activeValues.internalMetadata.contractStatus === 'sent_for_signature' ||
                    activeValues.internalMetadata.contractStatus === 'signed'
                      ? activeRenderResult
                      : null
                  }
                />
              </>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
                <div className="max-w-lg space-y-4">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                    Nenhum contrato ativo selecionado
                  </h2>
                  <p className="text-sm leading-7 text-slate-600">
                    Crie um draft para preencher dados da contratante, plano, recorrencia,
                    condicao especial, preview contratual e PDF no modulo central do SolarZap.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button type="button" variant="outline" onClick={handleLoadMock}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Gerar mock obrigatorio
                    </Button>
                    <Button type="button" onClick={handleCreateDraft}>
                      <FilePlus2 className="mr-2 h-4 w-4" />
                      Criar draft
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ContractWizardDialog
        open={wizardOpen}
        initialValues={activeValues}
        initialRenderResult={activeRenderResult}
        onOpenChange={setWizardOpen}
        onSaveDraft={async (values) => {
          const result = await contractModule.saveDraft(values);
          syncResult(result);
          return result;
        }}
        onMarkReviewReady={async (values) => {
          const result = await contractModule.markReviewReady(values);
          syncResult(result);
          return result;
        }}
        onGeneratePreview={async (values) => {
          const result = await contractModule.generatePreview(values);
          syncResult(result);
          return result;
        }}
        onGeneratePdf={async (values) => {
          const result = await contractModule.generatePdf(values);
          syncResult(result);
          return result;
        }}
        isSavingDraft={contractModule.isSavingDraft}
        isMarkingReviewReady={contractModule.isMarkingReviewReady}
        isGeneratingPreview={contractModule.isGeneratingPreview}
        isGeneratingPdf={contractModule.isGeneratingPdf}
      />
    </div>
  );
}
