import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { generateContractPdfBlob } from '../lib/pdf';
import { renderContractDocument } from '../lib/templateEngine';
import { slugifyToken } from '../lib/formatters';
import type {
  ContractEmbedSessionRecord,
  ContractRenderResult,
} from '../lib/domain';
import type { ContractFormalizationFormValues } from '../lib/schema';

const blobToBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    anchor.remove();
  }, 1000);
};

const resolveEmbedOrigin = () => {
  if (typeof document === 'undefined') return '';
  if (document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      return '';
    }
  }
  return '';
};

type EmbedResolveResponse = {
  session: ContractEmbedSessionRecord;
  values: ContractFormalizationFormValues;
};

type PersistResult = {
  values: ContractFormalizationFormValues;
  renderResult: ContractRenderResult;
};

const invokeEmbedAction = async <T>(
  token: string,
  action: string,
  payload?: Record<string, unknown>,
) => {
  const { data, error } = await supabase.functions.invoke('contract-embed-api', {
    body: {
      token,
      action,
      embedOrigin: resolveEmbedOrigin(),
      ...(payload || {}),
    },
  });

  if (error) throw error;
  return data as T;
};

export const useContractEmbedSession = (token: string) => {
  const { toast } = useToast();

  const resolveQuery = useQuery({
    queryKey: ['contract-embed-session', token],
    queryFn: async () => invokeEmbedAction<EmbedResolveResponse>(token, 'resolve'),
    enabled: token.trim().length > 0,
    retry: 0,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: ContractFormalizationFormValues) => {
      const response = await invokeEmbedAction<{ values: ContractFormalizationFormValues }>(
        token,
        'save',
        { values },
      );
      return {
        values: response.values,
        renderResult: renderContractDocument(response.values),
      } as PersistResult;
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (values: ContractFormalizationFormValues) => {
      const response = await invokeEmbedAction<{ values: ContractFormalizationFormValues }>(
        token,
        'review_ready',
        { values },
      );
      return {
        values: response.values,
        renderResult: renderContractDocument(response.values),
      } as PersistResult;
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (values: ContractFormalizationFormValues) => {
      const renderResult = renderContractDocument(values);
      const response = await invokeEmbedAction<{ values: ContractFormalizationFormValues }>(
        token,
        'save_preview',
        {
          values,
          render: {
            html: renderResult.html,
            markdown: renderResult.markdown,
            placeholders: renderResult.placeholders,
            commercialSummary: renderResult.commercialSummary,
            includedAnnexes: renderResult.includedAnnexes,
          },
        },
      );
      return {
        values: response.values,
        renderResult,
      } as PersistResult;
    },
  });

  const pdfMutation = useMutation({
    mutationFn: async (values: ContractFormalizationFormValues) => {
      const renderResult = renderContractDocument(values);
      const pdfBlob = generateContractPdfBlob(renderResult, {
        contractNumber: values.internalMetadata.contractNumber,
        companyName:
          values.legalData.contratante.nomeFantasia ||
          values.legalData.contratante.razaoSocial,
      });
      const fileName = `${slugifyToken(values.internalMetadata.contractNumber)}-${slugifyToken(
        values.legalData.contratante.nomeFantasia ||
          values.legalData.contratante.razaoSocial,
      )}.pdf`;

      const response = await invokeEmbedAction<{ values: ContractFormalizationFormValues }>(
        token,
        'save_pdf',
        {
          values,
          render: {
            html: renderResult.html,
            markdown: renderResult.markdown,
            placeholders: renderResult.placeholders,
            commercialSummary: renderResult.commercialSummary,
            includedAnnexes: renderResult.includedAnnexes,
          },
          pdfBase64: await blobToBase64(pdfBlob),
          fileName,
        },
      );

      downloadBlob(pdfBlob, fileName);
      return {
        values: response.values,
        renderResult,
        pdfFileName: fileName,
      };
    },
    onSuccess: (result) => {
      toast({
        title: 'PDF gerado',
        description: `${result.pdfFileName} foi gerado e salvo na sessao embed.`,
      });
    },
  });

  return {
    resolveQuery,
    session: resolveQuery.data?.session || null,
    resolvedValues: resolveQuery.data?.values || null,
    lockedFieldKeys: resolveQuery.data?.session?.lockFields || [],
    saveDraft: saveMutation.mutateAsync,
    isSavingDraft: saveMutation.isPending,
    markReviewReady: reviewMutation.mutateAsync,
    isMarkingReviewReady: reviewMutation.isPending,
    generatePreview: previewMutation.mutateAsync,
    isGeneratingPreview: previewMutation.isPending,
    generatePdf: pdfMutation.mutateAsync,
    isGeneratingPdf: pdfMutation.isPending,
  };
};
