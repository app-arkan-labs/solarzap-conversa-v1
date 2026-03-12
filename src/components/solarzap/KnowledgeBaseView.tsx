import React, { useState, useRef } from 'react';
import { Building2, MessageSquareQuote, ShieldQuestion, FileUp, Loader2, X, FileText, CheckCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { SobreEmpresaTab } from './knowledge-base/SobreEmpresaTab';
import { DepoimentosTab } from './knowledge-base/DepoimentosTab';
import { ObjecoesFAQTab } from './knowledge-base/ObjecoesFAQTab';
import { BrandingSettingsCard } from './knowledge-base/BrandingSettingsCard';
import { PageHeader } from './PageHeader';

type IngestionState = 'idle' | 'pending' | 'processing' | 'ready' | 'error';

const isSchemaMismatchError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === '42703' || code === 'PGRST204') return true;
  return /column|schema cache/i.test(String(error.message || ''));
};

export function KnowledgeBaseView() {
  const { toast } = useToast();
  const { user, orgId, role } = useAuth();
  const canEdit = role === 'owner' || role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [ingestionState, setIngestionState] = useState<IngestionState>('idle');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Tipo de arquivo não suportado",
        description: "Envie um PDF, TXT ou documento Word.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 20MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadedFile(file);
  };

  const closeImportDialog = () => {
    setIsImportDialogOpen(false);
    setUploadedFile(null);
    setUploadSuccess(false);
    setIngestionState('idle');
  };

  const ingestUploadedItem = async (kbItemId: string | null) => {
    if (!kbItemId) return 'pending' as IngestionState;

    const { data, error } = await supabase.functions.invoke('kb-ingest', {
      body: {
        kb_item_id: kbItemId,
        force: true,
      },
    });

    if (error) {
      console.warn('[KB] kb-ingest invoke warning:', error.message || error);
      return 'pending' as IngestionState;
    }

    const payload = (data || {}) as {
      ingested?: Array<{ id?: string }>;
      failed?: Array<{ id?: string; error?: string }>;
    };

    const ingested = Array.isArray(payload.ingested)
      ? payload.ingested.some((item) => String(item?.id || '') === kbItemId)
      : false;
    if (ingested) return 'ready';

    const failed = Array.isArray(payload.failed)
      ? payload.failed.find((item) => String(item?.id || '') === kbItemId)
      : null;
    if (failed) {
      throw new Error(String(failed.error || 'Falha na ingestão.'));
    }

    return 'pending';
  };

  const handleUpload = async () => {
    if (!uploadedFile) return;

    setIsUploading(true);
    setIngestionState('pending');
    try {
      if (!user || !orgId) throw new Error('not_authenticated');

      const fileExt = uploadedFile.name.split('.').pop() || 'bin';
      const ext = fileExt.toLowerCase();
      const fileName = `org/${orgId}/knowledge_base_${Date.now()}.${fileExt}`;
      const mimeType = uploadedFile.type || null;

      const { error: uploadError } = await supabase.storage
        .from('knowledge-base')
        .upload(fileName, uploadedFile);

      if (uploadError) throw uploadError;

      let insertedId: string | null = null;
      let insertResult = await supabase
        .from('kb_items')
        .insert({
          org_id: orgId,
          type: 'document',
          title: uploadedFile.name,
          body: `Documento importado: ${uploadedFile.name}`,
          tags: ['importado', ext, 'ingestao_pendente'],
          status: 'approved',
          ingestion_status: 'pending',
          storage_bucket: 'knowledge-base',
          storage_path: fileName,
          mime_type: mimeType,
          created_by: user.id
        })
        .select('id')
        .single();

      if (insertResult.error && isSchemaMismatchError(insertResult.error)) {
        insertResult = await supabase
          .from('kb_items')
          .insert({
            org_id: orgId,
            type: 'document',
            title: uploadedFile.name,
            body: `Documento importado: ${uploadedFile.name}`,
            tags: ['importado', ext],
            status: 'approved',
            storage_bucket: 'knowledge-base',
            storage_path: fileName,
            mime_type: mimeType,
            created_by: user.id
          })
          .select('id')
          .single();
      }

      if (insertResult.error) throw insertResult.error;
      insertedId = String(insertResult.data?.id || '').trim() || null;

      setIngestionState('processing');
      const finalState = await ingestUploadedItem(insertedId);
      setIngestionState(finalState);
      setUploadSuccess(true);

      toast({
        title: "Documento importado!",
        description: finalState === 'ready'
          ? "Arquivo processado e pronto para uso da IA."
          : "Arquivo enviado. A ingestão será concluída em background.",
      });

      setTimeout(() => {
        closeImportDialog();
      }, 1800);
    } catch (error) {
      console.error('Error uploading document:', error);
      setIngestionState('error');
      toast({
        title: "Erro ao importar",
        description: "Não foi possível importar o documento.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <PageHeader
        title="Minha Empresa"
        subtitle="Gerencie marca, logo e conhecimento usado pela IA"
        icon={Building2}
        actionContent={
          <Button
            variant="outline"
            className="gap-2 bg-background/50 glass border-border/50 shadow-sm"
            onClick={() => setIsImportDialogOpen(true)}
            disabled={!canEdit}
          >
            <FileUp className="w-4 h-4" />
            Importar Documento
          </Button>
        }
      />

      <div className="flex-1 p-6 overflow-auto bg-slate-50/50">
        <div className="w-full space-y-6">
          <BrandingSettingsCard canEdit={canEdit} />
          <Tabs defaultValue="empresa" className="w-full space-y-6">
            <TabsList className="bg-white border shadow-sm p-1.5 rounded-xl h-auto flex flex-wrap justify-start gap-1">
              <TabsTrigger
                value="empresa"
                className="gap-2 px-4 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg"
              >
                <Building2 className="w-4 h-4" />
                Sobre a Empresa
              </TabsTrigger>
              <TabsTrigger
                value="depoimentos"
                className="gap-2 px-4 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg"
              >
                <MessageSquareQuote className="w-4 h-4" />
                Depoimentos
              </TabsTrigger>
              <TabsTrigger
                value="objecoes"
                className="gap-2 px-4 py-2.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg"
              >
                <ShieldQuestion className="w-4 h-4" />
                Objecoes & FAQ
              </TabsTrigger>
            </TabsList>

            <TabsContent value="empresa" className="focus-visible:ring-0 outline-none mt-6">
              <SobreEmpresaTab />
            </TabsContent>

            <TabsContent value="depoimentos" className="focus-visible:ring-0 outline-none mt-6">
              <DepoimentosTab />
            </TabsContent>

            <TabsContent value="objecoes" className="focus-visible:ring-0 outline-none mt-6">
              <ObjecoesFAQTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5 text-primary" />
              Importar Base de Dados
            </DialogTitle>
            <DialogDescription>
              Envie um PDF ou documento de texto com informações para a IA aprender
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />

            {uploadSuccess ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-green-800">Importado com sucesso!</h3>
                <p className="text-sm text-muted-foreground">
                  {ingestionState === 'ready'
                    ? 'A IA já pode usar esse conhecimento.'
                    : ingestionState === 'processing'
                      ? 'Documento em processamento.'
                    : ingestionState === 'pending'
                      ? 'Documento enfileirado para processamento.'
                        : 'Documento salvo com sucesso.'}
                </p>
              </div>
            ) : uploadedFile ? (
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <FileText className="w-8 h-8 text-blue-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-800 truncate">
                    {uploadedFile.name}
                  </p>
                  <p className="text-xs text-blue-600">
                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-blue-700 hover:text-red-600 hover:bg-red-50"
                  onClick={() => setUploadedFile(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-8 border-2 border-dashed rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-colors"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileUp className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-medium">Clique para selecionar arquivo</span>
                    <p className="text-xs text-muted-foreground mt-1">PDF, TXT, DOC ou DOCX - Máx 20MB</p>
                  </div>
                </div>
              </button>
            )}

            {!uploadSuccess && (
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={closeImportDialog}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleUpload}
                  disabled={!uploadedFile || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <FileUp className="w-4 h-4" />
                      Importar
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
