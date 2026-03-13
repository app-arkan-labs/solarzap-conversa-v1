import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import { useOrgFeatureFlags } from '@/hooks/useOrgFeatureFlags';

const SolarZapLayout = lazy(() =>
  import('@/components/solarzap/SolarZapLayout').then((module) => ({
    default: module.SolarZapLayout,
  })),
);

const Index = () => {
  const { data: flags } = useOrgFeatureFlags();
  const showCrmFlagBlock = flags?.crm_feature_flag_banner === true;

  return (
    <>
      {showCrmFlagBlock ? (
        <div
          data-testid="crm-feature-flag-banner"
          className="fixed bottom-3 right-3 z-50 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 shadow"
        >
          Feature flag `crm_feature_flag_banner` ativa para esta organizacao.
        </div>
      ) : null}
      <Suspense
        fallback={
          <div className="h-screen w-full flex items-center justify-center bg-background">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Carregando area principal...</span>
            </div>
          </div>
        }
      >
        <SolarZapLayout />
      </Suspense>
    </>
  );
};

export default Index;
