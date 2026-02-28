import type { PDFGenerationOptions, ProposalPDFData, SellerScriptPDFData } from '@/utils/pdf/legacyRenderer';

export interface ProposalRenderContext {
  data: ProposalPDFData;
  options?: PDFGenerationOptions;
  modulesExecuted: string[];
}

export interface SellerScriptRenderContext {
  data: SellerScriptPDFData;
  options?: PDFGenerationOptions;
  modulesExecuted: string[];
}

export interface ProposalPageRenderer {
  key: 'cover' | 'analysis' | 'technical' | 'financial' | 'closing';
  render: (ctx: ProposalRenderContext) => void;
}

export interface SellerScriptRenderer {
  key: 'seller-script';
  render: (ctx: SellerScriptRenderContext) => void;
}

export function runProposalModules(
  modules: ProposalPageRenderer[],
  data: ProposalPDFData,
  options?: PDFGenerationOptions,
): ProposalRenderContext {
  const ctx: ProposalRenderContext = { data, options, modulesExecuted: [] };
  modules.forEach((module) => module.render(ctx));
  return ctx;
}

export function runSellerScriptModules(
  modules: SellerScriptRenderer[],
  data: SellerScriptPDFData,
  options?: PDFGenerationOptions,
): SellerScriptRenderContext {
  const ctx: SellerScriptRenderContext = { data, options, modulesExecuted: [] };
  modules.forEach((module) => module.render(ctx));
  return ctx;
}

export function sanitizeFileToken(value: string): string {
  const normalized = String(value || '').trim().replace(/\s+/g, '_');
  return normalized.replace(/[^a-zA-Z0-9_.-]/g, '');
}

export function buildProposalFileName(
  customerName: string,
  proposalNumber: string,
  isUsina: boolean,
): string {
  const customerToken = sanitizeFileToken(customerName) || 'cliente';
  const proposalToken = sanitizeFileToken(proposalNumber) || 'PROP-00000000';
  return `Proposta_${isUsina ? 'Usina' : 'Energia'}_Solar_${customerToken}_${proposalToken}.pdf`;
}

export function buildSellerScriptFileName(customerName: string, proposalNumber: string): string {
  const customerToken = sanitizeFileToken(customerName) || 'cliente';
  const proposalToken = sanitizeFileToken(proposalNumber) || 'PROP-00000000';
  return `Roteiro_Vendedor_${customerToken}_${proposalToken}.pdf`;
}
