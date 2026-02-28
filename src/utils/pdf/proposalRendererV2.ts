import {
  generateProposalPDFLegacy,
  generateSellerScriptPDFLegacy,
  type PDFGenerationOptions,
  type ProposalPDFData,
  type SellerScriptPDFData,
} from '@/utils/pdf/legacyRenderer';
import { analysisPageRenderer } from '@/utils/pdf/analysis';
import { closingPageRenderer } from '@/utils/pdf/closing';
import { coverPageRenderer } from '@/utils/pdf/cover';
import { financialPageRenderer } from '@/utils/pdf/financial';
import { sellerScriptRenderer } from '@/utils/pdf/sellerScript';
import {
  runProposalModules,
  runSellerScriptModules,
  type ProposalPageRenderer,
  type SellerScriptRenderer,
} from '@/utils/pdf/shared';
import { technicalPageRenderer } from '@/utils/pdf/technical';

const PROPOSAL_PAGE_RENDERERS: ProposalPageRenderer[] = [
  coverPageRenderer,
  analysisPageRenderer,
  technicalPageRenderer,
  financialPageRenderer,
  closingPageRenderer,
];

const SELLER_SCRIPT_RENDERERS: SellerScriptRenderer[] = [sellerScriptRenderer];

export function generateProposalPDFV2(data: ProposalPDFData, options?: PDFGenerationOptions): Blob | void {
  runProposalModules(PROPOSAL_PAGE_RENDERERS, data, options);
  return generateProposalPDFLegacy(data, options);
}

export function generateSellerScriptPDFV2(data: SellerScriptPDFData, options?: PDFGenerationOptions): Blob | void {
  runSellerScriptModules(SELLER_SCRIPT_RENDERERS, data, options);
  return generateSellerScriptPDFLegacy(data, options);
}
