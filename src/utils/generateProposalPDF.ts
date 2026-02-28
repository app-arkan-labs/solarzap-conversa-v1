import { isPdfRendererV2Enabled } from '@/config/featureFlags';
import {
  generateProposalPDFLegacy,
  generateSellerScriptPDFLegacy,
  type PDFGenerationOptions,
  type ProposalPDFData,
  type SellerScriptPDFData,
} from '@/utils/pdf/legacyRenderer';
import { generateProposalPDFV2, generateSellerScriptPDFV2 } from '@/utils/pdf/proposalRendererV2';

export type { PDFGenerationOptions, ProposalPDFData, SellerScriptPDFData } from '@/utils/pdf/legacyRenderer';
export { generateProposalPDFLegacy, generateSellerScriptPDFLegacy } from '@/utils/pdf/legacyRenderer';

export function generateProposalPDF(data: ProposalPDFData, options?: PDFGenerationOptions): Blob | void {
  if (isPdfRendererV2Enabled()) {
    return generateProposalPDFV2(data, options);
  }
  return generateProposalPDFLegacy(data, options);
}

export function generateSellerScriptPDF(data: SellerScriptPDFData, options?: PDFGenerationOptions): Blob | void {
  if (isPdfRendererV2Enabled()) {
    return generateSellerScriptPDFV2(data, options);
  }
  return generateSellerScriptPDFLegacy(data, options);
}
