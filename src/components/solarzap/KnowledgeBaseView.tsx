import React, { useState, useRef } from 'react';
import { Brain, Building2, MessageSquareQuote, ShieldQuestion, FileUp, Loader2, X, FileText, CheckCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { SobreEmpresaTab } from './knowledge-base/SobreEmpresaTab';
import { DepoimentosTab } from './knowledge-base/DepoimentosTab';
import { ObjecoesFAQTab } from './knowledge-base/ObjecoesFAQTab';

export function KnowledgeBaseView() {
    const { toast } = useToast();
    const { user, orgId } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadSuccess, setUploadSuccess] = useState(false);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
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

        // Validate file size (max 20MB)
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

    const handleUpload = async () => {
        if (!uploadedFile) return;

        setIsUploading(true);
        try {
            if (!user || !orgId) throw new Error('Not authenticated');
            const fileExt = uploadedFile.name.split('.').pop();
            const fileName = `${orgId}/knowledge_base_${Date.now()}.${fileExt}`;

            // Upload to Supabase Storage
            const { data, error } = await supabase.storage
                .from('knowledge-base')
                .upload(fileName, uploadedFile);

            if (error) throw error;

            // Sprint 2, Item #12: Extract text content from supported file types
            let extractedBody = `Documento importado: ${uploadedFile.name}`;
            let contentExtracted = false;
            const ext = (fileExt || '').toLowerCase();
            try {
                if (ext === 'txt' || ext === 'csv' || ext === 'md' || ext === 'json') {
                    const textContent = await uploadedFile.text();
                    if (textContent && textContent.trim().length > 0) {
                        // Limit to first 50KB of text to avoid oversized DB rows
                        extractedBody = textContent.substring(0, 50 * 1024);
                        contentExtracted = true;
                    }
                }
            } catch (extractErr) {
                console.warn('[KB] Text extraction failed (non-blocking):', extractErr);
            }

            // Save reference to kb_items table
            const { error: dbError } = await supabase
                .from('kb_items')
                .insert({
                    org_id: orgId,
                    type: 'document',
                    title: uploadedFile.name,
                    body: extractedBody,
                    tags: contentExtracted ? ['importado', ext, 'conteudo_extraido'] : ['importado', ext, 'extracao_pendente'],
                    status: 'approved',
                    created_by: user.id
                });

            if (dbError) throw dbError;

            setUploadSuccess(true);
            toast({
                title: "Documento importado!",
                description: "O arquivo foi adicionado à base de conhecimento da IA.",
            });

            // Reset after 2 seconds
            setTimeout(() => {
                setIsImportDialogOpen(false);
                setUploadedFile(null);
                setUploadSuccess(false);
            }, 2000);

        } catch (error) {
            console.error('Error uploading document:', error);
            toast({
                title: "Erro ao importar",
                description: "Não foi possível importar o documento.",
                variant: "destructive",
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleCloseImportDialog = () => {
        setIsImportDialogOpen(false);
        setUploadedFile(null);
        setUploadSuccess(false);
    };

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="h-16 border-b flex items-center px-6 justify-between bg-gradient-to-r from-primary/10 via-background to-primary/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                        <Brain className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-foreground">Banco de Dados</h1>
                        <p className="text-xs text-muted-foreground">Treine a IA para representar sua empresa</p>
                    </div>
                </div>

                {/* Import Button */}
                <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setIsImportDialogOpen(true)}
                >
                    <FileUp className="w-4 h-4" />
                    Importar Documento
                </Button>
            </div>

            {/* Content with Tabs */}
            <div className="flex-1 p-6 overflow-auto bg-slate-50/50">
                <div className="w-full">
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
                                Objeções & FAQ
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

            {/* Import Document Dialog */}
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
                                <p className="text-sm text-muted-foreground">A IA já pode usar esse conhecimento.</p>
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
                                        <p className="text-xs text-muted-foreground mt-1">PDF, TXT, DOC ou DOCX • Máx 20MB</p>
                                    </div>
                                </div>
                            </button>
                        )}

                        {!uploadSuccess && (
                            <div className="flex gap-3 pt-4 border-t">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={handleCloseImportDialog}
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
