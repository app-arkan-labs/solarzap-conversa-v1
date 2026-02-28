import type { ProposalPageRenderer } from '@/utils/pdf/shared';

export const closingPageRenderer: ProposalPageRenderer = {
  key: 'closing',
  render: (ctx) => {
    ctx.modulesExecuted.push('closing');
  },
};
