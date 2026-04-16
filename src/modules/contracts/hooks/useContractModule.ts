import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  createContractArtifact,
  createContractDraft,
  getContractDraft,
  listContractDrafts,
  persistContractDraft,
} from '../lib/repository';
import { generateContractPdfBlob } from '../lib/pdf';
import { renderContractDocument } from '../lib/templateEngine';
import type { ContractExternalPrefill } from '../lib/domain';
import type { ContractFormalizationFormValues } from '../lib/schema';
import { slugifyToken } from '../lib/formatters';

const downloadBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    link.remove();
  }, 1000);
};

const uploadArtifactToStorage = async (input: {
  orgId: string;
  contractId: string;
  artifactKind: 'preview_html' | 'pdf';
  fileName: string;
  mimeType: string;
  blob: Blob;
}) => {
  const { data, error } = await supabase.functions.invoke('contract-storage-intent', {
    body: {
      orgId: input.orgId,
      contractId: input.contractId,
      artifactKind: input.artifactKind,
      fileName: input.fileName,
      sizeBytes: input.blob.size,
      mimeType: input.mimeType,
    },
  });

  if (error || !data?.uploadUrl) {
    throw error || new Error('Falha ao obter upload URL do contrato.');
  }

  const response = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': input.mimeType },
    body: input.blob,
  });

  if (!response.ok) {
    throw new Error('Falha ao enviar artifact do contrato para o storage.');
  }

  return {
    bucket: String(data.bucket || ''),
    path: String(data.path || ''),
  };
};

export const useContractModule = (externalPrefill?: ContractExternalPrefill | null) => {
  const { orgId, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const draftsQuery = useQuery({
    queryKey: ['contract-module', 'drafts', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      return listContractDrafts(orgId);
    },
    enabled: Boolean(orgId),
  });

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !user?.id) throw new Error('Usuario sem organizacao ativa.');
      return createContractDraft({
        orgId,
        userId: user.id,
        sellerUserId: user.id,
        prefill: externalPrefill,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-module', 'drafts', orgId] });
      toast({
        title: 'Contrato draft criado',
        description: 'O novo draft foi aberto no modulo contratual.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Falha ao criar contrato',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (values: ContractFormalizationFormValues) => {
      if (!orgId || !user?.id) throw new Error('Usuario sem organizacao ativa.');
      return persistContractDraft({
        values,
        orgId,
        userId: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-module', 'drafts', orgId] });
    },
  });

  const markReviewReadyMutation = useMutation({
    mutationFn: async (values: ContractFormalizationFormValues) => {
      if (!orgId || !user?.id) throw new Error('Usuario sem organizacao ativa.');
      return persistContractDraft({
        values,
        orgId,
        userId: user.id,
        nextStatus: 'review_ready',
        eventType: 'summary_confirmed',
        eventMessage: 'Resumo comercial confirmado e revisao final concluida.',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-module', 'drafts', orgId] });
      toast({
        title: 'Revisao concluida',
        description: 'O contrato esta pronto para gerar preview.',
      });
    },
  });

  const generatePreviewMutation = useMutation({
    mutationFn: async (values: ContractFormalizationFormValues) => {
      if (!orgId || !user?.id) throw new Error('Usuario sem organizacao ativa.');

      let workingValues = values;
      if (workingValues.internalMetadata.contractStatus === 'draft') {
        const reviewResult = await persistContractDraft({
          values: workingValues,
          orgId,
          userId: user.id,
          nextStatus: 'review_ready',
          eventType: 'summary_confirmed',
          eventMessage: 'Resumo comercial confirmado automaticamente para gerar preview.',
        });
        workingValues = reviewResult.values;
      }

      const renderResult = renderContractDocument(workingValues);
      const htmlBlob = new Blob([renderResult.html], { type: 'text/html' });
      let storagePath = '';
      let storageBucket = '';

      try {
        const storageResult = await uploadArtifactToStorage({
          orgId,
          contractId: workingValues.internalMetadata.contractDraftId,
          artifactKind: 'preview_html',
          fileName: `${slugifyToken(
            workingValues.internalMetadata.contractNumber,
          )}-preview.html`,
          mimeType: 'text/html',
          blob: htmlBlob,
        });
        storagePath = storageResult.path;
        storageBucket = storageResult.bucket;
      } catch (error) {
        console.warn('Preview storage upload failed (non-blocking):', error);
      }

      const result = await persistContractDraft({
        values: {
          ...workingValues,
          internalMetadata: {
            ...workingValues.internalMetadata,
            previewStoragePath: storagePath,
          },
        },
        orgId,
        userId: user.id,
        nextStatus: 'preview_generated',
        eventType: 'preview_generated',
        eventMessage: 'Preview contratual gerado.',
        renderPreview: true,
      });

      await createContractArtifact({
        contractDraftId: result.values.internalMetadata.contractDraftId,
        orgId,
        userId: user.id,
        kind: 'preview_html',
        templateVersion: result.values.internalMetadata.templateVersion,
        storageBucket,
        storagePath,
        mimeType: 'text/html',
        htmlSnapshot: renderResult.html,
        textSnapshot: renderResult.markdown,
        checksumHash: result.values.internalMetadata.checksumHash,
      });

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-module', 'drafts', orgId] });
      toast({
        title: 'Preview gerado',
        description: 'O contrato renderizado foi salvo no modulo central.',
      });
    },
  });

  const generatePdfMutation = useMutation({
    mutationFn: async (values: ContractFormalizationFormValues) => {
      if (!orgId || !user?.id) throw new Error('Usuario sem organizacao ativa.');

      let workingValues = values;
      if (
        !['preview_generated', 'pdf_generated', 'sent_for_signature', 'signed'].includes(
          workingValues.internalMetadata.contractStatus,
        )
      ) {
        const previewResult = await generatePreviewMutation.mutateAsync(workingValues);
        workingValues = previewResult.values;
      }

      const renderResult = renderContractDocument(workingValues);
      const pdfBlob = generateContractPdfBlob(renderResult, {
        contractNumber: workingValues.internalMetadata.contractNumber,
        companyName: workingValues.legalData.contratante.nomeFantasia,
      });

      const pdfFileName = `${slugifyToken(
        workingValues.internalMetadata.contractNumber,
      )}-${slugifyToken(
        workingValues.legalData.contratante.nomeFantasia ||
          workingValues.legalData.contratante.razaoSocial,
      )}.pdf`;

      let storagePath = '';
      let storageBucket = '';

      try {
        const storageResult = await uploadArtifactToStorage({
          orgId,
          contractId: workingValues.internalMetadata.contractDraftId,
          artifactKind: 'pdf',
          fileName: pdfFileName,
          mimeType: 'application/pdf',
          blob: pdfBlob,
        });
        storagePath = storageResult.path;
        storageBucket = storageResult.bucket;
      } catch (error) {
        console.warn('PDF storage upload failed (non-blocking):', error);
      }

      const result = await persistContractDraft({
        values: {
          ...workingValues,
          internalMetadata: {
            ...workingValues.internalMetadata,
            pdfStoragePath: storagePath,
          },
        },
        orgId,
        userId: user.id,
        nextStatus: 'pdf_generated',
        eventType: 'pdf_generated',
        eventMessage: 'PDF do contrato gerado.',
        renderPreview: true,
      });

      await createContractArtifact({
        contractDraftId: result.values.internalMetadata.contractDraftId,
        orgId,
        userId: user.id,
        kind: 'pdf',
        templateVersion: result.values.internalMetadata.templateVersion,
        storageBucket,
        storagePath,
        mimeType: 'application/pdf',
        htmlSnapshot: renderResult.html,
        textSnapshot: renderResult.markdown,
        checksumHash: result.values.internalMetadata.checksumHash,
      });

      downloadBlob(pdfBlob, pdfFileName);
      return { ...result, pdfBlob, pdfFileName };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-module', 'drafts', orgId] });
      toast({
        title: 'PDF gerado',
        description: 'O PDF de contrato foi exportado e persistido no modulo central.',
      });
    },
  });

  return {
    orgId,
    userId: user?.id || null,
    drafts: draftsQuery.data || [],
    isLoadingDrafts: draftsQuery.isLoading,
    createDraft: createDraftMutation.mutateAsync,
    isCreatingDraft: createDraftMutation.isPending,
    saveDraft: saveDraftMutation.mutateAsync,
    isSavingDraft: saveDraftMutation.isPending,
    markReviewReady: markReviewReadyMutation.mutateAsync,
    isMarkingReviewReady: markReviewReadyMutation.isPending,
    generatePreview: generatePreviewMutation.mutateAsync,
    isGeneratingPreview: generatePreviewMutation.isPending,
    generatePdf: generatePdfMutation.mutateAsync,
    isGeneratingPdf: generatePdfMutation.isPending,
    refreshDrafts: () =>
      queryClient.invalidateQueries({ queryKey: ['contract-module', 'drafts', orgId] }),
    getDraft: async (contractDraftId: string) => {
      if (!orgId) throw new Error('Organizacao nao encontrada.');
      return getContractDraft(contractDraftId, orgId);
    },
  };
};
