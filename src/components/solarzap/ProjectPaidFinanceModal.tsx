import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Contact } from '@/types/solarzap';
import {
  FinanceWizardStep,
  LeadSaleFinancePlanForm,
  LeadSaleInstallmentRecord,
  PAYMENT_METHOD_ORDER,
  PaymentMethod,
  SaleInstallmentInput,
} from '@/types/finance';
import {
  calculateMarginPct,
  calculateMarginValue,
  getEntryInstallmentMethods,
  getRegularInstallmentMethods,
  isFinancePlanFormValid,
  normalizeInstallments,
  roundMoney,
  validateInstallmentsExactTotal,
} from '@/lib/saleFinance';
import { getAuthUserDisplayName } from '@/lib/memberDisplayName';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { FinanceStepInstallments } from './finance-wizard/FinanceStepInstallments';
import { FinanceStepPaymentMethod } from './finance-wizard/FinanceStepPaymentMethod';
import { FinanceStepReview } from './finance-wizard/FinanceStepReview';
import { FinanceStepValues } from './finance-wizard/FinanceStepValues';
import { FinanceWizardProgressBar } from './finance-wizard/FinanceWizardProgressBar';

interface ProjectPaidFinanceModalProps {
  isOpen: boolean;
  contact: Contact | null;
  orgId: string | null;
  onCancel: () => void;
  onCompleted: () => void;
}

const STEP_COPY: Record<FinanceWizardStep, { title: string; description: string }> = {
  1: {
    title: 'Valores da venda',
    description: 'Registre o valor fechado, o custo previsto e as observacoes financeiras do projeto.',
  },
  2: {
    title: 'Modalidades de pagamento',
    description: 'Escolha as modalidades padrao que vao alimentar a configuracao das parcelas.',
  },
  3: {
    title: 'Parcelas e condicoes',
    description: 'Estruture entrada, vencimentos e totalizacao do recebimento.',
  },
  4: {
    title: 'Revisao final',
    description: 'Confira o resumo antes de salvar e concluir a mudanca para Projeto Pago.',
  },
};

const toDateInput = (value?: string | Date): string => {
  if (!value) {
    const now = new Date();
    const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const sortPaymentMethods = (methods: PaymentMethod[]): PaymentMethod[] => {
  return PAYMENT_METHOD_ORDER.filter((method) => methods.includes(method));
};

const uniqPaymentMethods = (methods: PaymentMethod[]): PaymentMethod[] => {
  return sortPaymentMethods(
    methods.filter((method, index) => methods.indexOf(method) === index),
  );
};

const getEntryDefaultMethods = (methods: PaymentMethod[]): PaymentMethod[] => {
  const entryMethods = getEntryInstallmentMethods(methods);
  return entryMethods.length > 0 ? entryMethods : ['pix'];
};

const getRegularDefaultMethods = (methods: PaymentMethod[]): PaymentMethod[] => {
  const regularMethods = getRegularInstallmentMethods(methods);
  return regularMethods.length > 0 ? regularMethods : ['pix'];
};

const formatFinanceCommentCurrency = (value: number): string => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const buildFinanceLeadComment = ({
  saleValue,
  projectCost,
  marginValue,
  marginPct,
  notes,
}: {
  saleValue: number;
  projectCost: number;
  marginValue: number;
  marginPct: number;
  notes: string;
}): string => {
  const trimmedNotes = notes.trim();

  return [
    '[Financeiro Projeto Pago]',
    `Venda: ${formatFinanceCommentCurrency(roundMoney(saleValue))}`,
    `Custo: ${formatFinanceCommentCurrency(roundMoney(projectCost))}`,
    `Lucro: ${formatFinanceCommentCurrency(roundMoney(marginValue))} (${roundMoney(marginPct).toFixed(2)}%)`,
    '',
    'Observacoes financeiras:',
    trimmedNotes,
  ].join('\n');
};

const createInstallment = (index: number, defaults?: Partial<SaleInstallmentInput>): SaleInstallmentInput => ({
  installment_no: index + 1,
  due_on: defaults?.due_on || toDateInput(),
  amount: roundMoney(defaults?.amount || 0),
  payment_methods: defaults?.payment_methods?.length ? uniqPaymentMethods(defaults.payment_methods) : ['pix'],
  notes: defaults?.notes,
});

const mapInstallmentRow = (row: LeadSaleInstallmentRecord, index: number): SaleInstallmentInput => ({
  installment_no: row.installment_no || index + 1,
  due_on: toDateInput(row.due_on),
  amount: roundMoney(Number(row.amount) || 0),
  payment_methods: Array.isArray(row.payment_methods) ? uniqPaymentMethods(row.payment_methods as PaymentMethod[]) : ['pix'],
  notes: row.notes || undefined,
});

const sanitizeInstallmentPatch = (
  current: SaleInstallmentInput,
  patch: Partial<SaleInstallmentInput>,
): SaleInstallmentInput => ({
  ...current,
  ...(patch.amount !== undefined ? { amount: roundMoney(Number(patch.amount) || 0) } : {}),
  ...(patch.due_on !== undefined ? { due_on: toDateInput(patch.due_on) } : {}),
  ...(patch.notes !== undefined ? { notes: patch.notes || '' } : {}),
  ...(patch.payment_methods !== undefined
    ? { payment_methods: uniqPaymentMethods((patch.payment_methods as PaymentMethod[]) || []) }
    : {}),
});

const toggleMethodKeepingOne = (methods: PaymentMethod[], method: PaymentMethod): PaymentMethod[] => {
  if (methods.includes(method)) {
    const nextMethods = methods.filter((entry) => entry !== method);
    return nextMethods.length > 0 ? nextMethods : methods;
  }

  return uniqPaymentMethods([...methods, method]);
};

const splitInstallmentsForWizard = (installments: SaleInstallmentInput[]): {
  selectedMethods: PaymentMethod[];
  entryInstallment: SaleInstallmentInput | null;
  installments: SaleInstallmentInput[];
} => {
  const selectedMethods = uniqPaymentMethods(installments.flatMap((installment) => installment.payment_methods));
  const safeSelectedMethods: PaymentMethod[] = selectedMethods.length > 0 ? selectedMethods : ['pix'];

  if (!safeSelectedMethods.includes('financing')) {
    return {
      selectedMethods: safeSelectedMethods,
      entryInstallment: null,
      installments,
    };
  }

  const entryIndex = installments.findIndex((installment) =>
    installment.payment_methods.some((method) => method !== 'financing'),
  );

  return {
    selectedMethods: safeSelectedMethods,
    entryInstallment: entryIndex >= 0 ? installments[entryIndex] : null,
    installments: installments.filter((_, index) => index !== entryIndex),
  };
};

const semanticFinanceError = (message: string): string => {
  const normalized = String(message || '');

  if (normalized.includes('FINANCE_INSTALLMENTS_SUM_MISMATCH')) {
    return 'A soma das parcelas deve ser exatamente igual ao valor da venda.';
  }
  if (normalized.includes('FINANCE_PLAN_LOCKED_AFTER_PAYMENT')) {
    return 'O plano nao pode ser reestruturado apos a primeira parcela paga.';
  }
  if (normalized.includes('FINANCE_PAYMENT_METHOD_REQUIRED')) {
    return 'Cada parcela precisa ter ao menos uma modalidade de pagamento.';
  }
  if (normalized.includes('FINANCE_SALE_VALUE_REQUIRED')) {
    return 'Informe um valor de venda maior que zero.';
  }
  if (normalized.includes('FINANCE_PROJECT_COST_INVALID')) {
    return 'O custo do projeto precisa ser maior ou igual a zero.';
  }
  if (normalized.includes('FINANCE_INSTALLMENT_DUE_DATE_REQUIRED')) {
    return 'Todas as parcelas precisam de uma data de vencimento.';
  }
  if (normalized.includes('FINANCE_INSTALLMENT_AMOUNT_INVALID')) {
    return 'Todas as parcelas precisam ter valor maior que zero.';
  }

  return normalized || 'Nao foi possivel salvar o plano financeiro.';
};

const shouldFallbackToDirectFinanceSave = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as { code?: string; message?: string };
  return maybeError.code === '42702' && String(maybeError.message || '').includes('plan_id');
};

export function ProjectPaidFinanceModal({
  isOpen,
  contact,
  orgId,
  onCancel,
  onCompleted,
}: ProjectPaidFinanceModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [currentStep, setCurrentStep] = useState<FinanceWizardStep>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasPaidInstallments, setHasPaidInstallments] = useState(false);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<PaymentMethod[]>(['pix']);
  const [entryInstallment, setEntryInstallment] = useState<SaleInstallmentInput | null>(null);
  const [form, setForm] = useState<LeadSaleFinancePlanForm>({
    sale_value: 0,
    project_cost: 0,
    notes: '',
    installments: [createInstallment(0)],
  });

  const saleValue = roundMoney(Number(form.sale_value) || 0);
  const projectCost = roundMoney(Number(form.project_cost) || 0);
  const marginValue = calculateMarginValue(saleValue, projectCost);
  const marginPct = calculateMarginPct(saleValue, projectCost);

  const effectiveEntryInstallment = useMemo(() => {
    if (!entryInstallment) return null;
    return roundMoney(Number(entryInstallment.amount) || 0) > 0 ? sanitizeInstallmentPatch(entryInstallment, {}) : null;
  }, [entryInstallment]);

  const combinedInstallments = useMemo(
    () => normalizeInstallments([
      ...(effectiveEntryInstallment ? [effectiveEntryInstallment] : []),
      ...form.installments,
    ]),
    [effectiveEntryInstallment, form.installments],
  );

  const installmentsTotal = useMemo(
    () => roundMoney(combinedInstallments.reduce((sum, installment) => sum + (Number(installment.amount) || 0), 0)),
    [combinedInstallments],
  );
  const totalsMatch = validateInstallmentsExactTotal(saleValue, combinedInstallments);
  const remainingAmount = roundMoney(saleValue - installmentsTotal);
  const progressPct = saleValue > 0 ? (installmentsTotal / saleValue) * 100 : 0;

  const fullForm = useMemo<LeadSaleFinancePlanForm>(
    () => ({
      ...form,
      installments: combinedInstallments,
    }),
    [combinedInstallments, form],
  );
  const formValid = isFinancePlanFormValid(fullForm);
  const installmentsStepValid = combinedInstallments.length > 0
    && totalsMatch
    && combinedInstallments.every((installment) => (
      Number(installment.amount) > 0
      && Boolean(installment.due_on)
      && Array.isArray(installment.payment_methods)
      && installment.payment_methods.length > 0
    ));

  const formatCurrency = useCallback((value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }, []);

  const resetToDefault = useCallback(() => {
    const fallbackSaleValue = roundMoney(contact?.projectValue || 0);
    setSelectedPaymentMethods(['pix']);
    setEntryInstallment(null);
    setForm({
      sale_value: fallbackSaleValue,
      project_cost: 0,
      notes: '',
      installments: [createInstallment(0, { amount: fallbackSaleValue > 0 ? fallbackSaleValue : 0, payment_methods: ['pix'] })],
    });
    setHasPaidInstallments(false);
    setLoadError(null);
  }, [contact?.projectValue]);

  useEffect(() => {
    if (!isOpen) return;
    setCurrentStep(1);
  }, [isOpen, contact?.id]);

  useEffect(() => {
    if (!isOpen || !contact || !orgId) {
      if (!isOpen) {
        setLoadError(null);
      }
      return;
    }

    let mounted = true;

    const loadFinancePlan = async () => {
      setIsLoading(true);
      setLoadError(null);
      setHasPaidInstallments(false);

      try {
        const leadId = Number(contact.id);
        if (!Number.isFinite(leadId)) {
          throw new Error('Lead invalido para criar plano financeiro.');
        }

        const { data: plan, error: planError } = await supabase
          .from('lead_sale_finance_plans')
          .select('id, sale_value, project_cost, notes')
          .eq('org_id', orgId)
          .eq('lead_id', leadId)
          .maybeSingle();

        if (planError) {
          throw planError;
        }

        if (!plan?.id) {
          if (mounted) {
            resetToDefault();
          }
          return;
        }

        const { data: installmentsRows, error: installmentsError } = await supabase
          .from('lead_sale_installments')
          .select('id, org_id, plan_id, lead_id, installment_no, due_on, amount, payment_methods, status, cycle_no, paid_amount, paid_at, profit_amount, notes')
          .eq('org_id', orgId)
          .eq('plan_id', plan.id)
          .order('installment_no', { ascending: true });

        if (installmentsError) {
          throw installmentsError;
        }

        const typedInstallmentsRows = (installmentsRows || []) as LeadSaleInstallmentRecord[];
        const parsedInstallments = typedInstallmentsRows.map((row, idx) => mapInstallmentRow(row, idx));

        const safeSaleValue = roundMoney(Number(plan.sale_value) || Number(contact.projectValue) || 0);
        const wizardState = splitInstallmentsForWizard(parsedInstallments);
        const fallbackInstallments = wizardState.installments.length > 0
          ? wizardState.installments
          : [createInstallment(0, { amount: safeSaleValue, payment_methods: getRegularDefaultMethods(wizardState.selectedMethods) })];

        if (mounted) {
          setHasPaidInstallments(typedInstallmentsRows.some((row) => String(row.status) === 'paid'));
          setSelectedPaymentMethods(wizardState.selectedMethods);
          setEntryInstallment(wizardState.entryInstallment);
          setForm({
            sale_value: safeSaleValue,
            project_cost: roundMoney(Number(plan.project_cost) || 0),
            notes: String(plan.notes || ''),
            installments: fallbackInstallments,
          });
        }
      } catch (error) {
        if (!mounted) return;
        console.error('Failed to load finance plan for projeto_pago modal', error);
        setLoadError(error instanceof Error ? error.message : 'Falha ao carregar dados financeiros do lead.');
        resetToDefault();
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadFinancePlan();

    return () => {
      mounted = false;
    };
  }, [contact, isOpen, orgId, resetToDefault]);

  const patchInstallment = useCallback((index: number, patch: Partial<SaleInstallmentInput>) => {
    setForm((prev) => ({
      ...prev,
      installments: prev.installments.map((installment, currentIndex) => (
        currentIndex === index
          ? sanitizeInstallmentPatch(installment, patch)
          : installment
      )),
    }));
  }, []);

  const patchEntryInstallment = useCallback((patch: Partial<SaleInstallmentInput>) => {
    setEntryInstallment((prev) => {
      const base = prev || createInstallment(0, { payment_methods: getEntryDefaultMethods(selectedPaymentMethods) });
      const nextEntry = sanitizeInstallmentPatch(base, patch);

      if (selectedPaymentMethods.includes('financing') && form.installments.length === 1 && patch.amount !== undefined) {
        const nextEntryAmount = roundMoney(Number(nextEntry.amount) || 0);
        setForm((prevForm) => ({
          ...prevForm,
          installments: prevForm.installments.map((installment, index) => (
            index === 0
              ? { ...installment, amount: roundMoney(Math.max(0, (Number(prevForm.sale_value) || 0) - nextEntryAmount)) }
              : installment
          )),
        }));
      }

      return nextEntry;
    });
  }, [form.installments.length, selectedPaymentMethods]);

  const addEntryInstallment = useCallback(() => {
    setEntryInstallment((prev) => (
      prev || createInstallment(0, { payment_methods: getEntryDefaultMethods(selectedPaymentMethods) })
    ));
  }, [selectedPaymentMethods]);

  const removeEntryInstallment = useCallback(() => {
    setEntryInstallment(null);

    if (selectedPaymentMethods.includes('financing') && form.installments.length === 1) {
      setForm((prev) => ({
        ...prev,
        installments: prev.installments.map((installment, index) => (
          index === 0 ? { ...installment, amount: roundMoney(Number(prev.sale_value) || 0) } : installment
        )),
      }));
    }
  }, [form.installments.length, selectedPaymentMethods]);

  const addInstallment = useCallback(() => {
    setForm((prev) => {
      const nextInstallments = [...prev.installments];
      const defaultAmount = nextInstallments.length === 0
        ? roundMoney(Math.max(0, (Number(prev.sale_value) || 0) - (effectiveEntryInstallment?.amount || 0)))
        : 0;

      nextInstallments.push(
        createInstallment(nextInstallments.length, {
          amount: defaultAmount,
          payment_methods: getRegularDefaultMethods(selectedPaymentMethods),
        }),
      );

      return {
        ...prev,
        installments: nextInstallments,
      };
    });
  }, [effectiveEntryInstallment?.amount, selectedPaymentMethods]);

  const removeInstallment = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      installments: prev.installments
        .filter((_, currentIndex) => currentIndex !== index)
        .map((installment, currentIndex) => ({ ...installment, installment_no: currentIndex + 1 })),
    }));
  }, []);

  const toggleSelectedPaymentMethod = useCallback((method: PaymentMethod) => {
    setSelectedPaymentMethods((prev) => (
      uniqPaymentMethods(
        prev.includes(method)
          ? prev.filter((entry) => entry !== method)
          : [...prev, method],
      )
    ));
  }, []);

  const toggleInstallmentPaymentMethod = useCallback((index: number, method: PaymentMethod) => {
    setForm((prev) => ({
      ...prev,
      installments: prev.installments.map((installment, currentIndex) => (
        currentIndex === index
          ? { ...installment, payment_methods: toggleMethodKeepingOne(installment.payment_methods, method) }
          : installment
      )),
    }));
  }, []);

  const toggleEntryPaymentMethod = useCallback((method: PaymentMethod) => {
    setEntryInstallment((prev) => {
      const base = prev || createInstallment(0, { payment_methods: getEntryDefaultMethods(selectedPaymentMethods) });
      return {
        ...base,
        payment_methods: toggleMethodKeepingOne(base.payment_methods, method),
      };
    });
  }, [selectedPaymentMethods]);

  const applySelectedMethodsToSchedule = useCallback(() => {
    const safeSelectedMethods: PaymentMethod[] = selectedPaymentMethods.length > 0 ? selectedPaymentMethods : ['pix'];
    const hasFinancing = safeSelectedMethods.includes('financing');
    const safeSaleValue = roundMoney(Number(form.sale_value) || 0);

    if (hasFinancing) {
      const nextEntry = entryInstallment
        ? sanitizeInstallmentPatch(entryInstallment, { payment_methods: getEntryDefaultMethods(safeSelectedMethods) })
        : (safeSelectedMethods.some((method) => method !== 'financing')
          ? createInstallment(0, { payment_methods: getEntryDefaultMethods(safeSelectedMethods) })
          : null);

      setEntryInstallment(nextEntry);
      setForm((prev) => {
        const sourceInstallments = prev.installments.length > 0
          ? prev.installments
          : [createInstallment(0, { amount: safeSaleValue, payment_methods: ['financing'] })];
        const nextInstallments = sourceInstallments.map((installment, index) => ({
          ...installment,
          installment_no: index + 1,
          payment_methods: ['financing'] as PaymentMethod[],
        }));

        if (nextInstallments.length === 1) {
          nextInstallments[0] = {
            ...nextInstallments[0],
            amount: roundMoney(Math.max(0, safeSaleValue - (nextEntry?.amount || 0))),
          };
        }

        return {
          ...prev,
          installments: nextInstallments,
        };
      });

      return;
    }

    setEntryInstallment(null);
    setForm((prev) => {
      if (safeSelectedMethods.length === 1) {
        const firstInstallment = prev.installments[0];
        return {
          ...prev,
          installments: [
            createInstallment(0, {
              amount: safeSaleValue,
              due_on: firstInstallment?.due_on || toDateInput(),
              notes: firstInstallment?.notes,
              payment_methods: safeSelectedMethods,
            }),
          ],
        };
      }

      const nextInstallments = (prev.installments.length > 0
        ? prev.installments
        : [createInstallment(0, { amount: safeSaleValue, payment_methods: safeSelectedMethods })])
        .map((installment, index) => ({
          ...installment,
          installment_no: index + 1,
          payment_methods: safeSelectedMethods,
        }));

      if (nextInstallments.length === 1) {
        nextInstallments[0] = {
          ...nextInstallments[0],
          amount: safeSaleValue,
        };
      }

      return {
        ...prev,
        installments: nextInstallments,
      };
    });
  }, [entryInstallment, form.sale_value, selectedPaymentMethods]);

  const canProceed = useMemo(() => {
    if (currentStep === 1) {
      return saleValue > 0 && projectCost >= 0;
    }
    if (currentStep === 2) {
      return selectedPaymentMethods.length > 0;
    }
    if (currentStep === 3) {
      return installmentsStepValid;
    }
    return true;
  }, [currentStep, installmentsStepValid, projectCost, saleValue, selectedPaymentMethods.length]);

  const goNext = useCallback(() => {
    if (currentStep >= 4 || !canProceed) return;
    if (currentStep === 2) {
      applySelectedMethodsToSchedule();
    }
    setCurrentStep((prev) => Math.min(4, prev + 1) as FinanceWizardStep);
  }, [applySelectedMethodsToSchedule, canProceed, currentStep]);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1) as FinanceWizardStep);
  }, []);

  const saveFinancePlanFallback = useCallback(async (leadId: number) => {
    if (!orgId) {
      throw new Error('Organização não encontrada para salvar o plano financeiro.');
    }

    const actorUserId = user?.id || null;
    const notes = fullForm.notes?.trim() || null;

    const { data: existingPlan, error: existingPlanError } = await supabase
      .from('lead_sale_finance_plans')
      .select('id')
      .eq('org_id', orgId)
      .eq('lead_id', leadId)
      .maybeSingle();

    if (existingPlanError) throw existingPlanError;

    let planId = existingPlan?.id || null;

    if (planId) {
      const { count: paidInstallmentsCount, error: paidInstallmentsError } = await supabase
        .from('lead_sale_installments')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('plan_id', planId)
        .eq('status', 'paid');

      if (paidInstallmentsError) throw paidInstallmentsError;
      if ((paidInstallmentsCount || 0) > 0) {
        throw new Error('FINANCE_PLAN_LOCKED_AFTER_PAYMENT');
      }

      const { error: updatePlanError } = await supabase
        .from('lead_sale_finance_plans')
        .update({
          sale_value: roundMoney(fullForm.sale_value),
          project_cost: roundMoney(fullForm.project_cost),
          notes,
          updated_by: actorUserId,
        })
        .eq('org_id', orgId)
        .eq('id', planId);

      if (updatePlanError) throw updatePlanError;
    } else {
      const { data: createdPlan, error: createPlanError } = await supabase
        .from('lead_sale_finance_plans')
        .insert({
          org_id: orgId,
          lead_id: leadId,
          sale_value: roundMoney(fullForm.sale_value),
          project_cost: roundMoney(fullForm.project_cost),
          notes,
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .select('id')
        .single();

      if (createPlanError) throw createPlanError;
      planId = createdPlan.id;
    }

    if (!planId) {
      throw new Error('Nao foi possivel identificar o plano financeiro salvo.');
    }

    const { error: deleteInstallmentsError } = await supabase
      .from('lead_sale_installments')
      .delete()
      .eq('org_id', orgId)
      .eq('plan_id', planId)
      .neq('status', 'paid');

    if (deleteInstallmentsError) throw deleteInstallmentsError;

    const installmentRows = combinedInstallments.map((installment) => ({
      org_id: orgId,
      plan_id: planId,
      lead_id: leadId,
      installment_no: installment.installment_no,
      due_on: installment.due_on,
      amount: roundMoney(installment.amount),
      payment_methods: installment.payment_methods,
      status: 'scheduled' as const,
      cycle_no: 0,
      notes: installment.notes?.trim() || null,
      created_by: actorUserId,
      updated_by: actorUserId,
    }));

    if (installmentRows.length > 0) {
      const { error: insertInstallmentsError } = await supabase
        .from('lead_sale_installments')
        .insert(installmentRows);

      if (insertInstallmentsError) throw insertInstallmentsError;
    }

    const { error: updateDealsError } = await supabase
      .from('deals')
      .update({ amount: roundMoney(fullForm.sale_value) })
      .eq('org_id', orgId)
      .eq('lead_id', leadId);

    if (updateDealsError) {
      console.warn('Failed to sync deal amount after finance fallback save', updateDealsError);
    }
  }, [combinedInstallments, fullForm, orgId, user?.id]);

  const saveFinanceComment = useCallback(async (leadId: number) => {
    const trimmedNotes = fullForm.notes?.trim() || '';
    if (!trimmedNotes || !orgId) return;

    const author = getAuthUserDisplayName(user) || 'Vendedor';
    const commentText = buildFinanceLeadComment({
      saleValue,
      projectCost,
      marginValue,
      marginPct,
      notes: trimmedNotes,
    });

    const { error } = await supabase.from('comentarios_leads').insert({
      org_id: orgId,
      lead_id: leadId,
      texto: commentText,
      autor: author,
    });

    if (error) {
      throw error;
    }
  }, [fullForm.notes, marginPct, marginValue, orgId, projectCost, saleValue, user]);

  const handleSave = async () => {
    if (!contact || !orgId) return;

    const leadId = Number(contact.id);
    if (!Number.isFinite(leadId)) {
      toast({
        title: 'Lead invalido',
        description: 'Nao foi possivel identificar o lead para salvar o plano financeiro.',
        variant: 'destructive',
      });
      return;
    }

    if (!formValid) {
      toast({
        title: 'Dados incompletos',
        description: 'Revise valor, custo, modalidades e parcelas antes de continuar.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        p_org_id: orgId,
        p_lead_id: leadId,
        p_sale_value: roundMoney(fullForm.sale_value),
        p_project_cost: roundMoney(fullForm.project_cost),
        p_notes: fullForm.notes?.trim() || null,
        p_installments: combinedInstallments,
        p_actor_user_id: user?.id || null,
      };

      const { error } = await supabase.rpc('rpc_upsert_lead_sale_finance_plan', payload);
      if (error) {
        if (!shouldFallbackToDirectFinanceSave(error)) {
          throw error;
        }

        await saveFinancePlanFallback(leadId);
      }

      try {
        await saveFinanceComment(leadId);
      } catch (commentError) {
        console.error('Failed to persist project paid finance comment', commentError);
        toast({
          title: 'Plano salvo, mas o comentario falhou',
          description: 'O plano financeiro foi salvo, mas a observacao nao foi registrada no historico do lead.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Plano financeiro salvo',
        description: 'Lead pronto para seguir para Projeto Pago.',
      });

      onCompleted();
    } catch (error) {
      const message = semanticFinanceError(error instanceof Error ? error.message : String(error || ''));
      toast({
        title: 'Falha ao salvar plano financeiro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!contact) return null;

  const disableSave = isSaving || isLoading || hasPaidInstallments || !formValid;
  const stepMeta = STEP_COPY[currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => (!nextOpen ? onCancel() : undefined)}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Parabens pela venda! Finalize o financeiro</DialogTitle>
          <DialogDescription>
            Informe valor, custo e condicoes de pagamento para concluir a mudanca para Projeto Pago.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando plano financeiro...
          </div>
        ) : (
          <div className="space-y-6">
            <FinanceWizardProgressBar currentStep={currentStep} />

            <div className="rounded-xl border bg-muted/30 px-4 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-base font-semibold">{stepMeta.title}</p>
                  <p className="text-sm text-muted-foreground">{stepMeta.description}</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{contact.name}</strong>
                  <div>{[contact.company, contact.phone].filter(Boolean).join(' | ')}</div>
                </div>
              </div>
            </div>

            {loadError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {loadError}
              </div>
            ) : null}

            {hasPaidInstallments ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Este plano ja possui parcela paga. A estrutura nao pode ser alterada; use confirmacao ou reagendamento
                de parcelas pendentes.
              </div>
            ) : null}

            {currentStep === 1 ? (
              <FinanceStepValues
                saleValue={saleValue}
                projectCost={projectCost}
                notes={form.notes || ''}
                marginValue={marginValue}
                marginPct={marginPct}
                formatCurrency={formatCurrency}
                disabled={hasPaidInstallments}
                onSaleValueChange={(value) => setForm((prev) => ({ ...prev, sale_value: roundMoney(value) }))}
                onProjectCostChange={(value) => setForm((prev) => ({ ...prev, project_cost: roundMoney(value) }))}
                onNotesChange={(value) => setForm((prev) => ({ ...prev, notes: value }))}
              />
            ) : null}

            {currentStep === 2 ? (
              <FinanceStepPaymentMethod
                selectedMethods={selectedPaymentMethods}
                disabled={hasPaidInstallments}
                onToggleMethod={toggleSelectedPaymentMethod}
              />
            ) : null}

            {currentStep === 3 ? (
              <FinanceStepInstallments
                saleValue={saleValue}
                selectedMethods={selectedPaymentMethods}
                entryInstallment={entryInstallment}
                installments={form.installments}
                installmentsTotal={installmentsTotal}
                progressPct={progressPct}
                totalsMatch={totalsMatch}
                remainingAmount={remainingAmount}
                disabled={hasPaidInstallments}
                formatCurrency={formatCurrency}
                onAddEntry={addEntryInstallment}
                onRemoveEntry={removeEntryInstallment}
                onAddInstallment={addInstallment}
                onRemoveInstallment={removeInstallment}
                onEntryChange={patchEntryInstallment}
                onInstallmentChange={patchInstallment}
                onToggleEntryMethod={toggleEntryPaymentMethod}
                onToggleInstallmentMethod={toggleInstallmentPaymentMethod}
              />
            ) : null}

            {currentStep === 4 ? (
              <FinanceStepReview
                saleValue={saleValue}
                projectCost={projectCost}
                marginValue={marginValue}
                marginPct={marginPct}
                notes={form.notes || ''}
                selectedMethods={selectedPaymentMethods}
                installments={combinedInstallments}
                formatCurrency={formatCurrency}
                onEditStep={(step) => setCurrentStep(step)}
              />
            ) : null}
          </div>
        )}

        <DialogFooter className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>

          {currentStep > 1 ? (
            <Button type="button" variant="outline" onClick={goBack} disabled={isSaving || isLoading}>
              Voltar
            </Button>
          ) : null}

          {currentStep < 4 ? (
            <Button type="button" onClick={goNext} disabled={isSaving || isLoading || !canProceed}>
              Proximo
            </Button>
          ) : (
            <Button type="button" onClick={handleSave} disabled={disableSave}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar e continuar'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
