import type { SellerScriptRenderer } from '@/utils/pdf/shared';

export const sellerScriptRenderer: SellerScriptRenderer = {
  key: 'seller-script',
  render: (ctx) => {
    ctx.modulesExecuted.push('seller-script');
  },
};
