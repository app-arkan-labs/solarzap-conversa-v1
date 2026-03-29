import { useMemo } from 'react';
import {
  useInternalCrmDeals,
  useInternalCrmPipelineStages,
  useInternalCrmProducts,
} from '@/modules/internal-crm/hooks/useInternalCrmApi';
import type { InternalCrmDealSummary, InternalCrmProduct, InternalCrmStage } from '@/modules/internal-crm/types';

export type InternalCrmPipelineFilters = {
  search?: string;
  stage_code?: string;
  status?: 'open' | 'won' | 'lost' | 'all';
};

export type InternalCrmPipelineColumn = InternalCrmStage & {
  deals: InternalCrmDealSummary[];
  totals: {
    count: number;
    one_time_cents: number;
    mrr_cents: number;
  };
};

export type InternalCrmProductMap = Map<string, InternalCrmProduct>;

export function useInternalCrmPipeline(filters: InternalCrmPipelineFilters) {
  const normalizedSearch = String(filters.search || '').trim();
  const normalizedStage = filters.stage_code && filters.stage_code !== 'all' ? filters.stage_code : undefined;
  const normalizedStatus = filters.status && filters.status !== 'all' ? filters.status : undefined;

  const stagesQuery = useInternalCrmPipelineStages();
  const dealsQuery = useInternalCrmDeals({
    search: normalizedSearch || undefined,
    stage_code: normalizedStage,
    status: normalizedStatus,
  });
  const productsQuery = useInternalCrmProducts();

  const columns = useMemo<InternalCrmPipelineColumn[]>(() => {
    const stages = stagesQuery.data?.stages || [];
    const deals = dealsQuery.data?.deals || [];

    return stages.map((stage) => {
      const stageDeals = deals.filter((deal) => deal.stage_code === stage.stage_code);
      return {
        ...stage,
        deals: stageDeals,
        totals: {
          count: stageDeals.length,
          one_time_cents: stageDeals.reduce((sum, deal) => sum + Number(deal.one_time_total_cents || 0), 0),
          mrr_cents: stageDeals.reduce((sum, deal) => sum + Number(deal.mrr_cents || 0), 0),
        },
      };
    });
  }, [dealsQuery.data?.deals, stagesQuery.data?.stages]);

  const productMap = useMemo<InternalCrmProductMap>(() => {
    return new Map((productsQuery.data?.products || []).map((product) => [product.product_code, product]));
  }, [productsQuery.data?.products]);

  return {
    stagesQuery,
    dealsQuery,
    productsQuery,
    columns,
    productMap,
  };
}
