import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    MessageSquareQuote,
    Plus,
    ChevronRight,
    ChevronLeft,
    Upload,
    Trash2,
    Edit,
    Video,
    Image as ImageIcon,
    FileText,
    Mic,
    X,
    Loader2,
    Search,
    CheckCircle,
    File
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabase';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface Testimonial {
    id: string;
    display_name: string;
    quote_short: string;
    story_long?: string;
    type: 'video' | 'audio' | 'image' | 'pdf' | 'text';
    media_url?: string;
    created_at: string;
}

const STEPS = [
    { id: 1, title: 'Cliente', question: 'Qual o nome do cliente?' },
    { id: 2, title: 'Depoimento', question: 'O que ele disse ou como reagiu?' },
    { id: 3, title: 'Mídia', question: 'Você tem foto, vídeo ou áudio?' },
    { id: 4, title: 'Resumo IA', question: 'Como a IA deve apresentar isso?' },
];

const MEDIA_TYPES = [
    { type: 'text', icon: MessageSquareQuote, label: 'Só Texto', color: 'green', accept: '', description: 'Nenhuma mídia' },
    { type: 'image', icon: ImageIcon, label: 'Foto', color: 'purple', accept: 'image/*', description: 'JPG, PNG, WebP' },
    { type: 'video', icon: Video, label: 'Vídeo', color: 'blue', accept: 'video/*', description: 'MP4, MOV, WebM' },
    { type: 'audio', icon: Mic, label: 'Áudio', color: 'orange', accept: 'audio/*', description: 'MP3, WAV, M4A' },
    { type: 'pdf', icon: FileText, label: 'Print', color: 'red', accept: 'image/*,.pdf', description: 'Print ou PDF' },
];

export function DepoimentosTab() {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        clientName: '',
        quote: '',
        mediaType: 'text' as 'video' | 'audio' | 'image' | 'pdf' | 'text',
        mediaFile: null as File | null,
        mediaUrl: '',
        aiSummary: ''
    });

    useEffect(() => {
        loadTestimonials();
    }, []);

    const loadTestimonials = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const orgId = user.user_metadata?.org_id || user.id;

            const { data, error } = await supabase
                .from('testimonials')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTestimonials(data || []);
        } catch (error) {
            console.error('Error loading testimonials:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({ clientName: '', quote: '', mediaType: 'text', mediaFile: null, mediaUrl: '', aiSummary: '' });
        setCurrentStep(1);
    };

    const handleOpenDialog = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        resetForm();
    };

    const handleNext = () => {
        if (currentStep < 4) setCurrentStep(currentStep + 1);
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(currentStep - 1);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            toast({
                title: "Arquivo muito grande",
                description: "O arquivo deve ter no máximo 10MB.",
                variant: "destructive",
            });
            return;
        }

        setFormData(prev => ({ ...prev, mediaFile: file }));
    };

    const uploadMedia = async (file: File): Promise<string> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const orgId = user.user_metadata?.org_id || user.id;
        const fileExt = file.name.split('.').pop();
        const fileName = `${orgId}/${Date.now()}.${fileExt}`;

        const { data, error } = await supabase.storage
            .from('testimonials')
            .upload(fileName, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from('testimonials')
            .getPublicUrl(data.path);

        return publicUrl;
    };

    const handleSave = async () => {
        if (!formData.clientName.trim() || !formData.quote.trim()) {
            toast({
                title: "Preencha os campos obrigatórios",
                description: "Nome do cliente e depoimento são obrigatórios.",
                variant: "destructive",
            });
            return;
        }

        setIsSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const orgId = user.user_metadata?.org_id || user.id;

            // Upload media if present
            let mediaUrl = '';
            if (formData.mediaFile) {
                setIsUploading(true);
                try {
                    mediaUrl = await uploadMedia(formData.mediaFile);
                } catch (uploadError) {
                    console.error('Upload error:', uploadError);
                    toast({
                        title: "Erro no upload",
                        description: "Mídia não enviada, mas depoimento será salvo.",
                        variant: "destructive",
                    });
                }
                setIsUploading(false);
            }

            const { error } = await supabase
                .from('testimonials')
                .insert({
                    org_id: orgId,
                    display_name: formData.clientName,
                    quote_short: formData.quote,
                    story_long: formData.aiSummary || formData.quote,
                    type: formData.mediaType,
                    media_url: mediaUrl || null,
                    status: 'approved',
                    consent_status: 'internal_only',
                    created_by: user.id
                });

            if (error) throw error;

            toast({
                title: "Depoimento adicionado!",
                description: formData.mediaFile
                    ? "O depoimento e mídia foram salvos."
                    : "O depoimento foi salvo e está disponível para a IA.",
            });

            handleCloseDialog();
            loadTestimonials();
        } catch (error) {
            console.error('Error saving testimonial:', error);
            toast({
                title: "Erro ao salvar",
                description: "Não foi possível salvar o depoimento.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const { error } = await supabase
                .from('testimonials')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setTestimonials(prev => prev.filter(t => t.id !== id));
            toast({ title: "Depoimento removido" });
        } catch (error) {
            console.error('Error deleting:', error);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'video': return <Video className="w-4 h-4 text-blue-500" />;
            case 'audio': return <Mic className="w-4 h-4 text-orange-500" />;
            case 'image': return <ImageIcon className="w-4 h-4 text-purple-500" />;
            case 'pdf': return <FileText className="w-4 h-4 text-red-500" />;
            default: return <MessageSquareQuote className="w-4 h-4 text-green-500" />;
        }
    };

    const filteredTestimonials = testimonials.filter(t =>
        t.display_name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
        t.quote_short?.toLowerCase().includes(searchFilter.toLowerCase())
    );

    const canProceed = () => {
        switch (currentStep) {
            case 1: return formData.clientName.trim().length > 0;
            case 2: return formData.quote.trim().length > 0;
            case 3: return true; // Media is optional
            case 4: return true; // Summary can be auto-generated
            default: return false;
        }
    };

    const currentMediaType = MEDIA_TYPES.find(m => m.type === formData.mediaType);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <MessageSquareQuote className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Depoimentos de Clientes</h2>
                        <p className="text-sm text-muted-foreground">
                            A IA usa esses depoimentos para convencer novos clientes
                        </p>
                    </div>
                </div>
                <Button onClick={handleOpenDialog} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Novo Depoimento
                </Button>
            </div>

            {/* Search/Filter */}
            {testimonials.length > 0 && (
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar depoimentos..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="pl-9"
                    />
                </div>
            )}

            {/* Testimonials Grid */}
            {filteredTestimonials.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTestimonials.map((item) => (
                        <Card key={item.id} className="group hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        {getTypeIcon(item.type)}
                                        <span className="font-medium text-foreground">{item.display_name}</span>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)}>
                                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                                {item.media_url && (
                                    <div className="mb-3">
                                        {item.type === 'image' || item.type === 'pdf' ? (
                                            <img
                                                src={item.media_url}
                                                alt="Mídia do depoimento"
                                                className="w-full h-32 object-cover rounded-lg"
                                            />
                                        ) : item.type === 'video' ? (
                                            <video
                                                src={item.media_url}
                                                className="w-full h-32 object-cover rounded-lg"
                                                controls
                                            />
                                        ) : item.type === 'audio' ? (
                                            <audio
                                                src={item.media_url}
                                                className="w-full"
                                                controls
                                            />
                                        ) : null}
                                    </div>
                                )}
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                    "{item.quote_short}"
                                </p>
                                <div className="mt-3 text-xs text-muted-foreground">
                                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed rounded-xl bg-muted/30">
                    <MessageSquareQuote className="w-12 h-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Nenhum depoimento ainda</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                        Adicione depoimentos de clientes satisfeitos. A IA usará essas histórias para convencer novos leads.
                    </p>
                    <Button onClick={handleOpenDialog} variant="outline" className="gap-2">
                        <Plus className="w-4 h-4" />
                        Adicionar primeiro depoimento
                    </Button>
                </div>
            )}

            {/* Wizard Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageSquareQuote className="w-5 h-5 text-purple-500" />
                            Novo Depoimento
                        </DialogTitle>
                    </DialogHeader>

                    {/* Step Indicator */}
                    <div className="flex items-center justify-between mb-6">
                        {STEPS.map((step, i) => (
                            <React.Fragment key={step.id}>
                                <div className="flex flex-col items-center">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                                        currentStep >= step.id
                                            ? "bg-purple-600 text-white"
                                            : "bg-muted text-muted-foreground"
                                    )}>
                                        {step.id}
                                    </div>
                                    <span className="text-xs mt-1 text-muted-foreground">{step.title}</span>
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div className={cn(
                                        "flex-1 h-0.5 mx-2",
                                        currentStep > step.id ? "bg-purple-600" : "bg-muted"
                                    )} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Step Content */}
                    <div className="min-h-[220px]">
                        {currentStep === 1 && (
                            <div className="space-y-4">
                                <Label className="text-base font-medium">{STEPS[0].question}</Label>
                                <Input
                                    placeholder="Ex: João da Padaria Central"
                                    value={formData.clientName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                                    autoFocus
                                />
                                <p className="text-sm text-muted-foreground">
                                    Pode ser o nome ou apelido que o cliente autorizou usar
                                </p>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-4">
                                <Label className="text-base font-medium">{STEPS[1].question}</Label>
                                <Textarea
                                    placeholder="Ex: Minha conta era R$1.200 e agora pago só R$80! Melhor investimento que fiz..."
                                    value={formData.quote}
                                    onChange={(e) => setFormData(prev => ({ ...prev, quote: e.target.value }))}
                                    rows={4}
                                    autoFocus
                                />
                                <p className="text-sm text-muted-foreground">
                                    Escreva exatamente como o cliente falou, quanto mais natural melhor
                                </p>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-4">
                                <Label className="text-base font-medium">{STEPS[2].question}</Label>

                                {/* Media Type Selection */}
                                <div className="grid grid-cols-5 gap-2">
                                    {MEDIA_TYPES.map(({ type, icon: Icon, label, color }) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    mediaType: type as any,
                                                    mediaFile: type === 'text' ? null : prev.mediaFile
                                                }));
                                            }}
                                            className={cn(
                                                "flex flex-col items-center p-3 rounded-lg border-2 transition-all",
                                                formData.mediaType === type
                                                    ? color === 'green' ? "border-green-500 bg-green-50" :
                                                        color === 'purple' ? "border-purple-500 bg-purple-50" :
                                                            color === 'blue' ? "border-blue-500 bg-blue-50" :
                                                                color === 'orange' ? "border-orange-500 bg-orange-50" :
                                                                    "border-red-500 bg-red-50"
                                                    : "border-muted hover:border-muted-foreground/30"
                                            )}
                                        >
                                            <Icon className={cn(
                                                "w-5 h-5 mb-1",
                                                color === 'green' ? "text-green-500" :
                                                    color === 'purple' ? "text-purple-500" :
                                                        color === 'blue' ? "text-blue-500" :
                                                            color === 'orange' ? "text-orange-500" :
                                                                "text-red-500"
                                            )} />
                                            <span className="text-xs">{label}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* File Upload Area */}
                                {formData.mediaType !== 'text' && (
                                    <div className="mt-4">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept={currentMediaType?.accept}
                                            onChange={handleFileSelect}
                                            className="hidden"
                                        />

                                        {formData.mediaFile ? (
                                            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                                                <CheckCircle className="w-5 h-5 text-green-600" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-green-800 truncate">
                                                        {formData.mediaFile.name}
                                                    </p>
                                                    <p className="text-xs text-green-600">
                                                        {(formData.mediaFile.size / 1024 / 1024).toFixed(2)} MB
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-green-700 hover:text-red-600 hover:bg-red-50"
                                                    onClick={() => setFormData(prev => ({ ...prev, mediaFile: null }))}
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full p-6 border-2 border-dashed rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-colors"
                                            >
                                                <div className="flex flex-col items-center gap-2">
                                                    <Upload className="w-8 h-8 text-muted-foreground" />
                                                    <span className="text-sm font-medium">Clique para anexar {currentMediaType?.label.toLowerCase()}</span>
                                                    <span className="text-xs text-muted-foreground">{currentMediaType?.description} • Máx 10MB</span>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                )}

                                {formData.mediaType === 'text' && (
                                    <p className="text-sm text-muted-foreground">
                                        Você pode adicionar mídia depois se quiser
                                    </p>
                                )}
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-4">
                                <Label className="text-base font-medium">{STEPS[3].question}</Label>
                                <Textarea
                                    placeholder={`Ex: ${formData.clientName || 'Um cliente'} economizou mais de R$1.000 por mês na conta de luz após instalar conosco...`}
                                    value={formData.aiSummary}
                                    onChange={(e) => setFormData(prev => ({ ...prev, aiSummary: e.target.value }))}
                                    rows={4}
                                    autoFocus
                                />
                                <p className="text-sm text-muted-foreground">
                                    Esse texto ajuda a IA a contar a história de forma convincente. Se deixar em branco, usamos o depoimento original.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center justify-between pt-4 border-t">
                        <Button
                            variant="ghost"
                            onClick={currentStep === 1 ? handleCloseDialog : handleBack}
                            className="gap-2"
                        >
                            {currentStep === 1 ? (
                                <>
                                    <X className="w-4 h-4" />
                                    Cancelar
                                </>
                            ) : (
                                <>
                                    <ChevronLeft className="w-4 h-4" />
                                    Voltar
                                </>
                            )}
                        </Button>

                        {currentStep < 4 ? (
                            <Button onClick={handleNext} disabled={!canProceed()} className="gap-2">
                                Próximo
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        ) : (
                            <Button onClick={handleSave} disabled={isSaving || isUploading} className="gap-2 bg-purple-600 hover:bg-purple-700">
                                {isSaving || isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {isUploading ? 'Enviando mídia...' : 'Salvar Depoimento'}
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
