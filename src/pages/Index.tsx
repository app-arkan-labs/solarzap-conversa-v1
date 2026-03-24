import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useOrgFeatureFlags } from '@/hooks/useOrgFeatureFlags';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const SolarZapLayout = lazyWithRetry(() =>
  import('@/components/solarzap/SolarZapLayout').then((module) => ({
    default: module.SolarZapLayout,
  })),
  'page:index:solarzap-layout',
);

const Index = () => {
  const { data: flags } = useOrgFeatureFlags();
  const showCrmFlagBlock = flags?.crm_feature_flag_banner === true;

  return (
    <>
      {showCrmFlagBlock ? (
        <div
          data-testid="crm-feature-flag-banner"
          className="fixed bottom-3 right-3 z-50 rounded-xl border border-primary/25 bg-background/95 px-3 py-2 text-xs text-foreground shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur-sm"
        >
          Feature flag `crm_feature_flag_banner` ativa para esta organização.
        </div>
      ) : null}
      <Suspense
        fallback={
          <div className="h-screen w-full flex items-center justify-center bg-background">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Carregando área principal...</span>
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
