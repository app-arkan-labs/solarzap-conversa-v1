import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  FileText,
  Loader2,
  Save,
  Sparkles,
  User,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { CONTRACT_PLAN_OPTIONS, buildPlanSnapshot } from '../lib/catalog';
import { createSolarPrimeMockContract } from '../lib/mock';
import { synchronizeContractValues } from '../lib/derivations';
import { renderContractDocument } from '../lib/templateEngine';
import { formatCurrencyPtBr, formatDatePtBr } from '../lib/formatters';
import { ContractPreview } from './ContractPreview';
import type { ContractRenderResult } from '../lib/domain';
import type { ContractFormalizationFormValues } from '../lib/schema';
import {
  contractFormalizationSchema,
  contractPaymentTermsSchema,
  contractPlanSchema,
  contractSpecialConditionSchema,
  contractCompanyAddressSchema,
  contractingCompanySchema,
  legalRepresentativeSchema,
} from '../lib/schema';

const WIZARD_STEPS = [
  { id: 1, label: 'Responsavel', icon: User },
  { id: 2, label: 'Empresa', icon: Building2 },
  { id: 3, label: 'Plano', icon: FileText },
  { id: 4, label: 'Pagamento', icon: CreditCard },
  { id: 5, label: 'Condicao especial', icon: Sparkles },
  { id: 6, label: 'Revisao', icon: CheckCircle2 },
  { id: 7, label: 'Preview', icon: Eye },
  { id: 8, label: 'PDF', icon: Download },
] as const;

type PersistResult = {
  values: ContractFormalizationFormValues;
  renderResult: ContractRenderResult;
};

interface ContractWizardDialogProps {
  open: boolean;
  initialValues: ContractFormalizationFormValues | null;
  initialRenderResult: ContractRenderResult | null;
  onOpenChange: (open: boolean) => void;
  onSaveDraft: (values: ContractFormalizationFormValues) => Promise<PersistResult>;
  onMarkReviewReady: (values: ContractFormalizationFormValues) => Promise<PersistResult>;
  onGeneratePreview: (values: ContractFormalizationFormValues) => Promise<PersistResult>;
  onGeneratePdf: (
    values: ContractFormalizationFormValues,
  ) => Promise<PersistResult & { pdfFileName: string }>;
  isSavingDraft?: boolean;
  isMarkingReviewReady?: boolean;
  isGeneratingPreview?: boolean;
  isGeneratingPdf?: boolean;
  title?: string;
  subtitle?: string;
  showMockSeedButton?: boolean;
  showSaveDraftButton?: boolean;
  lockedFieldKeys?: string[];
}

const cloneValues = <T,>(value: T): T =>
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));

const setValueAtPath = (
  source: ContractFormalizationFormValues,
  path: string,
  value: unknown,
) => {
  const clone = cloneValues(source) as Record<string, unknown>;
  const keys = path.split('.');
  let cursor: Record<string, unknown> = clone;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }

    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }

    cursor = cursor[key] as Record<string, unknown>;
  });

  return synchronizeContractValues(clone as ContractFormalizationFormValues);
};

const validateWizardStep = (
  values: ContractFormalizationFormValues,
  currentStep: number,
) => {
  if (currentStep === 1) {
    return legalRepresentativeSchema.safeParse(values.legalData.responsavel);
  }
  if (currentStep === 2) {
    const companyValidation = contractingCompanySchema.safeParse(values.legalData.contratante);
    if (!companyValidation.success) return companyValidation;
    return contractCompanyAddressSchema.safeParse(values.legalData.contratante.endereco);
  }
  if (currentStep === 3) {
    return contractPlanSchema.safeParse(values.legalData.plano);
  }
  if (currentStep === 4) {
    return contractPaymentTermsSchema.safeParse(values.legalData.pagamento);
  }
  if (currentStep === 5) {
    const validation = contractSpecialConditionSchema.safeParse(
      values.legalData.condicaoEspecial,
    );
    if (
      validation.success &&
      values.legalData.condicaoEspecial.ativa &&
      values.legalData.condicaoEspecial.descricao.trim().length === 0
    ) {
      return {
        success: false,
        error: { issues: [{ message: 'Descreva a condicao especial ativa.' }] },
      };
    }
    return validation;
  }

  return contractFormalizationSchema.safeParse(values);
};

const planCards = CONTRACT_PLAN_OPTIONS.map((plan) => ({
  ...plan,
  description:
    plan.value === 'plano_a'
      ? 'Implantacao enxuta com escopo controlado.'
      : plan.value === 'plano_b'
        ? 'Implantacao guiada com 1 reuniao, SolarZap no mes 1 e trafego pago.'
        : 'Plano completo com acompanhamento semanal, suporte via WhatsApp e condicoes especiais.',
}));

export function ContractWizardDialog({
  open,
  initialValues,
  initialRenderResult,
  onOpenChange,
  onSaveDraft,
  onMarkReviewReady,
  onGeneratePreview,
  onGeneratePdf,
  isSavingDraft = false,
  isMarkingReviewReady = false,
  isGeneratingPreview = false,
  isGeneratingPdf = false,
  title = 'Formalizacao contratual SolarZap',
  subtitle = 'Wizard central do contrato unico, com vigencia inicial de 3 meses, recorrencia no mesmo instrumento e anexos dinamicos por plano.',
  showMockSeedButton = true,
  showSaveDraftButton = true,
  lockedFieldKeys = [],
}: ContractWizardDialogProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [values, setValues] = useState<ContractFormalizationFormValues | null>(initialValues);
  const [previewResult, setPreviewResult] = useState<ContractRenderResult | null>(
    initialRenderResult,
  );
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    if (!open || !initialValues) return;
    setCurrentStep(1);
    setValues(cloneValues(initialValues));
    setPreviewResult(initialRenderResult);
    setValidationMessage('');
  }, [initialRenderResult, initialValues, open]);

  const derivedPreview = useMemo(
    () => (values ? renderContractDocument(values) : null),
    [values],
  );

  if (!values) return null;

  const isBusy =
    isSavingDraft || isMarkingReviewReady || isGeneratingPreview || isGeneratingPdf;

  const updateField = (path: string, nextValue: unknown) => {
    setValues((current) => (current ? setValueAtPath(current, path, nextValue) : current));
  };

  const isLocked = (...keys: string[]) => keys.some((key) => lockedFieldKeys.includes(key));

  const goNext = () => {
    const validation = validateWizardStep(values, currentStep);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      setValidationMessage(issue?.message || 'Revise os campos obrigatorios.');
      return;
    }

    setValidationMessage('');
    setCurrentStep((current) => Math.min(8, current + 1));
  };

  const handleSaveDraft = async () => {
    const result = await onSaveDraft(values);
    setValues(result.values);
    setPreviewResult(result.renderResult);
  };

  const handleMarkReviewReady = async () => {
    const validation = validateWizardStep(values, 6);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      setValidationMessage(issue?.message || 'Revise os campos antes de continuar.');
      return;
    }

    const result = await onMarkReviewReady(values);
    setValues(result.values);
    setPreviewResult(result.renderResult);
    setValidationMessage('');
    setCurrentStep(7);
  };

  const handleGeneratePreview = async () => {
    const result = await onGeneratePreview(values);
    setValues(result.values);
    setPreviewResult(result.renderResult);
    setCurrentStep(8);
  };

  const handleGeneratePdf = async () => {
    const result = await onGeneratePdf(values);
    setValues(result.values);
    setPreviewResult(result.renderResult);
    toast({
      title: 'PDF exportado',
      description: `${result.pdfFileName} foi gerado no modulo contratual.`,
    });
  };

  const loadMock = () => {
    const mock = createSolarPrimeMockContract({
      internalMetadata: {
        ...values.internalMetadata,
        organizationId: values.internalMetadata.organizationId,
        createdByUserId: values.internalMetadata.createdByUserId,
        lastUpdatedByUserId: values.internalMetadata.lastUpdatedByUserId,
        sellerUserId: values.internalMetadata.sellerUserId,
      },
    });
    setValues(mock);
    setPreviewResult(renderContractDocument(mock));
    setValidationMessage('');
  };

  const renderFieldGroup = (label: string, input: ReactNode) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      {input}
    </div>
  );

  const renderStepOne = () => (
    <div className="grid gap-4 md:grid-cols-2">
      {renderFieldGroup(
        'Nome completo',
        <Input
          value={values.legalData.responsavel.nome}
          disabled={isLocked('responsavelNome')}
          onChange={(event) => updateField('legalData.responsavel.nome', event.target.value)}
        />,
      )}
      {renderFieldGroup(
        'Nacionalidade',
        <Input
          value={values.legalData.responsavel.nacionalidade}
          onChange={(event) =>
            updateField('legalData.responsavel.nacionalidade', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Estado civil',
        <Input
          value={values.legalData.responsavel.estadoCivil}
          onChange={(event) =>
            updateField('legalData.responsavel.estadoCivil', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Profissao',
        <Input
          value={values.legalData.responsavel.profissao}
          onChange={(event) => updateField('legalData.responsavel.profissao', event.target.value)}
        />,
      )}
      {renderFieldGroup(
        'CPF',
        <Input
          value={values.legalData.responsavel.cpf}
          onChange={(event) => updateField('legalData.responsavel.cpf', event.target.value)}
        />,
      )}
      {renderFieldGroup(
        'RG',
        <Input
          value={values.legalData.responsavel.rg}
          onChange={(event) => updateField('legalData.responsavel.rg', event.target.value)}
        />,
      )}
      {renderFieldGroup(
        'Cargo',
        <Input
          value={values.legalData.responsavel.cargo}
          onChange={(event) => updateField('legalData.responsavel.cargo', event.target.value)}
        />,
      )}
      {renderFieldGroup(
        'E-mail',
        <Input
          type="email"
          value={values.legalData.responsavel.email}
          disabled={isLocked('responsavelEmail')}
          onChange={(event) => updateField('legalData.responsavel.email', event.target.value)}
        />,
      )}
      <div className="md:col-span-2">
        {renderFieldGroup(
          'Telefone',
          <Input
            value={values.legalData.responsavel.telefone}
            disabled={isLocked('responsavelTelefone')}
            onChange={(event) =>
              updateField('legalData.responsavel.telefone', event.target.value)
            }
          />,
        )}
      </div>
    </div>
  );

  const renderStepTwo = () => (
    <div className="grid gap-4 md:grid-cols-2">
      {renderFieldGroup(
        'Razao social',
        <Input
          value={values.legalData.contratante.razaoSocial}
          disabled={isLocked('empresaRazaoSocial')}
          onChange={(event) =>
            updateField('legalData.contratante.razaoSocial', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Nome fantasia',
        <Input
          value={values.legalData.contratante.nomeFantasia}
          disabled={isLocked('empresaNome')}
          onChange={(event) =>
            updateField('legalData.contratante.nomeFantasia', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'CNPJ',
        <Input
          value={values.legalData.contratante.cnpj}
          disabled={isLocked('cnpj')}
          onChange={(event) => updateField('legalData.contratante.cnpj', event.target.value)}
        />,
      )}
      {renderFieldGroup(
        'Logradouro',
        <Input
          value={values.legalData.contratante.endereco.logradouro}
          onChange={(event) =>
            updateField('legalData.contratante.endereco.logradouro', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Numero',
        <Input
          value={values.legalData.contratante.endereco.numero}
          onChange={(event) =>
            updateField('legalData.contratante.endereco.numero', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Complemento',
        <Input
          value={values.legalData.contratante.endereco.complemento}
          onChange={(event) =>
            updateField('legalData.contratante.endereco.complemento', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Bairro',
        <Input
          value={values.legalData.contratante.endereco.bairro}
          onChange={(event) =>
            updateField('legalData.contratante.endereco.bairro', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Cidade',
        <Input
          value={values.legalData.contratante.endereco.cidade}
          onChange={(event) =>
            updateField('legalData.contratante.endereco.cidade', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Estado',
        <Input
          maxLength={2}
          value={values.legalData.contratante.endereco.estado}
          onChange={(event) =>
            updateField(
              'legalData.contratante.endereco.estado',
              event.target.value.toUpperCase(),
            )
          }
        />,
      )}
      {renderFieldGroup(
        'CEP',
        <Input
          value={values.legalData.contratante.endereco.cep}
          onChange={(event) =>
            updateField('legalData.contratante.endereco.cep', event.target.value)
          }
        />,
      )}
    </div>
  );

  const renderStepThree = () => (
    <div className="space-y-6">
      <div className="grid gap-3 lg:grid-cols-3">
        {planCards.map((plan) => {
          const active = values.legalData.plano.codigo === plan.value;
          return (
            <button
              key={plan.value}
              type="button"
              disabled={isLocked('planoSugerido')}
              onClick={() =>
                updateField(
                  'legalData.plano',
                  buildPlanSnapshot(plan.value, {
                    valorImplantacao: values.legalData.pagamento.valorImplantacao,
                    valorRecorrente: values.legalData.pagamento.valorRecorrente,
                    quantidadeReunioesImplantacao:
                      values.legalData.plano.quantidadeReunioesImplantacao,
                    includeReuniaoExtra:
                      values.legalData.condicaoEspecial.incluiReuniaoExtra,
                    includeLandingPage:
                      values.legalData.condicaoEspecial.incluiLandingPage,
                  }),
                )
              }
              className={`rounded-[24px] border px-5 py-5 text-left transition-all ${
                active
                  ? 'border-slate-900 bg-slate-950 text-white shadow-[0_22px_40px_-32px_rgba(15,23,42,0.8)]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              } ${isLocked('planoSugerido') ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold tracking-[0.18em] uppercase">
                    {plan.value.replace('_', ' ')}
                  </span>
                  {active ? <CheckCircle2 className="h-5 w-5" /> : null}
                </div>
                <div>
                  <p className="text-lg font-semibold tracking-tight">{plan.label}</p>
                  <p className={`mt-2 text-sm leading-6 ${active ? 'text-slate-200' : 'text-slate-600'}`}>
                    {plan.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {renderFieldGroup(
          'Valor da implantacao',
          <Input
            type="number"
            min={0}
            value={values.legalData.pagamento.valorImplantacao}
            onChange={(event) =>
              updateField(
                'legalData.pagamento.valorImplantacao',
                Number(event.target.value || 0),
              )
            }
          />,
        )}
        {renderFieldGroup(
          'Valor da recorrencia',
          <Input
            type="number"
            min={0}
            value={values.legalData.pagamento.valorRecorrente}
            onChange={(event) =>
              updateField(
                'legalData.pagamento.valorRecorrente',
                Number(event.target.value || 0),
              )
            }
          />,
        )}
        {renderFieldGroup(
          'Quantidade de reunioes na implantacao',
          <Input
            type="number"
            min={0}
            max={10}
            value={values.legalData.plano.quantidadeReunioesImplantacao}
            onChange={(event) =>
              updateField(
                'legalData.plano.quantidadeReunioesImplantacao',
                Number(event.target.value || 0),
              )
            }
          />,
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Suporte WhatsApp', values.legalData.plano.flags.suporteWhatsapp],
          ['Acompanhamento semanal', values.legalData.plano.flags.acompanhamentoSemanal],
          ['Treinamento gravado', values.legalData.plano.flags.treinamentoGravado],
          ['SolarZap mes 1', values.legalData.plano.flags.solarZapMesUm],
          ['Trafego pago', values.legalData.plano.flags.trafegoPago],
          ['Reuniao extra', values.legalData.plano.flags.reuniaoExtra],
          ['Landing page', values.legalData.plano.flags.landingPage],
        ].map(([label, active]) => (
          <Card key={String(label)}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <span className="text-sm text-slate-600">{label}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {active ? 'Ativo' : 'Inativo'}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderStepFour = () => (
    <div className="grid gap-4 md:grid-cols-2">
      {renderFieldGroup(
        'Data de assinatura',
        <Input
          type="date"
          value={values.legalData.pagamento.dataAssinatura}
          onChange={(event) =>
            updateField('legalData.pagamento.dataAssinatura', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Data de inicio',
        <Input
          type="date"
          value={values.legalData.pagamento.dataInicio}
          onChange={(event) =>
            updateField('legalData.pagamento.dataInicio', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Primeiro vencimento',
        <Input
          type="date"
          value={values.legalData.pagamento.dataPrimeiroVencimento}
          onChange={(event) =>
            updateField('legalData.pagamento.dataPrimeiroVencimento', event.target.value)
          }
        />,
      )}
      {renderFieldGroup(
        'Dia do vencimento mensal',
        <Input
          type="number"
          min={1}
          max={31}
          value={values.legalData.pagamento.diaVencimentoMensal}
          onChange={(event) =>
            updateField(
              'legalData.pagamento.diaVencimentoMensal',
              Number(event.target.value || 1),
            )
          }
        />,
      )}
      {renderFieldGroup(
        'Pagamento da implantacao',
        <Select
          value={values.legalData.pagamento.formaPagamentoImplantacao}
          onValueChange={(nextValue) =>
            updateField('legalData.pagamento.formaPagamentoImplantacao', nextValue)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Pix">Pix</SelectItem>
            <SelectItem value="boleto">Boleto</SelectItem>
            <SelectItem value="cartao">Cartao</SelectItem>
            <SelectItem value="transferencia">Transferencia</SelectItem>
          </SelectContent>
        </Select>,
      )}
      {renderFieldGroup(
        'Pagamento da recorrencia',
        <Select
          value={values.legalData.pagamento.formaPagamentoRecorrencia}
          onValueChange={(nextValue) =>
            updateField('legalData.pagamento.formaPagamentoRecorrencia', nextValue)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="boleto mensal">boleto mensal</SelectItem>
            <SelectItem value="Pix mensal">Pix mensal</SelectItem>
            <SelectItem value="cartao recorrente">cartao recorrente</SelectItem>
          </SelectContent>
        </Select>,
      )}
      {renderFieldGroup(
        'Vigencia inicial (meses)',
        <Input
          type="number"
          min={3}
          value={values.legalData.recorrencia.vigenciaInicialMeses}
          onChange={(event) =>
            updateField(
              'legalData.recorrencia.vigenciaInicialMeses',
              Number(event.target.value || 3),
            )
          }
        />,
      )}
      {renderFieldGroup(
        'Prazo de cancelamento (dias)',
        <Input
          type="number"
          min={1}
          value={values.legalData.recorrencia.prazoCancelamentoDias}
          onChange={(event) =>
            updateField(
              'legalData.recorrencia.prazoCancelamentoDias',
              Number(event.target.value || 30),
            )
          }
        />,
      )}
    </div>
  );

  const renderStepFive = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Ativar condicao especial</p>
          <p className="text-sm text-slate-600">
            O anexo especial sera incluido e o resumo comercial refletira o bonus.
          </p>
        </div>
        <Switch
          checked={values.legalData.condicaoEspecial.ativa}
          disabled={isLocked('condicaoEspecialAtiva')}
          onCheckedChange={(checked) => updateField('legalData.condicaoEspecial.ativa', checked)}
        />
      </div>

      {renderFieldGroup(
        'Descricao da condicao especial',
        <Textarea
          rows={4}
          value={values.legalData.condicaoEspecial.descricao}
          disabled={isLocked('condicaoEspecialDescricao')}
          onChange={(event) =>
            updateField('legalData.condicaoEspecial.descricao', event.target.value)
          }
        />,
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-center justify-between rounded-[20px] border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Reuniao extra</p>
            <p className="text-sm text-slate-500">Reflete no anexo e no resumo comercial.</p>
          </div>
          <Switch
            checked={values.legalData.condicaoEspecial.incluiReuniaoExtra}
            onCheckedChange={(checked) =>
              updateField('legalData.condicaoEspecial.incluiReuniaoExtra', checked)
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-[20px] border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Landing page incluida</p>
            <p className="text-sm text-slate-500">Mantem o contrato unico e adiciona o bonus.</p>
          </div>
          <Switch
            checked={values.legalData.condicaoEspecial.incluiLandingPage}
            onCheckedChange={(checked) =>
              updateField('legalData.condicaoEspecial.incluiLandingPage', checked)
            }
          />
        </div>
      </div>

      {renderFieldGroup(
        'Observacoes comerciais',
        <Textarea
          rows={4}
          value={values.legalData.condicaoEspecial.observacoesComerciais}
          onChange={(event) =>
            updateField(
              'legalData.condicaoEspecial.observacoesComerciais',
              event.target.value,
            )
          }
        />,
      )}
    </div>
  );

  const renderStepSix = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Contratante', values.legalData.contratante.razaoSocial || 'Nao preenchido'],
          ['Responsavel', values.legalData.responsavel.nome || 'Nao preenchido'],
          ['Plano', values.legalData.plano.nome],
          ['Foro', `${values.legalData.foro.cidade}/${values.legalData.foro.estado}`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {label}
              </p>
              <p className="text-sm font-medium text-slate-900">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Implantacao
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {formatCurrencyPtBr(values.legalData.pagamento.valorImplantacao)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Recorrencia mensal
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {formatCurrencyPtBr(values.legalData.pagamento.valorRecorrente)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Inicio / 1o vencimento
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {formatDatePtBr(values.legalData.pagamento.dataInicio)} /{' '}
              {formatDatePtBr(values.legalData.pagamento.dataPrimeiroVencimento)}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-[24px] border border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Resumo comercial final
        </p>
        <p className="text-sm leading-7 text-slate-700">
          Plano <strong>{derivedPreview?.commercialSummary.planoNome}</strong> com
          implantacao inicial de{' '}
          <strong>{formatCurrencyPtBr(values.legalData.pagamento.valorImplantacao)}</strong>{' '}
          no mes 1, recorrencia mensal de{' '}
          <strong>{formatCurrencyPtBr(values.legalData.pagamento.valorRecorrente)}</strong>{' '}
          a partir do ciclo contratual, vigencia inicial de{' '}
          <strong>{values.legalData.recorrencia.vigenciaInicialMeses} meses</strong>,
          renovacao automatica mensal, vencimento todo dia{' '}
          <strong>{values.legalData.pagamento.diaVencimentoMensal}</strong> e
          foro em <strong>{values.legalData.foro.cidade}/{values.legalData.foro.estado}</strong>.
        </p>
        <p className="text-sm leading-7 text-slate-700">
          Condicao especial:{' '}
          <strong>
            {values.legalData.condicaoEspecial.ativa
              ? values.legalData.condicaoEspecial.descricao
              : 'nao aplicavel'}
          </strong>
          .
        </p>
      </div>
    </div>
  );

  const renderStepSeven = () => (
    <ContractPreview
      renderResult={previewResult || derivedPreview}
      emptyStateTitle="Preview contratual pronto para geracao"
      emptyStateDescription="Use o botao abaixo para salvar o preview final, injetar anexos e persistir o HTML renderizado."
    />
  );

  const renderStepEight = () => (
    <div className="space-y-6">
      <ContractPreview
        renderResult={previewResult || derivedPreview}
        emptyStateTitle="Gere o preview antes do PDF"
        emptyStateDescription="O PDF usa exatamente a mesma renderizacao do preview contratual."
      />
      <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <p>
          Contrato numero <strong>{values.internalMetadata.contractNumber}</strong> pronto
          para exportacao em PDF, com anexo do plano{' '}
          <strong>{values.legalData.plano.codigo}</strong>
          {values.legalData.condicaoEspecial.ativa ? ' e anexo de condicao especial ativo.' : '.'}
        </p>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    if (currentStep === 1) return renderStepOne();
    if (currentStep === 2) return renderStepTwo();
    if (currentStep === 3) return renderStepThree();
    if (currentStep === 4) return renderStepFour();
    if (currentStep === 5) return renderStepFive();
    if (currentStep === 6) return renderStepSix();
    if (currentStep === 7) return renderStepSeven();
    return renderStepEight();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] max-w-7xl overflow-hidden border-slate-200 p-0">
        <DialogHeader className="border-b border-slate-200 bg-[linear-gradient(180deg,#f8fafc,#ffffff)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-semibold tracking-tight text-slate-950">
                {title}
              </DialogTitle>
              <p className="text-sm text-slate-600">
                {subtitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {showMockSeedButton ? (
                <Button type="button" variant="outline" onClick={loadMock} disabled={isBusy}>
                  Carregar mock Solar Prime
                </Button>
              ) : null}
              {showSaveDraftButton ? (
                <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={isBusy}>
                  {isSavingDraft ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Salvar draft
                </Button>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50/80 px-4 py-5 lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              {WIZARD_STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = currentStep === step.id;
                const isDone = currentStep > step.id;

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left transition-all ${
                      isActive
                        ? 'bg-slate-950 text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.7)]'
                        : isDone
                          ? 'bg-white text-slate-900'
                          : 'text-slate-500 hover:bg-white'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        isActive
                          ? 'bg-white/15'
                          : isDone
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </span>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] opacity-70">Etapa {step.id}</p>
                      <p className="text-sm font-semibold">{step.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <Separator className="my-5" />

            <div className="space-y-2 text-sm text-slate-600">
              <p>
                <strong>Contrato:</strong> {values.internalMetadata.contractNumber}
              </p>
              <p>
                <strong>Template:</strong> {values.internalMetadata.templateVersion}
              </p>
              <p>
                <strong>Status:</strong> {values.internalMetadata.contractStatus}
              </p>
            </div>
          </aside>

          <div className="min-h-0">
            <ScrollArea className="h-[76dvh] px-6 py-6">
              <div className="mx-auto flex max-w-5xl flex-col gap-6">
                {validationMessage ? (
                  <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {validationMessage}
                  </div>
                ) : null}
                {renderCurrentStep()}
              </div>
            </ScrollArea>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep((step) => Math.max(1, step - 1))}
                disabled={currentStep === 1 || isBusy}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                {currentStep < 6 ? (
                  <Button type="button" onClick={goNext} disabled={isBusy}>
                    Proximo
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : null}
                {currentStep === 6 ? (
                  <Button type="button" onClick={handleMarkReviewReady} disabled={isBusy}>
                    {isMarkingReviewReady ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Confirmar revisao
                  </Button>
                ) : null}
                {currentStep === 7 ? (
                  <Button type="button" onClick={handleGeneratePreview} disabled={isBusy}>
                    {isGeneratingPreview ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    Gerar preview
                  </Button>
                ) : null}
                {currentStep === 8 ? (
                  <Button type="button" onClick={handleGeneratePdf} disabled={isBusy}>
                    {isGeneratingPdf ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Gerar PDF
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
