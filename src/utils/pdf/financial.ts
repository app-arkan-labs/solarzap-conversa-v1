import type { ProposalPageRenderer } from '@/utils/pdf/shared';

export const financialPageRenderer: ProposalPageRenderer = {
  key: 'financial',
  render: (ctx) => {
    ctx.modulesExecuted.push('financial');
  },
};
