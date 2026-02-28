import type { ProposalPageRenderer } from '@/utils/pdf/shared';

export const analysisPageRenderer: ProposalPageRenderer = {
  key: 'analysis',
  render: (ctx) => {
    ctx.modulesExecuted.push('analysis');
  },
};
