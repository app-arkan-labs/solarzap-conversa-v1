import { SolarZapLayout } from '@/components/solarzap/SolarZapLayout';
import { useOrgFeatureFlags } from '@/hooks/useOrgFeatureFlags';

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
      <SolarZapLayout />
    </>
  );
};

export default Index;
