import type { ProposalPageRenderer } from '@/utils/pdf/shared';

export const coverPageRenderer: ProposalPageRenderer = {
  key: 'cover',
  render: (ctx) => {
    ctx.modulesExecuted.push('cover');
  },
};
