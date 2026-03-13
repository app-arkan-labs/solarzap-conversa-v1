import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BillingBlockerDialog } from '@/components/billing/BillingBlockerDialog';
import { PackPurchaseModal } from '@/components/billing/PackPurchaseModal';
import { useAuth } from '@/contexts/AuthContext';
import { createBillingPortalSession, type OrgBillingInfo } from '@/hooks/useOrgBilling';
import { useToast } from '@/hooks/use-toast';
import {
  buildBillingSearchParams,
  type BillingBlockerPayload,
  type BillingPageIntent,
  type BillingTargetPlan,
} from '@/lib/billingBlocker';
import { BILLING_PACK_KEYS, type BillingPackType } from '@/lib/billingPacks';
import { supabase } from '@/lib/supabase';

type BillingPackFallbackOptions = {
  source?: string;
  targetPlan?: BillingTargetPlan | null;
  billingIntent?: BillingPageIntent | null;
};

type BillingBlockerContextValue = {
  billing: OrgBillingInfo | null | undefined;
  openBillingBlocker: (blocker: BillingBlockerPayload) => void;
  closeBillingBlocker: () => void;
  openPackPurchase: (
    packType: BillingPackType,
    options?: BillingPackFallbackOptions,
  ) => Promise<boolean>;
};

const BillingBlockerContext = createContext<BillingBlockerContextValue>({
  billing: null,
  openBillingBlocker: () => undefined,
  closeBillingBlocker: () => undefined,
  openPackPurchase: async () => false,
});

interface BillingBlockerProviderProps {
  billing: OrgBillingInfo | null | undefined;
  children: React.ReactNode;
}

export function BillingBlockerProvider({ billing, children }: BillingBlockerProviderProps) {
  const navigate = useNavigate();
  const { orgId } = useAuth();
  const { toast } = useToast();
  const [blocker, setBlocker] = useState<BillingBlockerPayload | null>(null);
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const [packModalType, setPackModalType] = useState<BillingPackType>('disparo');
  const [packModalOpen, setPackModalOpen] = useState(false);

  const closeBillingBlocker = useCallback(() => {
    setBlocker(null);
    setPrimaryBusy(false);
  }, []);

  const navigateToBilling = useCallback(
    (options: BillingPackFallbackOptions & { source?: string }) => {
      const params = new URLSearchParams();
      params.set('intent', options.billingIntent || 'upgrade');
      params.set('target', options.targetPlan || 'start');
      params.set('source', options.source || 'billing');
      navigate(`/billing?${params.toString()}`);
    },
    [navigate],
  );

  const openPackPurchase = useCallback(
    async (packType: BillingPackType, options?: BillingPackFallbackOptions) => {
      if (packType === 'ai') {
        const { count, error } = await supabase
          .from('_admin_addon_catalog')
          .select('addon_key', { count: 'exact', head: true })
          .eq('is_active', true)
          .in('addon_key', BILLING_PACK_KEYS.ai);

        if (!error && Number(count || 0) < 1) {
          navigateToBilling({
            source: options?.source || 'ai_credits',
            targetPlan: options?.targetPlan || 'pro',
            billingIntent: options?.billingIntent || 'upgrade',
          });
          return false;
        }
      }

      setPackModalType(packType);
      setPackModalOpen(true);
      return true;
    },
    [navigateToBilling],
  );

  const handlePrimaryAction = useCallback(async () => {
    if (!blocker) return;

    if (blocker.primaryAction === 'billing_page') {
      const params = buildBillingSearchParams(blocker, billing);
      closeBillingBlocker();
      navigate(`/billing?${params.toString()}`);
      return;
    }

    if (blocker.primaryAction === 'billing_portal') {
      try {
        setPrimaryBusy(true);
        const url = await createBillingPortalSession(orgId);
        window.location.href = url;
      } catch (error) {
        toast({
          title: 'Portal indisponivel',
          description: error instanceof Error ? error.message : 'Erro inesperado ao abrir portal',
          variant: 'destructive',
        });
      } finally {
        setPrimaryBusy(false);
      }
      return;
    }

    closeBillingBlocker();
    if (blocker.primaryAction === 'pack_ai') {
      await openPackPurchase('ai', {
        source: blocker.source,
        targetPlan: blocker.targetPlan || 'pro',
        billingIntent: blocker.billingIntent || 'upgrade',
      });
      return;
    }

    await openPackPurchase('disparo', {
      source: blocker.source,
      targetPlan: blocker.targetPlan || null,
      billingIntent: blocker.billingIntent || 'upgrade',
    });
  }, [billing, blocker, closeBillingBlocker, navigate, openPackPurchase, orgId, toast]);

  const contextValue = useMemo<BillingBlockerContextValue>(
    () => ({
      billing,
      openBillingBlocker: (nextBlocker) => setBlocker(nextBlocker),
      closeBillingBlocker,
      openPackPurchase,
    }),
    [billing, closeBillingBlocker, openPackPurchase],
  );

  return (
    <BillingBlockerContext.Provider value={contextValue}>
      {children}
      <BillingBlockerDialog
        open={blocker !== null}
        blocker={blocker}
        primaryBusy={primaryBusy}
        onClose={closeBillingBlocker}
        onPrimaryAction={() => {
          void handlePrimaryAction();
        }}
      />
      <PackPurchaseModal
        open={packModalOpen}
        onOpenChange={setPackModalOpen}
        packType={packModalType}
      />
    </BillingBlockerContext.Provider>
  );
}

export const useBillingBlocker = () => useContext(BillingBlockerContext);
