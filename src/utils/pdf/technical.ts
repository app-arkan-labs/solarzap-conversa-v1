import type { ProposalPageRenderer } from '@/utils/pdf/shared';

export const technicalPageRenderer: ProposalPageRenderer = {
  key: 'technical',
  render: (ctx) => {
    ctx.modulesExecuted.push('technical');
  },
};
